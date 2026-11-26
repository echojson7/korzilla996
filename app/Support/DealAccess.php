<?php

namespace App\Support;

use App\Models\CrmDeal;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Права на сделки по уровням роли (раздел crm в App\Support\Access):
 * «свои» — где сотрудник ответственный или создатель; «отдела» — где
 * ответственный или создатель из его отдела; «все» — любые. Как задачи,
 * только без участников. Настройки воронок и полей — право crm.settings.
 */
class DealAccess
{
    public static function can(User $me, string $action, CrmDeal $deal): bool
    {
        $owners = $deal->ownerIds();

        return match (Access::level($me, 'crm', $action)) {
            'all' => true,
            'dept' => (bool) array_intersect($owners, Access::colleagues($me)),
            'own' => in_array($me->id, $owners, true),
            default => false,
        };
    }

    public static function visible(Builder $query, User $me): Builder
    {
        $level = Access::level($me, 'crm', 'view');
        if ($level === 'all') {
            return $query;
        }
        if ($level === 'none') {
            return $query->whereRaw('1 = 0');
        }
        $ids = $level === 'dept' ? Access::colleagues($me) : [$me->id];

        return $query->where(fn ($q) => $q->whereIn('responsible_id', $ids)->orWhereIn('creator_id', $ids));
    }

    /**
     * Кому слать событие deal: тем, кто видит сделку. Сотрудников немного,
     * поэтому проверяем каждого действующего; владельцы и администраторы
     * видят всё.
     *
     * @param  array<int, int[]>  $owners  id сделки → её ответственный и создатель (до и после правки)
     * @return array<int, int[]> сотрудник → id сделок
     */
    public static function audience(array $owners): array
    {
        if (! $owners) {
            return [];
        }
        $byUser = [];
        $users = User::query()->where('is_active', true)->with('roleRecord')->get();
        foreach ($users as $user) {
            $level = Access::level($user, 'crm', 'view');
            if ($level === 'none') {
                continue;
            }
            $mine = $level === 'dept' ? Access::colleagues($user) : [$user->id];
            foreach ($owners as $dealId => $ids) {
                if ($level === 'all' || array_intersect($ids, $mine)) {
                    $byUser[$user->id][] = (int) $dealId;
                }
            }
        }

        return $byUser;
    }

    /** Всем, кто видит раздел CRM: поменялись воронки, стадии или поля. */
    public static function everyone(): array
    {
        return User::query()->where('is_active', true)->with('roleRecord')->get()
            ->filter(fn (User $user) => Access::allows($user, 'crm', 'view'))
            ->mapWithKeys(fn (User $user) => [$user->id => [1]])->all();
    }
}
