<?php

namespace App\Support\Bitrix;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Запросы к Битрикс24 по входящему вебхуку (config services.bitrix24.webhook).
 * Битрикс пускает примерно 2 запроса в секунду и отдаёт списки по 50:
 * между запросами пауза, на «слишком часто» — подождать и повторить.
 * Только для консольного переноса, в вебе не использовать.
 */
class Client
{
    private float $last = 0;

    public function __construct(private string $webhook)
    {
        $this->webhook = rtrim($webhook, '/').'/';
    }

    public static function fromConfig(): self
    {
        $webhook = (string) config('services.bitrix24.webhook');
        if ($webhook === '') {
            throw new RuntimeException('Нет BITRIX24_WEBHOOK в .env');
        }

        return new self($webhook);
    }

    /** Один метод: весь ответ (result, total, next). */
    public function call(string $method, array $params = []): array
    {
        for ($try = 1; ; $try++) {
            $wait = 0.55 - (microtime(true) - $this->last);
            if ($wait > 0) {
                usleep((int) ($wait * 1e6));
            }
            $this->last = microtime(true);
            $response = Http::timeout(60)->asForm()->post($this->webhook.$method.'.json', $params);
            $body = $response->json() ?? [];
            $error = $body['error'] ?? null;
            if ($response->successful() && ! $error) {
                return $body;
            }
            $retry = $error === 'QUERY_LIMIT_EXCEEDED' || $response->status() === 503 || $response->serverError();
            if (! $retry || $try >= 6) {
                throw new RuntimeException("Битрикс24 {$method}: ".($error ?: 'HTTP '.$response->status()).' '.($body['error_description'] ?? ''));
            }
            sleep(2 * $try);
        }
    }

    /**
     * Все записи списка постранично (start = 0, 50, 100…). Ответ без
     * обёртки или с обёрткой вида result.items — $key говорит, где список.
     *
     * @return \Generator<int, array>
     */
    public function each(string $method, array $params = [], ?string $key = null): \Generator
    {
        $start = 0;
        do {
            $body = $this->call($method, $params + ['start' => $start]);
            $rows = $key ? ($body['result'][$key] ?? []) : ($body['result'] ?? []);
            foreach ($rows as $row) {
                yield $row;
            }
            $start = $body['next'] ?? null;
        } while ($start !== null && $rows);
    }

    /** Файл по адресу из Битрикса (фото сотрудника и т. п.); null — не скачался. */
    public function download(string $url): ?string
    {
        $response = Http::timeout(60)->get($url);

        return $response->successful() ? $response->body() : null;
    }
}
