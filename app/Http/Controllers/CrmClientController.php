<?php

namespace App\Http\Controllers;

use App\Models\CrmCompany;
use App\Models\CrmContact;
use App\Models\CrmDeal;
use App\Models\User;
use App\Support\Access;
use App\Support\CrmSearch;
use App\Support\DealAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Компании и контакты CRM (перенесены из Битрикс24). Права — как у
 * сделок (раздел crm): «свои» — где сотрудник ответственный или
 * создатель, «отдела» — его отдел, «все» — любые. Пока только просмотр
 * и поиск; правка — следующим шагом.
 */
class CrmClientController extends Controller
{
    private const PER = 50;

    public function companies(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $query = CrmSearch::apply(DealAccess::visible(CrmCompany::query(), $me), (string) $request->input('q'));

        return $this->page($request, $query->withCount('deals'), fn (CrmCompany $one) => $this->companyRow($one) + ['deals' => $one->deals_count]);
    }

    public function contacts(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $query = CrmSearch::apply(DealAccess::visible(CrmContact::query(), $me), (string) $request->input('q'));

        return $this->page($request, $query->with('company:id,title')->withCount('deals'), fn (CrmContact $one) => $this->contactRow($one) + ['deals' => $one->deals_count]);
    }

    private function companyRow(CrmCompany $one): array
    {
        return [
            'id' => $one->id, 'title' => $one->title, 'type' => $one->type, 'industry' => $one->industry,
            'phones' => $one->phones ?? [], 'emails' => $one->emails ?? [], 'webs' => $one->webs ?? [], 'address' => $one->address,
            'responsibleId' => $one->responsible_id, 'createdAt' => $one->created_at?->toIso8601String(),
        ];
    }

    public function showCompany(Request $request, CrmCompany $company): JsonResponse
    {
        $me = $this->me($request);
        $this->allowed($me, $company);

        return response()->json(['data' => $this->companyRow($company) + [
            'comments' => $company->comments,
            'contacts' => CrmContact::query()->where('company_id', $company->id)->orderBy('name')->limit(200)->get()->map(fn (CrmContact $c) => $this->contactRow($c)),
            'dealList' => $this->deals($me, 'company_id', $company->id),
        ]]);
    }

    public function showContact(Request $request, CrmContact $contact): JsonResponse
    {
        $me = $this->me($request);
        $this->allowed($me, $contact);
        $contact->load('company:id,title');

        return response()->json(['data' => $this->contactRow($contact) + [
            'comments' => $contact->comments,
            'birthday' => $contact->birthday?->toDateString(),
            'dealList' => $this->deals($me, 'contact_id', $contact->id),
        ]]);
    }

    /* ---------- Внутреннее ---------- */

    private function contactRow(CrmContact $one): array
    {
        return [
            'id' => $one->id, 'name' => $one->name, 'post' => $one->post,
            'phones' => $one->phones ?? [], 'emails' => $one->emails ?? [],
            'companyId' => $one->company_id, 'company' => $one->relationLoaded('company') ? $one->company?->title : null,
            'responsibleId' => $one->responsible_id, 'createdAt' => $one->created_at?->toIso8601String(),
        ];
    }

    private function deals(User $me, string $column, int $id): array
    {
        return DealAccess::visible(CrmDeal::query(), $me)->where($column, $id)->with('stage:id,title,color,semantic')->orderByDesc('id')->limit(200)->get()
            ->map(fn (CrmDeal $deal) => [
                'id' => $deal->id, 'title' => $deal->title, 'amount' => (float) $deal->amount, 'currency' => $deal->currency,
                'closed' => $deal->closed, 'stage' => $deal->stage?->title, 'color' => $deal->stage?->color, 'semantic' => $deal->stage?->semantic,
                'createdAt' => $deal->created_at?->toIso8601String(),
            ])->all();
    }

    private function page(Request $request, Builder $query, callable $map): JsonResponse
    {
        $total = (clone $query)->toBase()->getCountForPagination();
        $page = max((int) $request->input('page', 1), 1);
        $rows = $query->orderByDesc('id')->forPage($page, self::PER)->get();

        return response()->json(['data' => ['rows' => $rows->map($map)->values(), 'total' => $total, 'per' => self::PER]]);
    }

    private function allowed(User $me, CrmCompany|CrmContact $one): void
    {
        $owners = array_values(array_filter([(int) $one->responsible_id, (int) $one->creator_id]));
        $ok = match (Access::level($me, 'crm', 'view')) {
            'all' => true,
            'dept' => (bool) array_intersect($owners, Access::colleagues($me)),
            'own' => in_array($me->id, $owners, true),
            default => false,
        };
        abort_unless($ok, 403, 'Нет доступа');
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
