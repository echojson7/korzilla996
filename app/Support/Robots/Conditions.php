<?php

namespace App\Support\Robots;

/**
 * Условие робота или триггера, как в Битрикс24: строки «поле — оператор —
 * значение», связанные «и» / «или». «И» сильнее «или»:
 * a и b или c и d = (a и b) или (c и d). Пустое условие — выполнять всегда.
 */
class Conditions
{
    public const OPS = ['=', '!=', '>', '>=', '<', '<=', 'contain', '!contain', 'empty', '!empty'];

    public static function check(?array $rules, DealContext $ctx): bool
    {
        $rules = array_values(array_filter($rules ?? [], fn ($one) => is_array($one) && ! empty($one['field'])));
        if (! $rules) {
            return true;
        }
        $groups = [[]];
        foreach ($rules as $i => $rule) {
            if ($i > 0 && ($rule['join'] ?? 'and') === 'or') {
                $groups[] = [];
            }
            $groups[count($groups) - 1][] = $rule;
        }
        foreach ($groups as $group) {
            if (collect($group)->every(fn ($rule) => self::one($rule, $ctx))) {
                return true;
            }
        }

        return false;
    }

    public static function one(array $rule, DealContext $ctx): bool
    {
        $actual = $ctx->value((string) $rule['field']);
        $op = (string) ($rule['op'] ?? '=');
        $expected = $rule['value'] ?? null;
        if (is_string($expected)) {
            $expected = Template::render($expected, $ctx);
        }
        $list = is_array($actual) ? array_values($actual) : ($actual === null || $actual === '' ? [] : [$actual]);

        return match ($op) {
            'empty' => ! array_filter($list, fn ($one) => $one !== null && $one !== '' && $one !== false),
            '!empty' => (bool) array_filter($list, fn ($one) => $one !== null && $one !== '' && $one !== false),
            '=' => self::any($list, fn ($one) => self::equal($one, $expected)) || (! $list && ($expected === '' || $expected === null)),
            '!=' => ! self::any($list, fn ($one) => self::equal($one, $expected)) && ! (! $list && ($expected === '' || $expected === null)),
            'contain' => self::any($list, fn ($one) => self::contains($one, $expected)),
            '!contain' => ! self::any($list, fn ($one) => self::contains($one, $expected)),
            '>', '>=', '<', '<=' => self::any($list, fn ($one) => self::compare($one, $expected, $op)),
            default => false,
        };
    }

    private static function any(array $list, callable $test): bool
    {
        foreach ($list as $one) {
            if ($test($one)) {
                return true;
            }
        }

        return false;
    }

    private static function equal(mixed $a, mixed $b): bool
    {
        if (is_bool($a)) {
            return $a === filter_var($b, FILTER_VALIDATE_BOOL);
        }
        if (is_numeric($a) && is_numeric($b)) {
            return (float) $a == (float) $b;
        }

        return mb_strtolower(trim((string) $a)) === mb_strtolower(trim((string) $b));
    }

    private static function contains(mixed $a, mixed $b): bool
    {
        $b = mb_strtolower(trim((string) $b));

        return $b === '' || str_contains(mb_strtolower((string) $a), $b);
    }

    private static function compare(mixed $a, mixed $b, string $op): bool
    {
        if (! is_numeric($a) || ! is_numeric($b)) {
            /* Даты Y-m-d сравниваются строкой. */
            [$a, $b] = [(string) $a, (string) $b];
        } else {
            [$a, $b] = [(float) $a, (float) $b];
        }

        return match ($op) {
            '>' => $a > $b, '>=' => $a >= $b, '<' => $a < $b, default => $a <= $b,
        };
    }
}
