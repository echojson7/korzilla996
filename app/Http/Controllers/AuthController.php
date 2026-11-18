<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Вход сотрудников в портал — тот же контракт, что у экрана входа admin2
 * в korzillaX: GET auth, POST auth/login, POST auth/logout, ответ { data }.
 *
 * Ошибка входа одна на все случаи, и пароль сверяется даже без учётки:
 * иначе текст ошибки и время ответа выдают, какие адреса заведены.
 */
class AuthController extends Controller
{
    /** Пять попыток в минуту на пару «почта + адрес». */
    private const ATTEMPTS = 5;

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->state($request)]);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ], [
            'email.required' => 'Введите почту и пароль',
            'password.required' => 'Введите почту и пароль',
        ]);

        $email = mb_strtolower(trim($data['email']));
        $key = 'login:'.sha1($email.'|'.$request->ip());
        if (RateLimiter::tooManyAttempts($key, self::ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages(['email' => "Слишком много попыток. Попробуйте через {$seconds} с."])->status(429);
        }

        $user = User::query()->where('email', $email)->first();
        $ok = Hash::check($data['password'], $user?->password ?? self::dummy());
        if (! $ok || ! $user || ! $user->is_active) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => 'Неверная почта или пароль']);
        }

        RateLimiter::clear($key);
        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return response()->json(['data' => $this->state($request)]);
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    private function state(Request $request): array
    {
        /** @var User|null $user */
        $user = $request->user();
        if ($user && ! $user->is_active) {
            Auth::guard('web')->logout();
            $user = null;
        }

        return [
            'admin' => $user ? [
                'name' => $user->name,
                'initials' => $user->initials(),
                'email' => $user->email,
                'role' => $user->role,
                'roleLabel' => User::ROLES[$user->role] ?? $user->role,
                'position' => $user->position,
                'permissions' => $user->permissions(),
            ] : null,
            'csrf' => csrf_token(),
        ];
    }

    /** Хеш-пустышка той же стоимости: сверка без учётки занимает столько же. */
    private static function dummy(): string
    {
        static $hash = null;

        return $hash ??= Hash::make('korzilla-996-no-such-user');
    }
}
