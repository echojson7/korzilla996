<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Поиск GIF и стикеров для мессенджера через внешний сервис: KLIPY
 * (основной, бесплатный, после закрытия Tenor API в июне 2026) или GIPHY.
 * Браузер ходит только к нашему серверу, ключ живёт в .env. Ответы
 * кэшируются, а сами картинки браузер берёт прямо с CDN сервиса.
 *
 * Каждая карточка приводится к одному виду (см. item()):
 *   key      klipy:gif:slug — сервис, вид, id у сервиса
 *   type     gif | sticker
 *   preview  { url, width, height } — для сетки в пикере
 *   full     { url, mp4?, width, height } — для ленты чата
 */
class Gifs
{
    public const PER_PAGE = 24;

    public const TYPES = ['gif', 'sticker'];

    /** С каких адресов разрешены картинки: чужие ссылки в чат не пускаем. */
    private const HOSTS = ['klipy' => 'klipy.com', 'giphy' => 'giphy.com'];

    public static function provider(): ?string
    {
        $want = Str::lower((string) config('services.gifs.provider'));
        if (in_array($want, ['klipy', 'giphy'], true)) {
            return self::key($want) ? $want : null;
        }
        if (self::key('klipy')) {
            return 'klipy';
        }

        return self::key('giphy') ? 'giphy' : null;
    }

    /**
     * Страница поиска (или трендовые при пустом запросе).
     *
     * @return array{items: array<int, array>, next: ?int, provider: string}
     */
    public static function search(string $type, string $query, int $page): array
    {
        $provider = self::provider();
        if (! $provider) {
            throw new RuntimeException('no-key');
        }
        $query = Str::limit(trim(preg_replace('/\s+/u', ' ', $query)), 100, '');
        $page = max(1, min($page, 50));
        $cacheKey = 'gifs:'.md5(implode('|', [$provider, $type, Str::lower($query), $page, config('services.gifs.locale'), config('services.gifs.rating')]));

        return Cache::remember($cacheKey, now()->addMinutes($query === '' ? 30 : 10), fn () => [
            ...($provider === 'klipy' ? self::klipy($type, $query, $page) : self::giphy($type, $query, $page)),
            'provider' => $provider,
        ]);
    }

    /**
     * Проверить карточку, пришедшую из браузера (отправка в чат, избранное):
     * оставить только известные поля и адреса с CDN сервиса.
     */
    public static function clean(mixed $item): ?array
    {
        if (! is_array($item)) {
            return null;
        }
        $key = (string) ($item['key'] ?? '');
        if (! preg_match('/^(klipy|giphy):(gif|sticker):[A-Za-z0-9_\-]{1,120}$/', $key, $m)) {
            return null;
        }
        $provider = $m[1];
        $preview = self::media($item['preview'] ?? null, $provider);
        $full = self::media($item['full'] ?? null, $provider);
        if (! $preview || ! $full) {
            return null;
        }

        return [
            'key' => $key,
            'provider' => $provider,
            'type' => $m[2],
            'title' => Str::limit(trim((string) ($item['title'] ?? '')), 200, ''),
            'preview' => $preview,
            'full' => $full,
        ];
    }

    /* ---------- KLIPY: api.klipy.com/api/v1/{ключ}/{gifs|stickers}/{search|trending} ---------- */

    private static function klipy(string $type, string $query, int $page): array
    {
        $segment = $type === 'sticker' ? 'stickers' : 'gifs';
        $params = array_filter([
            'q' => $query === '' ? null : $query,
            'page' => $page,
            'per_page' => self::PER_PAGE,
            'locale' => self::locale(true),
            'rating' => config('services.gifs.rating'),
        ], fn ($v) => $v !== null && $v !== '');
        $json = self::get('https://api.klipy.com/api/v1/'.rawurlencode((string) self::key('klipy')).'/'.$segment.'/'.($query === '' ? 'trending' : 'search'), $params);
        $data = $json['data'] ?? [];
        $rows = is_array($data['data'] ?? null) ? $data['data'] : (array_is_list($data) ? $data : []);

        $items = [];
        foreach ($rows as $row) {
            /* В выдаче бывают рекламные места — их не показываем. */
            if (! is_array($row) || ($row['type'] ?? '') === 'ad') {
                continue;
            }
            $files = $row['file'] ?? $row['files'] ?? [];
            $id = (string) ($row['slug'] ?? $row['id'] ?? '');
            $preview = self::klipyPick($files, ['sm', 'xs', 'md', 'hd'], $type, false);
            $full = self::klipyPick($files, ['md', 'hd', 'sm'], $type, true);
            if ($one = self::item('klipy', $type, $id, (string) ($row['title'] ?? ''), $preview, $full)) {
                $items[] = $one;
            }
        }

        return ['items' => $items, 'next' => ! empty($data['has_next']) ? $page + 1 : null];
    }

    private static function klipyPick(mixed $files, array $sizes, string $type, bool $withVideo): ?array
    {
        if (! is_array($files)) {
            return null;
        }
        foreach ($sizes as $size) {
            $set = $files[$size] ?? null;
            if (! is_array($set)) {
                continue;
            }
            $image = self::klipyFormat($set['webp'] ?? null) ?? self::klipyFormat($set['gif'] ?? null);
            if ($image) {
                /* Стикерам нужна прозрачность — им только картинка, не видео. */
                $mp4 = $withVideo && $type === 'gif' ? self::klipyFormat($set['mp4'] ?? null) : null;

                return $image + ($mp4 ? ['mp4' => $mp4['url']] : []);
            }
        }

        return null;
    }

    private static function klipyFormat(mixed $node): ?array
    {
        if (is_string($node)) {
            return ['url' => $node, 'width' => null, 'height' => null];
        }
        if (! is_array($node) || empty($node['url'])) {
            return null;
        }

        return ['url' => (string) $node['url'], 'width' => self::int($node['width'] ?? null), 'height' => self::int($node['height'] ?? null)];
    }

    /* ---------- GIPHY: api.giphy.com/v1/{gifs|stickers}/{search|trending} ---------- */

    private static function giphy(string $type, string $query, int $page): array
    {
        $offset = ($page - 1) * self::PER_PAGE;
        $params = array_filter([
            'api_key' => self::key('giphy'),
            'q' => $query === '' ? null : $query,
            'limit' => self::PER_PAGE,
            'offset' => $offset,
            'rating' => config('services.gifs.rating'),
            'lang' => $query === '' ? null : self::locale(false),
            'bundle' => 'messaging_non_clips',
        ], fn ($v) => $v !== null && $v !== '');
        $json = self::get('https://api.giphy.com/v1/'.($type === 'sticker' ? 'stickers' : 'gifs').'/'.($query === '' ? 'trending' : 'search'), $params);

        $items = [];
        foreach ((array) ($json['data'] ?? []) as $row) {
            $images = $row['images'] ?? [];
            $small = $images['fixed_width'] ?? null;
            $big = $images['downsized_medium'] ?? $images['original'] ?? null;
            $original = $images['original'] ?? [];
            $preview = is_array($small) ? ['url' => (string) ($small['webp'] ?? $small['url'] ?? ''), 'width' => self::int($small['width'] ?? null), 'height' => self::int($small['height'] ?? null)] : null;
            $full = is_array($big) ? ['url' => (string) ($original['webp'] ?? $big['url'] ?? ''), 'width' => self::int($big['width'] ?? null), 'height' => self::int($big['height'] ?? null)] : null;
            if ($full && $type === 'gif' && ! empty($original['mp4'])) {
                $full['mp4'] = (string) $original['mp4'];
            }
            if ($one = self::item('giphy', $type, (string) ($row['id'] ?? ''), (string) ($row['title'] ?? ''), $preview, $full)) {
                $items[] = $one;
            }
        }
        $total = (int) ($json['pagination']['total_count'] ?? 0);
        $next = $offset + self::PER_PAGE < min($total, 4999) ? $page + 1 : null;

        return ['items' => $items, 'next' => $next];
    }

    /* ---------- Общее ---------- */

    private static function get(string $url, array $params): array
    {
        try {
            $response = Http::timeout(6)->connectTimeout(3)->acceptJson()->get($url, $params);
        } catch (\Throwable) {
            throw new RuntimeException('down');
        }
        /* KLIPY на неверный ключ отвечает 404 с текстом «API key is invalid». */
        if (in_array($response->status(), [401, 403], true) || ($response->status() === 404 && str_contains(Str::lower($response->body()), 'api key'))) {
            throw new RuntimeException('bad-key');
        }
        if ($response->status() === 429) {
            throw new RuntimeException('limit');
        }
        if (! $response->successful() || ! is_array($response->json())) {
            throw new RuntimeException('down');
        }

        return $response->json();
    }

    private static function item(string $provider, string $type, string $id, string $title, ?array $preview, ?array $full): ?array
    {
        return self::clean(['key' => "{$provider}:{$type}:{$id}", 'title' => $title, 'preview' => $preview, 'full' => $full]);
    }

    private static function media(mixed $media, string $provider): ?array
    {
        if (! is_array($media) || ! self::allowed($media['url'] ?? null, $provider)) {
            return null;
        }
        $out = ['url' => (string) $media['url'], 'width' => self::int($media['width'] ?? null), 'height' => self::int($media['height'] ?? null)];
        if (self::allowed($media['mp4'] ?? null, $provider)) {
            $out['mp4'] = (string) $media['mp4'];
        }

        return $out;
    }

    private static function allowed(mixed $url, string $provider): bool
    {
        if (! is_string($url) || strlen($url) > 1000 || ! str_starts_with($url, 'https://')) {
            return false;
        }
        $host = Str::lower((string) parse_url($url, PHP_URL_HOST));
        $root = self::HOSTS[$provider];

        return $host === $root || str_ends_with($host, '.'.$root);
    }

    private static function int(mixed $value): ?int
    {
        return is_numeric($value) && (int) $value > 0 ? min((int) $value, 10000) : null;
    }

    private static function key(string $provider): ?string
    {
        $key = trim((string) config("services.gifs.{$provider}_key"));

        return $key === '' ? null : $key;
    }

    private static function locale(bool $full): string
    {
        $locale = (string) config('services.gifs.locale', 'ru');
        $lang = Str::lower(substr($locale, 0, 2));

        return $full ? (str_contains($locale, '_') ? $locale : $lang.'_'.Str::upper($lang)) : $lang;
    }
}
