<?php

namespace Tests\Feature;

use App\Models\CrmContact;
use App\Models\CrmField;
use App\Models\CrmLead;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportCrm;
use App\Support\BitrixImport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BitrixLeadsTest extends TestCase
{
    use RefreshDatabase;

    public function test_leads_with_statuses_fields_contacts_and_products(): void
    {
        (new BitrixImport)->lead([
            ['ENTITY_ID' => 'STATUS', 'STATUS_ID' => 'NEW', 'NAME' => 'Не обработан', 'SORT' => 10, 'EXTRA' => ['SEMANTICS' => 'process', 'COLOR' => '#39a8ef']],
            ['ENTITY_ID' => 'STATUS', 'STATUS_ID' => 'JUNK', 'NAME' => 'Некачественный лид', 'SORT' => 20, 'EXTRA' => ['SEMANTICS' => 'failure']],
            ['ENTITY_ID' => 'SOURCE', 'STATUS_ID' => 'WEB', 'NAME' => 'Сайт', 'SORT' => 10],
        ], [
            'SOURCE_ID' => ['type' => 'crm_status'],
            'UF_CRM_7' => ['type' => 'enumeration', 'listLabel' => 'Тип сайта', 'items' => [['ID' => '5', 'VALUE' => 'Магазин']]],
        ]);
        $this->assertSame(2, CrmField::query()->where('entity', 'lead')->count());
        $contact = CrmContact::query()->create(['name' => 'Петров Иван', 'external_id' => '9']);
        $other = CrmContact::query()->create(['name' => 'Сидоров', 'external_id' => '10']);

        Http::fake([
            '*/crm.lead.list.json' => Http::response(['result' => [
                ['ID' => '300', 'TITLE' => 'Заявка с сайта', 'STATUS_ID' => 'JUNK', 'STATUS_SEMANTIC_ID' => 'F', 'NAME' => 'Иван', 'LAST_NAME' => 'Петров',
                    'PHONE' => [['VALUE' => '+7 900 111-22-33', 'VALUE_TYPE' => 'MOBILE']], 'CONTACT_ID' => '9', 'SOURCE_ID' => 'WEB', 'UF_CRM_7' => '5', 'OPPORTUNITY' => '1000'],
            ], 'total' => 1]),
            '*/batch.json' => Http::response(['result' => ['result' => ['l300' => [['CONTACT_ID' => 9, 'SORT' => 10], ['CONTACT_ID' => 10, 'SORT' => 20]]], 'result_error' => []]]),
            '*/crm.product.list.json' => Http::response(['result' => [['ID' => '1', 'NAME' => 'Лендинг', 'PRICE' => '30000', 'CURRENCY_ID' => 'RUB', 'ACTIVE' => 'Y']], 'total' => 1]),
            '*/crm.item.productrow.list.json' => Http::response(['result' => ['productRows' => [
                ['id' => 77, 'ownerId' => 300, 'ownerType' => 'L', 'productId' => 1, 'productName' => 'Лендинг', 'price' => 30000, 'quantity' => 2, 'discountSum' => 500, 'measureName' => 'шт', 'sort' => 10],
            ]]]),
        ]);

        $import = new ImportCrm(new Client('https://b24.test/rest/6/x/'), 'https://b24.test');
        $import->leads = 'all';
        $report = $import->run(['leads', 'products']);

        $lead = CrmLead::query()->where('external_id', '300')->first();
        $this->assertSame('Петров Иван', $lead->name);
        $this->assertTrue($lead->closed);
        $this->assertSame('Некачественный лид', $lead->stage->title);
        $this->assertSame($contact->id, $lead->contact_id);
        $this->assertEquals(['source' => 'WEB', 'uf_crm_7' => '5'], $lead->fields);
        $this->assertSame([$contact->id, $other->id], DB::table('crm_lead_contacts')->where('lead_id', $lead->id)->orderBy('sort')->pluck('contact_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(1, $report['product_rows']);
        $row = DB::table('crm_product_rows')->first();
        $this->assertSame(['lead', $lead->id, 'Лендинг'], [$row->owner_type, (int) $row->owner_id, $row->name]);
        $this->assertNotNull($row->product_id);

        $owner = \App\Models\User::factory()->create(['role' => 'owner']);
        $this->actingAs($owner->fresh())->getJson('/api/crm/lead-schema')->assertOk()->assertJsonCount(2, 'data.pipeline.stages');
        $this->getJson('/api/crm/leads?q=петров')->assertOk()->assertJsonPath('data.total', 1);
        $this->getJson('/api/crm/leads/'.$lead->id)->assertOk()->assertJsonPath('data.contacts.1.name', 'Сидоров')->assertJsonPath('data.products.0.sum', 60000);
    }
}
