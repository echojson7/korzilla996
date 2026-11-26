<?php

namespace Tests\Feature;

use App\Models\CrmDeal;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportSmart;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BitrixSmartTest extends TestCase
{
    use RefreshDatabase;

    public function test_smart_process_with_stages_fields_items_and_documents(): void
    {
        $pipeline = CrmPipeline::query()->create(['entity' => 'deal', 'title' => 'Общая', 'external_id' => '0']);
        $stage = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Новая', 'external_id' => 'NEW']);
        $deal = CrmDeal::query()->create(['pipeline_id' => $pipeline->id, 'stage_id' => $stage->id, 'title' => 'Сделка', 'external_id' => '100']);
        DB::table('crm_documents')->insert(['title' => 'Договор', 'bitrix_type' => 181, 'bitrix_owner' => '5', 'external_id' => '70', 'created_at' => now(), 'updated_at' => now()]);

        Http::fake([
            '*/crm.status.list.json' => Http::response(['result' => [
                ['ENTITY_ID' => 'DYNAMIC_181_STAGE_9', 'STATUS_ID' => 'DT181_9:NEW', 'NAME' => 'Подготовка', 'SORT' => 10, 'EXTRA' => ['SEMANTICS' => 'process']],
                ['ENTITY_ID' => 'DYNAMIC_181_STAGE_9', 'STATUS_ID' => 'DT181_9:SUCCESS', 'NAME' => 'Подписан', 'SORT' => 20, 'EXTRA' => ['SEMANTICS' => 'success']],
            ], 'total' => 2]),
            '*/crm.type.list.json' => Http::response(['result' => ['types' => [['id' => 1, 'entityTypeId' => 181, 'title' => 'Договоры']]]]),
            '*/crm.category.list.json' => Http::response(['result' => ['categories' => [['id' => 9, 'name' => 'Договоры', 'sort' => 100, 'isDefault' => true]]]]),
            '*/crm.item.fields.json' => Http::response(['result' => ['fields' => [
                'title' => ['type' => 'string'],
                'ufCrm5Number' => ['type' => 'string', 'title' => 'UF_CRM_5_NUMBER', 'listLabel' => 'Номер договора', 'upperName' => 'UF_CRM_5_NUMBER'],
            ]]]),
            '*/crm.item.list.json' => Http::response(['result' => ['items' => [
                ['id' => 5, 'title' => 'Договор с Ромашкой', 'categoryId' => 9, 'stageId' => 'DT181_9:SUCCESS', 'parentId2' => 100, 'ufCrm5Number' => 'Д-12', 'opportunity' => 90000],
            ]], 'total' => 1]),
        ]);

        $report = (new ImportSmart(new Client('https://b24.test/rest/6/x/'), 'https://b24.test'))->run();
        $this->assertSame([1, 2, 1, 1, 1], [$report['types'], $report['stages'], $report['fields'], $report['items'], $report['documents']]);

        $owner = User::factory()->create(['role' => 'owner']);
        $smart = $this->actingAs($owner->fresh())->getJson('/api/crm/deals/'.$deal->id)->assertOk()->json('data.smart.0');
        $this->assertSame(['Договоры', 'Договор с Ромашкой', true], [$smart['typeTitle'], $smart['title'], $smart['closed']]);
        $this->getJson('/api/crm/smart/'.$smart['id'])->assertOk()->assertJsonPath('data.fields.uf_crm_5_number', 'Д-12')->assertJsonPath('data.documents.0.title', 'Договор');
        $this->getJson('/api/crm/smart-types')->assertOk()->assertJsonPath('data.0.count', 1)->assertJsonPath('data.0.fields.0.title', 'Номер договора');
    }
}
