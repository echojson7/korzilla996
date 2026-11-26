<?php

namespace App\Support\Robots;

/** Подстановки {{Название}} в тексты роботов. Неизвестный ключ остаётся как есть. */
class Template
{
    public static function render(?string $text, DealContext $ctx, bool $url = false): string
    {
        if ($text === null || $text === '') {
            return '';
        }

        return preg_replace_callback('/\{\{\s*([^{}]{1,120}?)\s*\}\}/u', function ($m) use ($ctx, $url) {
            $value = $ctx->text($m[1]);
            if ($value === null) {
                return $m[0];
            }

            return $url ? rawurlencode($value) : $value;
        }, $text);
    }

    /** Число из шаблона («{{uf_crm_…}}», «3», «({{uf_crm_…}}*80/100)»); не число — $default. */
    public static function number(mixed $value, DealContext $ctx, float $default = 0): float
    {
        $text = str_replace([' ', ','], ['', '.'], self::render((string) ($value ?? ''), $ctx));
        if (is_numeric($text)) {
            return (float) $text;
        }
        if ($text !== '' && preg_match('/^[\d.+\-*\/()]+$/', $text)) {
            $pos = 0;
            try {
                $result = self::sum($text, $pos);

                return $pos === strlen($text) && is_finite($result) ? $result : $default;
            } catch (\Throwable) {
                return $default;
            }
        }

        return $default;
    }

    /* Простая арифметика без eval: + − × ÷ и скобки. */
    private static function sum(string $s, int &$i): float
    {
        $v = self::product($s, $i);
        while ($i < strlen($s) && ($s[$i] === '+' || $s[$i] === '-')) {
            $op = $s[$i++];
            $r = self::product($s, $i);
            $v = $op === '+' ? $v + $r : $v - $r;
        }

        return $v;
    }

    private static function product(string $s, int &$i): float
    {
        $v = self::atom($s, $i);
        while ($i < strlen($s) && ($s[$i] === '*' || $s[$i] === '/')) {
            $op = $s[$i++];
            $r = self::atom($s, $i);
            $v = $op === '*' ? $v * $r : ($r == 0 ? throw new \DivisionByZeroError : $v / $r);
        }

        return $v;
    }

    private static function atom(string $s, int &$i): float
    {
        if (($s[$i] ?? '') === '(') {
            $i++;
            $v = self::sum($s, $i);
            if (($s[$i] ?? '') !== ')') {
                throw new \RuntimeException('скобка');
            }
            $i++;

            return $v;
        }
        if (($s[$i] ?? '') === '-') {
            $i++;

            return -self::atom($s, $i);
        }
        preg_match('/\d+(?:\.\d+)?/A', $s, $m, 0, $i) || throw new \RuntimeException('число');
        $i += strlen($m[0]);

        return (float) $m[0];
    }
}
