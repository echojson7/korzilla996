<?php

namespace App\Support;

use App\Models\CrmField;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Значения своих полей CRM: проверка и приведение по типу поля перед
 * записью в JSON-колонку fields, текст для истории.
 *
 * Хранение: строка, текст, ссылка — строка; число — float; дата —
 * Y-m-d; дата и время — ISO 8601; да/нет — bool; список — id варианта
 * (строка); сотрудник — id (int). У множественного поля — массив таких
 * значений. Файл — [{name, url}] (заполняет импорт, правка — на этапе 2).
 */
class CrmFields
{
    /** Одно значение из формы → как хранить; null — пусто. */
    public static function normalize(CrmField $field, mixed $value): mixed
    {
        if ($field->multiple || $field->type === 'file') {
            $list = is_array($value) ? array_values($value) : ($value === null || $value === '' ? [] : [$value]);
            if ($field->type === 'file') {
                return $list ?: null;
            }
            $out = [];
            foreach ($list as $one) {
                $one = self::single($field, $one);
                if ($one !== null && ! in_array($one, $out, true)) {
                    $out[] = $one;
                }
            }

            return $out ?: null;
        }
        if (is_array($value)) {
            self::fail($field, 'ждёт одно значение');
        }

        return self::single($field, $value);
    }

    private static function single(CrmField $field, mixed $value): mixed
    {
        if ($value === null || $value === '' || (is_string($value) && trim($value) === '')) {
            return $field->type === 'boolean' ? false : null;
        }

        switch ($field->type) {
            case 'string':
                return mb_substr(trim((string) $value), 0, 1000);
            case 'text':
                return mb_substr(trim((string) $value), 0, 20000);
            case 'url':
                $value = trim((string) $value);
                if (! preg_match('~^https?://~i', $value)) {
                    $value = 'https://'.$value;
                }
                filter_var($value, FILTER_VALIDATE_URL) || self::fail($field, 'ждёт ссылку');

                return mb_substr($value, 0, 1000);
            case 'number':
                $text = str_replace([' ', "\u{00A0}", ','], ['', '', '.'], (string) $value);
                is_numeric($text) || self::fail($field, 'ждёт число');

                return (float) $text;
            case 'boolean':
                return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? (bool) $value;
            case 'date':
            case 'datetime':
                try {
                    $at = Carbon::parse((string) $value);
                } catch (\Throwable) {
                    self::fail($field, 'ждёт дату');
                }

                return $field->type === 'date' ? $at->toDateString() : $at->toIso8601String();
            case 'list':
                $id = (string) $value;
                $known = collect($field->options ?? [])->pluck('id')->map(fn ($one) => (string) $one);
                $known->contains($id) || self::fail($field, 'нет такого варианта');

                return $id;
            case 'user':
                $id = (int) $value;
                User::query()->whereKey($id)->exists() || self::fail($field, 'нет такого сотрудника');

                return $id;
        }

        return null;
    }

    /** Значение как текст: для истории и поиска. */
    public static function text(CrmField $field, mixed $value): ?string
    {
        if ($value === null || $value === [] || $value === '') {
            return null;
        }
        $list = is_array($value) && $field->type !== 'file' ? $value : [$value];
        $out = [];
        foreach ($list as $one) {
            $out[] = match ($field->type) {
                'boolean' => $one ? 'Да' : 'Нет',
                'list' => collect($field->options ?? [])->firstWhere('id', (string) $one)['label'] ?? (string) $one,
                'user' => User::query()->whereKey((int) $one)->value('name') ?? '№'.$one,
                'file' => collect((array) $one)->pluck('name')->filter()->implode(', '),
                'number' => rtrim(rtrim(number_format((float) $one, 2, '.', ''), '0'), '.'),
                default => (string) $one,
            };
        }

        return mb_substr(implode(', ', $out), 0, 2000);
    }

    /** Код нового поля из названия: латиница, цифры и _ (как UF_CRM_… в Битриксе). */
    public static function codeFor(string $entity, string $title): string
    {
        $base = 'f_'.substr(md5($entity.$title.microtime()), 0, 10);
        while (CrmField::query()->where('entity', $entity)->where('code', $base)->exists()) {
            $base = 'f_'.substr(md5($base.random_int(0, PHP_INT_MAX)), 0, 10);
        }

        return $base;
    }

    private static function fail(CrmField $field, string $why): never
    {
        throw ValidationException::withMessages(['fields.'.$field->code => "«{$field->title}»: {$why}"]);
    }
}
