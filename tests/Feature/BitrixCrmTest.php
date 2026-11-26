<?php

namespace Tests\Feature;

use App\Models\CrmDeal;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportCrm;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BitrixCrmTest extends TestCase
{
    use RefreshDatabase;

    public function test_companies_contacts_and_deals_move_with_links(): void
    {
        $anna = User::factory()->create();
        $anna->forceFill(['bitrix_id' => 7])->save();
        $pipeline = CrmPipeline::query()->create(['entity' => 'deal', 'title' => 'Общая', 'external_id' => '0']);
        CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Новая', 'external_id' => 'NEW', 'sort' => 10]);
        $won = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Успех', 'external_id' => 'WON', 'semantic' => 'success', 'sort' => 20]);
        CrmField::query()->create(['entity' => 'deal', 'code' => 'kind', 'title' => 'Вид', 'type' => 'list', 'options' => [['id' => '44', 'label' => 'Сайт']], 'external_code' => 'UF_CRM_1']);
        CrmField::query()->create(['entity' => 'deal', 'code' => 'price', 'title' => 'Цена', 'type' => 'number', 'external_code' => 'UF_CRM_2']);
        CrmField::query()->create(['entity' => 'deal', 'code' => 'source', 'title' => 'Источник', 'type' => 'list', 'options' => [['id' => 'WEB', 'label' => 'Сайт']], 'external_code' => 'SOURCE_ID']);

        Http::fake([
            '*/crm.company.list.json' => Http::response(['result' => [
                ['ID' => '5', 'TITLE' => 'ООО Ромашка', 'PHONE' => [['VALUE' => '+7 (900) 123-45-67', 'VALUE_TYPE' => 'WORK']], 'ASSIGNED_BY_ID' => '7', 'DATE_CREATE' => '2023-01-02T10:00:00+03:00', 'UF_CRM_INN' => '123'],
            ], 'total' => 1]),
            '*/crm.contact.list.json' => Http::response(['result' => [
                ['ID' => '9', 'NAME' => 'Иван', 'LAST_NAME' => 'Петров', 'COMPANY_ID' => '5', 'EMAIL' => [['VALUE' => 'i@r.ru', 'VALUE_TYPE' => 'WORK']]],
            ], 'total' => 1]),
            '*/crm.deal.list.json' => Http::response(['result' => [
                ['ID' => '100', 'TITLE' => 'Сайт для Ромашки', 'CATEGORY_ID' => '0', 'STAGE_ID' => 'WON', 'OPPORTUNITY' => '150000.00', 'CURRENCY_ID' => 'RUB',
                    'ASSIGNED_BY_ID' => '7', 'CREATED_BY_ID' => '999', 'COMPANY_ID' => '5', 'CONTACT_ID' => '9', 'CLOSED' => 'Y', 'CLOSEDATE' => '2023-03-01T03:00:00+03:00',
                    'COMMENTS' => 'Первый<br>[b]второй[/b]', 'UF_CRM_1' => '44', 'UF_CRM_2' => '500|RUB', 'SOURCE_ID' => 'WEB'],
                ['ID' => '101', 'TITLE' => 'Чужая', 'CATEGORY_ID' => '77'],
            ], 'total' => 2]),
        ]);

        $run = fn () => (new ImportCrm(new Client('https://b24.test/rest/6/x/'), 'https://b24.test'))->run();
        $report = $run();

        $this->assertSame(1, $report['deals']['new']);
        $this->assertSame(1, $report['deals_no_pipeline']);
        $deal = CrmDeal::query()->where('external_id', '100')->first();
        $this->assertSame($won->id, $deal->stage_id);
        $this->assertSame($anna->id, $deal->responsible_id);
        $this->assertNull($deal->creator_id);
        $this->assertSame('ООО Ромашка', $deal->company);
        $this->assertSame('Петров Иван', $deal->contact);
        $this->assertNotNull($deal->company_id);
        $this->assertTrue($deal->closed);
        $this->assertSame("Первый\nвторой", $deal->comments);
        $this->assertEquals(['kind' => '44', 'price' => 500, 'source' => 'WEB'], $deal->fields);
        $this->assertSame('2023-03-01', $deal->close_date->toDateString());

        $again = $run();
        $this->assertSame(0, $again['deals']['new'] + $again['companies']['new'] + $again['contacts']['new']);
        $this->assertSame(1, $again['deals']['kept']);

        $this->actingAs($anna->fresh())->getJson('/api/crm/deals/'.$deal->id)->assertOk()->assertJsonPath('data.companyInfo.phones.0.value', '+7 (900) 123-45-67');
        $this->getJson('/api/crm/companies?q=ромашка')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.rows.0.deals', 1);
        $this->getJson('/api/crm/companies/'.$deal->company_id)->assertOk()->assertJsonPath('data.contacts.0.name', 'Петров Иван')->assertJsonPath('data.dealList.0.title', 'Сайт для Ромашки');
        $this->getJson('/api/crm/contacts?q=i@r.ru')->assertOk()->assertJsonPath('data.rows.0.company', 'ООО Ромашка');
        $this->getJson('/api/crm/companies?q=8 900 123')->assertOk()->assertJsonPath('data.total', 1);
    }
}
