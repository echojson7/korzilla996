<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MessengerTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'is_active' => true]);
    }

    public function test_guest_gets_401(): void
    {
        $this->getJson('/api/messenger/chats')->assertStatus(401);
    }

    public function test_direct_chat_messages_reactions_and_unread(): void
    {
        Storage::fake('local');
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $eve = $this->user('Ева Чужая');

        $chat = $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $boris->id])
            ->assertCreated()->assertJsonPath('data.title', 'Борис Петров')->json('data');
        /* Второй раз — тот же чат. */
        $this->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $boris->id])->assertOk()->assertJsonPath('data.id', $chat['id']);

        $file = UploadedFile::fake()->image('фото.png', 40, 30);
        $sent = $this->post("/api/messenger/chats/{$chat['id']}/messages", ['body' => 'Привет 👋', 'files' => [$file]], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.files.0.image', true)->assertJsonPath('data.files.0.width', 40)->json('data');

        $this->actingAs($boris)->getJson('/api/messenger/chats')->assertJsonPath('data.chats.0.unread', 1)->assertJsonPath('data.chats.0.last.text', 'Привет 👋');
        $this->getJson("/api/messenger/chats/{$chat['id']}/messages")->assertJsonPath('data.messages.0.body', 'Привет 👋');
        $this->get('/api/messenger/files/'.$sent['files'][0]['id'])->assertOk();

        $this->postJson("/api/messenger/messages/{$sent['id']}/reactions", ['emoji' => '👍'])->assertJsonPath('data.reactions.0.users.0', $boris->id);
        $this->postJson("/api/messenger/messages/{$sent['id']}/reactions", ['emoji' => 'abc'])->assertStatus(422);
        $this->postJson("/api/messenger/chats/{$chat['id']}/read", ['id' => $sent['id']])->assertNoContent();
        $this->getJson('/api/messenger/chats')->assertJsonPath('data.chats.0.unread', 0);

        /* Чужому чат не виден, файл тоже. */
        $this->actingAs($eve)->getJson("/api/messenger/chats/{$chat['id']}/messages")->assertNotFound();
        $this->get('/api/messenger/files/'.$sent['files'][0]['id'])->assertNotFound();

        /* Правка и удаление — только своё. */
        $this->actingAs($boris)->patchJson("/api/messenger/messages/{$sent['id']}", ['body' => 'нет'])->assertForbidden();
        $this->actingAs($anna)->patchJson("/api/messenger/messages/{$sent['id']}", ['body' => 'Привет!'])->assertJsonPath('data.body', 'Привет!');
        $since = now()->subMinute()->toIso8601String();
        $this->deleteJson("/api/messenger/messages/{$sent['id']}")->assertNoContent();
        $this->getJson("/api/messenger/chats/{$chat['id']}/messages?since=".urlencode($since))->assertJsonPath('data.messages.0.deleted', true);
    }

    public function test_group_chat_members(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $vera = $this->user('Вера Сидорова');

        $chat = $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'group', 'title' => 'Отдел продаж', 'user_ids' => [$boris->id]])
            ->assertCreated()->assertJsonPath('data.initials', 'ОП')->json('data');
        $this->assertCount(2, $chat['members']);

        $this->actingAs($boris)->postJson("/api/messenger/chats/{$chat['id']}/members", ['user_ids' => [$vera->id]])->assertJsonCount(3, 'data.members');
        $this->patchJson("/api/messenger/chats/{$chat['id']}", ['title' => 'Новое'])->assertForbidden();
        $this->deleteJson("/api/messenger/chats/{$chat['id']}/members/{$vera->id}")->assertForbidden();
        $this->deleteJson("/api/messenger/chats/{$chat['id']}/members/{$boris->id}")->assertNoContent();
        $this->getJson('/api/messenger/chats')->assertJsonCount(0, 'data.chats');

        $this->actingAs($anna)->patchJson("/api/messenger/chats/{$chat['id']}", ['title' => 'Продажи'])->assertJsonPath('data.title', 'Продажи');
        $this->postJson("/api/messenger/chats/{$chat['id']}/pin")->assertJsonPath('data.pinned', true);
    }
}
