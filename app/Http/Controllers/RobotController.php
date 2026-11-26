<?php

namespace App\Http\Controllers;

use App\Models\CrmDeal;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmRobot;
use App\Models\CrmRobotRun;
use App\Models\CrmStage;
use App\Models\CrmTrigger;
use App\Models\User;
use App\Support\Access;
use App\Support\DealAccess;
use App\Support\Robots\Actions;
use App\Support\Robots\Automation;
use App\Support\Robots\Conditions;
use App\Support\Robots\DealContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Настройка роботов и триггеров воронки (как «Роботы» в Битрикс24).
 * Смотреть — всем, кто видит сделки; менять — право crm.robots.
 * Внешний вебхук триггера — hook(), без входа, по ключу.
 */
class RobotController extends Controller
{
    public const TRIGGERS = [
        'task_done' => 'Задача по сделке завершена',
        'field' => 'Изменилась сделка (при условии)',
        'webhook' => 'Входящий вебхук',
    ];

    public function index(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к сделкам');
        $pipeline = CrmPipeline::query()->where('entity', 'deal')->findOrFail((int) $request->input('pipeline'));
        $robots = CrmRobot::query()->where('pipeline_id', $pipeline->id)->orderBy('sort')->orderBy('id')->get();
        $stats = CrmRobotRun::query()->whereIn('robot_id', $robots->pluck('id'))->where('created_at', '>=', now()->subDays(30))
            ->select('robot_id', 'status', DB::raw('count(*) as n'))->groupBy('robot_id', 'status')->get()
            ->groupBy('robot_id')->map(fn ($rows) => $rows->pluck('n', 'status')->map(fn ($n) => (int) $n));
        $canEdit = $this->mayEdit($me);

        return response()->json(['data' => [
            'robots' => $robots->map(fn (CrmRobot $one) => $this->robot($one) + ['stats' => (object) ($stats[$one->id] ?? [])]),
            'triggers' => CrmTrigger::query()->where('pipeline_id', $pipeline->id)->orderBy('sort')->orderBy('id')->get()
                ->map(fn (CrmTrigger $one) => $this->trigger($one, $canEdit)),
            'types' => Actions::TYPES,
            'triggerTypes' => self::TRIGGERS,
            'keys' => collect(DealContext::KEYS)->map(fn ($one, $key) => ['key' => $key, 'title' => $one[0], 'type' => $one[1]])->values(),
            'placeholders' => DealContext::PLACEHOLDERS,
            'ops' => Conditions::OPS,
            'can' => ['edit' => $canEdit],
        ]]);
    }

    /* ---------- Роботы ---------- */

    public function store(Request $request): JsonResponse
    {
        $me = $this->editor($request);
        $data = $this->validatedRobot($request, true);
        $robot = CrmRobot::query()->create($data + [
            'entity' => 'deal',
            'created_by' => $me->id,
            'sort' => (int) CrmRobot::query()->where('stage_id', $data['stage_id'])->max('sort') + 10,
        ]);

        return response()->json(['data' => $this->robot($robot->fresh())], 201);
    }

    public function update(Request $request, CrmRobot $robot): JsonResponse
    {
        $this->editor($request);
        $data = $this->validatedRobot($request, false, $robot);
        $robot->update($data);

        return response()->json(['data' => $this->robot($robot->fresh())]);
    }

    public function destroy(Request $request, CrmRobot $robot): Response
    {
        $this->editor($request);
        $robot->delete();

        return response()->noContent();
    }

    /** Порядок роботов стадии (и перенос на другую стадию той же воронки). */
    public function order(Request $request): Response
    {
        $this->editor($request);
        $data = $request->validate(['stage_id' => ['required', 'integer', 'exists:crm_stages,id'], 'ids' => ['required', 'array', 'max:500'], 'ids.*' => ['integer']]);
        $stage = CrmStage::query()->findOrFail($data['stage_id']);
        DB::transaction(function () use ($data, $stage) {
            foreach (array_values($data['ids']) as $i => $id) {
                CrmRobot::query()->whereKey($id)->where('pipeline_id', $stage->pipeline_id)->update(['stage_id' => $stage->id, 'sort' => ($i + 1) * 10]);
            }
        });

        return response()->noContent();
    }

    /** Журнал запусков робота (или сделки: ?deal=). */
    public function runs(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к сделкам');
        $query = CrmRobotRun::query()->with('robot:id,title,type')->orderByDesc('id')->limit(100);
        if ($request->filled('robot')) {
            $query->where('robot_id', (int) $request->input('robot'));
        }
        if ($request->filled('deal')) {
            $deal = CrmDeal::query()->findOrFail((int) $request->input('deal'));
            abort_unless(DealAccess::can($me, 'view', $deal), 403, 'Нет доступа к сделке');
            $query->where('entity', 'deal')->where('entity_id', $deal->id);
        }
        $runs = $query->get();
        $visible = DealAccess::visible(CrmDeal::query(), $me)->whereIn('id', $runs->pluck('entity_id')->unique())->pluck('title', 'id');

        return response()->json(['data' => $runs->map(fn (CrmRobotRun $run) => [
            'id' => $run->id,
            'robotId' => $run->robot_id,
            'robot' => $run->robot?->title,
            'dealId' => $run->entity_id,
            'deal' => $visible[$run->entity_id] ?? null,
            'status' => $run->status,
            'result' => $run->result,
            'runAt' => $run->run_at?->toIso8601String(),
            'finishedAt' => $run->finished_at?->toIso8601String(),
        ])]);
    }

    /* ---------- Триггеры ---------- */

    public function storeTrigger(Request $request): JsonResponse
    {
        $this->editor($request);
        $data = $this->validatedTrigger($request, true);
        $trigger = CrmTrigger::query()->create($data + [
            'entity' => 'deal',
            'token' => $data['type'] === 'webhook' ? Str::random(40) : null,
            'sort' => (int) CrmTrigger::query()->where('stage_id', $data['stage_id'])->max('sort') + 10,
        ]);

        return response()->json(['data' => $this->trigger($trigger->fresh(), true)], 201);
    }

    public function updateTrigger(Request $request, CrmTrigger $trigger): JsonResponse
    {
        $this->editor($request);
        $data = $this->validatedTrigger($request, false, $trigger);
        $trigger->fill($data);
        if ($trigger->type === 'webhook' && ! $trigger->token) {
            $trigger->token = Str::random(40);
        }
        $trigger->save();

        return response()->json(['data' => $this->trigger($trigger->fresh(), true)]);
    }

    public function destroyTrigger(Request $request, CrmTrigger $trigger): Response
    {
        $this->editor($request);
        $trigger->delete();

        return response()->noContent();
    }

    /**
     * Внешний вебхук: GET или POST api/crm/hook/{token}?deal=ID (или
     * external=ID сделки в Битрикс24) — перевести сделку на стадию триггера.
     */
    public function hook(Request $request, string $token): JsonResponse
    {
        $trigger = CrmTrigger::query()->where('token', $token)->where('type', 'webhook')->first();
        abort_unless($trigger && $trigger->active, 404, 'Нет такого вебхука');
        $deal = $request->filled('deal') ? CrmDeal::query()->find((int) $request->input('deal'))
            : ($request->filled('external') ? CrmDeal::query()->where('external_id', (string) $request->input('external'))->first() : null);
        abort_unless($deal, 404, 'Сделка не найдена');
        abort_unless((int) $deal->pipeline_id === (int) $trigger->pipeline_id, 422, 'Сделка из другой воронки');
        $stage = CrmStage::query()->findOrFail($trigger->stage_id);
        $current = CrmStage::query()->find($deal->stage_id);
        if (! $trigger->allow_back && $current && ($deal->closed || $stage->sort <= $current->sort)) {
            return response()->json(['ok' => false, 'message' => 'Сделка уже дальше этой стадии']);
        }
        if (! Conditions::check($trigger->conditions, new DealContext($deal))) {
            return response()->json(['ok' => false, 'message' => 'Условие триггера не выполнено']);
        }
        $moved = Automation::moveTo($deal, $stage, null, 0, 'вебхук «'.$trigger->title.'»');

        return response()->json(['ok' => true, 'moved' => $moved, 'stage' => $stage->title]);
    }

    /* ---------- Внутреннее ---------- */

    private function validatedRobot(Request $request, bool $creating, ?CrmRobot $robot = null): array
    {
        $data = $request->validate([
            'stage_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:crm_stages,id'],
            'type' => [$creating ? 'required' : 'sometimes', Rule::in(array_keys(Actions::TYPES))],
            'title' => [$creating ? 'required' : 'sometimes', 'string', 'max:250'],
            'settings' => ['sometimes', 'nullable', 'array'],
            'conditions' => ['sometimes', 'nullable', 'array', 'max:50'],
            'delay' => ['sometimes', 'nullable', 'array'],
            'active' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);
        if (isset($data['stage_id'])) {
            $data['pipeline_id'] = CrmStage::query()->whereKey($data['stage_id'])->value('pipeline_id');
            abort_if($robot && (int) $robot->pipeline_id !== (int) $data['pipeline_id'], 422, 'Робота можно перенести только на стадию этой же воронки');
        }
        if (isset($data['title'])) {
            $data['title'] = trim($data['title']) ?: 'Робот';
        }
        if (array_key_exists('conditions', $data)) {
            $data['conditions'] = $this->cleanConditions($data['conditions']);
        }
        if (array_key_exists('delay', $data)) {
            $delay = $data['delay'] ?? [];
            $type = in_array($delay['type'] ?? 'now', ['now', 'after', 'field'], true) ? ($delay['type'] ?? 'now') : 'now';
            $data['delay'] = $type === 'now' ? null : [
                'type' => $type,
                'value' => mb_substr((string) ($delay['value'] ?? '0'), 0, 120),
                'unit' => in_array($delay['unit'] ?? 'm', ['m', 'h', 'd', 'wd'], true) ? $delay['unit'] : 'm',
                'field' => $type === 'field' ? mb_substr((string) ($delay['field'] ?? ''), 0, 60) : null,
            ];
        }
        $type = $data['type'] ?? $robot?->type;
        if (array_key_exists('settings', $data) && in_array($type, ['stage', 'deal'], true) && ! empty($data['settings']['stage_id'])) {
            abort_unless(CrmStage::query()->whereKey((int) $data['settings']['stage_id'])->exists(), 422, 'Нет такой стадии');
        }
        if (array_key_exists('settings', $data) && strlen(json_encode($data['settings'] ?? [])) > 60000) {
            abort(422, 'Слишком большие настройки робота');
        }

        return $data;
    }

    private function validatedTrigger(Request $request, bool $creating, ?CrmTrigger $trigger = null): array
    {
        $data = $request->validate([
            'stage_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:crm_stages,id'],
            'type' => [$creating ? 'required' : 'sometimes', Rule::in(array_keys(self::TRIGGERS))],
            'title' => [$creating ? 'required' : 'sometimes', 'string', 'max:250'],
            'settings' => ['sometimes', 'nullable', 'array'],
            'conditions' => ['sometimes', 'nullable', 'array', 'max:50'],
            'allow_back' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
        ]);
        if (isset($data['stage_id'])) {
            $data['pipeline_id'] = CrmStage::query()->whereKey($data['stage_id'])->value('pipeline_id');
            abort_if($trigger && (int) $trigger->pipeline_id !== (int) $data['pipeline_id'], 422, 'Триггер можно перенести только на стадию этой же воронки');
        }
        if (isset($data['title'])) {
            $data['title'] = trim($data['title']) ?: 'Триггер';
        }
        if (array_key_exists('conditions', $data)) {
            $data['conditions'] = $this->cleanConditions($data['conditions']);
        }

        return $data;
    }

    private function cleanConditions(?array $rules): ?array
    {
        $out = [];
        foreach ($rules ?? [] as $rule) {
            if (! is_array($rule) || empty($rule['field'])) {
                continue;
            }
            $out[] = [
                'field' => mb_substr((string) $rule['field'], 0, 60),
                'op' => in_array($rule['op'] ?? '=', Conditions::OPS, true) ? $rule['op'] : '=',
                'value' => is_array($rule['value'] ?? null) ? null : mb_substr((string) ($rule['value'] ?? ''), 0, 1000),
                'join' => ($rule['join'] ?? 'and') === 'or' ? 'or' : 'and',
            ];
        }

        return $out ?: null;
    }

    private function robot(CrmRobot $one): array
    {
        return [
            'id' => $one->id, 'pipelineId' => $one->pipeline_id, 'stageId' => $one->stage_id, 'type' => $one->type, 'title' => $one->title,
            'settings' => (object) ($one->settings ?? []), 'conditions' => $one->conditions ?? [], 'delay' => $one->delay,
            'active' => $one->active, 'sort' => $one->sort, 'note' => $one->note, 'imported' => (bool) $one->external_ref,
        ];
    }

    private function trigger(CrmTrigger $one, bool $secret): array
    {
        return [
            'id' => $one->id, 'pipelineId' => $one->pipeline_id, 'stageId' => $one->stage_id, 'type' => $one->type, 'title' => $one->title,
            'settings' => (object) ($one->settings ?? []), 'conditions' => $one->conditions ?? [], 'allowBack' => $one->allow_back,
            'active' => $one->active, 'sort' => $one->sort,
            'hook' => $secret && $one->token ? 'crm/hook/'.$one->token : null,
        ];
    }

    private function mayEdit(User $me): bool
    {
        return Access::allows($me, 'crm', 'robots', 'all');
    }

    private function editor(Request $request): User
    {
        $me = $this->me($request);
        abort_unless($this->mayEdit($me), 403, 'Настраивать роботов нельзя: нет права');

        return $me;
    }

    private function me(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user && $user->is_active, 401);

        return $user;
    }
}
