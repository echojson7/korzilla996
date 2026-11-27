<?php

namespace App\Support\Bitrix;

use Illuminate\Http\Client\ConnectionException;
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
            try {
                $response = Http::timeout(180)->connectTimeout(20)->asForm()->post($this->webhook.$method.'.json', $params);
            } catch (ConnectionException $error) {
                /* Таймаут или обрыв: подождать и повторить. Адрес с токеном в текст ошибки не пускаем. */
                if ($try >= 6) {
                    throw new RuntimeException("Битрикс24 {$method}: нет ответа (".$this->hide($error->getMessage()).')');
                }
                sleep(5 * $try);

                continue;
            }
            $body = $response->json() ?? [];
            $status = $response->status();
            $ok = $response->successful();
            unset($response);
            $error = $body['error'] ?? null;
            if ($ok && ! $error) {
                return $body;
            }
            /* Метод выбрал свой лимит времени (≈8 минут работы за 10): ждать дольше. */
            $slow = $error === 'OPERATION_TIME_LIMIT';
            $retry = $slow || $error === 'QUERY_LIMIT_EXCEEDED' || $status >= 500;
            if (! $retry || $try >= ($slow ? 15 : 6)) {
                throw new RuntimeException("Битрикс24 {$method}: ".($error ?: 'HTTP '.$status).' '.($body['error_description'] ?? ''));
            }
            sleep($slow ? 90 : 2 * $try);
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

    /**
     * Весь список страницами по 50, но запросами batch: до 50 страниц
     * (2500 записей) за один запрос к Битриксу. Порядок — по ID, чтобы
     * новые записи во время переноса уходили в конец.
     *
     * @return \Generator<int, array> страница записей
     */
    public function pages(string $method, array $params = [], ?callable $progress = null, ?string $key = null): \Generator
    {
        $params += ['order' => ['ID' => 'ASC']];
        $first = $this->call($method, $params + ['start' => 0]);
        $total = (int) ($first['total'] ?? 0);
        $rows = $key ? ($first['result'][$key] ?? []) : ($first['result'] ?? []);
        $progress && $progress(count($rows), $total);
        yield $rows;
        $offsets = range(50, max(50, $total - 1), 50);
        if ($total <= 50) {
            return;
        }
        $done = 50;
        /* По 10 страниц (500 записей) за batch: ответ на 2500 записей со всеми UF_* весит десятки МБ. */
        foreach (array_chunk($offsets, 10) as $chunk) {
            $cmd = [];
            foreach ($chunk as $offset) {
                $cmd['p'.$offset] = $method.'?'.http_build_query($params + ['start' => $offset]);
            }
            for ($try = 1; ; $try++) {
                $body = $this->call('batch', ['halt' => 0, 'cmd' => $cmd]);
                $errors = $body['result']['result_error'] ?? [];
                if (! $errors) {
                    break;
                }
                /* Лимит времени метода внутри batch: подождать и повторить всю пачку. */
                $slow = collect($errors)->contains(fn ($one) => in_array($one['error'] ?? '', ['OPERATION_TIME_LIMIT', 'QUERY_LIMIT_EXCEEDED'], true));
                if (! $slow || $try >= 15) {
                    throw new RuntimeException("Битрикс24 batch {$method}: ".json_encode(array_slice($errors, 0, 2), JSON_UNESCAPED_UNICODE));
                }
                unset($body);
                sleep(90);
            }
            foreach ($chunk as $offset) {
                $rows = $body['result']['result']['p'.$offset] ?? [];
                $rows = $key ? ($rows[$key] ?? []) : $rows;
                $done += count($rows);
                yield $rows;
            }
            unset($body, $rows);
            gc_collect_cycles();
            $progress && $progress($done, $total);
        }
    }

    /** Текст без адреса вебхука (в нём токен). */
    private function hide(string $text): string
    {
        return str_replace($this->webhook, '…/', preg_replace('~https?://\S+/rest/\d+/[^/\s]+/~', '…/', $text));
    }

    /** Файл по адресу из Битрикса (фото сотрудника и т. п.); null — не скачался. */
    public function download(string $url): ?string
    {
        $response = Http::timeout(60)->get($url);

        return $response->successful() ? $response->body() : null;
    }
}
