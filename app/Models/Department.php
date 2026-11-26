<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Отдел. Сотрудник указывает отдел названием (форма в настройках и
 * профиле не поменялась), сервер находит отдел по ключу — имени в нижнем
 * регистре без лишних пробелов — или заводит новый.
 */
class Department extends Model
{
    protected $fillable = ['name', 'key'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /** Название как записать: пробелы по краям убраны, внутри — по одному. */
    public static function clean(?string $name): ?string
    {
        $name = trim((string) preg_replace('/\s+/u', ' ', (string) $name));

        return $name === '' ? null : mb_substr($name, 0, 120);
    }

    public static function keyOf(string $name): string
    {
        return mb_strtolower((string) self::clean($name));
    }

    /** id отдела по названию; такого нет — заводится. Пустое название — без отдела. */
    public static function idFor(?string $name): ?int
    {
        $name = self::clean($name);
        if ($name === null) {
            return null;
        }

        return (int) self::query()->firstOrCreate(['key' => self::keyOf($name)], ['name' => $name])->id;
    }
}
