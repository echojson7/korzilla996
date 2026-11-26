<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Число запросов к базе не растёт с числом сотрудников и чатов: списки
 * собираются пачками, без запроса на каждую строку (N+1).
 */
class QueryCountTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff'): User
    {
        return User::withoutEvents(fn () => User::query()->create([
            'name' => $name, 'email' => uniqid('u', true).'@k.ru', 'password' => 'secret-pass-123', 'is_active' => true, 'role' => $role,
        ]));
    }

    /** @return string[] SQL всех запросов, сделанных за время $run */
    private function queries(callable $run): array
    {
        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            $sql[] = $query->sql;
        });
        $run();

        return $sql;
    }

    private function hits(array $sql, string $table): int
    {
        return count(array_filter($sql, fn ($one) => preg_match('/from "'.$table.'"/', $one)));
    }

    private function customRoleStaff(int $n): void
    {
        Role::query()->firstOrCreate(['key' => 'sales'], ['name' => 'Продажи', 'permissions' => [], 'sort' => 10]);
        for ($i = 0; $i < $n; $i++) {
            $this->user("Продавец {$i}", 'sales');
        }
    }

    public function test_people_list_loads_roles_once(): void
    {
        $me = $this->user('Анна Иванова', 'owner');
        $this->customRoleStaff(2);
        $few = $this->queries(fn () => $this->actingAs($me)->getJson('/api/messenger/users')->assertOk());
        $this->customRoleStaff(8);
        $many = $this->queries(fn () => $this->actingAs($me)->getJson('/api/messenger/users')
            ->assertOk()->assertJsonPath('data.1.roleLabel', 'Продажи'));

        $this->assertSame($this->hits($few, 'roles'), $this->hits($many, 'roles'));
        $this->assertLessThanOrEqual(1, $this->hits($many, 'roles'));
    }

    public function test_settings_list_loads_roles_once(): void
    {
        $me = $this->user('Анна Иванова', 'owner');
        $this->customRoleStaff(10);
        $sql = $this->queries(fn () => $this->actingAs($me)->getJson('/api/access')->assertOk());

        /* Список ролей с числом сотрудников и одна пачка ролей для людей. */
        $this->assertLessThanOrEqual(2, $this->hits($sql, 'roles'));
    }

    /** Общий чат на всех: список чатов не тянет всех его участников из users, только собеседников личных чатов. */
    public function test_chat_list_loads_only_direct_peers(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $crowd = collect(range(1, 15))->map(fn ($i) => $this->user("Сотрудник {$i}"))->pluck('id')->all();

        $this->actingAs($anna)->postJson('/api/messenger/chats', ['type' => 'direct', 'user_id' => $boris->id])->assertCreated();
        $this->postJson('/api/messenger/chats', ['type' => 'group', 'title' => 'Все', 'user_ids' => $crowd])->assertCreated();

        $bindings = [];
        DB::listen(function ($query) use (&$bindings) {
            if (preg_match('/from "users" where "id" in/', $query->sql)) {
                $bindings[] = $query->bindings;
            }
        });
        $chats = collect($this->getJson('/api/messenger/chats')->assertOk()->json('data.chats'));

        $this->assertSame('Борис Петров', $chats->firstWhere('type', 'direct')['title']);
        $this->assertCount(16, $chats->firstWhere('type', 'group')['members']);
        $this->assertSame([[$boris->id]], $bindings);
    }
}
