<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Support\GeneralChat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff', ?string $department = null): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'role' => $role, 'department' => $department, 'is_active' => true]);
    }

    public function test_only_managers_open_settings(): void
    {
        $anna = $this->user('Анна Иванова');
        $admin = $this->user('Админ Главный', 'admin');

        $this->actingAs($anna)->getJson('/api/access')->assertForbidden();
        $this->actingAs($admin)->getJson('/api/access')->assertOk()
            ->assertJsonPath('data.roles.0.key', 'owner')
            ->assertJsonPath('data.roles.2.permissions.tasks.view', 'own')
            ->assertJsonPath('data.schema.tasks.actions.view.levels', ['none', 'own', 'dept', 'all']);
        $this->getJson('/api/auth')->assertJsonPath('data.admin.manager', true)->assertJsonPath('data.admin.access.tasks.delete', 'all');
    }

    public function test_owner_rules(): void
    {
        $owner = $this->user('Владелец Один', 'owner');
        $admin = $this->user('Админ Главный', 'admin');
        $anna = $this->user('Анна Иванова');

        /* Админ не назначает владельцев и не трогает их. */
        $this->actingAs($admin)->patchJson("/api/access/users/{$anna->id}", ['role' => 'owner'])->assertForbidden();
        $this->patchJson("/api/access/users/{$owner->id}", ['role' => 'staff'])->assertForbidden();
        $this->patchJson("/api/access/users/{$owner->id}", ['active' => false])->assertForbidden();
        $this->postJson("/api/access/users/{$owner->id}/password")->assertForbidden();
        $this->patchJson("/api/access/users/{$admin->id}", ['active' => false])->assertStatus(422);
        $this->patchJson("/api/access/users/{$anna->id}", ['role' => 'admin'])->assertOk()->assertJsonPath('data.role', 'admin');

        /* Последнего владельца не понизить, второго — можно. */
        $this->actingAs($owner)->patchJson("/api/access/users/{$owner->id}", ['role' => 'admin'])->assertStatus(422);
        $this->patchJson("/api/access/users/{$anna->id}", ['role' => 'owner'])->assertOk();
        $this->patchJson("/api/access/users/{$owner->id}", ['role' => 'admin'])->assertOk();
        $this->assertSame('admin', $owner->fresh()->role);
    }

    public function test_accounts_from_settings(): void
    {
        $admin = $this->user('Админ Главный', 'admin');

        $made = $this->actingAs($admin)->postJson('/api/access/users', ['email' => 'Vera@K.ru', 'name' => 'Вера Сидорова', 'role' => 'staff', 'department' => 'Продажи'])
            ->assertCreated()->assertJsonPath('data.user.email', 'vera@k.ru')->json('data');
        $this->assertSame(16, strlen($made['password']));
        $this->postJson('/api/access/users', ['email' => 'vera@k.ru', 'name' => 'Ещё', 'role' => 'staff'])->assertStatus(422);
        $this->postJson('/api/access/users', ['email' => 'boss', 'name' => 'Босс', 'role' => 'owner'])->assertForbidden();

        $vera = User::query()->where('email', 'vera@k.ru')->first();
        $this->assertTrue(GeneralChat::chat()->members()->where('user_id', $vera->id)->exists());
        $this->patchJson("/api/access/users/{$vera->id}", ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->postJson('/api/auth/logout');
        $this->postJson('/api/auth/login', ['email' => 'vera@k.ru', 'password' => $made['password']])->assertStatus(422);
    }

    public function test_custom_role_limits_tasks_and_messenger(): void
    {
        $admin = $this->user('Админ Главный', 'admin');
        $role = $this->actingAs($admin)->postJson('/api/access/roles', ['name' => 'Стажёр', 'permissions' => [
            'tasks' => ['view' => 'dept', 'create' => 'none', 'edit' => 'none', 'delete' => 'none'],
            'messenger' => ['chats' => 'none', 'general' => 'none', 'moderate' => 'none', 'hack' => 'all'],
            'staff' => ['view' => 'none'],
        ]])->assertCreated()->assertJsonPath('data.permissions.messenger.chats', 'none')->json('data');
        $this->assertArrayNotHasKey('hack', $role['permissions']['messenger']);
        $this->postJson('/api/access/roles', ['name' => 'Стажёр'])->assertStatus(422);
        $this->patchJson('/api/access/roles/'.Role::query()->where('key', 'admin')->value('id'), ['permissions' => []])->assertStatus(422);

        $intern = $this->user('Иван Стажёр', $role['key'], 'Продажи');
        $boss = $this->user('Борис Петров', 'staff', 'Продажи');
        $other = $this->user('Олег Чужой', 'staff', 'Склад');

        $mine = $this->actingAs($boss)->postJson('/api/tasks', ['title' => 'Задача отдела'])->assertCreated()->json('data.id');
        $foreign = $this->actingAs($other)->postJson('/api/tasks', ['title' => 'Чужая задача'])->assertCreated()->json('data.id');

        $this->actingAs($intern)->getJson('/api/tasks')->assertOk()->assertJsonCount(1, 'data.tasks')->assertJsonPath('data.tasks.0.id', $mine);
        $this->getJson("/api/tasks/{$foreign}")->assertNotFound();
        $this->getJson("/api/tasks/{$mine}")->assertOk()->assertJsonPath('data.can.edit', false);
        $this->patchJson("/api/tasks/{$mine}", ['title' => 'Правка'])->assertForbidden();
        $this->postJson('/api/tasks', ['title' => 'Своя'])->assertForbidden();
        $this->getJson("/api/profiles/{$boss->id}")->assertForbidden();
        $this->getJson("/api/profiles/{$intern->id}")->assertOk();

        $this->postJson('/api/messenger/chats', ['type' => 'group', 'title' => 'Мой чат'])->assertForbidden();
        $this->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $boss->id])->assertSuccessful(); /* личный чат с коллегой уже заведён при появлении учётки */
        $general = GeneralChat::chat();
        $this->postJson("/api/messenger/chats/{$general->id}/messages", ['body' => 'Привет всем'])->assertForbidden();
        $this->postJson('/api/messenger/entity-chats', ['entity' => "task:{$foreign}", 'title' => 'Задача'])->assertNotFound();

        /* Роль удалили — сотрудник снова «Сотрудник». */
        $this->actingAs($admin)->deleteJson("/api/access/roles/{$role['id']}")->assertNoContent();
        $this->assertSame('staff', $intern->fresh()->role);
    }

    public function test_staff_set_is_editable(): void
    {
        $admin = $this->user('Админ Главный', 'admin');
        $anna = $this->user('Анна Иванова');
        $other = $this->user('Олег Чужой');
        $task = $this->actingAs($other)->postJson('/api/tasks', ['title' => 'Чужая'])->json('data.id');

        $staff = Role::query()->where('key', 'staff')->first();
        $this->actingAs($admin)->patchJson("/api/access/roles/{$staff->id}", ['name' => 'Другое', 'permissions' => ['tasks' => ['view' => 'all', 'create' => 'all', 'edit' => 'own', 'delete' => 'own']]])
            ->assertOk()->assertJsonPath('data.name', 'Сотрудник');
        $this->actingAs($anna)->getJson("/api/tasks/{$task}")->assertOk();
    }
}
