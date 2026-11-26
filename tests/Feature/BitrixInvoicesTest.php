<?php

namespace Tests\Feature;

use App\Models\CrmDeal;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportInvoices;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BitrixInvoicesTest extends TestCase
{
    use RefreshDatabase;

    public function test_old_and_smart_invoices_with_products(): void
    {
        $pipeline = CrmPipeline::query()->create(['entity' => 'deal', 'title' => 'Общая', 'external_id' => '0']);
        $stage = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Новая', 'external_id' => 'NEW']);
        $deal = CrmDeal::query()->create(['pipeline_id' => $pipeline->id, 'stage_id' => $stage->id, 'title' => 'Сделка', 'external_id' => '100']);

        Http::fake([
            '*/crm.status.list.json' => Http::response(['result' => [
                ['ENTITY_ID' => 'INVOICE_STATUS', 'STATUS_ID' => 'P', 'NAME' => 'Оплачен', 'SORT' => 10],
                ['ENTITY_ID' => 'SMART_INVOICE_STAGE_1', 'STATUS_ID' => 'DT31_1:N', 'NAME' => 'Новый', 'SORT' => 10, 'EXTRA' => ['SEMANTICS' => 'process']],
            ], 'total' => 2]),
            '*/crm.invoice.list.json' => Http::response(['result' => [
                ['ID' => '5', 'ACCOUNT_NUMBER' => '2024-5', 'ORDER_TOPIC' => 'Сайт', 'STATUS_ID' => 'P', 'PRICE' => '50000', 'CURRENCY' => 'RUB', 'DATE_BILL' => '2024-03-01T00:00:00+03:00', 'UF_DEAL_ID' => '100', 'PAY_VOUCHER_DATE' => '2024-03-05'],
            ], 'total' => 1]),
            '*/batch.json' => Http::response(['result' => ['result' => ['i5' => ['PRODUCT_ROWS' => [['ID' => '9', 'PRODUCT_NAME' => 'Разработка', 'PRICE' => 50000, 'QUANTITY' => 1]]]], 'result_error' => []]]),
            '*/crm.item.list.json' => Http::response(['result' => ['items' => [
                ['id' => 7, 'accountNumber' => 'С-7', 'title' => 'Счёт 7', 'stageId' => 'DT31_1:N', 'opportunity' => 1200, 'currencyId' => 'RUB', 'parentId2' => 100],
            ]], 'total' => 1]),
            '*/crm.item.productrow.list.json' => Http::response(['result' => ['productRows' => [['id' => 3, 'ownerId' => 7, 'productName' => 'Хостинг', 'price' => 1200, 'quantity' => 1]]]]),
        ]);

        $report = (new ImportInvoices(new Client('https://b24.test/rest/6/x/')))->run();
        $this->assertSame([1, 1, 2], [$report['old'], $report['new'], $report['rows']]);
        $old = DB::table('crm_invoices')->where('external_id', 'o5')->first();
        $this->assertSame(['Оплачен', 'success', $deal->id, '2024-03-05'], [$old->status_title, $old->semantic, (int) $old->deal_id, $old->paid_at]);

        $owner = User::factory()->create(['role' => 'owner']);
        $this->actingAs($owner->fresh())->getJson('/api/crm/deals/'.$deal->id)->assertOk()
            ->assertJsonCount(2, 'data.invoices')->assertJsonPath('data.invoices.0.products.0.name', 'Разработка');
    }
}
