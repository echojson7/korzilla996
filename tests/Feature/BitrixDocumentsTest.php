<?php

namespace Tests\Feature;

use App\Models\CrmDeal;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportDocuments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BitrixDocumentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_documents_come_with_files_and_open_from_the_deal(): void
    {
        Storage::fake('local');
        $pipeline = CrmPipeline::query()->create(['entity' => 'deal', 'title' => 'Общая', 'external_id' => '0']);
        $stage = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Новая', 'external_id' => 'NEW']);
        $deal = CrmDeal::query()->create(['pipeline_id' => $pipeline->id, 'stage_id' => $stage->id, 'title' => 'Сделка', 'external_id' => '100']);

        Http::fake([
            '*/crm.documentgenerator.template.list.json' => Http::response(['result' => ['templates' => [['id' => '4', 'name' => 'Договор продвижение']]], 'total' => 1]),
            '*/crm.documentgenerator.document.list.json' => Http::response(['result' => ['documents' => [
                ['id' => '50', 'title' => 'Договор №12', 'number' => '12', 'templateId' => '4', 'entityTypeId' => '2', 'entityId' => '100',
                    'pdfUrlMachine' => 'https://b24.test/rest/6/x/crm.documentgenerator.document.download?id=50&pdf=1'],
                ['id' => '51', 'title' => 'Претензия', 'entityTypeId' => '1044', 'entityId' => '3'],
            ]], 'total' => 2]),
            'https://b24.test/rest/6/x/crm.documentgenerator.document.download*' => Http::response('%PDF-1.4 test'),
        ]);

        $report = (new ImportDocuments(new Client('https://b24.test/rest/6/x/')))->run();
        $this->assertSame([2, 1, 1], [$report['new'], $report['files'], $report['no_file']]);

        $owner = User::factory()->create(['role' => 'owner']);
        $docs = $this->actingAs($owner->fresh())->getJson('/api/crm/deals/'.$deal->id)->assertOk()->json('data.documents');
        $this->assertSame('Договор продвижение', $docs[0]['template']);
        $file = $this->get('/api/crm/documents/'.$docs[0]['id'].'/file');
        $file->assertOk();
        $this->assertSame('%PDF-1.4 test', $file->streamedContent());
    }
}
