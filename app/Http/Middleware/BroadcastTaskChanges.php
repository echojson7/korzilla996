<?php

namespace App\Http\Middleware;

use App\Models\Task;
use App\Support\Realtime;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Любое изменение задачи (поля, статус, участники, чек-лист, файлы, время,
 * комментарии, удаление) — событие task всем, кто её видел до правки и
 * видит после, плюс тем, кто видит родительскую задачу. Контроллер про
 * real-time не знает: задачу берём из параметров маршрута.
 *
 * version задачи растёт до действия, поэтому ответ своему браузеру уже
 * несёт новый номер и событие о своей же правке лишний раз не грузит.
 */
class BroadcastTaskChanges
{
    private const PARAMS = ['task', 'item', 'file', 'comment', 'entry'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethodSafe()) {
            return $next($request);
        }
        $ids = [];
        foreach (self::PARAMS as $key) {
            $param = $request->route($key);
            if ($param instanceof Task) {
                $ids[] = $param->id;
            } elseif (is_object($param) && isset($param->task_id)) {
                $ids[] = (int) $param->task_id;
            }
        }
        $before = $this->audience($ids);
        if ($ids) {
            DB::table('tasks')->whereIn('id', $ids)->increment('version');
        }

        $response = $next($request);

        if ($response->getStatusCode() >= 400) {
            return $response;
        }
        if (! $ids && $response instanceof JsonResponse && $request->route()?->getActionMethod() === 'store') {
            $ids[] = (int) ($response->getData(true)['data']['id'] ?? 0);
        }
        $ids = array_filter($ids);
        if (! $ids) {
            return $response;
        }
        $after = $this->audience($ids);
        /* Родитель тоже поменялся: у него список и счётчик подзадач. */
        $parents = array_diff(array_unique(array_filter(array_merge($before['parents'], $after['parents']))), $ids);
        if ($parents) {
            DB::table('tasks')->whereIn('id', $parents)->increment('version');
            $after['users'] += $this->audience($parents)['users'];
        }

        $admins = Realtime::admins();
        $byUser = [];
        foreach (array_merge($ids, $parents) as $id) {
            $users = array_unique(array_merge($before['users'][$id] ?? [], $after['users'][$id] ?? [], $admins));
            foreach ($users as $userId) {
                $byUser[$userId][] = $id;
            }
        }
        Realtime::changed('task', $byUser);

        return $response;
    }

    /** @return array{users: array<int, int[]>, parents: int[]} */
    private function audience(array $ids): array
    {
        if (! $ids) {
            return ['users' => [], 'parents' => []];
        }
        $tasks = Task::query()->with('members:id,task_id,user_id')->whereIn('id', $ids)
            ->get(['id', 'parent_id', 'creator_id', 'responsible_id']);

        return [
            'users' => $tasks->mapWithKeys(fn (Task $task) => [$task->id => $task->participantIds()])->all(),
            'parents' => $tasks->pluck('parent_id')->filter()->map(fn ($id) => (int) $id)->all(),
        ];
    }
}
