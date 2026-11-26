<?php

namespace App\Support;

use App\Models\Chat;
use App\Models\ChatMember;
use App\Models\Task;
use App\Models\TaskHistory;
use App\Models\TaskMember;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Упомянули человека (@Имя) в чате задачи — он становится наблюдателем,
 * если у него ещё нет роли в задаче, и попадает в чат обсуждения.
 */
class TaskMentions
{
    /** Кого упомянули в тексте: «@Имя» целиком, за ним не буква и не цифра. */
    public static function people(string $body): Collection
    {
        if (! str_contains($body, '@')) {
            return collect();
        }

        return User::query()->where('is_active', true)->get(['id', 'name'])
            ->filter(fn (User $user) => trim($user->name) !== ''
                && preg_match('/@'.preg_quote(trim($user->name), '/').'(?![\p{L}\p{N}])/iu', $body))
            ->values();
    }

    /** @return User[] кого добавили наблюдателями */
    public static function apply(Chat $chat, User $me, string $body): array
    {
        if (! preg_match('/^task:(\d+)$/', (string) $chat->entity, $m)) {
            return [];
        }
        $task = Task::query()->with('members')->find((int) $m[1]);
        if (! $task) {
            return [];
        }
        $had = $task->participantIds();
        $added = self::people($body)->reject(fn (User $user) => in_array($user->id, $had, true))->values();
        if ($added->isEmpty()) {
            return [];
        }
        $before = $task->members->where('role', 'auditor')->pluck('user_id');
        foreach ($added as $user) {
            TaskMember::query()->create(['task_id' => $task->id, 'user_id' => $user->id, 'role' => 'auditor']);
            ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $user->id]);
        }
        $names = fn (Collection $ids) => $ids->isEmpty() ? null
            : User::query()->whereIn('id', $ids)->orderBy('name')->pluck('name')->implode(', ');
        TaskHistory::query()->create([
            'task_id' => $task->id, 'user_id' => $me->id, 'field' => 'auditors',
            'old' => $names($before), 'new' => $names($before->merge($added->pluck('id'))),
        ]);

        /* Как правка задачи через её API: версия растёт, участники и
           администраторы получают событие task (см. BroadcastTaskChanges). */
        DB::table('tasks')->where('id', $task->id)->increment('version');
        $byUser = [];
        foreach (array_unique(array_merge($had, $added->pluck('id')->all(), Realtime::admins())) as $userId) {
            $byUser[$userId] = [$task->id];
        }
        Realtime::changed('task', $byUser);

        return $added->all();
    }
}
