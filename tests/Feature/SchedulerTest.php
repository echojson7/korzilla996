<?php

namespace Tests\Feature;

use App\Support\Realtime;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SchedulerTest extends TestCase
{
    use RefreshDatabase;

    public function test_realtime_prune_is_scheduled_hourly(): void
    {
        $events = collect(app(Schedule::class)->events())->filter(fn ($event) => str_contains((string) $event->command, 'realtime:prune'));

        $this->assertCount(1, $events);
        $this->assertSame('0 * * * *', $events->first()->expression);
    }

    public function test_prune_removes_old_events_in_batches_and_keeps_fresh(): void
    {
        $old = now()->subDays(4);
        foreach (array_chunk(range(1, 2500), 500) as $chunk) {
            DB::table('realtime_events')->insert(array_map(fn ($i) => ['user_id' => 1, 'type' => 'task', 'entity_id' => $i, 'created_at' => $old], $chunk));
        }
        DB::table('realtime_events')->insert(['user_id' => 1, 'type' => 'task', 'entity_id' => 7, 'created_at' => now()]);
        $edge = (int) DB::table('realtime_events')->where('created_at', '<', now()->subDays(3))->max('id');

        $this->artisan('realtime:prune')->expectsOutput('Убрано событий: 2500')->assertSuccessful();

        $this->assertSame(1, DB::table('realtime_events')->count());
        $this->assertSame($edge, (int) Cache::get('realtime:floor'));
        /* Кто отстал за границу — грузит всё заново. */
        $this->assertTrue(Realtime::since(1, 5)['reset']);
        $this->assertSame(0, Realtime::prune());
    }
}
