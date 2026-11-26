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

    /** Число из шаблона («{{uf_crm_…}}», «3»); не число — $default. */
    public static function number(mixed $value, DealContext $ctx, float $default = 0): float
    {
        $text = str_replace([' ', ','], ['', '.'], self::render((string) ($value ?? ''), $ctx));

        return is_numeric($text) ? (float) $text : $default;
    }
}
