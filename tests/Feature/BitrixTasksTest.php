<?php

namespace Tests\Feature;

use App\Models\CrmDeal;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\Task;
use App\Models\User;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportTasks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BitrixTasksTest extends TestCase
{
    use RefreshDatabase;

    public function test_tasks_move_with_people_deal_parent_and_checklist(): void
    {
        $anna = User::factory()->create(['role' => 'owner']);
        $anna->forceFill(['bitrix_id' => 7])->save();
        $boris = User::factory()->create();
        $boris->forceFill(['bitrix_id' => 8])->save();
        $pipeline = CrmPipeline::query()->create(['entity' => 'deal', 'title' => 'Общая', 'external_id' => '0']);
        $stage = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Новая', 'external_id' => 'NEW']);
        $deal = CrmDeal::query()->create(['pipeline_id' => $pipeline->id, 'stage_id' => $stage->id, 'title' => 'Сделка', 'external_id' => '100']);

        Http::fake([
            '*/sonet_group.get.json' => Http::response(['result' => [['ID' => '3', 'NAME' => 'Сайты']], 'total' => 1]),
            '*/tasks.task.list.json' => Http::response(['result' => ['tasks' => [
                ['id' => '11', 'parentId' => '10', 'title' => 'Сверстать', 'status' => '3', 'priority' => '2', 'createdBy' => '7', 'responsibleId' => '8',
                    'accomplices' => ['7', '999'], 'auditors' => ['8'], 'deadline' => '2026-12-01T18:00:00+03:00', 'taskControl' => 'Y', 'groupId' => '3', 'ufCrmTask' => ['C_5', 'D_100'],
                    'createdDate' => '2026-11-01T10:00:00+03:00'],
                ['id' => '10', 'title' => 'Сайт', 'status' => '5', 'responsibleId' => '7', 'closedDate' => '2020-01-01T10:00:00+03:00', 'createdDate' => '2019-12-01T10:00:00+03:00'],
            ]], 'total' => 2]),
            '*/batch.json' => Http::response(['result' => ['result' => ['t11' => [
                ['ID' => '1', 'PARENT_ID' => '0', 'TITLE' => 'Чек-лист 1', 'IS_COMPLETE' => 'N'],
                ['ID' => '2', 'PARENT_ID' => '1', 'TITLE' => 'Шапка', 'IS_COMPLETE' => 'Y'],
                ['ID' => '3', 'PARENT_ID' => '1', 'TITLE' => 'Подвал', 'IS_COMPLETE' => 'N'],
            ]], 'result_error' => []]]),
        ]);

        $report = (new ImportTasks(new Client('https://b24.test/rest/6/x/')))->run();
        $this->assertSame(2, $report['new']);

        $task = Task::query()->where('external_id', '11')->first();
        $this->assertSame('work', $task->status);
        $this->assertSame('high', $task->priority);
        $this->assertSame($boris->id, $task->responsible_id);
        $this->assertSame($anna->id, $task->creator_id);
        $this->assertSame($deal->id, (int) $task->deal_id);
        $this->assertSame('Сайты', $task->project);
        $this->assertTrue((bool) $task->needs_review);
        $this->assertSame(Task::query()->where('external_id', '10')->value('id'), $task->parent_id);
        $this->assertSame([[$anna->id, 'accomplice']], $task->members()->get()->map(fn ($m) => [$m->user_id, $m->role])->all());
        $this->assertSame(['Шапка', 'Подвал'], $task->checklist()->orderBy('sort')->pluck('title')->all());

        /* Давно завершённая задача в общий список не попадает. */
        $ids = collect($this->actingAs($anna->fresh())->getJson('/api/tasks')->assertOk()->json('data.tasks'))->pluck('id')->all();
        $this->assertSame([$task->id], $ids);

        $again = (new ImportTasks(new Client('https://b24.test/rest/6/x/')))->run();
        $this->assertSame(0, $again['new']);
    }
}
