<?php

namespace Tests\Feature;

use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\User;
use App\Support\BitrixImport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CrmTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff'): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'role' => $role, 'is_active' => true]);
    }

    private function import(): void
    {
        $read = fn ($name) => json_decode(file_get_contents(database_path("bitrix24/{$name}")), true);
        (new BitrixImport)->run($read('deal-stages.json'), $read('deal-fields.json'));
    }

    public function test_guest_gets_401(): void
    {
        $this->getJson('/api/crm/schema')->assertStatus(401);
        $this->getJson('/api/crm/deals')->assertStatus(401);
    }

    public function test_import_from_bitrix_is_idempotent(): void
    {
        $this->import();
        $this->import();
        $this->assertSame(14, CrmPipeline::query()->count());
        $site = CrmPipeline::query()->where('external_id', '4')->first();
        $this->assertSame('Создание сайта', $site->title);
        $this->assertTrue($site->is_default);
        $this->assertSame(['Новая', 'Расценка'], $site->stages->take(2)->pluck('title')->all());
        $this->assertSame('success', $site->stages->firstWhere('title', 'Проект закрыт')->semantic);
        $pay = CrmField::query()->where('external_code', 'UF_CRM_1547064684753')->first();
        $this->assertSame('list', $pay->type);
        $this->assertSame('Способ оплаты', $pay->title);
        $this->assertContains(['id' => '64', 'label' => 'ООО Корзилла'], $pay->options);
        $this->assertFalse(CrmField::query()->where('title', 'sdsdsds')->first()->active);
        $this->assertSame('user', CrmField::query()->where('title', 'Технолог')->first()->type);
    }

    public function test_deal_flow_with_fields_history_and_rights(): void
    {
        $this->import();
        $anna = $this->user('Анна Менеджер');
        $boris = $this->user('Борис Менеджер');
        $admin = $this->user('Ада Админ', 'admin');
        $site = CrmPipeline::query()->where('external_id', '4')->first();

        $schema = $this->actingAs($anna)->getJson('/api/crm/schema')->assertOk()->assertJsonPath('data.can.settings', false);
        $this->assertCount(14, $schema->json('data.pipelines'));

        $deal = $this->actingAs($anna)->postJson('/api/crm/deals', [
            'title' => ' Сайт клиники ', 'amount' => '180000', 'pipeline_id' => $site->id, 'company' => 'Улыбка',
            'fields' => ['uf_crm_1547064684753' => '64', 'uf_crm_1663244214' => [$boris->id], 'uf_crm_1668609649457' => '30', 'nonexistent' => 'x'],
        ])->assertCreated()
            ->assertJsonPath('data.title', 'Сайт клиники')
            ->assertJsonPath('data.stageId', $site->stages->first()->id)
            ->assertJsonPath('data.fields.uf_crm_1547064684753', '64')
            ->assertJsonPath('data.fields.uf_crm_1663244214', [$boris->id])
            ->json('data');
        $this->assertArrayNotHasKey('nonexistent', $deal['fields']);
        $this->postJson('/api/crm/deals', ['title' => 'x', 'fields' => ['uf_crm_1547064684753' => 'nope']])->assertStatus(422);

        /* Стадия «Проект закрыт» — сделка закрыта, в истории — переход. */
        $won = $site->stages->firstWhere('title', 'Проект закрыт');
        $this->postJson("/api/crm/deals/{$deal['id']}/move", ['stage_id' => $won->id])->assertOk()->assertJsonPath('data.closed', true);
        $full = $this->getJson("/api/crm/deals/{$deal['id']}")->assertOk()->json('data');
        $this->assertSame(['stage_id', 'created'], array_slice(array_column($full['history'], 'field'), 0, 2));
        $this->getJson("/api/crm/deals?pipeline={$site->id}&closed=0")->assertJsonCount(0, 'data.deals');
        $this->getJson("/api/crm/deals?pipeline={$site->id}&closed=1")->assertJsonCount(1, 'data.deals');

        /* Правка поля пишется в историю текстом варианта. */
        $this->patchJson("/api/crm/deals/{$deal['id']}", ['fields' => ['uf_crm_1547064684753' => '68']])->assertOk();
        $this->assertSame(['ООО Корзилла', 'Нал'], [$this->getJson("/api/crm/deals/{$deal['id']}")->json('data.history.0.old'), $this->getJson("/api/crm/deals/{$deal['id']}")->json('data.history.0.new')]);

        /* Чужую сделку менять нельзя (уровень «свои»), видеть — можно (по умолчанию «все»). */
        $this->actingAs($boris)->getJson("/api/crm/deals/{$deal['id']}")->assertOk()->assertJsonPath('data.can.edit', false);
        $this->patchJson("/api/crm/deals/{$deal['id']}", ['title' => 'Взлом'])->assertForbidden();
        $this->deleteJson("/api/crm/deals/{$deal['id']}")->assertForbidden();

        /* Настройки — только с правом. */
        $this->postJson('/api/crm/pipelines', ['title' => 'Своя'])->assertForbidden();
        $pipeline = $this->actingAs($admin)->postJson('/api/crm/pipelines', ['title' => 'Своя'])->assertCreated()->assertJsonCount(4, 'data.stages')->json('data');
        $stage = $this->postJson("/api/crm/pipelines/{$pipeline['id']}/stages", ['title' => 'Встреча', 'color' => '#AABBCC'])->assertCreated()->json('data');
        $order = $this->getJson('/api/crm/schema')->json('data.pipelines');
        $mine = collect($order)->firstWhere('id', $pipeline['id']);
        $this->assertSame(['Новая', 'В работе', 'Встреча', 'Сделка успешна', 'Сделка провалена'], array_column($mine['stages'], 'title'));
        $this->deleteJson("/api/crm/stages/{$stage['id']}")->assertNoContent();

        $field = $this->postJson('/api/crm/fields', ['title' => 'Тариф', 'type' => 'list', 'options' => [['label' => 'Lite'], ['label' => 'Pro']]])->assertCreated()->json('data');
        $this->assertCount(2, $field['options']);
        $this->actingAs($anna)->patchJson("/api/crm/deals/{$deal['id']}", ['fields' => [$field['code'] => $field['options'][1]['id']]])->assertOk();
        $this->actingAs($admin)->deleteJson("/api/crm/fields/{$field['id']}")->assertNoContent();
        $this->assertArrayNotHasKey($field['code'], $this->getJson("/api/crm/deals/{$deal['id']}")->json('data.fields'));

        /* Воронку со сделками не удалить. */
        $this->deleteJson("/api/crm/pipelines/{$site->id}")->assertStatus(422);
        $this->deleteJson("/api/crm/pipelines/{$pipeline['id']}")->assertNoContent();

        $this->actingAs($anna)->deleteJson("/api/crm/deals/{$deal['id']}")->assertNoContent();
        $this->getJson("/api/crm/deals/{$deal['id']}")->assertNotFound();
    }
}
