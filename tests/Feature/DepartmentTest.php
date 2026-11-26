<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Support\Access;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DepartmentTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, ?string $department, string $role = 'staff'): User
    {
        return User::withoutEvents(fn () => User::query()->create([
            'name' => $name, 'email' => uniqid('u', true).'@k.ru', 'password' => 'secret-pass-123',
            'is_active' => true, 'role' => $role, 'department' => $department,
        ]));
    }

    public function test_same_department_written_differently_is_one_department(): void
    {
        $anna = $this->user('Анна', 'Продажи');
        $boris = $this->user('Борис', '  продажи ');
        $vera = $this->user('Вера', 'Отдел   кадров');
        $gleb = $this->user('Глеб', '   ');

        $this->assertSame($anna->department_id, $boris->department_id);
        $this->assertSame('Продажи', $boris->fresh()->department);
        $this->assertSame('Отдел кадров', $vera->fresh()->department);
        $this->assertNull($gleb->department_id);
        $this->assertSame(2, Department::query()->count());
        $this->assertEqualsCanonicalizing([$anna->id, $boris->id], Access::colleagues($boris->fresh()));
    }

    public function test_dept_level_sees_tasks_of_colleagues_regardless_of_spelling(): void
    {
        Role::query()->create(['key' => 'dept', 'name' => 'Отдел', 'permissions' => ['tasks' => ['view' => 'dept']], 'sort' => 10]);
        $anna = $this->user('Анна', 'Продажи', 'dept');
        $boris = $this->user('Борис', 'продажи ');
        $task = Task::query()->create(['title' => 'Позвонить клиенту', 'creator_id' => $boris->id, 'responsible_id' => $boris->id]);

        $this->actingAs($anna)->getJson("/api/tasks/{$task->id}")->assertOk();
    }

    public function test_settings_and_profile_change_department_by_name(): void
    {
        $owner = $this->user('Владелец', null, 'owner');
        $anna = $this->user('Анна', 'Продажи');

        $this->actingAs($owner)->patchJson("/api/profiles/{$anna->id}", ['department' => 'ПРОДАЖИ'])->assertOk()
            ->assertJsonPath('data.department', 'Продажи');
        $this->patchJson("/api/profiles/{$anna->id}", ['department' => 'Маркетинг'])->assertOk()
            ->assertJsonPath('data.department', 'Маркетинг');
        $this->patchJson("/api/profiles/{$anna->id}", ['department' => null])->assertOk()
            ->assertJsonPath('data.department', null);

        $made = $this->postJson('/api/access/users', ['email' => 'vera', 'name' => 'Вера', 'role' => 'staff', 'department' => 'маркетинг'])
            ->assertCreated()->json('data.user');
        $this->assertSame('Маркетинг', $made['department']);
        /* В подсказках — только отделы, где кто-то есть. */
        $this->getJson('/api/access')->assertOk()->assertJsonPath('data.departments', ['Маркетинг']);
    }

    public function test_people_list_loads_departments_once(): void
    {
        $me = $this->user('Анна', 'Продажи', 'owner');
        foreach (range(1, 8) as $i) {
            $this->user("Сотрудник {$i}", "Отдел {$i}");
        }
        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            $sql[] = $query->sql;
        });
        $this->actingAs($me)->getJson('/api/messenger/users')->assertOk()->assertJsonPath('data.0.department', 'Продажи');

        $this->assertCount(1, array_filter($sql, fn ($one) => str_contains($one, 'from "departments"')));
    }
}
