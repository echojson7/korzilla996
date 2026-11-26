<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Сессии лежат в файлах (не в базе), поэтому «выйти на других устройствах»
 * не удаляет строки из таблицы, а работает так: в сессии хранится отпечаток
 * пароля. Сменили пароль (сам сотрудник или администратор) — у всех
 * остальных входов отпечаток не сходится, и они выходят. Выключенная
 * учётка выходит сразу же, на первом запросе.
 */
class CheckSignIn
{
    public const KEY = 'auth_stamp';

    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->hasSession() ? $request->user() : null;
        if ($user) {
            $session = $request->session();
            $saved = $session->get(self::KEY);
            $stamp = self::stamp($user);
            /* Отпечаток другого сотрудника (вошли поверх чужого входа) — не повод выходить. */
            $same = is_string($saved) && str_starts_with($saved, $user->getAuthIdentifier().':');
            if (! $user->is_active || ($same && ! hash_equals($saved, $stamp))) {
                /* logoutCurrentDevice, не logout: тот меняет remember_token
                   и выкинул бы заодно все остальные входы сотрудника. */
                Auth::guard('web')->logoutCurrentDevice();
                $session->invalidate();
                $session->regenerateToken();
            } elseif (! $same) {
                $session->put(self::KEY, $stamp);
            }
        }

        return $next($request);
    }

    public static function stamp(User $user): string
    {
        return $user->getAuthIdentifier().':'.hash('sha256', (string) $user->getAuthPassword());
    }
}
