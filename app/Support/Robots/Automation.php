<?php

namespace App\Support\Robots;

use App\Models\CrmDeal;
use App\Models\CrmDealHistory;
use App\Models\CrmPipeline;
use App\Models\CrmRobot;
use App\Models\CrmRobotRun;
use App\Models\CrmStage;
use App\Models\CrmTrigger;
use App\Models\Task;
use App\Models\User;
use App\Support\DealAccess;
use App\Support\Realtime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Роботы и триггеры сделок как в Битрикс24.
 *
 * - Сделка вошла на стадию (создана, перенесена руками, роботом или
 *   триггером) — stageEntered: ждущие роботы прежних стадий отменяются,
 *   роботы новой стадии ставятся в crm_robot_runs. Срочные выполняются тут
 *   же (после записи сделки), отложенные — планировщиком (crm:robots раз в
 *   минуту).
 * - Событие (задача сделки завершена, поле изменилось, внешний вебхук) —
 *   ищем триггер воронки и переводим сделку на его стадию.
 *
 * Состояния между запросами нет (FrankenPHP worker): глубина цепочки
 * «робот сменил стадию → роботы новой стадии» передаётся аргументом.
 */
class Automation
{
    /** Сколько раз подряд роботы могут сами менять стадию одной сделки. */
    private const MAX_DEPTH = 6;

    /* ---------- Вход на стадию ---------- */

    public static function stageEntered(CrmDeal $deal, ?User $actor, int $depth = 0): void
    {
        try {
            self::enqueue($deal, $actor);
            self::runDueFor($deal->id, $depth);
        } catch (\Throwable $error) {
            /* Робот не должен ломать перенос сделки. */
            Log::error('Роботы: '.$error->getMessage(), ['deal' => $deal->id]);
        }
    }

    private static function enqueue(CrmDeal $deal, ?User $actor): void
    {
        $now = now();
        CrmRobotRun::query()->where('entity', 'deal')->where('entity_id', $deal->id)->where('status', 'pending')
            ->where('stage_id', '!=', $deal->stage_id)
            ->update(['status' => 'cancelled', 'result' => 'Сделка ушла со стадии', 'finished_at' => $now, 'updated_at' => $now]);

        $robots = CrmRobot::query()->where('entity', 'deal')->where('stage_id', $deal->stage_id)->where('active', true)
            ->orderBy('sort')->orderBy('id')->get();
        if ($robots->isEmpty()) {
            return;
        }
        $ctx = new DealContext($deal);
        $i = 0;
        foreach ($robots as $robot) {
            /* Порядок в пределах одной секунды держим id: создаём по порядку. */
            CrmRobotRun::query()->create([
                'robot_id' => $robot->id, 'entity' => 'deal', 'entity_id' => $deal->id, 'stage_id' => $deal->stage_id,
                'user_id' => $actor?->id, 'run_at' => self::runAt($robot->delay, $ctx, $now)->copy()->addMicroseconds($i++), 'status' => 'pending',
            ]);
        }
    }

    /** Когда выполнить: сразу, через N, или от даты в поле сделки. */
    public static function runAt(?array $delay, DealContext $ctx, Carbon $now): Carbon
    {
        $type = $delay['type'] ?? 'now';
        if ($type === 'after') {
            return self::shift($now->copy(), Template::number($delay['value'] ?? 0, $ctx), (string) ($delay['unit'] ?? 'm'));
        }
        if ($type === 'field' && ! empty($delay['field'])) {
            $raw = $ctx->value((string) $delay['field']);
            $raw = is_array($raw) ? ($raw[0] ?? null) : $raw;
            try {
                $base = $raw ? Carbon::parse((string) $raw) : null;
            } catch (\Throwable) {
                $base = null;
            }
            if ($base) {
                $at = self::shift($base, Template::number($delay['value'] ?? 0, $ctx), (string) ($delay['unit'] ?? 'd'));

                return $at->lessThan($now) ? $now->copy() : $at;
            }
        }

        return $now->copy();
    }

    /** Сдвиг: m — минуты, h — часы, d — дни, wd — рабочие дни (пн–пт). */
    public static function shift(Carbon $at, float $value, string $unit): Carbon
    {
        $n = (int) round($value);
        if ($unit === 'wd') {
            $step = $n < 0 ? -1 : 1;
            for ($left = abs($n); $left > 0;) {
                $at->addDays($step);
                if (! $at->isWeekend()) {
                    $left--;
                }
            }

            return $at;
        }

        return match ($unit) {
            'h' => $at->addHours($n),
            'd' => $at->addDays($n),
            default => $at->addMinutes($n),
        };
    }

    /* ---------- Выполнение ---------- */

    /** Роботы этой сделки, срок которых пришёл (сразу после перевода). */
    public static function runDueFor(int $dealId, int $depth = 0): void
    {
        $ids = CrmRobotRun::query()->where('entity', 'deal')->where('entity_id', $dealId)->where('status', 'pending')
            ->where('run_at', '<=', now())->orderBy('run_at')->orderBy('id')->pluck('id');
        foreach ($ids as $id) {
            if (! self::runOne((int) $id, $depth)) {
                break;
            }
        }
    }

    /** Планировщик: все созревшие запуски пачкой. */
    public static function runDue(int $limit = 200): int
    {
        /* Зависшие (процесс умер посреди робота) — в ошибки. */
        CrmRobotRun::query()->where('status', 'running')->where('updated_at', '<', now()->subMinutes(15))
            ->update(['status' => 'failed', 'result' => 'Прервано', 'finished_at' => now()]);
        $ids = CrmRobotRun::query()->where('status', 'pending')->where('run_at', '<=', now())
            ->orderBy('run_at')->orderBy('id')->limit($limit)->pluck('id');
        foreach ($ids as $id) {
            self::runOne((int) $id, 0);
        }

        return $ids->count();
    }

    /**
     * Один запуск. false — сделка ушла со стадии (остальные роботы этой
     * стадии уже отменены новым входом, дальше не идём).
     */
    public static function runOne(int $runId, int $depth): bool
    {
        if (! CrmRobotRun::query()->whereKey($runId)->where('status', 'pending')->update(['status' => 'running', 'attempts' => DB::raw('attempts + 1'), 'updated_at' => now()])) {
            return true;
        }
        $run = CrmRobotRun::query()->with('robot')->find($runId);
        $deal = CrmDeal::query()->find($run->entity_id);
        $robot = $run->robot;
        $finish = fn (string $status, ?string $result) => $run->update(['status' => $status, 'result' => $result ? mb_substr($result, 0, 2000) : null, 'finished_at' => now()]);
        if (! $deal || ! $robot) {
            $finish('cancelled', 'Сделка или робот удалены');

            return true;
        }
        if ((int) $deal->stage_id !== (int) $run->stage_id) {
            $finish('cancelled', 'Сделка ушла со стадии');

            return false;
        }
        if (! $robot->active) {
            $finish('cancelled', 'Робот выключен');

            return true;
        }
        $ctx = new DealContext($deal);
        if (! Conditions::check($robot->conditions, $ctx)) {
            $finish('skipped', 'Условие не выполнено');

            return true;
        }
        $actor = $run->user_id ? User::query()->find($run->user_id) : null;
        try {
            $result = (new Actions($ctx, $robot, $actor, $depth))->run();
            $finish('done', $result);
            self::log($deal, $actor, 'robot', $robot->title, $result);
        } catch (\Throwable $error) {
            $finish('failed', $error->getMessage());
            self::log($deal, $actor, 'robot', $robot->title, 'Ошибка: '.mb_substr($error->getMessage(), 0, 300));
            Log::warning('Робот '.$robot->id.': '.$error->getMessage(), ['deal' => $deal->id]);
        }
        Realtime::changed('deal', DealAccess::audience([$deal->id => $deal->ownerIds()]));

        return (int) CrmDeal::query()->whereKey($deal->id)->value('stage_id') === (int) $run->stage_id;
    }

    /* ---------- Смена стадии роботом и триггером ---------- */

    /** Перевести сделку (история, закрытие, real-time) и запустить роботы новой стадии. */
    public static function moveTo(CrmDeal $deal, CrmStage $stage, ?User $actor, int $depth, string $why): bool
    {
        if ((int) $deal->stage_id === (int) $stage->id) {
            return false;
        }
        if ($depth >= self::MAX_DEPTH) {
            throw new \RuntimeException('Слишком длинная цепочка роботов: стадию дальше не меняем');
        }
        $before = $deal->ownerIds();
        DB::transaction(function () use ($deal, $stage, $actor, $why) {
            $old = CrmStage::query()->find($deal->stage_id);
            if ((int) $stage->pipeline_id !== (int) $deal->pipeline_id) {
                self::log($deal, $actor, 'pipeline_id', CrmPipeline::query()->whereKey($deal->pipeline_id)->value('title'), $stage->pipeline?->title);
                $deal->pipeline_id = $stage->pipeline_id;
            }
            self::log($deal, $actor, 'stage_id', $old?->title, $stage->title.' ('.$why.')');
            $deal->stage_id = $stage->id;
            $deal->closed = $stage->isClosed();
            $deal->stage_changed_at = now();
            $deal->version++;
            $deal->save();
        });
        Realtime::changed('deal', DealAccess::audience([$deal->id => array_merge($before, $deal->ownerIds())]));
        self::stageEntered($deal, $actor, $depth + 1);

        return true;
    }

    /** Триггеры воронки сделки этого типа: подходящий — перевести. */
    public static function fire(CrmDeal $deal, string $type, ?User $actor, ?callable $match = null, int $depth = 0): ?CrmTrigger
    {
        try {
            $triggers = CrmTrigger::query()->where('entity', 'deal')->where('pipeline_id', $deal->pipeline_id)
                ->where('type', $type)->where('active', true)->orderBy('sort')->orderBy('id')->get();
            if ($triggers->isEmpty()) {
                return null;
            }
            $current = CrmStage::query()->find($deal->stage_id);
            $stages = CrmStage::query()->whereIn('id', $triggers->pluck('stage_id'))->get()->keyBy('id');
            $ctx = new DealContext($deal);
            foreach ($triggers->sortByDesc(fn ($one) => $stages[$one->stage_id]->sort ?? 0) as $trigger) {
                $stage = $stages[$trigger->stage_id] ?? null;
                if (! $stage || $stage->id === $deal->stage_id) {
                    continue;
                }
                if (! $trigger->allow_back && $current && ($deal->closed || $stage->sort <= $current->sort)) {
                    continue;
                }
                if ($match && ! $match($trigger)) {
                    continue;
                }
                if (! Conditions::check($trigger->conditions, $ctx)) {
                    continue;
                }
                self::moveTo($deal, $stage, $actor, $depth, 'триггер «'.$trigger->title.'»');

                return $trigger;
            }
        } catch (\Throwable $error) {
            Log::error('Триггеры: '.$error->getMessage(), ['deal' => $deal->id]);
        }

        return null;
    }

    /** Задача сделки завершена. */
    public static function taskCompleted(Task $task, ?User $actor): void
    {
        $deal = $task->deal_id ? CrmDeal::query()->find($task->deal_id) : null;
        if (! $deal) {
            return;
        }
        self::fire($deal, 'task_done', $actor, function (CrmTrigger $trigger) use ($task) {
            $needle = mb_strtolower(trim((string) ($trigger->settings['title'] ?? '')));

            return $needle === '' || str_contains(mb_strtolower($task->title), $needle);
        });
    }

    /** Поля сделки изменились (руками или роботом): $changed — ключи как в условиях. */
    public static function dealChanged(CrmDeal $deal, array $changed, ?User $actor, int $depth = 0): void
    {
        if (! $changed) {
            return;
        }
        self::fire($deal, 'field', $actor, function (CrmTrigger $trigger) use ($changed) {
            $watch = array_filter((array) ($trigger->settings['fields'] ?? []));

            return ! $watch || array_intersect($watch, $changed);
        }, $depth);
    }

    /* ---------- Общее ---------- */

    public static function log(CrmDeal $deal, ?User $actor, string $field, ?string $old, ?string $new): void
    {
        CrmDealHistory::query()->create([
            'deal_id' => $deal->id, 'user_id' => $actor?->id, 'field' => $field,
            'old' => $old === null ? null : mb_substr($old, 0, 2000), 'new' => $new === null ? null : mb_substr($new, 0, 2000), 'created_at' => now(),
        ]);
    }
}
