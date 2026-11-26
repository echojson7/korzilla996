<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RealtimeTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff'): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'role' => $role, 'is_active' => true]);
    }

    private function last(User $user): int
    {
        return (int) $this->actingAs($user)->getJson('/api/realtime')->assertOk()->json('data.last');
    }

    public function test_task_changes_reach_everyone_who_sees_it(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $vera = $this->user('Вера Сидорова');
        $boss = $this->user('Главный Админ', 'admin');
        $eve = $this->user('Ева Чужая');

        $this->getJson('/api/realtime')->assertStatus(401);

        /* До первого события журнал пуст: отсчёт с нуля. */
        $this->assertSame(0, $this->last($anna));
        $id = $this->actingAs($anna)->postJson('/api/tasks', ['title' => 'Главная', 'responsible_id' => $boris->id, 'accomplices' => [$vera->id]])
            ->assertCreated()->assertJsonPath('data.version', 1)->json('data.id');
        foreach ([$anna, $boris, $vera, $boss] as $who) {
            $this->assertGreaterThan(0, $this->last($who));
        }
        $this->assertSame(0, $this->last($eve));
        /* С нуля — значит, «всё после начала журнала». */
        $this->actingAs($vera)->getJson('/api/realtime?after=0')->assertJsonPath('data.changes.task', [$id]);

        /* Своя правка уже несёт новую версию. */
        $mark = $this->last($boris);
        $this->actingAs($anna)->patchJson("/api/tasks/{$id}", ['title' => 'Главная страница'])->assertJsonPath('data.version', 2);
        $state = $this->actingAs($boris)->getJson("/api/realtime?after={$mark}")->json('data');
        $this->assertSame([$id], $state['changes']['task']);
        /* Пока ничего нового — пусто. */
        $this->getJson("/api/realtime?after={$state['last']}")->assertJsonPath('data.changes', []);

        /* Догрузка по id. */
        $this->getJson("/api/tasks?ids={$id},999")->assertJsonCount(1, 'data.tasks')->assertJsonPath('data.tasks.0.title', 'Главная страница');

        /* Веру убрали — событие ей приходит, а задача по id уже не отдаётся. */
        $mark = $this->last($vera);
        $this->actingAs($anna)->patchJson("/api/tasks/{$id}", ['accomplices' => []])->assertOk();
        $this->actingAs($vera)->getJson("/api/realtime?after={$mark}")->assertJsonPath('data.changes.task', [$id]);
        $this->getJson("/api/tasks?ids={$id}")->assertJsonCount(0, 'data.tasks');

        /* Чек-лист и подзадача: событие и о задаче, и о родителе. */
        $mark = $this->last($boris);
        $this->actingAs($boris)->postJson("/api/tasks/{$id}/checklist", ['title' => 'Шапка'])->assertCreated();
        $child = $this->postJson('/api/tasks', ['title' => 'Шапка', 'parent_id' => $id])->assertCreated()->json('data.id');
        $changed = $this->getJson("/api/realtime?after={$mark}")->json('data.changes.task');
        sort($changed);
        $this->assertSame([$id, $child], $changed);
        $this->getJson("/api/tasks?ids={$id}")->assertJsonPath('data.tasks.0.children', 1);

        /* Удаление — событие тем, кто видел. */
        $mark = $this->last($boris);
        $this->deleteJson("/api/tasks/{$child}")->assertNoContent();
        $this->getJson("/api/realtime?after={$mark}")->assertJsonPath('data.changes.task', [$child, $id]);
    }
}
