<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Real-time для всего портала: мессенджер, задачи, дальше — сделки.
 * Один транспорт, одна закрытая тема у каждого сотрудника, события разных
 * типов (message, chat, read, typing, task, …).
 *
 * Мессенджер:
 *
 * 1. Метка изменений у каждого сотрудника (кэш): лёгкий опрос
 *    GET messenger/sync?v=… сразу отвечает «ничего нового», пока метка
 *    та же, и не трогает чаты и сообщения.
 * 2. Mercure (встроен в FrankenPHP), если он настроен: событие уходит
 *    в браузеры участников сразу, по SSE. Тема у каждого сотрудника своя
 *    и закрытая: подписаться на неё можно только с его токеном.
 *
 * Без Mercure всё работает на опросе, просто с задержкой в секунду-две.
 *
 * Записи (задачи и т. п.): changed() пишет журнал realtime_events на
 * каждого, кто видит запись, и шлёт в Mercure {type, ev, ids}. Браузер
 * по ids забирает свежие данные, а по журналу (GET realtime?after=ev)
 * догружает всё, что пропустил, пока не было связи.
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
        self::send($ids->all(), ['type' => $type] + $data);
    }

    /** В Mercure: одно событие в темы этих сотрудников. */
    private static function send(array $userIds, array $event): void
    {
        if (! self::enabled() || ! $userIds) {
            return;
        }
        $topics = array_map(fn ($id) => self::topic((int) $id), $userIds);
        $payload = json_encode($event, JSON_UNESCAPED_UNICODE);
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
        return 'https://korzilla996/user/'.$userId;
    }

    /* ---------- Записи: журнал изменений ---------- */

    /** Журнал хранится трое суток: кто был без связи дольше — грузит всё заново. */
    private const KEEP_HOURS = 72;

    /**
     * Записи type с ids поменялись: каждому из $byUser (id сотрудника =>
     * id записей) — строка в журнал и событие в Mercure.
     *
     * @param  array<int, int[]>  $byUser
     */
    public static function changed(string $type, array $byUser): void
    {
        $now = now();
        /* Журнал — одной транзакцией: одна блокировка записи и одна фиксация
           на всех получателей, а не по штуке на каждого. В Mercure — после. */
        $sent = DB::transaction(function () use ($byUser, $type, $now) {
            $sent = [];
            foreach ($byUser as $userId => $ids) {
                $ids = array_values(array_unique(array_map('intval', $ids)));
                if (! $ids) {
                    continue;
                }
                DB::table('realtime_events')->insert(array_map(
                    fn ($id) => ['user_id' => $userId, 'type' => $type, 'entity_id' => $id, 'created_at' => $now], $ids,
                ));
                $sent[$userId] = [(int) DB::table('realtime_events')->where('user_id', $userId)->max('id'), $ids];
            }

            return $sent;
        });
        foreach ($sent as $userId => [$ev, $ids]) {
            Cache::put(self::lastKey($userId), $ev, now()->addHours(self::KEEP_HOURS));
            self::send([$userId], ['type' => $type, 'ev' => $ev, 'ids' => $ids]);
        }
        if (random_int(1, 200) === 1) {
            self::prune();
        }
    }

    /**
     * Что поменялось у сотрудника после события $after.
     * $after = null — только узнать номер последнего события (старт вкладки).
     * reset — пропущено слишком много (или журнал уже почищен): грузить всё.
     *
     * @return array{last: int, changes: array<string, int[]>, reset: bool}
     */
    public static function since(int $userId, ?int $after): array
    {
        $cached = Cache::get(self::lastKey($userId));
        if ($after !== null && $cached !== null && (int) $cached <= $after) {
            return ['last' => $after, 'changes' => [], 'reset' => false];
        }
        $last = (int) DB::table('realtime_events')->where('user_id', $userId)->max('id');
        Cache::put(self::lastKey($userId), $last, now()->addHours(self::KEEP_HOURS));
        if ($after === null || $last <= $after) {
            return ['last' => max($last, (int) $after), 'changes' => [], 'reset' => false];
        }
        if ($after < (int) Cache::get('realtime:floor', 0)) {
            return ['last' => $last, 'changes' => [], 'reset' => true];
        }
        $rows = DB::table('realtime_events')->where('user_id', $userId)->where('id', '>', $after)
            ->orderBy('id')->limit(2001)->get(['id', 'type', 'entity_id']);
        if ($rows->count() > 2000) {
            return ['last' => $last, 'changes' => [], 'reset' => true];
        }
        $changes = [];
        foreach ($rows as $row) {
            $changes[$row->type][(int) $row->entity_id] = (int) $row->entity_id;
        }

        return ['last' => (int) $rows->last()->id, 'changes' => array_map('array_values', $changes), 'reset' => false];
    }

    /**
     * Сотрудники, которые видят все задачи: владелец, администраторы и
     * роли с правом «видеть все задачи». Кэш сбрасывает смена ролей.
     */
    public static function admins(): array
    {
        return Cache::remember('realtime:admins', 60, function () {
            try {
                $roles = \App\Models\Role::query()->get(['key', 'permissions'])
                    ->filter(fn ($role) => ($role->permissions['tasks']['view'] ?? null) === 'all')
                    ->pluck('key')->push('owner')->push('admin')->unique()->all();
            } catch (\Illuminate\Database\QueryException) {
                $roles = ['owner', 'admin'];
            }

            return User::query()->whereIn('role', $roles)->where('is_active', true)->pluck('id')->map(fn ($id) => (int) $id)->all();
        });
    }

    /**
     * Убрать журнал старше трёх суток. Пачками по 1000 строк: каждая пачка —
     * своя короткая запись, и запросы портала не ждут, пока сотрётся всё.
     * Зовёт планировщик (realtime:prune раз в час) и, на случай если он не
     * запущен, изредка changed(). Возвращает, сколько строк убрано.
     */
    public static function prune(int $batch = 1000): int
    {
        $edge = (int) DB::table('realtime_events')->where('created_at', '<', now()->subHours(self::KEEP_HOURS))->max('id');
        if (! $edge) {
            return 0;
        }
        /* Сначала граница: кто отстал за неё, тот грузит всё заново, а не ждёт стёртых событий. */
        Cache::forever('realtime:floor', max($edge, (int) Cache::get('realtime:floor', 0)));
        $total = 0;
        do {
            $ids = DB::table('realtime_events')->where('id', '<=', $edge)->orderBy('id')->limit($batch)->pluck('id');
            if ($ids->isNotEmpty()) {
                $total += DB::table('realtime_events')->whereIn('id', $ids)->delete();
            }
        } while ($ids->count() === $batch);

        return $total;
    }

    private static function lastKey(int $userId): string
    {
        return 'realtime:last:'.$userId;
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
