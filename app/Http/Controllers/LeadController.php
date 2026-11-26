<?php

namespace App\Http\Controllers;

use App\Models\CrmContact;
use App\Models\CrmField;
use App\Models\CrmLead;
use App\Models\CrmPipeline;
use App\Models\User;
use App\Support\Access;
use App\Support\CrmSearch;
use App\Support\DealAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Лиды CRM (перенесены из Битрикс24): статусы — стадии «воронки»
 * лидов, свои поля — crm_fields с entity = lead. Права — раздел crm,
 * как у сделок (ответственный или создатель). Пока просмотр и поиск.
 */
class LeadController extends Controller
{
    private const PER = 50;

    public function schema(Request $request, CrmController $crm): JsonResponse
    {
        $me = $this->me($request);
        $pipeline = CrmPipeline::query()->where('entity', 'lead')->with('stages')->first();
        $counts = $pipeline ? DealAccess::visible(CrmLead::query(), $me)->select('stage_id', DB::raw('count(*) as n'))->groupBy('stage_id')->pluck('n', 'stage_id') : collect();

        return response()->json(['data' => [
            'pipeline' => $pipeline ? $crm->pipeline($pipeline) : null,
            'counts' => $counts,
            'fields' => CrmField::query()->where('entity', 'lead')->where('active', true)->orderBy('sort')->orderBy('id')->get()->map(fn (CrmField $one) => $crm->field($one)),
        ]]);
    }

    public function index(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $query = DealAccess::visible(CrmLead::query(), $me);
        if ($request->filled('stage')) {
            $query->where('stage_id', (int) $request->input('stage'));
        }
        $closed = (string) $request->input('closed', 'all');
        if ($closed === '0' || $closed === '1') {
            $query->where('closed', $closed === '1');
        }
        CrmSearch::apply($query, (string) $request->input('q'));
        $total = (clone $query)->count();
        $page = max((int) $request->input('page', 1), 1);
        $rows = $query->orderBy('sort')->orderByDesc('id')->forPage($page, self::PER)->get();

        return response()->json(['data' => ['rows' => $rows->map(fn (CrmLead $one) => $this->brief($one)), 'total' => $total, 'per' => self::PER]]);
    }

    public function show(Request $request, CrmLead $lead): JsonResponse
    {
        $me = $this->me($request);
        $owners = array_values(array_filter([(int) $lead->responsible_id, (int) $lead->creator_id]));
        $ok = match (Access::level($me, 'crm', 'view')) {
            'all' => true,
            'dept' => (bool) array_intersect($owners, Access::colleagues($me)),
            'own' => in_array($me->id, $owners, true),
            default => false,
        };
        abort_unless($ok, 403, 'Нет доступа к лиду');
        $contacts = DB::table('crm_lead_contacts')->where('lead_id', $lead->id)->orderBy('sort')->pluck('contact_id')->all();
        if (! $contacts && $lead->contact_id) {
            $contacts = [$lead->contact_id];
        }

        return response()->json(['data' => $this->brief($lead) + [
            'comments' => $lead->comments,
            'fields' => (object) ($lead->fields ?? []),
            'webs' => $lead->webs ?? [],
            'address' => $lead->address,
            'companyId' => $lead->company_id,
            'contacts' => CrmContact::query()->whereIn('id', $contacts)->get()
                ->sortBy(fn ($one) => array_search($one->id, $contacts))->values()
                ->map(fn (CrmContact $one) => ['id' => $one->id, 'name' => $one->name, 'post' => $one->post, 'phones' => $one->phones ?? [], 'emails' => $one->emails ?? []]),
            'products' => ProductRows::of('lead', $lead->id),
            'invoices' => InvoiceRows::of('lead_id', $lead->id),
            'documents' => CrmDocumentController::of('lead', $lead->id),
            'smart' => SmartController::related('lead_id', $lead->id),
            'externalId' => $lead->external_id,
        ]]);
    }

    private function brief(CrmLead $one): array
    {
        return [
            'id' => $one->id, 'title' => $one->title, 'name' => $one->name, 'post' => $one->post, 'companyTitle' => $one->company_title,
            'stageId' => $one->stage_id, 'closed' => $one->closed, 'amount' => (float) $one->amount, 'currency' => $one->currency,
            'phones' => $one->phones ?? [], 'emails' => $one->emails ?? [],
            'responsibleId' => $one->responsible_id, 'creatorId' => $one->creator_id,
            'createdAt' => $one->created_at?->toIso8601String(), 'updatedAt' => $one->updated_at?->toIso8601String(),
        ];
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
