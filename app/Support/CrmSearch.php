<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * Поиск по компаниям, контактам и сделкам: колонка search — нужные поля
 * в нижнем регистре, телефоны ещё и одними цифрами. SQLite сравнивает
 * без учёта регистра только латиницу, поэтому регистр сводим сами.
 */
class CrmSearch
{
    private const COLUMNS = [
        'crm_companies' => ['title', 'address', 'phones', 'emails', 'webs'],
        'crm_contacts' => ['name', 'post', 'phones', 'emails'],
        'crm_deals' => ['title', 'company', 'contact'],
    ];

    /** Строка для колонки search по строке таблицы (массив колонок). */
    public static function of(string $table, array $row): string
    {
        $parts = [];
        foreach (self::COLUMNS[$table] as $column) {
            $value = $row[$column] ?? null;
            if (in_array($column, ['phones', 'emails', 'webs'], true)) {
                $list = is_string($value) ? (json_decode($value, true) ?: []) : (array) $value;
                foreach ($list as $one) {
                    $text = (string) ($one['value'] ?? '');
                    $parts[] = $text;
                    if ($column === 'phones') {
                        $digits = preg_replace('/\D/', '', $text);
                        /* 8 и +7 в начале — один номер. */
                        $parts[] = strlen($digits) === 11 ? substr($digits, 1) : $digits;
                    }
                }
            } elseif ($value !== null) {
                $parts[] = (string) $value;
            }
        }

        return mb_strtolower(trim(implode(' ', array_filter($parts, fn ($one) => $one !== ''))));
    }

    /** Условие поиска: все слова должны найтись (в любом порядке). */
    public static function apply(Builder $query, string $words): Builder
    {
        $words = trim($words);
        if ($words === '') {
            return $query;
        }
        $digits = preg_replace('/\D/', '', $words);
        $phone = strlen($digits) >= 5 && strlen($digits) >= mb_strlen(preg_replace('/[\s()+\-]/u', '', $words));

        return $query->where(function ($q) use ($words, $digits, $phone) {
            $q->where(function ($all) use ($words) {
                foreach (preg_split('/\s+/u', mb_strtolower($words)) as $word) {
                    $all->where('search', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $word).'%');
                }
            });
            if ($phone) {
                $q->orWhere('search', 'like', '%'.$digits.'%');
                /* «8 900…» и «+7 900…» — номер без кода страны. */
                if (strlen($digits) >= 6 && in_array($digits[0], ['7', '8'], true)) {
                    $q->orWhere('search', 'like', '%'.substr($digits, 1).'%');
                }
            }
            if (ctype_digit($words)) {
                $q->orWhere('id', (int) $words);
            }
        });
    }
}
