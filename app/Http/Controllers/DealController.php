<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\CrmCompany;
use App\Models\CrmContact;
use App\Models\CrmDeal;
use App\Models\CrmDealHistory;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Access;
use App\Support\CrmSearch;
use App\Support\CrmFields;
use App\Support\DealAccess;
use App\Support\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Сделки как в Битрикс24: воронка, стадия, сумма, ответственный, свои поля
 * (CrmField, значения в JSON fields), история изменений. Права — по роли
 * (App\Support\DealAccess). Чужая сделка — 403 без названия и полей,
 * несуществующая — 404. Каждое изменение — событие deal тем, кто видит
 * сделку до правки и после (браузер догружает GET crm/deals?ids=…).
 */
class DealController extends Controller
{
    private const SORT_GAP = 1e-6;

    private const CORE = ['title', 'amount', 'currency', 'responsible_id', 'company', 'contact', 'close_date', 'comments'];

    private const LABELS = [
        'title' => 'Название', 'amount' => 'Сумма', 'currency' => 'Валюта', 'responsible_id' => 'Ответственный',
        'company' => 'Компания', 'contact' => 'Контакт', 'close_date' => 'Дата завершения', 'comments' => 'Комментарий',
        'stage_id' => 'Стадия', 'pipeline_id' => 'Воронка',
    ];

    /* ---------- Список ---------- */

    /**
     * pipeline — воронка; closed=0 — только в работе (канбан), 1 — закрытые,
     * all — все; stage, q, responsible — фильтры; page/per — страницы (список);
     * ids=1,2 — только эти (догрузка по real-time).
     */
    public function index(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к сделкам');
        $query = DealAccess::visible(CrmDeal::query(), $me);

        if ($request->filled('ids')) {
            $ids = array_slice(array_filter(array_map('intval', explode(',', (string) $request->input('ids')))), 0, 500);

            return response()->json(['data' => ['deals' => $query->whereIn('id', $ids)->get()->map(fn (CrmDeal $deal) => $this->brief($deal))]]);
        }
        if ($request->filled('pipeline')) {
            $query->where('pipeline_id', (int) $request->input('pipeline'));
        }
        $closed = (string) $request->input('closed', 'all');
        if ($closed === '0' || $closed === '1') {
            $query->where('closed', $closed === '1');
        }
        if ($request->filled('stage')) {
            $query->where('stage_id', (int) $request->input('stage'));
        }
        if ($request->filled('responsible')) {
            $query->where('responsible_id', (int) $request->input('responsible'));
        }
        if ($request->filled('q')) {
            CrmSearch::apply($query, (string) $request->input('q'));
        }
        $total = (clone $query)->count();
        $sum = (float) (clone $query)->sum('amount');
        $per = min(max((int) $request->input('per', 2000), 1), 3000);
        $page = max((int) $request->input('page', 1), 1);
        $order = (string) $request->input('order', 'board');
        if ($order === 'board') {
            $query->orderBy('sort')->orderByDesc('id');
        } else {
            $column = ['id' => 'id', 'title' => 'title', 'amount' => 'amount', 'created' => 'created_at', 'updated' => 'updated_at', 'close' => 'close_date'][ltrim($order, '-')] ?? 'id';
            $query->orderBy($column, str_starts_with($order, '-') ? 'desc' : 'asc')->orderByDesc('id');
        }
        $deals = $query->forPage($page, $per)->get();

        return response()->json(['data' => [
            'deals' => $deals->map(fn (CrmDeal $deal) => $this->brief($deal)),
            'total' => $total,
            'sum' => $sum,
            'me' => $me->id,
        ]]);
    }

    /** Сводка для обзора: сделки в работе и новые за неделю. */
    public function summary(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к сделкам');
        $open = DealAccess::visible(CrmDeal::query(), $me)->where('closed', false);
        $week = (clone $open)->where('created_at', '>=', now()->subDays(6)->startOfDay());
        $byStage = (clone $open)->select('stage_id', DB::raw('count(*) as n'), DB::raw('sum(amount) as s'))->groupBy('stage_id')->get()
            ->mapWithKeys(fn ($row) => [$row->stage_id => ['count' => (int) $row->n, 'sum' => (float) $row->s]]);

        return response()->json(['data' => [
            'open' => ['count' => (clone $open)->count(), 'sum' => (float) (clone $open)->sum('amount')],
            'week' => ['count' => (clone $week)->count(), 'sum' => (float) (clone $week)->sum('amount')],
            'stages' => $byStage,
        ]]);
    }

    public function show(Request $request, CrmDeal $deal): JsonResponse
    {
        $me = $this->me($request);
        $this->see($deal, $me);

        return response()->json(['data' => $this->full($deal, $me)]);
    }

    /* ---------- Создание и правка ---------- */

    public function store(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless(Access::allows($me, 'crm', 'create') && Access::allows($me, 'crm', 'view'), 403, 'Создавать сделки нельзя: нет права');
        $data = $this->validated($request, true);
        $pipeline = isset($data['pipeline_id']) ? CrmPipeline::query()->findOrFail($data['pipeline_id'])
            : (CrmPipeline::query()->where('entity', 'deal')->orderByDesc('is_default')->orderBy('sort')->firstOrFail());
        $stage = isset($data['stage_id']) ? CrmStage::query()->where('pipeline_id', $pipeline->id)->findOrFail($data['stage_id']) : $pipeline->stages()->first();
        abort_unless($stage, 422, 'В воронке нет стадий');

        $deal = DB::transaction(function () use ($data, $me, $pipeline, $stage) {
            $deal = CrmDeal::query()->create([
                ...collect($data)->only(self::CORE)->all(),
                'pipeline_id' => $pipeline->id,
                'stage_id' => $stage->id,
                'responsible_id' => $data['responsible_id'] ?? $me->id,
                'creator_id' => $me->id,
                'currency' => $data['currency'] ?? 'RUB',
                'amount' => $data['amount'] ?? 0,
                'fields' => $this->fieldValues([], $data['fields'] ?? [], true),
                'sort' => (float) (CrmDeal::query()->min('sort') ?? 0) - 1,
                'closed' => $stage->isClosed(),
                'stage_changed_at' => now(),
            ]);
            $this->log($deal, $me, 'created', null, $deal->title);

            return $deal;
        });
        $this->broadcast([$deal->id => $deal->ownerIds()]);

        return response()->json(['data' => $this->full($deal->fresh(), $me)], 201);
    }

    public function update(Request $request, CrmDeal $deal): JsonResponse
    {
        $me = $this->me($request);
        $this->see($deal, $me);
        $this->canEdit($deal, $me);
        $data = $this->validated($request, false);
        $before = $deal->ownerIds();

        DB::transaction(function () use ($deal, $data, $me) {
            foreach (collect($data)->only(self::CORE)->all() as $field => $value) {
                $old = $this->asText($field, $deal->getAttribute($field));
                $deal->setAttribute($field, $value);
                if ($deal->isDirty($field)) {
                    $this->log($deal, $me, $field, $old, $this->asText($field, $deal->getAttribute($field)));
                }
            }
            if (array_key_exists('fields', $data)) {
                $deal->fields = $this->fieldValues($deal->fields ?? [], $data['fields'] ?? [], false, $deal, $me);
            }
            if (isset($data['pipeline_id']) || isset($data['stage_id'])) {
                $pipelineId = (int) ($data['pipeline_id'] ?? $deal->pipeline_id);
                $stage = isset($data['stage_id'])
                    ? CrmStage::query()->where('pipeline_id', $pipelineId)->find($data['stage_id'])
                    : CrmStage::query()->where('pipeline_id', $pipelineId)->orderBy('sort')->first();
                abort_unless($stage, 422, 'Стадия не из этой воронки');
                $this->applyStage($deal, $me, $stage);
            }
            $deal->version++;
            $deal->save();
            if ($deal->wasChanged('title')) {
                Chat::query()->where('entity', 'deal:'.$deal->id)->update(['title' => Str::limit('Сделка: '.$deal->title, 120, '')]);
            }
        });
        $this->broadcast([$deal->id => array_merge($before, $deal->ownerIds())]);

        return response()->json(['data' => $this->full($deal->fresh(), $me)]);
    }

    /** Канбан: перенос на стадию и место в колонке (перед before). */
    public function move(Request $request, CrmDeal $deal): JsonResponse
    {
        $me = $this->me($request);
        $this->see($deal, $me);
        $this->canEdit($deal, $me);
        $data = $request->validate([
            'stage_id' => ['nullable', 'integer'],
            'before' => ['nullable', 'integer'],
        ]);
        DB::transaction(function () use ($deal, $me, $data) {
            $before = isset($data['before']) ? CrmDeal::query()->find($data['before']) : null;
            if ($before && $before->id !== $deal->id) {
                $prev = CrmDeal::query()->where('sort', '<', $before->sort)->whereKeyNot($deal->id)->orderByDesc('sort')->first();
                if ($prev && $before->sort - $prev->sort < self::SORT_GAP) {
                    $this->renumber();
                    [$before, $prev] = [$before->fresh(), $prev->fresh()];
                }
                $deal->sort = $prev ? ($prev->sort + $before->sort) / 2 : $before->sort - 1;
            } elseif (! $before) {
                $deal->sort = (float) CrmDeal::query()->whereKeyNot($deal->id)->max('sort') + 1;
            }
            if (! empty($data['stage_id']) && (int) $data['stage_id'] !== $deal->stage_id) {
                $stage = CrmStage::query()->where('pipeline_id', $deal->pipeline_id)->find($data['stage_id']);
                abort_unless($stage, 422, 'Стадия не из этой воронки');
                $this->applyStage($deal, $me, $stage);
            }
            $deal->version++;
            $deal->save();
        });
        $this->broadcast([$deal->id => $deal->ownerIds()]);

        return response()->json(['data' => $this->brief($deal->fresh())]);
    }

    public function destroy(Request $request, CrmDeal $deal): Response
    {
        $me = $this->me($request);
        $this->see($deal, $me);
        abort_unless(DealAccess::can($me, 'delete', $deal), 403, 'Удалять эту сделку нельзя: нет права');
        $owners = [$deal->id => $deal->ownerIds()];
        DB::transaction(function () use ($deal) {
            DB::table('tasks')->where('deal_id', $deal->id)->update(['deal_id' => null]);
            $deal->delete();
            Chat::dropEntity('deal:'.$deal->id);
        });
        $this->broadcast($owners);

        return response()->noContent();
    }

    /* ---------- Внутреннее ---------- */

    private function validated(Request $request, bool $creating): array
    {
        $data = $request->validate([
            'title' => [$creating ? 'required' : 'sometimes', 'string', 'max:250'],
            'amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'responsible_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'company' => ['sometimes', 'nullable', 'string', 'max:250'],
            'contact' => ['sometimes', 'nullable', 'string', 'max:250'],
            'close_date' => ['sometimes', 'nullable', 'date'],
            'comments' => ['sometimes', 'nullable', 'string', 'max:200000'],
            'pipeline_id' => ['sometimes', 'integer', 'exists:crm_pipelines,id'],
            'stage_id' => ['sometimes', 'integer', 'exists:crm_stages,id'],
            'fields' => ['sometimes', 'nullable', 'array'],
        ]);
        if (isset($data['title'])) {
            $data['title'] = trim($data['title']);
            abort_if($data['title'] === '', 422, 'Название не может быть пустым');
        }
        foreach (['company', 'contact', 'comments'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = is_string($data[$key]) && trim($data[$key]) !== '' ? trim($data[$key]) : null;
            }
        }
        if (array_key_exists('amount', $data)) {
            $data['amount'] = (float) ($data['amount'] ?? 0);
        }
        if (isset($data['currency'])) {
            $data['currency'] = strtoupper($data['currency']);
        }

        return $data;
    }

    /** Свои поля: только известные и включённые; проверка по типу, история. */
    private function fieldValues(array $current, array $input, bool $creating, ?CrmDeal $deal = null, ?User $me = null): array
    {
        $fields = CrmField::query()->where('entity', 'deal')->get()->keyBy('code');
        foreach ($input as $code => $value) {
            $field = $fields->get($code);
            if (! $field || $field->type === 'file') {
                continue;
            }
            $new = CrmFields::normalize($field, $value);
            $old = $current[$code] ?? null;
            if ($new === null || $new === [] || $new === false && $field->type === 'boolean' && $old === null) {
                unset($current[$code]);
            } else {
                $current[$code] = $new;
            }
            if ($deal && $me && $old !== ($current[$code] ?? null)) {
                $this->log($deal, $me, 'fields.'.$code, CrmFields::text($field, $old), CrmFields::text($field, $current[$code] ?? null));
            }
        }
        foreach ($fields as $field) {
            if ($creating && $field->required && $field->active && ! array_key_exists($field->code, $current)) {
                abort(422, "Заполните поле «{$field->title}»");
            }
        }

        return $current;
    }

    private function applyStage(CrmDeal $deal, User $me, CrmStage $stage): void
    {
        if ($stage->id === $deal->stage_id && $stage->pipeline_id === $deal->pipeline_id) {
            return;
        }
        $oldStage = CrmStage::query()->find($deal->stage_id);
        if ($stage->pipeline_id !== $deal->pipeline_id) {
            $this->log($deal, $me, 'pipeline_id', CrmPipeline::query()->whereKey($deal->pipeline_id)->value('title'), $stage->pipeline->title);
            $deal->pipeline_id = $stage->pipeline_id;
        }
        $this->log($deal, $me, 'stage_id', $oldStage?->title, $stage->title);
        $deal->stage_id = $stage->id;
        $deal->closed = $stage->isClosed();
        $deal->stage_changed_at = now();
    }

    private function renumber(): void
    {
        $i = 0;
        foreach (CrmDeal::query()->orderBy('sort')->orderByDesc('id')->pluck('id') as $id) {
            DB::table('crm_deals')->where('id', $id)->update(['sort' => ++$i]);
        }
    }

    private function log(CrmDeal $deal, User $me, string $field, ?string $old, ?string $new): void
    {
        CrmDealHistory::query()->create(['deal_id' => $deal->id, 'user_id' => $me->id, 'field' => $field, 'old' => $old, 'new' => $new, 'created_at' => now()]);
    }

    private function asText(string $field, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return match ($field) {
            'responsible_id' => User::query()->whereKey($value)->value('name'),
            'close_date' => $value instanceof \DateTimeInterface ? $value->format('Y-m-d') : (string) $value,
            'amount' => rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.'),
            'comments' => Str::limit((string) $value, 300),
            default => (string) $value,
        };
    }

    private function broadcast(array $owners): void
    {
        Realtime::changed('deal', DealAccess::audience($owners));
    }

    private function brief(CrmDeal $deal): array
    {
        return [
            'id' => $deal->id,
            'pipelineId' => $deal->pipeline_id,
            'stageId' => $deal->stage_id,
            'title' => $deal->title,
            'amount' => (float) $deal->amount,
            'currency' => $deal->currency,
            'responsibleId' => $deal->responsible_id,
            'creatorId' => $deal->creator_id,
            'company' => $deal->company,
            'contact' => $deal->contact,
            'closeDate' => $deal->close_date?->toDateString(),
            'closed' => $deal->closed,
            'fields' => (object) ($deal->fields ?? []),
            'sort' => $deal->sort,
            'stageChangedAt' => $deal->stage_changed_at?->toIso8601String(),
            'createdAt' => $deal->created_at?->toIso8601String(),
            'updatedAt' => $deal->updated_at?->toIso8601String(),
            'version' => $deal->version,
        ];
    }

    /** Компания сделки с телефонами и почтой (перенесённая из Битрикс24). */
    private function companyInfo(?int $id): ?array
    {
        $one = $id ? CrmCompany::query()->find($id) : null;

        return $one ? ['id' => $one->id, 'title' => $one->title, 'phones' => $one->phones ?? [], 'emails' => $one->emails ?? [], 'webs' => $one->webs ?? [], 'address' => $one->address] : null;
    }

    /** Все контакты сделки (основной — первым). */
    private function contactList(CrmDeal $deal): array
    {
        $ids = DB::table('crm_deal_contacts')->where('deal_id', $deal->id)->orderBy('sort')->pluck('contact_id')->map(fn ($id) => (int) $id)->all();
        if ($deal->contact_id && ! in_array((int) $deal->contact_id, $ids, true)) {
            array_unshift($ids, (int) $deal->contact_id);
        }

        return CrmContact::query()->whereIn('id', $ids)->get()->sortBy(fn ($one) => array_search($one->id, $ids))->values()
            ->map(fn (CrmContact $one) => ['id' => $one->id, 'name' => $one->name, 'post' => $one->post, 'phones' => $one->phones ?? [], 'emails' => $one->emails ?? []])->all();
    }

    private function contactInfo(?int $id): ?array
    {
        $one = $id ? CrmContact::query()->find($id) : null;

        return $one ? ['id' => $one->id, 'name' => $one->name, 'post' => $one->post, 'phones' => $one->phones ?? [], 'emails' => $one->emails ?? []] : null;
    }

    private function full(CrmDeal $deal, User $me): array
    {
        return $this->brief($deal) + [
            'comments' => $deal->comments,
            'externalId' => $deal->external_id,
            'companyInfo' => $this->companyInfo($deal->company_id),
            'contactInfo' => $this->contactInfo($deal->contact_id),
            'products' => ProductRows::of('deal', $deal->id),
            'invoices' => InvoiceRows::of('deal_id', $deal->id),
            'documents' => CrmDocumentController::of('deal', $deal->id),
            'contactList' => $this->contactList($deal),
            'history' => $deal->history()->orderByDesc('id')->limit(200)->get()->map(fn (CrmDealHistory $one) => [
                'id' => $one->id, 'userId' => $one->user_id, 'field' => $one->field, 'old' => $one->old, 'new' => $one->new,
                'at' => $one->created_at?->toIso8601String(),
            ]),
            'can' => ['edit' => DealAccess::can($me, 'edit', $deal), 'delete' => DealAccess::can($me, 'delete', $deal)],
        ];
    }

    private function me(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user && $user->is_active, 401);

        return $user;
    }

    private function see(CrmDeal $deal, User $me): void
    {
        abort_unless(DealAccess::can($me, 'view', $deal), 403, 'Нет доступа к сделке');
    }

    private function canEdit(CrmDeal $deal, User $me): void
    {
        abort_unless(DealAccess::can($me, 'edit', $deal), 403, 'Менять эту сделку нельзя: нет права');
    }
}
