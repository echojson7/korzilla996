<?php

namespace App\Support\Robots;

use App\Http\Controllers\MessengerController;
use App\Models\Chat;
use App\Models\ChatMember;
use App\Models\CrmDeal;
use App\Models\CrmRobot;
use App\Models\CrmStage;
use App\Models\Message;
use App\Models\Task;
use App\Models\TaskChecklistItem;
use App\Models\TaskHistory;
use App\Models\TaskMember;
use App\Models\User;
use App\Support\CrmFields;
use App\Support\DealAccess;
use App\Support\Realtime;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Действия роботов. Каждое возвращает строку для истории сделки.
 *
 * Сотрудник в настройках робота: «responsible» — ответственный за сделку,
 * «creator» — создатель сделки, «actor» — кто перевёл сделку на стадию,
 * «u:12» — конкретный сотрудник, «f:uf_crm_…» — сотрудник из поля сделки.
 */
class Actions
{
    public const TYPES = [
        'task' => 'Поставить задачу',
        'notify' => 'Уведомить сотрудника',
        'chat' => 'Написать в чат сделки',
        'field' => 'Изменить поля сделки',
        'stage' => 'Сменить стадию',
        'responsible' => 'Сменить ответственного',
        'deal' => 'Создать сделку',
        'webhook' => 'Отправить вебхук',
        'bitrix' => 'Шаг из Битрикс24 (нужно настроить)',
    ];

    /** Поля сделки, которые робот может менять, кроме своих. */
    private const CORE_FIELDS = ['title' => 'Название', 'amount' => 'Сумма', 'close_date' => 'Дата завершения', 'comments' => 'Комментарий'];

    public function __construct(private DealContext $ctx, private CrmRobot $robot, private ?User $actor, private int $depth) {}

    private function deal(): CrmDeal
    {
        return $this->ctx->deal;
    }

    private function s(string $key, mixed $default = null): mixed
    {
        return ($this->robot->settings ?? [])[$key] ?? $default;
    }

    private function text(?string $template): string
    {
        return Template::render($template, $this->ctx);
    }

    public function run(): string
    {
        return match ($this->robot->type) {
            'task' => $this->task(),
            'notify' => $this->notify(),
            'chat' => $this->chat(),
            'field' => $this->fields(),
            'stage' => $this->stage(),
            'responsible' => $this->responsible(),
            'deal' => $this->newDeal(),
            'webhook' => $this->webhook(),
            default => throw new \RuntimeException('Это действие пока не выполняется: '.($this->robot->note ?: 'настройте робота')),
        };
    }

    /* ---------- Сотрудники ---------- */

    /** @return int[] */
    public function users(mixed $specs): array
    {
        $deal = $this->deal();
        $out = [];
        foreach ((array) $specs as $spec) {
            $spec = (string) $spec;
            $ids = match (true) {
                $spec === 'responsible' => [$deal->responsible_id],
                $spec === 'creator' => [$deal->creator_id],
                $spec === 'actor' => [$this->actor?->id ?? $deal->responsible_id],
                str_starts_with($spec, 'u:') => [(int) substr($spec, 2)],
                str_starts_with($spec, 'f:') => (array) (($deal->fields ?? [])[substr($spec, 2)] ?? []),
                ctype_digit($spec) => [(int) $spec],
                default => [],
            };
            foreach ($ids as $id) {
                if ($id && ! in_array((int) $id, $out, true)) {
                    $out[] = (int) $id;
                }
            }
        }

        return User::query()->whereIn('id', $out)->pluck('id')->map(fn ($id) => (int) $id)
            ->sortBy(fn ($id) => array_search($id, $out, true))->values()->all();
    }

    private function user(mixed $spec, ?int $fallback = null): ?int
    {
        return $this->users($spec)[0] ?? $fallback;
    }

    private function names(array $ids): string
    {
        return User::query()->whereIn('id', $ids)->pluck('name')->implode(', ');
    }

    /* ---------- Задача ---------- */

    private function task(): string
    {
        $deal = $this->deal();
        $title = trim($this->text($this->s('title'))) ?: 'Задача по сделке «'.$deal->title.'»';
        $responsible = $this->user($this->s('responsible', ['responsible']), $deal->responsible_id);
        $creator = $this->user($this->s('creator', ['responsible']), $responsible);
        abort_unless($responsible, 422, 'Не найден ответственный за задачу');
        $deadline = null;
        $value = $this->s('deadline_value');
        if ($value !== null && $value !== '') {
            $deadline = Automation::shift(now(), Template::number($value, $this->ctx), (string) $this->s('deadline_unit', 'wd'));
            if (in_array($this->s('deadline_unit', 'wd'), ['d', 'wd'], true)) {
                $deadline->setTime(19, 0);
            }
        }

        $task = DB::transaction(function () use ($deal, $title, $responsible, $creator, $deadline) {
            $task = Task::query()->create([
                'title' => Str::limit($title, 250, ''),
                'description' => $this->text($this->s('description')) ?: null,
                'status' => 'pending',
                'priority' => in_array($this->s('priority'), array_keys(Task::PRIORITIES), true) ? $this->s('priority') : 'normal',
                'creator_id' => $creator,
                'responsible_id' => $responsible,
                'deadline' => $deadline,
                'needs_review' => (bool) $this->s('needs_review', false),
                'deal_id' => $deal->id,
                'sort' => (float) (Task::query()->min('sort') ?? 0) - 1,
            ]);
            $taken = [$responsible];
            foreach (['accomplice' => 'accomplices', 'auditor' => 'auditors'] as $role => $key) {
                foreach ($this->users($this->s($key, [])) as $id) {
                    if (! in_array($id, $taken, true)) {
                        TaskMember::query()->create(['task_id' => $task->id, 'user_id' => $id, 'role' => $role]);
                        $taken[] = $id;
                    }
                }
            }
            $lines = array_values(array_filter(array_map('trim', preg_split('/\R/u', (string) $this->s('checklist', '')))));
            foreach ($lines as $i => $line) {
                TaskChecklistItem::query()->create(['task_id' => $task->id, 'title' => Str::limit($this->text($line), 500, ''), 'sort' => $i + 1]);
            }
            TaskHistory::query()->create(['task_id' => $task->id, 'user_id' => $creator, 'field' => 'created', 'old' => null, 'new' => Str::limit($task->title, 500), 'created_at' => now()]);

            return $task;
        });
        $audience = array_unique(array_merge(
            [$task->responsible_id, $task->creator_id],
            TaskMember::query()->where('task_id', $task->id)->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
            Realtime::admins(),
        ));
        Realtime::changed('task', collect(array_filter($audience))->mapWithKeys(fn ($id) => [(int) $id => [$task->id]])->all());

        return 'Задача №'.$task->id.' «'.$task->title.'» — '.$this->names([$responsible]);
    }

    /* ---------- Сообщения ---------- */

    private function notify(): string
    {
        $text = trim($this->text($this->s('text')));
        abort_if($text === '', 422, 'Пустой текст уведомления');
        $to = $this->users($this->s('to', ['responsible']));
        abort_unless($to, 422, 'Некому отправить уведомление');
        $from = $this->user($this->s('from', ['responsible']), $this->deal()->responsible_id);
        $link = $this->s('link', true) ? "\n\n[Сделка «".$this->deal()->title.'»]('.$this->ctx->text('Ссылка').')' : '';
        foreach ($to as $id) {
            $chat = DB::transaction(function () use ($id) {
                $chat = Chat::query()->firstOrCreate(['entity' => 'notify:'.$id], ['type' => 'group', 'title' => 'Уведомления CRM']);
                ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $id]);

                return $chat;
            });
            if ($chat->wasRecentlyCreated) {
                Realtime::emit([$id], 'chat', ['chatId' => $chat->id]);
            }
            $this->post($chat, $from, $text.$link);
        }

        return 'Уведомление: '.$this->names($to);
    }

    private function chat(): string
    {
        $deal = $this->deal();
        $text = trim($this->text($this->s('text')));
        abort_if($text === '', 422, 'Пустое сообщение');
        $from = $this->user($this->s('from', ['responsible']), $deal->responsible_id);
        $chat = DB::transaction(function () use ($deal, $from) {
            $chat = Chat::query()->firstOrCreate(['entity' => 'deal:'.$deal->id], ['type' => 'group', 'title' => Str::limit('Сделка: '.$deal->title, 120, ''), 'created_by' => $from]);
            foreach (array_filter([$from, $deal->responsible_id]) as $id) {
                ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $id]);
            }

            return $chat;
        });
        if ($chat->wasRecentlyCreated) {
            Realtime::emit(ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id'), 'chat', ['chatId' => $chat->id]);
        }
        $this->post($chat, $from, $text);

        return 'Сообщение в чат сделки';
    }

    private function post(Chat $chat, ?int $from, string $text): void
    {
        $message = $chat->messages()->create(['user_id' => $from, 'kind' => 'text', 'body' => Str::limit($text, 20000, '')]);
        $chat->update(['last_message_at' => $message->created_at]);
        $payload = app(MessengerController::class)->message(Message::query()->with(['files', 'reactions', 'replyTo'])->find($message->id));
        Realtime::emit(ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id'), 'message', ['chatId' => $chat->id, 'message' => $payload, 'new' => true]);
    }

    /* ---------- Поля, стадия, ответственный ---------- */

    private function fields(): string
    {
        $deal = $this->deal();
        $done = [];
        $changed = [];
        $before = $deal->ownerIds();
        DB::transaction(function () use ($deal, &$done, &$changed) {
            $values = $deal->fields ?? [];
            foreach ((array) $this->s('values', []) as $row) {
                $code = (string) ($row['field'] ?? '');
                $raw = $row['value'] ?? null;
                $value = is_string($raw) ? $this->text($raw) : $raw;
                if (isset(self::CORE_FIELDS[$code])) {
                    $old = $deal->getAttribute($code);
                    $deal->setAttribute($code, match ($code) {
                        'amount' => Template::number($value, $this->ctx),
                        'close_date' => $value ? \Illuminate\Support\Carbon::parse((string) $value)->toDateString() : null,
                        'title' => trim((string) $value) ?: $deal->title,
                        default => $value === '' ? null : $value,
                    });
                    if ($deal->isDirty($code)) {
                        Automation::log($deal, $this->actor, $code, $old instanceof \DateTimeInterface ? $old->format('Y-m-d') : (string) $old, (string) ($deal->getAttribute($code) instanceof \DateTimeInterface ? $deal->getAttribute($code)->format('Y-m-d') : $deal->getAttribute($code)));
                        $done[] = self::CORE_FIELDS[$code];
                        $changed[] = $code;
                    }

                    continue;
                }
                $field = $this->ctx->field($code);
                if (! $field || $field->type === 'file') {
                    continue;
                }
                if ($field->type === 'list' && is_string($value) && $value !== '') {
                    /* Вариант можно задать и названием. */
                    $byLabel = collect($field->options ?? [])->first(fn ($one) => mb_strtolower($one['label']) === mb_strtolower(trim($value)));
                    $value = $byLabel['id'] ?? $value;
                }
                if ($field->type === 'user' && is_string($value) && ! ctype_digit($value)) {
                    $value = $this->user([$value]);
                }
                $new = CrmFields::normalize($field, $value);
                $old = $values[$code] ?? null;
                if ($new === null || $new === []) {
                    unset($values[$code]);
                } else {
                    $values[$code] = $new;
                }
                if ($old !== ($values[$code] ?? null)) {
                    Automation::log($deal, $this->actor, 'fields.'.$code, CrmFields::text($field, $old), CrmFields::text($field, $values[$code] ?? null));
                    $done[] = $field->title;
                    $changed[] = $code;
                }
            }
            $deal->fields = $values;
            if ($changed) {
                $deal->version++;
                $deal->save();
            }
        });
        if ($changed) {
            Realtime::changed('deal', DealAccess::audience([$deal->id => array_merge($before, $deal->ownerIds())]));
            $this->ctx->refresh();
            Automation::dealChanged($deal, $changed, $this->actor, $this->depth + 1);
        }

        return $done ? 'Изменены поля: '.implode(', ', $done) : 'Поля уже были такими';
    }

    private function stage(): string
    {
        $stage = CrmStage::query()->find((int) $this->s('stage_id'));
        abort_unless($stage, 422, 'Стадия не найдена');
        $moved = Automation::moveTo($this->deal(), $stage, $this->actor, $this->depth, 'робот');

        return $moved ? 'Стадия: '.$stage->title : 'Сделка уже на стадии '.$stage->title;
    }

    private function responsible(): string
    {
        $deal = $this->deal();
        $users = $this->users($this->s('users', []));
        abort_unless($users, 422, 'Не выбраны сотрудники');
        $mode = (string) $this->s('mode', 'first');
        if ($mode === 'queue') {
            $settings = $this->robot->settings ?? [];
            $cursor = ((int) ($settings['cursor'] ?? -1) + 1) % count($users);
            $settings['cursor'] = $cursor;
            CrmRobot::query()->whereKey($this->robot->id)->update(['settings' => json_encode($settings, JSON_UNESCAPED_UNICODE)]);
            $id = $users[$cursor];
        } elseif ($mode === 'random') {
            $id = $users[array_rand($users)];
        } else {
            $id = $users[0];
        }
        if ((int) $deal->responsible_id === $id) {
            return 'Ответственный уже '.$this->names([$id]);
        }
        $before = $deal->ownerIds();
        $old = $this->names([(int) $deal->responsible_id]);
        $deal->responsible_id = $id;
        $deal->version++;
        $deal->save();
        Automation::log($deal, $this->actor, 'responsible_id', $old ?: null, $this->names([$id]));
        Realtime::changed('deal', DealAccess::audience([$deal->id => array_merge($before, $deal->ownerIds())]));
        Automation::dealChanged($deal, ['responsible_id'], $this->actor, $this->depth + 1);

        return 'Ответственный: '.$this->names([$id]);
    }

    /* ---------- Новая сделка ---------- */

    private function newDeal(): string
    {
        $deal = $this->deal();
        $stage = CrmStage::query()->find((int) $this->s('stage_id'));
        abort_unless($stage, 422, 'Не выбрана стадия новой сделки');
        $copy = (bool) $this->s('copy', true);
        $fields = [];
        foreach ((array) $this->s('values', []) as $row) {
            $field = $this->ctx->field((string) ($row['field'] ?? ''));
            if ($field && $field->type !== 'file') {
                $raw = $row['value'] ?? null;
                $value = is_string($raw) ? $this->text($raw) : $raw;
                if ($field->type === 'list' && is_string($value)) {
                    $value = collect($field->options ?? [])->first(fn ($one) => mb_strtolower($one['label']) === mb_strtolower(trim($value)))['id'] ?? $value;
                }
                try {
                    $value = CrmFields::normalize($field, $value);
                } catch (\Throwable) {
                    $value = null;
                }
                if ($value !== null && $value !== []) {
                    $fields[$field->code] = $value;
                }
            }
        }
        $responsible = $this->user($this->s('responsible', ['responsible']), $deal->responsible_id);
        $new = DB::transaction(function () use ($deal, $stage, $copy, $fields, $responsible) {
            $new = CrmDeal::query()->create([
                'pipeline_id' => $stage->pipeline_id,
                'stage_id' => $stage->id,
                'title' => Str::limit(trim($this->text($this->s('title'))) ?: $deal->title, 250, ''),
                'amount' => $copy ? $deal->amount : 0,
                'currency' => $deal->currency,
                'responsible_id' => $responsible,
                'creator_id' => $this->actor?->id ?? $deal->responsible_id,
                'company' => $copy ? $deal->company : null,
                'contact' => $copy ? $deal->contact : null,
                'company_id' => $copy ? $deal->company_id : null,
                'contact_id' => $copy ? $deal->contact_id : null,
                'fields' => array_merge($copy ? ($deal->fields ?? []) : [], $fields),
                'sort' => (float) (CrmDeal::query()->min('sort') ?? 0) - 1,
                'closed' => $stage->isClosed(),
                'stage_changed_at' => now(),
            ]);
            if ($copy) {
                foreach (DB::table('crm_deal_contacts')->where('deal_id', $deal->id)->get() as $row) {
                    DB::table('crm_deal_contacts')->insert(['deal_id' => $new->id, 'contact_id' => $row->contact_id, 'sort' => $row->sort]);
                }
            }
            Automation::log($new, $this->actor, 'created', null, $new->title.' (робот из сделки №'.$deal->id.')');

            return $new;
        });
        Realtime::changed('deal', DealAccess::audience([$new->id => $new->ownerIds()]));
        if ($this->depth < 3) {
            Automation::stageEntered($new, $this->actor, $this->depth + 1);
        }

        return 'Создана сделка №'.$new->id.' «'.$new->title.'»';
    }

    /* ---------- Вебхук ---------- */

    private function webhook(): string
    {
        $url = trim(Template::render(trim((string) $this->s('url')), $this->ctx, true));
        abort_unless(preg_match('~^https?://~i', $url), 422, 'Адрес вебхука должен начинаться с http:// или https://');
        $method = strtoupper((string) $this->s('method', 'GET'));
        $request = Http::timeout(8)->withHeaders(['User-Agent' => 'Korzilla996-robot']);
        $response = $method === 'POST'
            ? $request->withBody($this->text($this->s('body', '')) ?: json_encode(['deal' => $this->deal()->id], JSON_UNESCAPED_UNICODE), (string) $this->s('content_type', 'application/json'))->post($url)
            : $request->get($url);
        $status = $response->status();
        if ($status >= 400) {
            throw new \RuntimeException("Вебхук ответил {$status}: ".Str::limit(trim($response->body()), 200));
        }

        return "Вебхук {$method} {$status}".(trim($response->body()) !== '' ? ': '.Str::limit(trim(strip_tags($response->body())), 200) : '');
    }
}
