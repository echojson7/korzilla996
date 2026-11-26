<?php

namespace App\Http\Controllers;

use App\Models\GifFavorite;
use App\Support\Gifs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * GIF и стикеры для мессенджера: поиск через сервис (App\Support\Gifs)
 * и избранное сотрудника.
 */
class GifController extends Controller
{
    /** Избранного у одного сотрудника — не больше. */
    private const FAVORITES = 500;

    public function search(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['nullable', Rule::in(Gifs::TYPES)],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        try {
            $result = Gifs::search($data['type'] ?? 'gif', (string) ($data['q'] ?? ''), (int) ($data['page'] ?? 1));
        } catch (RuntimeException $e) {
            [$status, $text] = match ($e->getMessage()) {
                'no-key' => [503, 'Поиск GIF ещё не подключён: администратору нужно добавить ключ сервиса в настройки сервера'],
                'bad-key' => [503, 'Сервис GIF не принял ключ: проверьте его в настройках сервера'],
                'limit' => [429, 'Сервис GIF просит подождать: слишком много запросов'],
                default => [502, 'Сервис GIF не ответил, попробуйте ещё раз'],
            };

            return response()->json(['message' => $text, 'code' => $e->getMessage()], $status);
        }

        return response()->json(['data' => $result]);
    }

    public function favorites(Request $request): JsonResponse
    {
        $rows = GifFavorite::query()->where('user_id', $request->user()->id)->latest('id')->get();

        return response()->json(['data' => $rows->map(fn (GifFavorite $row) => $row->item)->values()]);
    }

    public function addFavorite(Request $request): JsonResponse
    {
        $item = Gifs::clean($request->input('item'));
        abort_unless($item, 422, 'Это не GIF и не стикер');
        $me = $request->user();
        $count = GifFavorite::query()->where('user_id', $me->id)->count();
        abort_if($count >= self::FAVORITES, 422, 'В избранном уже '.self::FAVORITES.', уберите что-нибудь');
        GifFavorite::query()->updateOrCreate(['user_id' => $me->id, 'key' => $item['key']], ['item' => $item]);

        return response()->json(['data' => $item], 201);
    }

    public function removeFavorite(Request $request): Response
    {
        $key = (string) $request->input('key', '');
        GifFavorite::query()->where('user_id', $request->user()->id)->where('key', $key)->delete();

        return response()->noContent();
    }
}
