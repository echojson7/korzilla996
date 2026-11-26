<?php

namespace App\Http\Controllers;

use App\Models\CrmDeal;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Access;
use App\Support\CrmFields;
use App\Support\DealAccess;
use App\Support\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Настройка CRM как в Битрикс24: воронки, стадии и свои поля сущности
 * (пока — сделки). Смотреть схему может каждый, кто видит сделки; править —
 * с правом crm.settings (владелец и администраторы — всегда). Любая правка —
 * событие crm всем, кто видит сделки: браузер перечитывает схему.
 */
class CrmController extends Controller
{
    private const COLOR = 'regex:/^#[0-9a-fA-F]{6}$/';

    public function schema(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к сделкам');
        $entity = 'deal';

        $counts = DealAccess::visible(CrmDeal::query(), $me)->where('closed', false)
            ->select('pipeline_id', DB::raw('count(*) as n'))->groupBy('pipeline_id')->pluck('n', 'pipeline_id');

        return response()->json(['data' => [
            'pipelines' => CrmPipeline::query()->where('entity', $entity)->with('stages')->orderBy('sort')->orderBy('id')->get()
                ->map(fn (CrmPipeline $one) => $this->pipeline($one) + ['open' => (int) ($counts[$one->id] ?? 0)]),
            'fields' => CrmField::query()->where('entity', $entity)->orderBy('sort')->orderBy('id')->get()->map(fn (CrmField $one) => $this->field($one)),
            'types' => CrmField::TYPES,
            'can' => [
                'settings' => Access::allows($me, 'crm', 'settings', 'all'),
                'create' => Access::allows($me, 'crm', 'create', 'all'),
            ],
        ]]);
    }

    /* ---------- Воронки ---------- */

    public function storePipeline(Request $request): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate(['title' => ['required', 'string', 'max:120']]);
        $pipeline = DB::transaction(function () use ($data) {
            $pipeline = CrmPipeline::query()->create([
                'entity' => 'deal', 'title' => trim($data['title']), 'sort' => (int) CrmPipeline::query()->max('sort') + 100,
            ]);
            foreach ([['Новая', '#39a8ef', 'process'], ['В работе', '#ffa900', 'process'], ['Сделка успешна', '#7bd500', 'success'], ['Сделка провалена', '#ff5752', 'failure']] as $i => [$title, $color, $semantic]) {
                $pipeline->stages()->create(['title' => $title, 'color' => $color, 'semantic' => $semantic, 'sort' => ($i + 1) * 10]);
            }

            return $pipeline;
        });
        $this->changed();

        return response()->json(['data' => $this->pipeline($pipeline->fresh('stages'))], 201);
    }

    public function updatePipeline(Request $request, CrmPipeline $pipeline): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        DB::transaction(function () use ($pipeline, $data) {
            if (isset($data['title'])) {
                $pipeline->title = trim($data['title']);
            }
            if (! empty($data['is_default'])) {
                CrmPipeline::query()->where('entity', $pipeline->entity)->update(['is_default' => false]);
                $pipeline->is_default = true;
            }
            $pipeline->save();
        });
        $this->changed();

        return response()->json(['data' => $this->pipeline($pipeline->fresh('stages'))]);
    }

    public function orderPipelines(Request $request): JsonResponse
    {
        $this->admin($request);
        $ids = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']])['ids'];
        DB::transaction(function () use ($ids) {
            foreach (array_values($ids) as $i => $id) {
                CrmPipeline::query()->whereKey($id)->update(['sort' => ($i + 1) * 100]);
            }
        });
        $this->changed();

        return response()->json(['data' => true]);
    }

    public function destroyPipeline(Request $request, CrmPipeline $pipeline): Response
    {
        $this->admin($request);
        abort_if(CrmPipeline::query()->where('entity', $pipeline->entity)->count() <= 1, 422, 'Последнюю воронку удалить нельзя');
        $deals = CrmDeal::query()->where('pipeline_id', $pipeline->id)->count();
        abort_if($deals > 0, 422, "В воронке есть сделки ({$deals}): сначала перенесите их");
        DB::transaction(function () use ($pipeline) {
            $wasDefault = $pipeline->is_default;
            $pipeline->delete();
            if ($wasDefault) {
                CrmPipeline::query()->where('entity', $pipeline->entity)->orderBy('sort')->limit(1)->update(['is_default' => true]);
            }
        });
        $this->changed();

        return response()->noContent();
    }

    /* ---------- Стадии ---------- */

    public function storeStage(Request $request, CrmPipeline $pipeline): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'color' => ['sometimes', 'string', self::COLOR],
            'semantic' => ['sometimes', Rule::in(array_keys(CrmStage::SEMANTICS))],
            'after' => ['sometimes', 'nullable', 'integer'],
        ]);
        $stage = DB::transaction(function () use ($pipeline, $data) {
            $stages = $pipeline->stages()->get();
            $after = isset($data['after']) ? $stages->firstWhere('id', (int) $data['after']) : $stages->where('semantic', 'process')->last();
            $stage = $pipeline->stages()->create([
                'title' => trim($data['title']), 'color' => strtolower($data['color'] ?? '#39a8ef'),
                'semantic' => $data['semantic'] ?? 'process', 'sort' => 0,
            ]);
            /* Вставить после after и перенумеровать. */
            $ids = $stages->pluck('id')->all();
            $at = $after ? array_search($after->id, $ids, true) + 1 : count($ids);
            array_splice($ids, $at, 0, [$stage->id]);
            $this->renumberStages($ids);

            return $stage;
        });
        $this->changed();

        return response()->json(['data' => $this->stage($stage->fresh())], 201);
    }

    public function updateStage(Request $request, CrmStage $stage): JsonResponse
    {
        $this->admin($request);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'color' => ['sometimes', 'string', self::COLOR],
            'semantic' => ['sometimes', Rule::in(array_keys(CrmStage::SEMANTICS))],
        ]);
        DB::transaction(function () use ($stage, $data) {
            if (isset($data['title'])) {
                $stage->title = trim($data['title']);
            }
            if (isset($data['color'])) {
                $stage->color = strtolower($data['color']);
            }
            if (isset($data['semantic']) && $data['semantic'] !== $stage->semantic) {
                abort_if($data['semantic'] !== 'process' && $stage->pipeline->stages()->where('semantic', 'process')->whereKeyNot($stage->id)->doesntExist(), 422, 'В воронке должна остаться хотя бы одна рабочая стадия');
                $stage->semantic = $data['semantic'];
                CrmDeal::query()->where('stage_id', $stage->id)->update(['closed' => $stage->isClosed()]);
            }
            $stage->save();
        });
        $this->changed();

        return response()->json(['data' => $this->stage($stage->fresh())]);
    }

    public function orderStages(Request $request, CrmPipeline $pipeline): JsonResponse
    {
        $this->admin($request);
        $ids = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']])['ids'];
        $own = $pipeline->stages()->pluck('id')->all();
        abort_if(array_diff($own, $ids) || array_diff($ids, $own), 422, 'Список стадий не совпадает с воронкой');
        DB::transaction(fn () => $this->renumberStages($ids));
        $this->changed();

        return response()->json(['data' => $this->pipeline($pipeline->fresh('stages'))]);
    }

    /** Удалить стадию; сделки с неё — на стадию move_to (из той же воронки). */
    public function destroyStage(Request $request, CrmStage $stage): Response
    {
        $this->admin($request);
        $data = $request->validate(['move_to' => ['nullable', 'integer']]);
        $pipeline = $stage->pipeline;
        abort_if($stage->semantic === 'process' && $pipeline->stages()->where('semantic', 'process')->count() <= 1, 422, 'В воронке должна остаться хотя бы одна рабочая стадия');
        $deals = CrmDeal::query()->where('stage_id', $stage->id)->count();
        $target = null;
        if ($deals) {
            $target = isset($data['move_to']) ? CrmStage::query()->where('pipeline_id', $pipeline->id)->whereKeyNot($stage->id)->find($data['move_to']) : null;
            abort_unless($target, 422, "На стадии есть сделки ({$deals}): выберите, куда их перенести");
        }
        DB::transaction(function () use ($stage, $target) {
            if ($target) {
                CrmDeal::query()->where('stage_id', $stage->id)->update(['stage_id' => $target->id, 'closed' => $target->isClosed()]);
            }
            $stage->delete();
        });
        $this->changed();
        if ($deals) {
            Realtime::changed('deal', DealAccess::audience(
                CrmDeal::query()->where('stage_id', $target->id)->get(['id', 'responsible_id', 'creator_id'])
                    ->mapWithKeys(fn (CrmDeal $deal) => [$deal->id => $deal->ownerIds()])->all(),
            ));
        }

        return response()->noContent();
    }

    /* ---------- Поля ---------- */

    public function storeField(Request $request): JsonResponse
    {
        $this->admin($request);
        $data = $this->fieldData($request, true);
        $field = CrmField::query()->create([
            ...$data,
            'entity' => 'deal',
            'code' => CrmFields::codeFor('deal', $data['title']),
            'sort' => (int) CrmField::query()->where('entity', 'deal')->max('sort') + 10,
        ]);
        $this->changed();

        return response()->json(['data' => $this->field($field->fresh())], 201);
    }

    public function updateField(Request $request, CrmField $field): JsonResponse
    {
        $this->admin($request);
        $data = $this->fieldData($request, false, $field);
        $field->fill($data)->save();
        $this->changed();

        return response()->json(['data' => $this->field($field->fresh())]);
    }

    public function orderFields(Request $request): JsonResponse
    {
        $this->admin($request);
        $ids = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']])['ids'];
        DB::transaction(function () use ($ids) {
            foreach (array_values($ids) as $i => $id) {
                CrmField::query()->whereKey($id)->update(['sort' => ($i + 1) * 10]);
            }
        });
        $this->changed();

        return response()->json(['data' => true]);
    }

    /** Удалить поле: определение уходит, значения в сделках вычищаются. */
    public function destroyField(Request $request, CrmField $field): Response
    {
        $this->admin($request);
        DB::transaction(function () use ($field) {
            $path = '$."'.str_replace('"', '', $field->code).'"';
            DB::table('crm_deals')->whereNotNull(DB::raw("json_extract(fields, '{$path}')"))
                ->update(['fields' => DB::raw("json_remove(fields, '{$path}')")]);
            $field->delete();
        });
        $this->changed();

        return response()->noContent();
    }

    /* ---------- Внутреннее ---------- */

    private function fieldData(Request $request, bool $creating, ?CrmField $field = null): array
    {
        $data = $request->validate([
            'title' => [$creating ? 'required' : 'sometimes', 'string', 'max:200'],
            'type' => [$creating ? 'required' : 'prohibited', Rule::in(array_keys(CrmField::TYPES))],
            'multiple' => ['sometimes', 'boolean'],
            'required' => ['sometimes', 'boolean'],
            'section' => ['sometimes', 'nullable', 'string', 'max:80'],
            'show_in_list' => ['sometimes', 'boolean'],
            'show_on_kanban' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
            'options' => ['sometimes', 'nullable', 'array', 'max:500'],
            'options.*.id' => ['nullable', 'string', 'max:40'],
            'options.*.label' => ['required', 'string', 'max:200'],
        ]);
        if (isset($data['title'])) {
            $data['title'] = trim($data['title']);
        }
        if (array_key_exists('section', $data)) {
            $data['section'] = is_string($data['section']) && trim($data['section']) !== '' ? trim($data['section']) : null;
        }
        $type = $data['type'] ?? $field?->type;
        if ($type === 'list') {
            if (array_key_exists('options', $data) || $creating) {
                $out = [];
                foreach ($data['options'] ?? [] as $one) {
                    $label = trim($one['label']);
                    if ($label === '') {
                        continue;
                    }
                    $id = isset($one['id']) && $one['id'] !== '' ? (string) $one['id'] : 'o'.substr(md5($label.microtime().count($out)), 0, 8);
                    $out[] = ['id' => $id, 'label' => $label];
                }
                abort_if(! $out, 422, 'Добавьте в список хотя бы один вариант');
                $data['options'] = $out;
            }
        } else {
            unset($data['options']);
        }
        if ($type === 'file' || $type === 'boolean') {
            $data['multiple'] = $type === 'file';
        }

        return $data;
    }

    private function renumberStages(array $ids): void
    {
        foreach (array_values($ids) as $i => $id) {
            CrmStage::query()->whereKey($id)->update(['sort' => ($i + 1) * 10]);
        }
    }

    private function changed(): void
    {
        Realtime::changed('crm', DealAccess::everyone());
    }

    private function pipeline(CrmPipeline $one): array
    {
        return [
            'id' => $one->id,
            'title' => $one->title,
            'sort' => $one->sort,
            'isDefault' => $one->is_default,
            'stages' => $one->stages->map(fn (CrmStage $stage) => $this->stage($stage))->values(),
        ];
    }

    private function stage(CrmStage $one): array
    {
        return ['id' => $one->id, 'pipelineId' => $one->pipeline_id, 'title' => $one->title, 'color' => $one->color, 'semantic' => $one->semantic, 'sort' => $one->sort];
    }

    private function field(CrmField $one): array
    {
        return [
            'id' => $one->id,
            'code' => $one->code,
            'title' => $one->title,
            'type' => $one->type,
            'multiple' => $one->multiple,
            'required' => $one->required,
            'options' => $one->options ?? [],
            'section' => $one->section,
            'sort' => $one->sort,
            'showInList' => $one->show_in_list,
            'showOnKanban' => $one->show_on_kanban,
            'active' => $one->active,
            'externalCode' => $one->external_code,
        ];
    }

    private function me(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user && $user->is_active, 401);

        return $user;
    }

    private function admin(Request $request): User
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'settings', 'all'), 403, 'Настраивать CRM могут владелец, администраторы и роли с правом настройки');

        return $me;
    }
}
