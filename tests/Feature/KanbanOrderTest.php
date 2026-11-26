<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KanbanOrderTest extends TestCase
{
    use RefreshDatabase;

    /** Сто бросков в одну и ту же щель: порядок цел, номера не слиплись. */
    public function test_many_drops_into_one_gap_keep_order(): void
    {
        $me = User::withoutEvents(fn () => User::query()->create(['name' => 'Анна', 'email' => 'anna@k.ru', 'password' => 'secret-pass-123', 'is_active' => true, 'role' => 'owner']));
        $make = fn (string $title, float $sort) => Task::query()->create(['title' => $title, 'creator_id' => $me->id, 'responsible_id' => $me->id, 'sort' => $sort]);
        $first = $make('Первая', 0);
        $last = $make('Последняя', 1);

        $expected = [$first->id];
        $this->actingAs($me);
        for ($i = 1; $i <= 100; $i++) {
            $task = $make("Задача {$i}", 50);
            $this->postJson("/api/tasks/{$task->id}/move", ['before' => $last->id])->assertOk();
            $expected[] = $task->id;
        }
        $expected[] = $last->id;

        $rows = Task::query()->orderBy('sort')->orderByDesc('id')->get(['id', 'sort']);
        $this->assertSame($expected, $rows->pluck('id')->all());
        $this->assertCount($rows->count(), $rows->pluck('sort')->unique());
        /* Список с сервера — в том же порядке. */
        $this->assertSame($expected, collect($this->getJson('/api/tasks')->json('data.tasks'))->pluck('id')->all());
    }
}
