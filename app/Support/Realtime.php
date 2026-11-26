<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Доставка событий мессенджера.
 *
 * 1. Метка изменений у каждого сотрудника (кэш): лёгкий опрос
 *    GET messenger/sync?v=… сразу отвечает «ничего нового», пока метка
 *    та же, и не трогает чаты и сообщения.
 * 2. Mercure (встроен в FrankenPHP), если он настроен: событие уходит
 *    в браузеры участников сразу, по SSE. Тема у каждого сотрудника своя
 *    и закрытая: подписаться на неё можно только с его токеном.
 *
 * Без Mercure всё работает на опросе, просто с задержкой в секунду-две.
 */
class Realtime
{
    public static function enabled(): bool
    {
        return (bool) config('services.mercure.secret') && (function_exists('mercure_publish') || config('services.mercure.url'));
    }

    public static function stamp(int $userId): int
    {
        return (int) Cache::get(self::key($userId), 0);
    }

    /** Событие участникам: метка — всем, Mercure — если включён. */
    public static function emit(iterable $userIds, string $type, array $data = [], bool $stamp = true): void
    {
        $ids = collect($userIds)->map(fn ($id) => (int) $id)->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }
        if ($stamp) {
            $now = (int) floor(microtime(true) * 1000);
            Cache::putMany($ids->mapWithKeys(fn ($id) => [self::key($id) => $now])->all(), now()->addDays(30));
        }
        if (! self::enabled()) {
            return;
        }
        $topics = $ids->map(fn ($id) => self::topic($id))->all();
        $payload = json_encode(['type' => $type] + $data, JSON_UNESCAPED_UNICODE);
        try {
            if (function_exists('mercure_publish')) {
                mercure_publish($topics, $payload, true);

                return;
            }
            $body = implode('&', array_merge(
                array_map(fn ($topic) => 'topic='.rawurlencode($topic), $topics),
                ['data='.rawurlencode($payload), 'private=on'],
            ));
            Http::timeout(2)->withToken(self::jwt(['publish' => ['*']]))
                ->withBody($body, 'application/x-www-form-urlencoded')
                ->post(config('services.mercure.url'));
        } catch (\Throwable $error) {
            /* Не доставили сразу — дойдёт опросом. */
            Log::warning('Mercure: '.$error->getMessage());
        }
    }

    /** Для браузера: адрес хаба, тема и токен подписки на 12 часов. */
    public static function subscription(int $userId): ?array
    {
        if (! self::enabled()) {
            return null;
        }

        return [
            'hub' => config('services.mercure.public_url'),
            'topic' => self::topic($userId),
            'token' => self::jwt(['subscribe' => [self::topic($userId)]], 12 * 3600),
        ];
    }

    public static function topic(int $userId): string
    {
        return 'https://korzilla996/messenger/user/'.$userId;
    }

    private static function key(int $userId): string
    {
        return 'messenger:stamp:'.$userId;
    }

    /** JWT HS256 для Mercure: без библиотек, формат простой. */
    private static function jwt(array $claims, int $ttl = 60): string
    {
        $b64 = fn (string $raw) => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
        $head = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $body = $b64(json_encode(['mercure' => $claims, 'exp' => time() + $ttl], JSON_UNESCAPED_SLASHES));
        $sign = $b64(hash_hmac('sha256', "{$head}.{$body}", (string) config('services.mercure.secret'), true));

        return "{$head}.{$body}.{$sign}";
    }
}
