<?php

namespace Tests\Feature;

use App\Models\Chat;
use App\Models\CrmDeal;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmRobotRun;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RobotTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff'): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'role' => $role, 'is_active' => true]);
    }

    private function stages(): array
    {
        $pipeline = CrmPipeline::query()->where('entity', 'deal')->first();

        return [$pipeline, $pipeline->stages()->orderBy('sort')->get()->values()];
    }

    public function test_staff_sees_but_cannot_edit_robots(): void
    {
        [$pipeline, $stages] = $this->stages();
        $anna = $this->user('Анна Менеджер');
        $this->actingAs($anna)->getJson('/api/crm/robots?pipeline='.$pipeline->id)->assertOk()->assertJsonPath('data.can.edit', false);
        $this->actingAs($anna)->postJson('/api/crm/robots', ['stage_id' => $stages[1]->id, 'type' => 'task', 'title' => 'x'])->assertStatus(403);
    }

    public function test_task_robot_with_condition_and_delay(): void
    {
        [$pipeline, $stages] = $this->stages();
        $admin = $this->user('Ада Админ', 'admin');
        $anna = $this->user('Анна Менеджер');
        $this->actingAs($admin)->postJson('/api/crm/robots', [
            'stage_id' => $stages[1]->id, 'type' => 'task', 'title' => 'Проверить ТЗ',
            'settings' => ['title' => 'Проверка ТЗ ({{Название}}, {{Сумма}})', 'responsible' => ['u:'.$admin->id], 'creator' => ['responsible'], 'deadline_value' => '2', 'deadline_unit' => 'wd', 'checklist' => "Поля\nБлоки", 'auditors' => ['responsible']],
            'conditions' => [['field' => 'amount', 'op' => '>', 'value' => '1000', 'join' => 'and']],
        ])->assertCreated();
        $this->actingAs($admin)->postJson('/api/crm/robots', [
            'stage_id' => $stages[1]->id, 'type' => 'notify', 'title' => 'Позже',
            'settings' => ['to' => ['responsible'], 'text' => 'Сделка {{Название}} висит 2 часа'],
            'delay' => ['type' => 'after', 'value' => '2', 'unit' => 'h'],
        ])->assertCreated();

        $small = $this->actingAs($anna)->postJson('/api/crm/deals', ['title' => 'Мелкая', 'amount' => 500])->json('data.id');
        $this->actingAs($anna)->postJson("/api/crm/deals/{$small}/move", ['stage_id' => $stages[1]->id])->assertOk();
        $this->assertSame(0, Task::query()->count());
        $this->assertSame('skipped', CrmRobotRun::query()->where('entity_id', $small)->orderBy('id')->first()->status);

        $big = $this->actingAs($anna)->postJson('/api/crm/deals', ['title' => 'Сайт', 'amount' => 50000])->json('data.id');
        $this->actingAs($anna)->postJson("/api/crm/deals/{$big}/move", ['stage_id' => $stages[1]->id])->assertOk();
        $task = Task::query()->firstOrFail();
        $this->assertSame('Проверка ТЗ (Сайт, 50000)', $task->title);
        $this->assertSame($big, (int) $task->deal_id);
        $this->assertSame($admin->id, (int) $task->responsible_id);
        $this->assertSame($anna->id, (int) $task->creator_id);
        $this->assertCount(2, $task->checklist);
        $this->assertTrue($task->members()->where('user_id', $anna->id)->where('role', 'auditor')->exists());
        $this->assertNotNull($task->deadline);
        $history = $this->actingAs($anna)->getJson("/api/crm/deals/{$big}")->json('data.history');
        $this->assertSame('robot', $history[0]['field']);

        /* Отложенный ждёт; уход со стадии отменяет его у мелкой сделки. */
        $this->assertSame(2, CrmRobotRun::query()->where('status', 'pending')->count());
        $this->actingAs($anna)->postJson("/api/crm/deals/{$small}/move", ['stage_id' => $stages[0]->id])->assertOk();
        $this->assertSame(1, CrmRobotRun::query()->where('status', 'pending')->count());
        Carbon::setTestNow(now()->addHours(3));
        $this->artisan('crm:robots')->assertSuccessful();
        Carbon::setTestNow();
        $this->assertSame(0, CrmRobotRun::query()->where('status', 'pending')->count());
        $chat = Chat::query()->where('entity', 'notify:'.$anna->id)->firstOrFail();
        $this->assertStringContainsString('Сделка Сайт висит 2 часа', $chat->messages()->first()->body);
    }

    public function test_stage_and_field_robots_chain_and_triggers(): void
    {
        [$pipeline, $stages] = $this->stages();
        $admin = $this->user('Ада Админ', 'admin');
        $pay = CrmField::query()->create(['entity' => 'deal', 'code' => 'uf_pay', 'title' => 'Способ оплаты', 'type' => 'list', 'options' => [['id' => '64', 'label' => 'ООО'], ['id' => '68', 'label' => 'Нал']]]);
        /* Новая сделка: поле «Нал» и задача; задача завершена — триггер на «В работе». */
        $this->actingAs($admin)->postJson('/api/crm/robots', ['stage_id' => $stages[0]->id, 'type' => 'field', 'title' => 'Оплата', 'settings' => ['values' => [['field' => 'uf_pay', 'value' => 'Нал'], ['field' => 'amount', 'value' => '777']]]])->assertCreated();
        $this->actingAs($admin)->postJson('/api/crm/robots', ['stage_id' => $stages[0]->id, 'type' => 'task', 'title' => 'Звонок', 'settings' => ['title' => 'Позвонить', 'responsible' => ['responsible']]])->assertCreated();
        $this->actingAs($admin)->postJson('/api/crm/triggers', ['stage_id' => $stages[1]->id, 'type' => 'task_done', 'title' => 'Позвонили', 'settings' => ['title' => 'позвон']])->assertCreated();
        /* На «В работе» при оплате налом — сразу в успех. */
        $this->actingAs($admin)->postJson('/api/crm/robots', ['stage_id' => $stages[1]->id, 'type' => 'stage', 'title' => 'Нал — закрыть', 'settings' => ['stage_id' => $stages[2]->id], 'conditions' => [['field' => 'uf_pay', 'op' => '=', 'value' => '68', 'join' => 'and']]])->assertCreated();

        $id = $this->actingAs($admin)->postJson('/api/crm/deals', ['title' => 'Заказ'])->json('data.id');
        $deal = CrmDeal::query()->find($id);
        $this->assertSame('68', $deal->fields['uf_pay']);
        $this->assertSame(777.0, (float) $deal->amount);
        $task = Task::query()->where('deal_id', $id)->firstOrFail();

        $this->actingAs($admin)->postJson("/api/tasks/{$task->id}/status", ['status' => 'done'])->assertOk();
        $deal->refresh();
        $this->assertSame($stages[2]->id, (int) $deal->stage_id);
        $this->assertTrue($deal->closed);
    }

    public function test_incoming_webhook_trigger_and_outgoing_webhook_robot(): void
    {
        [$pipeline, $stages] = $this->stages();
        $admin = $this->user('Ада Админ', 'admin');
        Http::fake(['journal.test/*' => Http::response('ok', 200)]);
        $this->actingAs($admin)->postJson('/api/crm/robots', ['stage_id' => $stages[1]->id, 'type' => 'webhook', 'title' => 'Журнал', 'settings' => ['url' => 'https://journal.test/rest/?deal={{ID}}&t={{Название}}']])->assertCreated();
        $hook = $this->actingAs($admin)->postJson('/api/crm/triggers', ['stage_id' => $stages[1]->id, 'type' => 'webhook', 'title' => 'Оплата пришла'])->assertCreated()->json('data.hook');
        $id = $this->actingAs($admin)->postJson('/api/crm/deals', ['title' => 'Сайт мечты'])->json('data.id');
        auth()->forgetGuards();

        $this->postJson('/api/'.$hook.'?deal='.$id)->assertOk()->assertJsonPath('ok', true);
        $this->assertSame($stages[1]->id, (int) CrmDeal::query()->find($id)->stage_id);
        Http::assertSent(fn ($request) => str_contains($request->url(), 'deal='.$id) && str_contains($request->url(), 't='.rawurlencode('Сайт мечты')));
        /* Назад без разрешения — нельзя. */
        $this->postJson('/api/'.$hook.'?deal='.$id)->assertOk()->assertJsonPath('ok', false);
        $this->postJson('/api/crm/hook/'.str_repeat('a', 40).'?deal='.$id)->assertNotFound();
    }
}
