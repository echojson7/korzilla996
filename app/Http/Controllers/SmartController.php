<?php

namespace App\Http\Controllers;

use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\User;
use App\Support\Access;
use App\Support\CrmSearch;
use App\Support\DealAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Смарт-процессы CRM («Договоры», «Претензии» из Битрикс24): типы,
 * список элементов типа и карточка. Права — раздел crm, как у сделок.
 */
class SmartController extends Controller
{
    private const PER = 50;

    public function types(Request $request, CrmController $crm): JsonResponse
    {
        $me = $this->me($request);
        $counts = $this->visible($me)->select('type_id', DB::raw('count(*) as n'))->groupBy('type_id')->pluck('n', 'type_id');

        return response()->json(['data' => DB::table('crm_smart_types')->orderBy('sort')->orderBy('id')->get()->map(fn ($type) => [
            'id' => (int) $type->id, 'title' => $type->title, 'count' => (int) ($counts[$type->id] ?? 0),
            'pipelines' => CrmPipeline::query()->where('entity', 'smart:'.$type->id)->with('stages')->orderBy('sort')->get()->map(fn ($one) => $crm->pipeline($one)),
            'fields' => CrmField::query()->where('entity', 'smart:'.$type->id)->where('active', true)->orderBy('sort')->get()->map(fn ($one) => $crm->field($one)),
        ])]);
    }

    public function index(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $query = $this->visible($me)->where('type_id', (int) $request->input('type'));
        if ($request->filled('stage')) {
            $query->where('stage_id', (int) $request->input('stage'));
        }
        if ($request->filled('q')) {
            CrmSearch::apply($query, (string) $request->input('q'));
        }
        $total = (clone $query)->count();
        $rows = $query->orderByDesc('id')->forPage(max((int) $request->input('page', 1), 1), self::PER)->get();

        return response()->json(['data' => ['rows' => $rows->map(fn ($one) => self::brief($one)), 'total' => $total]]);
    }

    public function show(Request $request, int $item): JsonResponse
    {
        $me = $this->me($request);
        $one = $this->visible($me)->where('id', $item)->first();
        abort_unless($one, 404, 'Нет такого элемента или нет доступа');

        return response()->json(['data' => self::brief($one) + [
            'fields' => (object) (json_decode((string) $one->fields, true) ?: []),
            'deal' => $one->deal_id ? DB::table('crm_deals')->where('id', $one->deal_id)->value('title') : null,
            'company' => $one->company_id ? DB::table('crm_companies')->where('id', $one->company_id)->value('title') : null,
            'contact' => $one->contact_id ? DB::table('crm_contacts')->where('id', $one->contact_id)->value('name') : null,
            'documents' => CrmDocumentController::of('smart', (int) $one->id),
        ]]);
    }

    /** Элементы смарт-процессов, связанные со сделкой или лидом, по типам. */
    public static function related(string $column, int $id): array
    {
        $types = DB::table('crm_smart_types')->pluck('title', 'id');

        return DB::table('crm_smart_items')->where($column, $id)->orderByDesc('id')->limit(100)->get()
            ->map(fn ($one) => self::brief($one) + ['typeTitle' => $types[$one->type_id] ?? ''])->all();
    }

    public static function brief(object $one): array
    {
        return [
            'id' => (int) $one->id, 'typeId' => (int) $one->type_id, 'title' => $one->title, 'stageId' => $one->stage_id ? (int) $one->stage_id : null,
            'stage' => $one->stage_id ? DB::table('crm_stages')->where('id', $one->stage_id)->first(['title', 'color', 'semantic']) : null,
            'amount' => (float) $one->amount, 'currency' => $one->currency, 'closed' => (bool) $one->closed,
            'responsibleId' => $one->responsible_id ? (int) $one->responsible_id : null,
            'dealId' => $one->deal_id ? (int) $one->deal_id : null, 'leadId' => $one->lead_id ? (int) $one->lead_id : null,
            'companyId' => $one->company_id ? (int) $one->company_id : null, 'contactId' => $one->contact_id ? (int) $one->contact_id : null,
            'beginDate' => $one->begin_date, 'closeDate' => $one->close_date, 'createdAt' => $one->created_at,
        ];
    }

    private function visible(User $me)
    {
        $query = DB::table('crm_smart_items');
        $level = Access::level($me, 'crm', 'view');
        if ($level === 'all') {
            return $query;
        }
        $ids = $level === 'dept' ? Access::colleagues($me) : [$me->id];

        return $query->where(fn ($q) => $q->whereIn('responsible_id', $ids)->orWhereIn('creator_id', $ids));
    }

    private function me(Request $request): User
    {
        /** @var User|null $me */
        $me = $request->user();
        abort_unless($me && $me->is_active, 401);
        abort_unless(Access::allows($me, 'crm', 'view'), 403, 'Нет доступа к CRM');

        return $me;
    }
}
