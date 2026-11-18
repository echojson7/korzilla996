<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'role', 'position', 'department', 'is_active'])]
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
}
