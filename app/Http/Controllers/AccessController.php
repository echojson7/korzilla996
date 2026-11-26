<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use App\Support\Access;
use App\Support\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Настройки: сотрудники, роли и наборы прав. Только владелец и
 * администраторы (Gate manage-access).
 *
 * Правила для владельцев: назначить или снять владельца, менять учётку
 * владельца может только владелец; последнего действующего владельца
 * нельзя понизить или отключить. Себя отключить нельзя.
 */
class AccessController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->manager($request);

        return response()->json(['data' => [
            'schema' => Access::schema(),
            'roles' => $this->roles(),
            'users' => User::query()->with('roleRecord')->orderByDesc('is_active')->orderBy('name')->get()->map(fn (User $user) => $this->person($user))->values(),
            'departments' => User::query()->whereNotNull('department')->where('department', '!=', '')->distinct()->orderBy('department')->pluck('department'),
        ]]);
    }

    /* ---------- Роли ---------- */

    public function storeRole(Request $request): JsonResponse
    {
        $this->manager($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('roles', 'name')],
            'permissions' => ['nullable', 'array'],
        ], ['name.required' => 'Назовите роль', 'name.unique' => 'Роль с таким названием уже есть']);

        $role = Role::query()->create([
            'key' => 'r_'.Str::lower(Str::random(10)),
            'name' => trim($data['name']),
            'system' => false,
            'permissions' => Access::normalize($data['permissions'] ?? Access::defaults()),
            'sort' => (int) Role::query()->max('sort') + 1,
        ]);

        return response()->json(['data' => $this->role($role)], 201);
    }

    public function updateRole(Request $request, Role $role): JsonResponse
    {
        $this->manager($request);
        abort_unless($role->editable(), 422, 'У владельца и администратора — все права, их не ограничить');
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:80', Rule::unique('roles', 'name')->ignore($role->id)],
            'permissions' => ['sometimes', 'array'],
        ], ['name.required' => 'Назовите роль', 'name.unique' => 'Роль с таким названием уже есть']);

        if (array_key_exists('name', $data) && ! $role->system) {
            $role->name = trim($data['name']);
        }
        if (array_key_exists('permissions', $data)) {
            $role->permissions = Access::normalize($data['permissions']);
        }
        $role->save();
        $this->changed($role->users()->pluck('id')->all());

        return response()->json(['data' => $this->role($role)]);
    }

    public function destroyRole(Request $request, Role $role): Response
    {
        $this->manager($request);
        abort_if($role->system, 422, 'Системную роль не удалить');
        $users = $role->users()->pluck('id')->all();
        DB::transaction(function () use ($role) {
            /* Сотрудники удалённой роли — обратно в «Сотрудника». */
            User::query()->where('role', $role->key)->update(['role' => 'staff']);
            $role->delete();
        });
        $this->changed($users, true);

        return response()->noContent();
    }

    /* ---------- Сотрудники ---------- */

    public function storeUser(Request $request): JsonResponse
    {
        $me = $this->manager($request);
        $data = $request->validate([
            'email' => ['required', 'string', 'max:255', 'regex:/^\S+$/u'],
            'name' => ['required', 'string', 'max:120'],
            'role' => ['required', 'string', Rule::exists('roles', 'key')],
            'position' => ['nullable', 'string', 'max:120'],
            'department' => ['nullable', 'string', 'max:120'],
        ], [
            'email.required' => 'Введите почту или логин',
            'email.regex' => 'В логине не должно быть пробелов',
            'name.required' => 'Введите имя',
            'role.exists' => 'Такой роли нет',
        ]);
        $email = mb_strtolower(trim($data['email']));
        if (User::query()->where('email', $email)->exists()) {
            throw ValidationException::withMessages(['email' => 'Учётка с таким логином уже есть']);
        }
        abort_if($data['role'] === 'owner' && ! Access::isOwner($me), 403, 'Назначить владельца может только владелец');

        $password = Str::password(16, symbols: false);
        $user = User::query()->create([
            'email' => $email,
            'name' => trim($data['name']),
            'role' => $data['role'],
            'position' => self::clean($data['position'] ?? null),
            'department' => self::clean($data['department'] ?? null),
            'password' => $password,
            'is_active' => true,
        ]);
        $this->changed([$user->id], true);

        return response()->json(['data' => ['user' => $this->person($user->fresh()), 'password' => $password]], 201);
    }

    /** Роль и включённость учётки. */
    public function updateUser(Request $request, User $user): JsonResponse
    {
        $me = $this->manager($request);
        $data = $request->validate([
            'role' => ['sometimes', 'string', Rule::exists('roles', 'key')],
            'active' => ['sometimes', 'boolean'],
        ], ['role.exists' => 'Такой роли нет']);
        $role = $data['role'] ?? $user->role;
        $active = array_key_exists('active', $data) ? (bool) $data['active'] : (bool) $user->is_active;

        $this->guard($me, $user, $role, $active);

        DB::transaction(function () use ($user, $role, $active) {
            $user->update(['role' => $role, 'is_active' => $active]);
            if (! $active) {
                $this->signOut($user);
            }
        });
        $this->changed([$user->id], true);

        return response()->json(['data' => $this->person($user->fresh())]);
    }

    /** Новый пароль: старый перестаёт работать, все входы сотрудника закрываются. */
    public function password(Request $request, User $user): JsonResponse
    {
        $me = $this->manager($request);
        abort_if(Access::isOwner($user) && ! Access::isOwner($me), 403, 'Пароль владельца меняет только владелец');
        abort_if($user->id === $me->id, 422, 'Свой пароль меняется в профиле');
        $password = Str::password(16, symbols: false);
        $user->forceFill(['password' => $password])->save();
        $this->signOut($user);

        return response()->json(['data' => ['password' => $password]]);
    }

    /* ---------- Внутреннее ---------- */

    private function manager(Request $request): User
    {
        /** @var User|null $me */
        $me = $request->user();
        abort_unless($me && $me->is_active, 401);
        abort_unless($me->can('manage-access'), 403, 'Настройки и права — для владельца и администраторов');

        return $me;
    }

    /** Правила для владельцев и себя самого. */
    private function guard(User $me, User $user, string $role, bool $active): void
    {
        $wasOwner = Access::isOwner($user);
        $staysOwner = $role === 'owner' && $active;
        if (($wasOwner || $role === 'owner') && ! Access::isOwner($me) && ($role !== $user->role || $active !== (bool) $user->is_active)) {
            abort(403, 'Владельцев назначает и меняет только владелец');
        }
        if ($user->id === $me->id && ! $active) {
            abort(422, 'Себя отключить нельзя');
        }
        if ($wasOwner && $user->is_active && ! $staysOwner) {
            $others = User::query()->where('role', 'owner')->where('is_active', true)->whereKeyNot($user->id)->exists();
            abort_unless($others, 422, 'Должен остаться хотя бы один владелец');
        }
    }

    /** Закрыть все входы сотрудника: сессии и «запомнить меня». */
    private function signOut(User $user): void
    {
        $user->forceFill(['remember_token' => Str::random(60)])->save();
        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
        }
    }

    /**
     * Права поменялись: их браузеры перечитают сессию (событие access),
     * списки сотрудников у всех освежатся (user), real-time задач — заново.
     */
    private function changed(array $ids, bool $everyone = false): void
    {
        Cache::forget('realtime:admins');
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (! $ids) {
            return;
        }
        Realtime::changed('access', collect($ids)->mapWithKeys(fn ($id) => [$id => [$id]])->all());
        if ($everyone) {
            $all = User::query()->where('is_active', true)->pluck('id');
            Realtime::changed('user', $all->mapWithKeys(fn ($id) => [$id => $ids])->all());
        }
    }

    private function roles(): array
    {
        $counts = User::query()->selectRaw('role, count(*) as n')->groupBy('role')->pluck('n', 'role');

        return Role::query()->orderBy('sort')->orderBy('id')->get()
            ->map(fn (Role $role) => $this->role($role, (int) ($counts[$role->key] ?? 0)))->values()->all();
    }

    private function role(Role $role, ?int $users = null): array
    {
        return [
            'key' => $role->key,
            'id' => $role->id,
            'name' => $role->name,
            'system' => $role->system,
            'editable' => $role->editable(),
            'permissions' => $role->editable() ? Access::fill($role->permissions) : Access::full(),
            'users' => $users ?? $role->users()->count(),
        ];
    }

    private function person(User $user): array
    {
        return $user->card() + [
            'roleLabel' => $user->roleLabel(),
            'since' => $user->created_at?->toIso8601String(),
        ];
    }

    private static function clean(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
