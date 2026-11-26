<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use App\Support\Avatars;
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

    /** Права для приложения: владелец и администратор — всё. */
    public function permissions(): array
    {
        return in_array($this->role, ['owner', 'admin'], true) ? ['*'] : [];
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
            'roleLabel' => self::ROLES[$this->role] ?? $this->role,
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
