<?php

namespace App\Models;

use App\Support\GeneralChat;
// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use App\Support\Access;
use App\Support\Avatars;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'role', 'position', 'department', 'is_active', 'phone', 'messengers', 'about', 'birthday', 'birthday_year_hidden', 'status_emoji', 'status_text', 'status_until'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    /* Общий чат портала: новая учётка — в нём, выключенная — выбывает. */
    protected static function booted(): void
    {
        static::created(fn (User $user) => GeneralChat::place($user));
        static::updated(function (User $user) {
            if ($user->wasChanged('is_active')) {
                GeneralChat::place($user);
            }
        });
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'messengers' => 'array',
            'birthday' => 'date',
            'birthday_year_hidden' => 'boolean',
            'status_until' => 'datetime',
        ];
    }

    /** Роли портала: подпись для людей. */
    public const ROLES = ['owner' => 'Владелец', 'admin' => 'Администратор', 'staff' => 'Сотрудник'];

    /** Буквы на аватаре: первые буквы имени и фамилии. */
    public function initials(): string
    {
        $words = preg_split('/\s+/u', trim($this->name), -1, PREG_SPLIT_NO_EMPTY);

        return mb_strtoupper(implode('', array_map(fn ($word) => mb_substr($word, 0, 1), array_slice($words, 0, 2))));
    }

    /** Роль сотрудника с набором прав (users.role — ключ роли). */
    public function roleRecord(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role', 'key');
    }

    public function departmentRecord(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    /**
     * Отдел названием, как раньше была колонка department: читать —
     * имя из справочника, записать — найти отдел по названию или завести
     * (App\Models\Department::idFor). В списках грузить with('departmentRecord').
     */
    protected function department(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->departmentRecord?->name,
            set: function (?string $value) {
                $this->unsetRelation('departmentRecord');

                return ['department_id' => Department::idFor($value)];
            },
        );
    }

    /** Подпись роли: системные — из ROLES, свои — из таблицы ролей. */
    public function roleLabel(): string
    {
        return self::ROLES[$this->role] ?? $this->roleRecord?->name ?? $this->role;
    }

    /**
     * Права для приложения: ['*'] у владельца и администратора (настройки,
     * всё можно). Подробные права по разделам — access().
     */
    public function permissions(): array
    {
        return Access::isManager($this) ? ['*'] : [];
    }

    /** Права по разделам: tasks.view = own|dept|all|none и т. д. */
    public function access(): array
    {
        return Access::map($this);
    }

    /** Мессенджеры в профиле: ключ — подпись. */
    public const MESSENGERS = ['telegram' => 'Telegram', 'whatsapp' => 'WhatsApp', 'max' => 'MAX', 'vk' => 'ВКонтакте'];

    /** Цвет аватара по id: у каждого свой, и всегда тот же. */
    public function hue(): int
    {
        return ($this->id * 47 + 200) % 360;
    }

    /** Статус, если ещё действует: «🌴 В отпуске» до такого-то дня. */
    public function status(): ?array
    {
        if (! $this->status_text && ! $this->status_emoji) {
            return null;
        }
        if ($this->status_until && $this->status_until->isPast()) {
            return null;
        }

        return ['emoji' => $this->status_emoji, 'text' => $this->status_text, 'until' => $this->status_until?->toIso8601String()];
    }

    /** Сотрудник для списков, чатов и задач: коротко, но с аватаром и статусом. */
    public function card(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'roleLabel' => $this->roleLabel(),
            'initials' => $this->initials(),
            'position' => $this->position,
            'department' => $this->department,
            'active' => (bool) $this->is_active,
            'hue' => $this->hue(),
            'avatar' => Avatars::url($this),
            'status' => $this->status(),
            'birthday' => $this->birthday?->format('m-d'),
        ];
    }

    /** Профиль целиком: карточка, контакты, о себе, день рождения. */
    public function profile(bool $editor = false): array
    {
        $messengers = array_filter(array_intersect_key((array) $this->messengers, self::MESSENGERS), fn ($value) => is_string($value) && $value !== '');

        return $this->card() + [
            'phone' => $this->phone,
            'messengers' => (object) $messengers,
            'about' => $this->about,
            'birthdate' => $this->birthday && ! $this->birthday_year_hidden ? $this->birthday->format('Y-m-d') : null,
            'since' => $this->created_at?->toIso8601String(),
            /* Для формы правки: как записано, даже скрытый год и истёкший статус. */
            'form' => $editor ? [
                'birthday' => $this->birthday?->format('Y-m-d'),
                'birthdayYearHidden' => (bool) $this->birthday_year_hidden,
                'status' => ['emoji' => $this->status_emoji, 'text' => $this->status_text, 'until' => $this->status_until?->toIso8601String()],
            ] : null,
        ];
    }
}
