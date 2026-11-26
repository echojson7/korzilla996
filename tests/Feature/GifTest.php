<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GifTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name): User
    {
        /* Без событий модели: общий чат портала проверяет свой тест, здесь он только мешал бы порядку чатов. */
        return User::withoutEvents(fn () => User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'is_active' => true]));
    }

    private function klipyItem(string $slug, string $type = 'gif'): array
    {
        $set = fn ($w) => [
            'gif' => ['url' => "https://static.klipy.com/{$slug}-{$w}.gif", 'width' => $w, 'height' => $w],
            'webp' => ['url' => "https://static.klipy.com/{$slug}-{$w}.webp", 'width' => $w, 'height' => $w],
            'mp4' => ['url' => "https://static.klipy.com/{$slug}-{$w}.mp4", 'width' => $w, 'height' => $w],
        ];

        return ['id' => 1, 'slug' => $slug, 'title' => 'Кот', 'type' => $type, 'file' => ['hd' => $set(480), 'md' => $set(320), 'sm' => $set(200), 'xs' => $set(90)]];
    }

    public function test_without_key_search_says_not_connected(): void
    {
        config(['services.gifs.klipy_key' => null, 'services.gifs.giphy_key' => null]);
        $this->actingAs($this->user('Анна Иванова'))->getJson('/api/gifs')->assertStatus(503)->assertJsonPath('code', 'no-key');
        $this->getJson('/api/gifs/favorites')->assertOk()->assertJsonPath('data', []);
    }

    public function test_klipy_search_is_proxied_cached_and_skips_ads(): void
    {
        config(['services.gifs.klipy_key' => 'test-key', 'services.gifs.provider' => null]);
        Http::fake(['api.klipy.com/*' => Http::response(['result' => true, 'data' => [
            'data' => [$this->klipyItem('cat-1'), ['type' => 'ad', 'content' => '<b>ad</b>'], $this->klipyItem('cat-2')],
            'current_page' => 1, 'per_page' => 24, 'has_next' => true,
        ]])]);

        $this->actingAs($this->user('Анна Иванова'));
        $res = $this->getJson('/api/gifs?q=кот')->assertOk()
            ->assertJsonPath('data.provider', 'klipy')
            ->assertJsonPath('data.next', 2)
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.items.0.key', 'klipy:gif:cat-1')
            ->assertJsonPath('data.items.0.preview.url', 'https://static.klipy.com/cat-1-200.webp')
            ->assertJsonPath('data.items.0.full.mp4', 'https://static.klipy.com/cat-1-320.mp4');
        $this->assertStringNotContainsString('test-key', $res->getContent());
        $this->getJson('/api/gifs?q=кот')->assertOk();
        Http::assertSentCount(1);
        Http::assertSent(fn ($req) => str_starts_with($req->url(), 'https://api.klipy.com/api/v1/test-key/gifs/search'));

        $this->getJson('/api/gifs?type=sticker')->assertOk();
        Http::assertSent(fn ($req) => str_contains($req->url(), '/stickers/trending'));
    }

    public function test_giphy_fallback(): void
    {
        config(['services.gifs.klipy_key' => null, 'services.gifs.giphy_key' => 'g-key']);
        Http::fake(['api.giphy.com/*' => Http::response(['data' => [[
            'id' => 'abc123', 'title' => 'Dog',
            'images' => [
                'fixed_width' => ['url' => 'https://media1.giphy.com/a.gif', 'webp' => 'https://media1.giphy.com/a.webp', 'width' => '200', 'height' => '150'],
                'original' => ['url' => 'https://media1.giphy.com/o.gif', 'webp' => 'https://media1.giphy.com/o.webp', 'mp4' => 'https://media1.giphy.com/o.mp4', 'width' => '480', 'height' => '360'],
            ],
        ]], 'pagination' => ['total_count' => 100, 'count' => 1, 'offset' => 0]])]);

        $this->actingAs($this->user('Анна Иванова'))->getJson('/api/gifs')->assertOk()
            ->assertJsonPath('data.provider', 'giphy')
            ->assertJsonPath('data.items.0.key', 'giphy:gif:abc123')
            ->assertJsonPath('data.items.0.preview.width', 200)
            ->assertJsonPath('data.items.0.full.mp4', 'https://media1.giphy.com/o.mp4');
    }

    public function test_favorites_and_gif_messages(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $item = [
            'key' => 'klipy:gif:cat-1', 'title' => 'Кот',
            'preview' => ['url' => 'https://static.klipy.com/cat-1-200.webp', 'width' => 200, 'height' => 200],
            'full' => ['url' => 'https://static.klipy.com/cat-1-320.webp', 'mp4' => 'https://static.klipy.com/cat-1-320.mp4', 'width' => 320, 'height' => 320],
        ];

        $this->actingAs($anna)->postJson('/api/gifs/favorites', ['item' => $item])->assertCreated();
        $this->postJson('/api/gifs/favorites', ['item' => $item])->assertCreated();
        $this->getJson('/api/gifs/favorites')->assertJsonCount(1, 'data')->assertJsonPath('data.0.type', 'gif');
        /* Чужой адрес картинки не пускаем. */
        $bad = $item;
        $bad['full']['url'] = 'https://evil.example/track.gif';
        $this->postJson('/api/gifs/favorites', ['item' => $bad])->assertStatus(422);
        $this->actingAs($boris)->getJson('/api/gifs/favorites')->assertJsonCount(0, 'data');

        $chat = $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $boris->id])->json('data');
        $sent = $this->postJson("/api/messenger/chats/{$chat['id']}/messages", ['gif' => $item, 'body' => 'лишнее'])->assertCreated()
            ->assertJsonPath('data.gif.key', 'klipy:gif:cat-1')
            ->assertJsonPath('data.body', null)->json('data');
        $this->postJson("/api/messenger/chats/{$chat['id']}/messages", ['gif' => $bad])->assertStatus(422);
        $this->patchJson("/api/messenger/messages/{$sent['id']}", ['body' => 'текст'])->assertStatus(422);
        $this->actingAs($boris)->getJson('/api/messenger/chats')->assertJsonPath('data.chats.0.last.text', 'GIF');

        $this->actingAs($anna)->deleteJson('/api/gifs/favorites', ['key' => 'klipy:gif:cat-1'])->assertNoContent();
        $this->getJson('/api/gifs/favorites')->assertJsonCount(0, 'data');
    }

    public function test_invalid_klipy_key_is_reported(): void
    {
        config(['services.gifs.klipy_key' => 'bad']);
        Http::fake(['api.klipy.com/*' => Http::response(['result' => false, 'errors' => ['message' => ['The provided API key is invalid.']]], 404)]);
        $this->actingAs($this->user('Анна Иванова'))->getJson('/api/gifs')->assertStatus(503)->assertJsonPath('code', 'bad-key');
    }
}
