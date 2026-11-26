<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TaskTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff'): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'role' => $role, 'is_active' => true]);
    }

    public function test_guest_gets_401(): void
    {
        $this->getJson('/api/tasks')->assertStatus(401);
    }

    public function test_full_task_flow(): void
    {
        Storage::fake('local');
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $vera = $this->user('Вера Сидорова');
        $eve = $this->user('Ева Чужая');

        $task = $this->actingAs($anna)->postJson('/api/tasks', [
            'title' => '  Сверстать главную  ', 'description' => "# План\n\n- [ ] шапка", 'responsible_id' => $boris->id,
            'accomplices' => [$vera->id], 'auditors' => [$eve->id], 'tags' => ['#Сайт', 'сайт', 'срочно'],
            'deadline' => now()->addDay()->toIso8601String(), 'needs_review' => true, 'project' => 'Мебель-Люкс', 'deal_id' => 1160,
        ])->assertCreated()
            ->assertJsonPath('data.title', 'Сверстать главную')
            ->assertJsonPath('data.creatorId', $anna->id)
            ->assertJsonPath('data.tags', ['сайт', 'срочно'])
            ->assertJsonPath('data.can.edit', true)
            ->json('data');
        $id = $task['id'];

        /* Видят участники, чужой — нет. */
        $outsider = $this->user('Олег Посторонний');
        $this->actingAs($outsider)->getJson("/api/tasks/{$id}")->assertNotFound();
        $this->getJson('/api/tasks')->assertJsonCount(0, 'data.tasks');
        $this->actingAs($vera)->getJson('/api/tasks')->assertJsonCount(1, 'data.tasks')->assertJsonPath('data.tasks.0.accomplices', [$vera->id]);
        $this->actingAs($eve)->getJson('/api/tasks')->assertJsonCount(1, 'data.tasks');
        /* Наблюдатель только комментирует. */
        $this->postJson("/api/tasks/{$id}/status", ['status' => 'work'])->assertForbidden();
        $this->postJson("/api/tasks/{$id}/comments", ['body' => 'Слежу'])->assertCreated();
        $this->patchJson("/api/tasks/{$id}", ['title' => 'Взлом'])->assertForbidden();

        /* Соисполнитель: чек-лист, время. */
        $item = $this->actingAs($vera)->postJson("/api/tasks/{$id}/checklist", ['title' => 'Шапка'])->assertCreated()->json('data');
        $this->patchJson("/api/task-checklist/{$item['id']}", ['done' => true])->assertJsonPath('data.done', true);
        $this->postJson("/api/tasks/{$id}/time", ['minutes' => 90, 'note' => 'вёрстка'])->assertCreated()->assertJsonPath('data.timeSpent', 5400);

        /* Ответственный: таймер переводит в работу, «завершить» с контролем — на контроль. */
        $this->actingAs($boris)->postJson("/api/tasks/{$id}/timer")->assertJsonPath('data.status', 'work');
        $this->getJson('/api/tasks')->assertJsonPath('data.timer.taskId', $id);
        $this->postJson("/api/tasks/{$id}/status", ['status' => 'done'])->assertJsonPath('data.status', 'review');
        $this->getJson('/api/tasks')->assertJsonPath('data.timer', null);

        $file = UploadedFile::fake()->create('ТЗ.pdf', 10, 'application/pdf');
        $saved = $this->post("/api/tasks/{$id}/files", ['files' => [$file]], ['Accept' => 'application/json'])->assertCreated()->json('data.0');
        $this->get("/api/task-files/{$saved['id']}")->assertOk();
        $this->actingAs($outsider)->get("/api/task-files/{$saved['id']}")->assertNotFound();

        /* Постановщик принимает работу. */
        $full = $this->actingAs($anna)->postJson("/api/tasks/{$id}/status", ['status' => 'done'])->assertJsonPath('data.status', 'done')->json('data');
        $this->assertNotNull($full['completedAt']);
        $this->assertSame(1, $full['checklist']['done']);
        $this->assertSame(1, $full['comments']);
        $fields = array_column($full['historyItems'], 'field');
        foreach (['created', 'status', 'checklist_add', 'checklist_done', 'file_add'] as $field) {
            $this->assertContains($field, $fields);
        }

        /* Правка полей пишет историю; подзадача не может стать родителем самой себе. */
        $this->patchJson("/api/tasks/{$id}", ['priority' => 'high', 'auditors' => []])->assertJsonPath('data.priority', 'high')->assertJsonPath('data.auditors', []);
        $child = $this->postJson('/api/tasks', ['title' => 'Подзадача', 'parent_id' => $id])->assertCreated()->json('data');
        $this->getJson("/api/tasks/{$id}")->assertJsonPath('data.childItems.0.id', $child['id'])->assertJsonPath('data.children', 1);
        $this->patchJson("/api/tasks/{$id}", ['parent_id' => $child['id']])->assertStatus(422);

        /* Перенос в канбане: статус и порядок. */
        $this->postJson("/api/tasks/{$child['id']}/move", ['status' => 'work', 'before' => $id])->assertJsonPath('data.status', 'work');
        $list = $this->getJson('/api/tasks')->json('data.tasks');
        $this->assertSame([$child['id'], $id], array_column($list, 'id'));

        /* Удаляет только постановщик. */
        $this->actingAs($boris)->deleteJson("/api/tasks/{$id}")->assertForbidden();
        $this->actingAs($anna)->deleteJson("/api/tasks/{$id}")->assertNoContent();
        $this->getJson("/api/tasks/{$id}")->assertNotFound();
    }

    public function test_admin_sees_all_and_editor_images(): void
    {
        Storage::fake('local');
        $anna = $this->user('Анна Иванова');
        $boss = $this->user('Главный Админ', 'admin');
        $this->actingAs($anna)->postJson('/api/tasks', ['title' => 'Своя'])->assertCreated()->assertJsonPath('data.responsibleId', $anna->id);
        $this->actingAs($boss)->getJson('/api/tasks')->assertJsonCount(1, 'data.tasks');

        $name = $this->post('/api/editor-images', ['file' => UploadedFile::fake()->image('a.png', 10, 10)], ['Accept' => 'application/json'])->assertCreated()->json('data.name');
        $this->get('/api/editor-images/'.$name)->assertOk();
        $this->get('/api/editor-images/..%2F..%2F.env')->assertNotFound();
        $this->postJson('/api/tasks', ['title' => '   '])->assertStatus(422);
    }

    public function test_mention_in_task_chat_adds_auditor(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $gleb = $this->user('Глеб');
        $id = $this->actingAs($anna)->postJson('/api/tasks', ['title' => 'Отчёт', 'responsible_id' => $boris->id])->json('data.id');
        $chat = $this->postJson('/api/messenger/entity-chats', ['entity' => "task:{$id}", 'title' => 'Задача: Отчёт'])->json('data.id');

        /* Ответственного не трогаем, Глеба — в наблюдатели; «@Глебов» не считается. */
        $this->postJson("/api/messenger/chats/{$chat}/messages", ['body' => '@Борис Петров, @Глебов и @Глеб, гляньте'])->assertCreated();
        $this->getJson("/api/tasks/{$id}")->assertJsonPath('data.auditors', [$gleb->id])->assertJsonPath('data.responsibleId', $boris->id);
        $this->actingAs($gleb)->getJson('/api/tasks')->assertJsonCount(1, 'data.tasks');
        $this->getJson("/api/messenger/chats/{$chat}/messages")->assertOk();

        /* Повторное упоминание ничего не дублирует. */
        $this->actingAs($anna)->postJson("/api/messenger/chats/{$chat}/messages", ['body' => 'Ещё раз @Глеб'])->assertCreated();
        $this->getJson("/api/tasks/{$id}")->assertJsonPath('data.auditors', [$gleb->id]);
    }
}
