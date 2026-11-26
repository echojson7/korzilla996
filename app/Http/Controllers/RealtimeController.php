<?php

namespace App\Http\Controllers;

use App\Support\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Общий канал обновлений для браузера.
 *
 * GET realtime?after=N — что поменялось после события N (типы и id
 * записей) и номер последнего события. Это и догрузка после обрыва
 * связи, и запасной опрос, когда Mercure нет: пока ничего не менялось,
 * ответ берётся из кэша и базу не трогает.
 * Без after — только номер последнего события. С sub=1 ещё и подписка на Mercure: хаб, тема, токен.
 */
class RealtimeController extends Controller
{
    public function sync(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user && $user->is_active, 401);
        $data = $request->validate(['after' => ['nullable', 'integer', 'min:0'], 'sub' => ['nullable', 'boolean']]);
        $state = Realtime::since($user->id, isset($data['after']) ? (int) $data['after'] : null);
        if ($request->boolean('sub')) {
            $state['realtime'] = Realtime::subscription($user->id);
        }

        return response()->json(['data' => $state]);
    }
}
