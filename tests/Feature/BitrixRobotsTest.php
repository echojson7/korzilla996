<?php

namespace Tests\Feature;

use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmRobot;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\Bitrix\ImportRobots;
use App\Support\Robots\Automation;
use App\Support\Robots\DealContext;
use App\Support\Robots\Template;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BitrixRobotsTest extends TestCase
{
    use RefreshDatabase;

    public function test_business_process_becomes_stage_robots(): void
    {
        $pipeline = CrmPipeline::query()->create(['entity' => 'deal', 'title' => 'Сайты', 'external_id' => '4']);
        $prep = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Подготовка', 'sort' => 10, 'external_id' => 'C4:PREPARATION']);
        $won = CrmStage::query()->create(['pipeline_id' => $pipeline->id, 'title' => 'Успех', 'sort' => 20, 'semantic' => 'success', 'external_id' => 'C4:WON']);
        CrmField::query()->create(['entity' => 'deal', 'code' => 'uf_crm_1547064684753', 'title' => 'Способ оплаты', 'type' => 'list', 'options' => [['id' => '64', 'label' => 'ООО Корзилла'], ['id' => '68', 'label' => 'Нал']]]);
        CrmField::query()->create(['entity' => 'deal', 'code' => 'uf_crm_tariff', 'title' => 'Тариф', 'type' => 'list', 'options' => [['id' => '1', 'label' => 'Lite'], ['id' => '2', 'label' => 'PRO']]]);
        $tech = User::query()->create(['name' => 'Технолог', 'email' => 't@k.ru', 'password' => 'secret-pass-123', 'role' => 'staff', 'is_active' => true]);
        $tech->forceFill(['bitrix_id' => 286])->save();

        $template = ['ID' => '260', 'TEMPLATE' => [[
            'Type' => 'SequentialWorkflowActivity', 'Children' => [[
                'Type' => 'IfElseActivity', 'Children' => [[
                    'Type' => 'IfElseBranchActivity', 'Properties' => ['Title' => 'Сайты', 'fieldcondition' => [['CATEGORY_ID', '=', '4', '0']]],
                    'Children' => [[
                        'Type' => 'SequenceActivity', 'Children' => [
                            ['Type' => 'CrmDealStageListenActivity', 'Properties' => ['WaitForState' => ['C4:PREPARATION', 'C8:PREPARATION']]],
                            ['Type' => 'Task2Activity', 'Name' => 'A1', 'Properties' => ['Title' => 'Проверка ТЗ', 'Fields' => ['TITLE' => 'Проверка ТЗ ({=Document:COMPANY.TITLE})', 'RESPONSIBLE_ID' => 'user_286', 'CREATED_BY' => 'author', 'DEADLINE' => '=addworkdays({=System:Now},2)']]],
                            ['Type' => 'IfElseActivity', 'Children' => [
                                ['Type' => 'IfElseBranchActivity', 'Properties' => ['Title' => 'Нал', 'fieldcondition' => [['UF_CRM_1547064684753', '=', '90f9edda148966d2bb53956c8dfef76c', '0']]], 'Children' => [
                                    ['Type' => 'IMNotifyActivity', 'Name' => 'A2', 'Properties' => ['Title' => 'Наличка', 'MessageUserTo' => ['author'], 'MessageSite' => 'Сделка {=Document:TITLE} за наличные']],
                                ]],
                                ['Type' => 'IfElseBranchActivity', 'Properties' => ['Title' => 'Lite', 'fieldcondition' => [['UF_CRM_TARIFF', '=', 'b536d9a3998d4d43e7cbee911c4b6785', '0']]], 'Children' => [
                                    ['Type' => 'rest_4ede09fe9202bea13f0048fcf9ad20ce', 'Name' => 'A3', 'Properties' => ['Title' => 'Договор', 'tmpId' => '7396']],
                                ]],
                            ]],
                            ['Type' => 'DelayActivity', 'Properties' => ['TimeoutTime' => '=addworkdays({=System:Now},3)']],
                            ['Type' => 'CrmChangeStatusActivity', 'Name' => 'A4', 'Properties' => ['Title' => 'Готово', 'TargetStatus' => 'C4:WON']],
                        ],
                    ]],
                ]],
            ]],
        ]]];

        $result = (new ImportRobots(true))->run($template);
        $this->assertSame(4, $result['created']);
        $again = (new ImportRobots(true))->run($template);
        $this->assertSame(4, $again['skipped']);

        $task = CrmRobot::query()->where('type', 'task')->firstOrFail();
        $this->assertSame($prep->id, $task->stage_id);
        $this->assertSame('Проверка ТЗ ({{Компания}})', $task->settings['title']);
        $this->assertSame(['u:'.$tech->id], $task->settings['responsible']);
        $this->assertSame(['2', 'wd'], [$task->settings['deadline_value'], $task->settings['deadline_unit']]);
        $this->assertTrue($task->active);

        $notify = CrmRobot::query()->where('type', 'notify')->firstOrFail();
        $this->assertSame([['field' => 'uf_crm_1547064684753', 'op' => '=', 'value' => '68', 'join' => 'and']], $notify->conditions);

        $doc = CrmRobot::query()->where('type', 'bitrix')->firstOrFail();
        $this->assertFalse($doc->active);
        $this->assertSame('1', $doc->conditions[0]['value']);
        $this->assertStringContainsString('7396', $doc->note);

        $stage = CrmRobot::query()->where('type', 'stage')->firstOrFail();
        $this->assertSame($won->id, $stage->settings['stage_id']);
        $this->assertSame(['type' => 'after', 'value' => '3', 'unit' => 'wd', 'field' => null], $stage->delay);
    }

    public function test_template_number_arithmetic(): void
    {
        $pipeline = CrmPipeline::query()->first();
        CrmField::query()->create(['entity' => 'deal', 'code' => 'uf_days', 'title' => 'Дней', 'type' => 'number']);
        $deal = new \App\Models\CrmDeal(['title' => 'x', 'fields' => ['uf_days' => 10]]);
        $ctx = new DealContext($deal);
        $this->assertSame(8.0, Template::number('({{uf_days}}*80/100)', $ctx));
        $this->assertSame(0.0, Template::number('2*(3', $ctx));
        $this->assertSame(5.0, Template::number('2+3', $ctx));
        $this->assertNotNull($pipeline);
        $this->assertSame('2026-11-30', Automation::shift(\Illuminate\Support\Carbon::parse('2026-11-27'), 1, 'wd')->toDateString());
    }
}
