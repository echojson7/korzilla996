<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Access;
use App\Support\Avatars;
use App\Support\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Профиль сотрудника: смотреть может любой вошедший, править — сам
 * сотрудник или тот, у кого право «менять профили» (отдела или всех).
 * Должность и отдел меняет только он (это оргструктура, а не личное).
 * Роли и учётки — в настройках (AccessController) и консолью.
 */
class ProfileController extends Controller
{
    public function show(Request $request, User $user): JsonResponse
    {
        $me = $request->user();
        abort_unless($me->id === $user->id || Access::allows($me, 'staff', 'view'), 403, 'Профили сотрудников закрыты для вашей роли');

        return response()->json(['data' => $this->out($me, $user)]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $me = $request->user();
        abort_unless($this->canEdit($me, $user), 403, 'Править можно только свой профиль');
        /* Должность и отдел — оргструктура: нужно право менять профили (даже свой). */
        $admin = $this->canManage($me, $user);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'position' => ['sometimes', 'nullable', 'string', 'max:120'],
            'department' => ['sometimes', 'nullable', 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[0-9+()\-\s.]*$/'],
            'messengers' => ['sometimes', 'array'],
            'messengers.*' => ['nullable', 'string', 'max:120'],
            'about' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'birthday' => ['sometimes', 'nullable', 'date', 'before:today', 'after:1920-01-01'],
            'birthdayYearHidden' => ['sometimes', 'boolean'],
            'status' => ['sometimes', 'nullable', 'array'],
            'status.emoji' => ['nullable', 'string', 'max:16'],
            'status.text' => ['nullable', 'string', 'max:80'],
            'status.until' => ['nullable', 'date'],
        ], [
            'name.required' => 'Введите имя',
            'phone.regex' => 'В телефоне только цифры, пробелы, +, скобки и дефисы',
            'birthday.before' => 'День рождения — в прошлом',
            'birthday.after' => 'Проверьте год рождения',
            'about.max' => 'О себе — до 2000 знаков',
            'status.text.max' => 'Статус — до 80 знаков',
        ]);

        if (! $admin && (array_key_exists('position', $data) || array_key_exists('department', $data))) {
            throw ValidationException::withMessages(['position' => 'Должность и отдел меняет администратор']);
        }

        $patch = [];
        foreach (['name', 'position', 'department', 'phone', 'about', 'birthday'] as $key) {
            if (array_key_exists($key, $data)) {
                $patch[$key] = self::clean($data[$key]);
            }
        }
        if (array_key_exists('birthdayYearHidden', $data)) {
            $patch['birthday_year_hidden'] = (bool) $data['birthdayYearHidden'];
        }
        if (array_key_exists('messengers', $data)) {
            $patch['messengers'] = collect(User::MESSENGERS)->keys()
                ->mapWithKeys(fn ($key) => [$key => self::messenger($key, $data['messengers'][$key] ?? null)])
                ->filter()->all() ?: null;
        }
        if (array_key_exists('status', $data)) {
            $status = $data['status'] ?? [];
            $patch['status_emoji'] = self::clean($status['emoji'] ?? null);
            $patch['status_text'] = self::clean($status['text'] ?? null);
            $patch['status_until'] = ($patch['status_emoji'] || $patch['status_text']) && ! empty($status['until']) ? $status['until'] : null;
        }

        $user->update($patch);
        $this->announce($user);

        return response()->json(['data' => $this->out($me, $user->fresh())]);
    }

    public function uploadAvatar(Request $request, User $user): JsonResponse
    {
        abort_unless($this->canEdit($request->user(), $user), 403, 'Править можно только свой профиль');
        $request->validate(['avatar' => ['required', 'file', 'mimetypes:image/png,image/jpeg,image/webp,image/gif', 'max:10240']], [
            'avatar.required' => 'Выберите картинку',
            'avatar.mimetypes' => 'Аватар — картинка PNG, JPEG или WebP',
            'avatar.max' => 'Картинка до 10 МБ',
        ]);
        Avatars::store($user, $request->file('avatar'));
        $this->announce($user);

        return response()->json(['data' => $this->out($request->user(), $user)]);
    }

    public function deleteAvatar(Request $request, User $user): JsonResponse
    {
        abort_unless($this->canEdit($request->user(), $user), 403, 'Править можно только свой профиль');
        Avatars::delete($user);
        $this->announce($user);

        return response()->json(['data' => $this->out($request->user(), $user)]);
    }

    /** Картинка аватара: адрес с версией не меняется, кэш — навсегда. */
    public function avatar(User $user, string $version, int $size): StreamedResponse
    {
        $path = Avatars::file($user, $version, $size);
        abort_unless($path, 404);

        return Storage::disk('local')->response($path, null, [
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    /** Смена пароля самим сотрудником: старый, новый дважды. Остальные входы — выйти. */
    public function password(Request $request): Response
    {
        $me = $request->user();
        $data = $request->validate([
            'current' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed', 'different:current'],
        ], [
            'current.required' => 'Введите текущий пароль',
            'password.required' => 'Введите новый пароль',
            'password.min' => 'Новый пароль — не короче 8 знаков',
            'password.confirmed' => 'Пароли не совпадают',
            'password.different' => 'Новый пароль совпадает со старым',
        ]);
        if (! Hash::check($data['current'], $me->password)) {
            throw ValidationException::withMessages(['current' => 'Текущий пароль не тот']);
        }

        $me->forceFill(['password' => $data['password'], 'remember_token' => Str::random(60)])->save();
        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $me->id)->where('id', '!=', $request->session()->getId())->delete();
        }
        $request->session()->regenerate();

        return response()->noContent();
    }

    /** Профиль для ответа: org — можно ли менять должность и отдел. */
    private function out(User $me, User $user): array
    {
        return $user->profile($this->canEdit($me, $user)) + ['org' => $this->canManage($me, $user)];
    }

    private function canEdit(?User $me, User $user): bool
    {
        return $me && ($me->id === $user->id || $this->canManage($me, $user));
    }

    /** Чужой профиль: право «менять профили» отдела или всех; владельца правит только владелец. */
    private function canManage(?User $me, User $user): bool
    {
        if (! $me || (Access::isOwner($user) && ! Access::isOwner($me))) {
            return false;
        }

        return match (Access::level($me, 'staff', 'edit')) {
            'all' => true,
            'dept' => in_array($user->id, Access::colleagues($me), true),
            default => false,
        };
    }

    /** Остальным — «у сотрудника новый аватар/статус»: списки обновятся сами. */
    private function announce(User $user): void
    {
        $ids = User::query()->where('is_active', true)->pluck('id');
        Realtime::changed('user', $ids->mapWithKeys(fn ($id) => [$id => [$user->id]])->all());
    }

    private static function clean(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }
        $value = trim($value);

        return $value === '' ? null : $value;
    }

    /** Ник без лишнего: «https://t.me/ivan» и «@ivan» — это «ivan». */
    private static function messenger(string $key, ?string $value): ?string
    {
        $value = self::clean($value);
        if (! $value) {
            return null;
        }
        if ($key === 'telegram') {
            $value = preg_replace('~^(https?://)?(www\.)?(t\.me|telegram\.me)/~i', '', $value);

            return ltrim($value, '@') ?: null;
        }
        if ($key === 'whatsapp') {
            $digits = preg_replace('/\D+/', '', preg_replace('~^(https?://)?(wa\.me|api\.whatsapp\.com/send\?phone=)/?~i', '', $value));

            return $digits ?: null;
        }
        if ($key === 'vk') {
            return ltrim(preg_replace('~^(https?://)?(m\.)?vk\.(com|ru)/~i', '', $value), '@') ?: null;
        }

        return Str::limit($value, 120, '');
    }
}
