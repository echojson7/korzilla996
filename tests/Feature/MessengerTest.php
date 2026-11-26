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
        /* Без событий модели: общий чат портала проверяет свой тест, здесь он только мешал бы порядку чатов. */
        return User::withoutEvents(fn () => User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'is_active' => true]));
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
        $this->actingAs($eve)->getJson("/api/messenger/chats/{$chat['id']}/messages")->assertForbidden()->assertExactJson(["message" => "Нет доступа к чату", "reason" => "forbidden"]);
        $this->get('/api/messenger/files/'.$sent['files'][0]['id'])->assertForbidden();

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

    public function test_entity_chat_is_one_per_entity_and_joins_opener(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');

        $chat = $this->actingAs($anna)->postJson('/api/messenger/entity-chats', ['entity' => 'deal:12', 'title' => 'Сделка: Сайт'])
            ->assertCreated()->assertJsonPath('data.entity', 'deal:12')->assertJsonPath('data.type', 'group')->json('data');
        $this->actingAs($boris)->postJson('/api/messenger/entity-chats', ['entity' => 'deal:12', 'title' => 'Другое'])
            ->assertOk()->assertJsonPath('data.id', $chat['id'])->assertJsonPath('data.title', 'Сделка: Сайт')
            ->assertJsonCount(2, 'data.members');
        $this->postJson('/api/messenger/entity-chats', ['entity' => 'drop table', 'title' => 'x'])->assertStatus(422);
    }

    public function test_system_messages_and_sync(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $vera = $this->user('Вера Сидорова');

        $chat = $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'group', 'title' => 'Продажи', 'user_ids' => [$boris->id]])->json('data');
        $this->postJson("/api/messenger/chats/{$chat['id']}/members", ['user_ids' => [$vera->id, $boris->id]]);

        $state = $this->actingAs($boris)->getJson('/api/messenger/chats')->assertOk()->json('data');
        /* Системные сообщения не считаются непрочитанными. */
        $this->assertSame(0, $state['chats'][0]['unread']);
        $this->assertSame('Анна Иванова добавляет в чат: Вера Сидорова', $state['chats'][0]['last']['text']);

        /* Ничего не менялось — короткий ответ. */
        $this->getJson('/api/messenger/sync?v='.$state['v'])->assertExactJson(['data' => ['v' => $state['v']]]);

        $this->actingAs($vera)->deleteJson("/api/messenger/chats/{$chat['id']}/members/{$vera->id}")->assertNoContent();
        $sync = $this->actingAs($boris)->getJson('/api/messenger/sync?v='.$state['v'].'&chat='.$chat['id'].'&since='.urlencode(now()->subMinute()->toIso8601String()))->assertOk()->json('data');
        $this->assertNotSame($state['v'], $sync['v']);
        $this->assertSame('Вера Сидорова выходит из чата', $sync['chats'][0]['last']['text']);
        $kinds = collect($sync['thread']['messages'])->pluck('kind')->unique()->values()->all();
        $this->assertSame(['system'], $kinds);

        /* На системное сообщение не ответить реакцией и не удалить. */
        $systemId = $sync['thread']['messages'][0]['id'];
        $this->postJson("/api/messenger/messages/{$systemId}/reactions", ['emoji' => '👍'])->assertStatus(422);
        $this->actingAs($anna)->deleteJson("/api/messenger/messages/{$systemId}")->assertForbidden();
        $this->postJson("/api/messenger/chats/{$chat['id']}/typing")->assertNoContent();
    }

    public function test_forward_copies_text_and_files_to_own_chats_only(): void
    {
        Storage::fake('local');
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $vera = $this->user('Вера Сидорова');
        $withBoris = $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $boris->id])->json('data');
        $withVera = $this->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $vera->id])->json('data');
        $foreign = $this->actingAs($boris)->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $vera->id])->json('data');

        $sent = $this->actingAs($boris)->post("/api/messenger/chats/{$withBoris['id']}/messages", ['body' => 'Отчёт', 'files' => [UploadedFile::fake()->create('отчёт.pdf', 10)]], ['Accept' => 'application/json'])->json('data');
        $this->actingAs($anna)->postJson("/api/messenger/messages/{$sent['id']}/forward", ['chat_ids' => [$withVera['id'], $foreign['id']]])
            ->assertOk()->assertJsonPath('data.count', 1);

        $copy = $this->actingAs($vera)->getJson("/api/messenger/chats/{$withVera['id']}/messages")->json('data.messages.0');
        $this->assertSame('Отчёт', $copy['body']);
        $this->assertSame($boris->id, $copy['forwardedFrom']);
        $this->assertSame($anna->id, $copy['userId']);
        $this->get('/api/messenger/files/'.$copy['files'][0]['id'])->assertOk();
        $this->actingAs($boris)->getJson("/api/messenger/chats/{$foreign['id']}/messages")->assertJsonCount(0, 'data.messages');
    }

    public function test_views_list_readers_with_time(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $vera = $this->user('Вера Сидорова');
        $chat = $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'group', 'title' => 'Продажи', 'user_ids' => [$boris->id, $vera->id]])->json('data');
        $sent = $this->postJson("/api/messenger/chats/{$chat['id']}/messages", ['body' => 'Кто видел?'])->json('data');

        $this->actingAs($boris)->postJson("/api/messenger/chats/{$chat['id']}/read", ['id' => $sent['id']])->assertNoContent();
        $views = $this->actingAs($anna)->getJson("/api/messenger/messages/{$sent['id']}/views")->assertOk()->json('data');
        $this->assertCount(1, $views);
        $this->assertSame($boris->id, $views[0]['userId']);
        $this->assertNotNull($views[0]['at']);
        $this->getJson('/api/messenger/chats')->assertJsonPath('data.chats.0.reads.'.$boris->id, $sent['id']);
    }

    public function test_general_chat_has_every_active_employee(): void
    {
        $make = fn (string $name) => User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@g.ru', 'password' => 'secret-pass-123', 'is_active' => true]);
        $anna = $make('Анна Общая');
        $boris = $make('Борис Общий');

        $all = $this->actingAs($boris)->getJson('/api/messenger/chats')->assertOk()->json('data.chats');
        /* Общий чат, Changelog и личный чат с новым коллегой. */
        $this->assertCount(3, $all);
        $direct = array_values(array_filter($all, fn ($chat) => $chat['type'] === 'direct'))[0];
        $this->assertSame('Борис Общий теперь в команде', $direct['last']['text']);
        $this->assertEqualsCanonicalizing([$anna->id, $boris->id], $direct['members']);
        $state = array_values(array_filter($all, fn ($chat) => $chat['general']));
        $this->assertTrue($state[0]['general']);
        $this->assertSame('Общий чат', $state[0]['title']);
        $this->assertEqualsCanonicalizing([$anna->id, $boris->id], $state[0]['members']);
        $this->assertSame('Борис Общий теперь в команде', $state[0]['last']['text']);
        $id = $state[0]['id'];

        /* Выйти, исключить, добавить — нельзя; переименовать — только администратор. */
        $this->deleteJson("/api/messenger/chats/{$id}/members/{$boris->id}")->assertStatus(422);
        $this->deleteJson("/api/messenger/chats/{$id}/members/{$anna->id}")->assertStatus(422);
        $this->postJson("/api/messenger/chats/{$id}/members", ['user_ids' => [$anna->id]])->assertStatus(422);
        $this->patchJson("/api/messenger/chats/{$id}", ['title' => 'Своё'])->assertForbidden();
        $this->postJson("/api/messenger/chats/{$id}/messages", ['body' => 'Всем привет'])->assertCreated();

        /* Выключенная учётка выбывает. */
        $anna->update(['is_active' => false]);
        $general = collect($this->getJson('/api/messenger/chats')->json('data.chats'))->firstWhere('general', true);
        $this->assertSame([$boris->id], $general['members']);
    }

    public function test_changelog_channel_read_by_all_written_by_admins(): void
    {
        $make = fn (string $name, string $role) => User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@c.ru', 'password' => 'secret-pass-123', 'is_active' => true, 'role' => $role]);
        $owner = $make('Олег Главный', 'owner');
        $staff = $make('Света Обычная', 'staff');

        $this->artisan('changelog:post', ['file' => '/nonexistent.md'])->assertExitCode(1);
        $path = tempnam(sys_get_temp_dir(), 'log');
        file_put_contents($path, "## Мессенджер\n- **Общий чат** для всех");
        $this->artisan('changelog:post', ['file' => $path])->assertExitCode(0);

        $chats = collect($this->actingAs($staff)->getJson('/api/messenger/chats')->assertOk()->json('data.chats'));
        $log = $chats->firstWhere('changelog', true);
        $this->assertSame('Changelog', $log['title']);
        $this->assertTrue($log['readonly']);
        $this->assertSame(1, $log['unread']);
        $this->getJson("/api/messenger/chats/{$log['id']}/messages")->assertJsonPath('data.messages.0.userId', null);
        $this->postJson("/api/messenger/chats/{$log['id']}/messages", ['body' => 'привет'])->assertForbidden();
        $this->deleteJson("/api/messenger/chats/{$log['id']}/members/{$staff->id}")->assertStatus(422);

        $this->actingAs($owner)->getJson('/api/messenger/chats')->assertOk();
        $this->postJson("/api/messenger/chats/{$log['id']}/messages", ['body' => '## Новое'])->assertCreated();
    }

    public function test_pin_messages(): void
    {
        $make = fn (string $name, string $role) => User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@p.ru', 'password' => 'secret-pass-123', 'is_active' => true, 'role' => $role]);
        $owner = $make('Олег Главный', 'owner');
        $staff = $make('Света Обычная', 'staff');
        $chat = $this->actingAs($staff)->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $owner->id])->json('data.id');
        $first = $this->postJson("/api/messenger/chats/{$chat}/messages", ['body' => 'Первое'])->json('data.id');
        $second = $this->postJson("/api/messenger/chats/{$chat}/messages", ['body' => 'Второе'])->json('data.id');

        /* В личном чате закрепляют оба; закреплённых может быть несколько, новые первыми. */
        $this->postJson("/api/messenger/messages/{$first}/pin")->assertOk()->assertJsonPath('data.id', $first);
        $this->actingAs($owner)->postJson("/api/messenger/messages/{$second}/pin")->assertOk();
        $page = $this->getJson("/api/messenger/chats/{$chat}/messages")->assertOk();
        $this->assertSame([$second, $first], collect($page->json('data.pins'))->pluck('id')->all());
        $this->assertSame(2, collect($page->json('data.messages'))->where('kind', 'system')->where('meta.event', 'pinned')->count());

        /* Повторно — открепить; удалённое уходит из закреплённых. */
        $this->postJson("/api/messenger/messages/{$second}/pin")->assertOk()->assertJsonPath('data.pinnedAt', null);
        $this->actingAs($staff)->deleteJson("/api/messenger/messages/{$first}")->assertNoContent();
        $this->getJson("/api/messenger/chats/{$chat}/messages")->assertJsonCount(0, 'data.pins');

        /* Общий чат: обычный сотрудник не закрепляет, владелец — да. */
        $general = collect($this->getJson('/api/messenger/chats')->json('data.chats'))->firstWhere('general', true);
        $this->assertFalse($general['canPin']);
        $this->actingAs($owner);
        $post = $this->postJson("/api/messenger/chats/{$general['id']}/messages", ['body' => 'Важное'])->json('data.id');
        $this->actingAs($staff)->postJson("/api/messenger/messages/{$post}/pin")->assertForbidden();
        $this->actingAs($owner)->postJson("/api/messenger/messages/{$post}/pin")->assertOk();
    }

    public function test_greet_all_backfills_direct_chats_once(): void
    {
        $make = fn (string $name) => User::withoutEvents(fn () => User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@b.ru', 'password' => 'secret-pass-123', 'is_active' => true]));
        $a = $make('Ася Первая');
        $b = $make('Бэла Вторая');
        $c = $make('Ваня Третий');
        $this->artisan('staff:greet-all')->expectsOutputToContain('Заведено личных чатов: 3')->assertExitCode(0);
        $this->artisan('staff:greet-all')->expectsOutputToContain('Заведено личных чатов: 0');
        $chats = collect($this->actingAs($a)->getJson('/api/messenger/chats')->json('data.chats'))->where('type', 'direct');
        $this->assertCount(2, $chats);
        $this->assertEqualsCanonicalizing(['Бэла Вторая теперь в команде', 'Ваня Третий теперь в команде'], $chats->pluck('last.text')->all());
    }
}
