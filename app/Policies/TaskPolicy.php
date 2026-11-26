<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\TaskMember;
use App\Models\User;
use App\Support\Access;
use Illuminate\Database\Eloquent\Builder;

/**
 * Права на задачи по уровням роли (App\Support\Access):
 * - видеть: свои — где сотрудник участник; отдела — где участвует кто-то
 *   из его отдела; все — любые;
 * - менять: свои — где он постановщик или ответственный; отдела — где
 *   постановщик или ответственный из его отдела; все — любые;
 * - удалять: свои — где он постановщик; отдела — постановщик из отдела.
 * Уровень «нет» закрывает действие совсем, даже для своих задач.
 */
class TaskPolicy
{
    public function viewAny(User $me): bool
    {
        return Access::allows($me, 'tasks', 'view');
    }

    public function view(User $me, Task $task): bool
    {
        return match (Access::level($me, 'tasks', 'view')) {
            'all' => true,
            'dept' => (bool) array_intersect($task->participantIds(), Access::colleagues($me)),
            'own' => in_array($me->id, $task->participantIds(), true),
            default => false,
        };
    }

    public function create(User $me): bool
    {
        return Access::allows($me, 'tasks', 'create') && Access::allows($me, 'tasks', 'view');
    }

    public function update(User $me, Task $task): bool
    {
        return $this->scoped($me, 'edit', [$task->creator_id, $task->responsible_id]);
    }

    /** Работать с задачей (статус, чек-лист, файлы, время): кто может менять, и соисполнители. */
    public function work(User $me, Task $task): bool
    {
        return $this->update($me, $task)
            || ($this->view($me, $task) && $task->members->contains(fn ($m) => $m->user_id === $me->id && $m->role === 'accomplice'));
    }

    public function delete(User $me, Task $task): bool
    {
        return $this->scoped($me, 'delete', [$task->creator_id]);
    }

    /** Чужое (комментарий, время, файл) в задаче: только с правом менять все задачи. */
    public function moderate(User $me, Task $task): bool
    {
        return Access::level($me, 'tasks', 'edit') === 'all';
    }

    /** Задачи, которые видит сотрудник, — условие для списка. */
    public static function visible(Builder $query, User $me): Builder
    {
        $level = Access::level($me, 'tasks', 'view');
        if ($level === 'all') {
            return $query;
        }
        if ($level === 'none') {
            return $query->whereRaw('1 = 0');
        }
        $ids = $level === 'dept' ? Access::colleagues($me) : [$me->id];

        return $query->where(fn ($q) => $q->whereIn('creator_id', $ids)->orWhereIn('responsible_id', $ids)
            ->orWhereIn('id', TaskMember::query()->select('task_id')->whereIn('user_id', $ids)));
    }

    private function scoped(User $me, string $action, array $owners): bool
    {
        $owners = array_filter($owners);

        return match (Access::level($me, 'tasks', $action)) {
            'all' => true,
            'dept' => (bool) array_intersect($owners, Access::colleagues($me)),
            'own' => in_array($me->id, $owners, true),
            default => false,
        };
    }
}
