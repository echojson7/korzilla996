<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Роль и её набор прав (App\Support\Access). */
class Role extends Model
{
    protected $fillable = ['key', 'name', 'system', 'permissions', 'sort'];

    protected function casts(): array
    {
        return ['system' => 'boolean', 'permissions' => 'array'];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role', 'key');
    }

    /** Права набора меняются: у «Сотрудника» и своих ролей — да, у владельца и администратора — нет. */
    public function editable(): bool
    {
        return ! in_array($this->key, ['owner', 'admin'], true);
    }
}
