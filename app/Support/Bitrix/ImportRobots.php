<?php

namespace App\Support\Bitrix;

use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmRobot;
use App\Models\CrmStage;
use App\Models\User;

/**
 * Бизнес-процесс сделок из Битрикс24 (шаблон БП, обычно #260 «Весь
 * процесс») → роботы стадий (App\Support\Robots).
 *
 * БП устроен как дерево: ветки по воронке (CATEGORY_ID) и полям, внутри
 * «ждать стадию X» (CrmDealStageListenActivity), за ним действия. Обходим
 * дерево и каждое действие кладём роботом на стадию, которой оно ждало;
 * условия веток — в условие робота (дизъюнктивная форма: группы «и»,
 * связанные «или»). Пауза перед действием — задержка робота.
 *
 * Что перенести нельзя (договор через приложение-генератор, счёт, письмо,
 * запуск другого БП, значения из шагов-генераторов {=A…}) — робот
 * «Шаг из Битрикс24» или выключенный робот с пояснением в note.
 *
 * Все роботы приходят выключенными (Битрикс ещё работает: иначе задачи и
 * вебхуки задвоятся), с active=true — включаются те, что перенеслись целиком.
 * Повтор не плодит дубли: external_ref = bp{шаблон}:{имя шага}:{стадия}.
 */
class ImportRobots
{
    /** Известные XML_ID вариантов «Способ оплаты» (по названиям веток БП). */
    private const XML = [
        'uf_crm_1547064684753' => [
            'f7299d510c01ccf5029b871e5e5d7ae5' => '66',   // ИП Лебедев
            '48a586432d68c86bc69c61fc12b297e8' => '1962', // ИП Верховых
            '90f9edda148966d2bb53956c8dfef76c' => '68',   // Нал
            'e7d74d5c773842ee36bf48eae2e982fc' => '64',   // ООО Корзилла
        ],
    ];

    private const SKIP = [
        'SetVariableActivity', 'LogActivity', 'SetStateTitleActivity', 'CrmGetProductRowActivity', 'CrmGetRequisitesInfoActivity',
        'TerminateActivity', 'GetUserActivity', 'SetPermissionsActivity', 'DiskDetailActivity',
    ];

    private array $report = [];

    private array $xml = self::XML;

    private int $sort = 0;

    private int $templateId = 0;

    private array $stages = [];

    private array $pipelines = [];

    private array $users = [];

    private array $fields = [];

    public function __construct(private bool $activate = false, private bool $update = false, private ?Client $client = null) {}

    /** @return array{created: int, updated: int, skipped: int, active: int, todo: int, report: array} */
    public function run(array $template): array
    {
        $this->templateId = (int) $template['ID'];
        $this->stages = CrmStage::query()->whereIn('pipeline_id', CrmPipeline::query()->where('entity', 'deal')->pluck('id'))
            ->whereNotNull('external_id')->get()->groupBy('external_id')->all();
        $this->pipelines = CrmPipeline::query()->where('entity', 'deal')->whereNotNull('external_id')->get()->keyBy('external_id')->all();
        $this->users = User::query()->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        $this->fields = CrmField::query()->where('entity', 'deal')->get()->keyBy('code')->all();
        $this->loadXml();
        foreach ($template['TEMPLATE'] ?? [] as $node) {
            $this->learn($node);
        }

        $stats = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'active' => 0, 'todo' => 0];
        $robots = [];
        $ctx = ['category' => null, 'dnf' => [[]], 'stages' => null, 'delay' => null, 'notes' => [], 'each' => false];
        foreach ($template['TEMPLATE'] ?? [] as $node) {
            $this->walk($node, $ctx, $robots);
        }
        foreach ($robots as $robot) {
            $existing = CrmRobot::query()->where('external_ref', $robot['external_ref'])->first();
            if ($existing && ! $this->update) {
                $stats['skipped']++;

                continue;
            }
            $robot['active'] = $this->activate && $robot['complete'];
            $complete = $robot['complete'];
            unset($robot['complete']);
            if ($existing) {
                $existing->update($robot);
                $stats['updated']++;
            } else {
                CrmRobot::query()->create($robot + ['entity' => 'deal']);
                $stats['created']++;
            }
            $stats[$complete ? 'active' : 'todo']++;
            $this->report[$robot['pipeline_id']][$robot['stage_id']][] = ['title' => $robot['title'], 'type' => $robot['type'], 'complete' => $complete, 'note' => $robot['note']];
        }

        return $stats + ['report' => $this->report];
    }

    /** XML_ID вариантов списков — из Битрикс24 по вебхуку, если он есть. */
    private function loadXml(): void
    {
        if (! $this->client) {
            return;
        }
        try {
            $start = 0;
            do {
                $page = $this->client->call('crm.deal.userfield.list', ['start' => $start]);
                foreach ($page['result'] ?? [] as $field) {
                    foreach ($field['LIST'] ?? [] as $item) {
                        if (! empty($item['XML_ID'])) {
                            $this->xml[strtolower($field['FIELD_NAME'])][(string) $item['XML_ID']] = (string) $item['ID'];
                        }
                    }
                }
                $start = $page['next'] ?? null;
            } while ($start);
        } catch (\Throwable) {
            /* Нет вебхука или сети — останутся известные значения. */
        }
    }

    /**
     * Варианты списков, которых нет в XML_ID: ветка «Lite» с условием
     * «Тариф = b536…» — значит, b536… это вариант «Lite».
     */
    private function learn(array $node): void
    {
        $p = $node['Properties'] ?? [];
        $rules = (array) ($p['fieldcondition'] ?? []);
        if (($node['Type'] ?? '') === 'IfElseBranchActivity' && count($rules) === 1) {
            [$field, $op, $value] = array_pad(array_values((array) $rules[0]), 3, '');
            $key = strtolower((string) $field);
            $title = mb_strtolower(trim((string) ($p['Title'] ?? '')));
            $def = $this->fields[$key] ?? null;
            if ($op === '=' && $def && $def->type === 'list' && $title !== '' && ! isset($this->xml[$key][$value]) && ! collect($def->options ?? [])->contains('id', (string) $value)) {
                $options = collect($def->options ?? []);
                $near = $options->filter(fn ($one) => str_contains($title, mb_strtolower($one['label'])) || str_contains(mb_strtolower($one['label']), $title));
                $match = $options->first(fn ($one) => mb_strtolower($one['label']) === $title) ?? ($near->count() === 1 ? $near->first() : null);
                if ($match) {
                    $this->xml[$key][(string) $value] = (string) $match['id'];
                }
            }
        }
        foreach ($node['Children'] ?? [] as $child) {
            $this->learn($child);
        }
    }

    /* ---------- Обход ---------- */

    /** Возвращает контекст после узла (стадия «протекает» дальше по последовательности). */
    private function walk(array $node, array $ctx, array &$robots): array
    {
        $type = (string) ($node['Type'] ?? '');
        $p = $node['Properties'] ?? [];

        switch ($type) {
            case 'SequentialWorkflowActivity':
            case 'SequenceActivity':
            case 'EmptyBlockActivity':
            case 'ParallelActivity':
                foreach ($node['Children'] ?? [] as $child) {
                    $ctx = $this->walk($child, $ctx, $robots);
                }

                return $ctx;
            case 'IfElseActivity':
                return $this->branches($node, $ctx, $robots);
            case 'ForEachActivity':
                $inner = $ctx + [];
                $inner['each'] = true;
                foreach ($node['Children'] ?? [] as $child) {
                    $inner = $this->walk($child, $inner, $robots);
                }

                return $ctx;
            case 'WhileActivity':
                return $ctx;
            case 'CrmDealStageListenActivity':
                $ctx['stages'] = array_values(array_filter((array) ($p['WaitForState'] ?? [])));
                $ctx['delay'] = null;

                return $ctx;
            case 'DelayActivity':
                $ctx['delay'] = $this->delay($p);

                return $ctx;
        }
        if (in_array($type, self::SKIP, true)) {
            return $ctx;
        }
        $this->action($node, $ctx, $robots);

        return $ctx;
    }

    private function branches(array $node, array $ctx, array &$robots): array
    {
        $previous = [];
        $outs = [];
        foreach ($node['Children'] ?? [] as $branch) {
            $p = $branch['Properties'] ?? [];
            $rules = $p['fieldcondition'] ?? $p['propertyvariablecondition'] ?? null;
            $inner = $ctx;
            if ($rules) {
                [$dnf, $category, $notes] = $this->condition($rules, isset($p['propertyvariablecondition']));
                $previous[] = $dnf;
            } else {
                /* «Иначе»: отрицание прежних веток, если они простые. */
                [$dnf, $category, $notes] = [$this->negate($previous), null, []];
                if ($dnf === null) {
                    $dnf = [[]];
                    $notes[] = 'Ветка «иначе» в Битрикс24: проверьте условие.';
                }
            }
            if ($category !== null) {
                $inner['category'] = $category;
            }
            $inner['dnf'] = $this->and($inner['dnf'], $dnf);
            $inner['notes'] = array_merge($inner['notes'], $notes);
            foreach ($branch['Children'] ?? [] as $child) {
                $inner = $this->walk($child, $inner, $robots);
            }
            $outs[] = $inner['stages'];
        }
        /* Стадия после развилки — если все ветки пришли к одной. */
        $outs = array_values(array_unique(array_map('json_encode', $outs)));
        if (count($outs) === 1) {
            $ctx['stages'] = json_decode($outs[0], true);
        }

        return $ctx;
    }

    /* ---------- Условия ---------- */

    /** @return array{0: array, 1: ?string, 2: string[]} DNF, воронка, пометки */
    private function condition(array $rules, bool $variables): array
    {
        $groups = [[]];
        $category = null;
        $notes = [];
        foreach ($rules as $i => $rule) {
            [$field, $op, $value, $join] = array_pad(array_values((array) $rule), 4, '0');
            if (! $variables && $field === 'CATEGORY_ID' && $op === '=') {
                $category = (string) $value;

                continue;
            }
            $one = $variables ? $this->variableRule((string) $field, (string) $op, (string) $value) : $this->fieldRule((string) $field, (string) $op, (string) $value);
            if (is_string($one)) {
                $notes[] = $one;

                continue;
            }
            if ($i > 0 && (string) $join === '1') {
                $groups[] = [];
            }
            $groups[count($groups) - 1][] = $one;
        }

        return [array_values(array_filter($groups, fn ($g) => $g !== [])) ?: [[]], $category, $notes];
    }

    /** Правило по полю сделки или пояснение, почему не перенеслось. */
    private function fieldRule(string $field, string $op, string $value): array|string
    {
        $op = ['contain' => 'contain', '!contain' => '!contain', 'empty' => 'empty', '!empty' => '!empty', '=' => '=', '!=' => '!=', '>' => '>', '<' => '<', '>=' => '>=', '<=' => '<='][$op] ?? null;
        if (! $op) {
            return "Условие по полю {$field} с оператором, которого нет у роботов.";
        }
        $key = match ($field) {
            'PRODUCT_IDS_PRINTABLE', 'PRODUCT_IDS' => 'products',
            'OPPORTUNITY' => 'amount',
            'TITLE' => 'title',
            'ASSIGNED_BY_ID' => 'responsible_id',
            'STAGE_ID' => 'stage_id',
            default => str_starts_with($field, 'UF_CRM_') ? strtolower($field) : null,
        };
        if (! $key) {
            return "Условие по полю {$field} не перенесено.";
        }
        if (isset($this->xml[$key][$value])) {
            $value = $this->xml[$key][$value];
        } elseif (isset($this->fields[$key]) && $this->fields[$key]->type === 'list' && $value !== '' && ! collect($this->fields[$key]->options ?? [])->contains('id', $value)) {
            return "Условие «{$this->fields[$key]->title} {$op} {$value}»: вариант из Битрикс24 не найден.";
        }
        if ($key === 'responsible_id' && preg_match('/^user_(\d+)$/', $value, $m)) {
            $value = (string) ($this->users[(int) $m[1]] ?? $value);
        }
        if ($key === 'stage_id') {
            $value = (string) (($this->stages[$value] ?? collect())->first()?->id ?? $value);
        }

        return ['field' => $key, 'op' => $op, 'value' => $value];
    }

    /** Переменные БП: известна только «количество товаров». */
    private function variableRule(string $name, string $op, string $value): array|string
    {
        if (in_array($name, ['countItem', 'Variable1'], true)) {
            return ['field' => 'products_count', 'op' => $op, 'value' => $value];
        }

        return "Условие на переменную БП «{$name}» не перенесено — задайте условие по полю сделки.";
    }

    private function and(array $a, array $b): array
    {
        $out = [];
        foreach ($a as $x) {
            foreach ($b as $y) {
                $out[] = array_merge($x, $y);
            }
        }

        return $out ?: [[]];
    }

    /** Отрицание прежних веток: только если каждая — одно правило. */
    private function negate(array $previous): ?array
    {
        $flip = ['=' => '!=', '!=' => '=', '>' => '<=', '<' => '>=', '>=' => '<', '<=' => '>', 'contain' => '!contain', '!contain' => 'contain', 'empty' => '!empty', '!empty' => 'empty'];
        $group = [];
        foreach ($previous as $dnf) {
            if (count($dnf) !== 1 || count($dnf[0]) > 1) {
                return null;
            }
            if ($dnf[0] === []) {
                continue;
            }
            $rule = $dnf[0][0];
            $rule['op'] = $flip[$rule['op']] ?? $rule['op'];
            $group[] = $rule;
        }

        return [$group];
    }

    private function rules(array $dnf): array
    {
        $out = [];
        foreach ($dnf as $g => $group) {
            foreach ($group as $i => $rule) {
                $out[] = $rule + ['join' => $g > 0 && $i === 0 ? 'or' : 'and'];
            }
        }

        return $out;
    }

    /* ---------- Действия ---------- */

    private function action(array $node, array $ctx, array &$robots): void
    {
        $type = (string) $node['Type'];
        $p = $node['Properties'] ?? [];
        $title = trim((string) ($p['Title'] ?? $type)) ?: $type;
        $notes = $ctx['notes'];
        if ($ctx['each']) {
            $notes[] = 'В Битрикс24 этот шаг выполнялся для каждого товара сделки — здесь один раз.';
        }
        $complete = true;
        $settings = [];
        $robotType = 'bitrix';

        switch ($type) {
            case 'Task2Activity':
                $f = $p['Fields'] ?? [];
                $robotType = 'task';
                [$deadline, $unit, $ok] = $this->deadline((string) ($f['DEADLINE'] ?? ''));
                $complete = $ok;
                if (! $ok) {
                    $notes[] = 'Срок из Битрикс24 не разобран: '.$f['DEADLINE'];
                }
                $settings = [
                    'title' => $this->text((string) ($f['TITLE'] ?? $title), $complete, $notes),
                    'description' => $this->text((string) ($f['DESCRIPTION'] ?? ''), $complete, $notes),
                    'responsible' => $this->who($f['RESPONSIBLE_ID'] ?? 'author', $complete, $notes),
                    'creator' => $this->who($f['CREATED_BY'] ?? 'author', $complete, $notes),
                    'accomplices' => $this->who($f['ACCOMPLICES'] ?? [], $complete, $notes, true),
                    'auditors' => $this->who($f['AUDITORS'] ?? [], $complete, $notes, true),
                    'deadline_value' => $deadline,
                    'deadline_unit' => $unit,
                    'priority' => ['0' => 'low', '1' => 'normal', '2' => 'high'][(string) ($f['PRIORITY'] ?? '1')] ?? 'normal',
                    'needs_review' => ($f['TASK_CONTROL'] ?? 'N') === 'Y',
                    'checklist' => implode("\n", array_filter(array_map(fn ($one) => is_array($one) ? (string) ($one['TITLE'] ?? $one['title'] ?? '') : (string) $one, (array) ($p['CheckListItems'] ?? [])))),
                ];
                break;
            case 'IMNotifyActivity':
            case 'ImMessageActivity':
                $robotType = 'notify';
                $text = $type === 'IMNotifyActivity' ? (string) ($p['MessageSite'] ?? '') : (string) ($p['MessageFields']['MessageText'] ?? '');
                $settings = [
                    'to' => $this->who($p['MessageUserTo'] ?? [], $complete, $notes, true),
                    'from' => $this->who($p['MessageUserFrom'] ?? 'author', $complete, $notes),
                    'text' => $this->text($text, $complete, $notes),
                    'link' => true,
                ];
                break;
            case 'SetFieldActivity':
                $values = (array) ($p['FieldValue'] ?? []);
                if (isset($values['STAGE_ID']) && count($values) === 1) {
                    $stage = ($this->stages[(string) $values['STAGE_ID']] ?? collect())->first();
                    $robotType = 'stage';
                    $settings = ['stage_id' => $stage?->id];
                    if (! $stage) {
                        $complete = false;
                        $notes[] = 'Стадия '.$values['STAGE_ID'].' не найдена.';
                    }
                    break;
                }
                $robotType = 'field';
                $rows = [];
                foreach ($values as $code => $value) {
                    $key = match ($code) {
                        'TITLE' => 'title', 'OPPORTUNITY' => 'amount', 'CLOSEDATE' => 'close_date', 'COMMENTS' => 'comments',
                        default => str_starts_with($code, 'UF_CRM_') ? strtolower($code) : null,
                    };
                    if (! $key || ($key !== 'title' && $key !== 'amount' && $key !== 'close_date' && $key !== 'comments' && ! isset($this->fields[$key]))) {
                        $complete = false;
                        $notes[] = "Поле {$code} не найдено.";

                        continue;
                    }
                    $value = is_array($value) ? implode(', ', $value) : (string) $value;
                    $rows[] = ['field' => $key, 'value' => $this->xml[$key][$value] ?? $this->text($value, $complete, $notes)];
                }
                $settings = ['values' => $rows];
                break;
            case 'WebHookActivity':
                $robotType = 'webhook';
                $settings = ['url' => $this->text(trim((string) ($p['Handler'] ?? '')), $complete, $notes), 'method' => 'POST', 'body' => ''];
                break;
            case 'CrmChangeStatusActivity':
                $stage = ($this->stages[(string) ($p['TargetStatus'] ?? '')] ?? collect())->first();
                $robotType = 'stage';
                $settings = ['stage_id' => $stage?->id];
                if (! $stage) {
                    $complete = false;
                    $notes[] = 'Стадия '.($p['TargetStatus'] ?? '').' не найдена.';
                }
                break;
            case 'CreateCrmDealDocumentActivity':
                $f = $p['Fields'] ?? [];
                $category = (string) ($f['CATEGORY_ID'] ?? '0');
                $stageCode = (string) ($f['STAGE_ID'] ?? 'NEW');
                $stage = ($this->stages[$category === '0' ? $stageCode : "C{$category}:{$stageCode}"] ?? collect())->first()
                    ?? ($this->pipelines[$category] ?? null)?->stages()->orderBy('sort')->first();
                $robotType = 'deal';
                $rows = [];
                foreach ($f as $code => $value) {
                    if (str_starts_with($code, 'UF_CRM_') && isset($this->fields[strtolower($code)]) && (string) $value !== '') {
                        $key = strtolower($code);
                        $rows[] = ['field' => $key, 'value' => $this->xml[$key][(string) $value] ?? $this->text((string) $value, $complete, $notes)];
                    }
                }
                $settings = [
                    'stage_id' => $stage?->id,
                    'title' => $this->text((string) ($f['TITLE'] ?? '{{Название}}'), $complete, $notes),
                    'responsible' => $this->who($f['ASSIGNED_BY_ID'] ?? 'author', $complete, $notes),
                    'copy' => false,
                    'values' => $rows,
                ];
                if (! $stage) {
                    $complete = false;
                    $notes[] = 'Не найдена воронка новой сделки.';
                }
                $notes[] = 'Компания копируется из исходной сделки, только если включить «Скопировать».';
                break;
            default:
                $complete = false;
                $notes[] = match (true) {
                    str_starts_with($type, 'rest_') => 'В Битрикс24 здесь приложение-генератор делало документ (договор/акт) по шаблону '.($p['tmpId'] ?? '?').'. Перенесите шаблон в документы портала.',
                    $type === 'MailActivity' => 'Письмо «'.($p['MailSubject'] ?? '').'» — отправка почты пока не подключена.',
                    $type === 'CrmConvertDocumentActivity' => 'В Битрикс24 создавался счёт на основании сделки — счета в портале пока только для просмотра.',
                    $type === 'StartWorkflowActivity' => 'Запуск другого БП Битрикс24 (шаблон №'.($p['TemplateId'] ?? '?').').',
                    $type === 'ImAddMessageToGroupChatActivity' => 'Сообщение в групповой чат Битрикс24 №'.($p['ChatId'] ?? '?').': «'.mb_substr((string) ($p['MessageFields']['MessageText'] ?? ''), 0, 200).'». Выберите чат или замените уведомлением.',
                    in_array($type, ['CrmAddProductRow', 'CrmRemoveProductRow'], true) => 'Добавление или удаление товара в сделке — такого робота пока нет.',
                    default => "Шаг Битрикс24 {$type}.",
                };
        }

        $stageIds = $this->targetStages($ctx);
        if (! $stageIds) {
            return;
        }
        $rules = $this->rules($ctx['dnf']);
        if (count($rules) > 40) {
            $rules = [];
            $complete = false;
            $notes[] = 'Условие из Битрикс24 слишком сложное — задайте вручную.';
        }
        /* Любая пометка (кроме справочной) — перенесён не целиком: робот ждёт проверки. */
        if (array_filter($notes, fn ($n) => ! str_starts_with($n, 'Компания копируется'))) {
            $complete = false;
        }
        $name = (string) ($node['Name'] ?? md5(json_encode($p)));
        foreach ($stageIds as $stage) {
            $robots[] = [
                'pipeline_id' => $stage->pipeline_id,
                'stage_id' => $stage->id,
                'type' => $robotType,
                'title' => mb_substr($title, 0, 250),
                'settings' => $settings,
                'conditions' => $rules ?: null,
                'delay' => $ctx['delay'],
                'note' => trim('Перенесено из БП Битрикс24 №'.$this->templateId.'.'.($notes ? "\n".implode("\n", array_unique(array_map(fn ($n) => preg_replace('/\s+/u', ' ', $n), $notes))) : '')),
                'external_ref' => mb_substr("bp{$this->templateId}:{$name}:{$stage->id}", 0, 120),
                'sort' => $this->sort += 10,
                'complete' => $complete && $robotType !== 'bitrix',
            ];
        }
    }

    /** Стадии для робота: ждали стадию — она (в своей воронке), иначе первая стадия воронки. */
    private function targetStages(array $ctx): array
    {
        $out = [];
        if ($ctx['stages']) {
            foreach ($ctx['stages'] as $code) {
                foreach ($this->stages[$code] ?? [] as $stage) {
                    $pipeline = collect($this->pipelines)->first(fn ($one) => $one->id === $stage->pipeline_id);
                    if ($ctx['category'] === null || ($pipeline && (string) $pipeline->external_id === (string) $ctx['category'])) {
                        $out[$stage->id] = $stage;
                    }
                }
            }

            return array_values($out);
        }
        $pipeline = $ctx['category'] !== null ? ($this->pipelines[$ctx['category']] ?? null) : null;
        $first = $pipeline?->stages()->orderBy('sort')->first();

        return $first ? [$first] : [];
    }

    /* ---------- Значения ---------- */

    /** Сотрудники БП → «responsible», «u:12», … */
    private function who(mixed $value, bool &$complete, array &$notes, bool $many = false): array
    {
        $out = [];
        foreach ((array) $value as $one) {
            $one = trim((string) $one);
            if ($one === '') {
                continue;
            }
            if ($one === 'author' || str_contains($one, 'ASSIGNED_BY') || $one === '{=Template:TargetUser}') {
                $out[] = 'responsible';
            } elseif (str_contains($one, 'CREATED_BY')) {
                $out[] = 'creator';
            } elseif (preg_match('/^user_(\d+)$/', $one, $m)) {
                if (isset($this->users[(int) $m[1]])) {
                    $out[] = 'u:'.$this->users[(int) $m[1]];
                } else {
                    $complete = false;
                    $notes[] = "Сотрудник Битрикс24 №{$m[1]} не найден среди перенесённых.";
                }
            } elseif (preg_match('/\{=Document:(UF_CRM_\w+)\}/', $one, $m)) {
                $out[] = 'f:'.strtolower($m[1]);
            } else {
                $complete = false;
                $notes[] = "Сотрудник «{$one}» из БП не разобран — выбран ответственный за сделку.";
                $out[] = 'responsible';
            }
        }

        return $many ? array_values(array_unique($out)) : array_slice($out ?: ['responsible'], 0, 1);
    }

    /** Подстановки БП {=Document:…} → {{…}}; ссылки на шаги {=A…}, переменные — не переносятся. */
    private function text(string $text, bool &$complete, array &$notes): string
    {
        $text = str_replace(['https://korzilla.bitrix24.ru{=Document:URL}', 'korzilla.bitrix24.ru{=Document:URL}'], '{{Ссылка}}', trim($text));
        $text = preg_replace_callback('/\{=Document:([A-Z0-9_.]+)\}/', function ($m) use (&$complete, &$notes) {
            $code = $m[1];
            $known = [
                'ID' => 'ID', 'TITLE' => 'Название', 'OPPORTUNITY' => 'Сумма', 'CURRENCY_ID' => 'Валюта', 'URL' => 'Ссылка',
                'COMPANY.TITLE' => 'Компания', 'COMPANY_TITLE' => 'Компания', 'COMPANY_ID_PRINTABLE' => 'Компания', 'CONTACT_ID_PRINTABLE' => 'Контакт',
                'ASSIGNED_BY_PRINTABLE' => 'Ответственный', 'ASSIGNED_BY_EMAIL' => 'Почта ответственного', 'ASSIGNED_BY_ID_PRINTABLE' => 'Ответственный',
                'PRODUCT_IDS_PRINTABLE' => 'Товары', 'CATEGORY_ID_PRINTABLE' => 'Воронка', 'STAGE_ID_PRINTABLE' => 'Стадия', 'CLOSEDATE' => 'Дата завершения',
                'COMMENTS' => 'Комментарий', 'COMPANY.PHONE' => 'Телефон компании', 'COMPANY.EMAIL' => 'Почта компании',
            ];
            if (isset($known[$code])) {
                return '{{'.$known[$code].'}}';
            }
            if (preg_match('/^(UF_CRM_\w+?)(?:_PRINTABLE)?$/', $code, $f)) {
                return '{{'.strtolower($f[1]).'}}';
            }
            $complete = false;
            $notes[] = "Подстановка {=Document:{$code}} не перенесена.";

            return '{=Document:'.$code.'}';
        }, $text);
        $text = str_replace('{=System:Now}', '{{Сегодня}}', $text);
        if (preg_match_all('/\{=(A[0-9_]+|Variable|Template|Constant):([^}]+)\}/', $text, $all)) {
            $complete = false;
            foreach (array_unique($all[0]) as $one) {
                $notes[] = str_starts_with($one, '{=A')
                    ? "Значение {$one} давал другой шаг БП (генератор документа и т. п.) — его здесь нет."
                    : "Переменная БП {$one} не перенесена.";
            }
        }

        return $text;
    }

    /** Срок задачи: «через N раб. дней», «+Nd» или из поля. */
    private function deadline(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return ['', 'wd', true];
        }
        if (preg_match('/^=addworkdays\(\{=System:Now\},\s*(\d+)\s*\)$/i', $raw, $m)) {
            return [$m[1], 'wd', true];
        }
        if (preg_match('/^=addworkdays\(\{=System:Now\},\s*\{=Document:(UF_CRM_\w+)\}\s*\)$/i', $raw, $m)) {
            return ['{{'.strtolower($m[1]).'}}', 'wd', true];
        }
        /* Выражение: «({=Document:UF_…}*80%)» → «({{uf_…}}*80/100)», считает Template::number. */
        if (preg_match('/^=addworkdays\(\{=System:Now\},\s*(.+)\)$/i', $raw, $m)) {
            $expr = preg_replace_callback('/\{=Document:(UF_CRM_\w+)\}/', fn ($f) => '{{'.strtolower($f[1]).'}}', $m[1]);
            $expr = preg_replace('/(\d+(?:\.\d+)?)%/', '$1/100', $expr);
            if (preg_match('/^(?:\{\{uf_crm_\w+\}\}|[\d.\s+\-*\/()])+$/', $expr)) {
                return [trim($expr), 'wd', true];
            }
        }
        if (preg_match('/^=dateadd\(\{=System:Now\},\s*"\+?(\d+)([dhm])"\s*\)$/i', $raw, $m)) {
            return [$m[1], strtolower($m[2]), true];
        }

        return ['', 'wd', false];
    }

    private function delay(array $p): ?array
    {
        if (! empty($p['TimeoutTime']) && preg_match('/addworkdays\(\{=System:Now\},\s*(\{=Document:(UF_CRM_\w+)\}|\d+)\s*\)/i', (string) $p['TimeoutTime'], $m)) {
            return ['type' => 'after', 'value' => isset($m[2]) && $m[2] !== '' ? '{{'.strtolower($m[2]).'}}' : $m[1], 'unit' => 'wd', 'field' => null];
        }
        if (! empty($p['TimeoutDuration'])) {
            $unit = ['s' => 'm', 'm' => 'm', 'h' => 'h', 'd' => 'd'][(string) ($p['TimeoutDurationType'] ?? 'm')] ?? 'm';

            return ['type' => 'after', 'value' => (string) $p['TimeoutDuration'], 'unit' => $unit, 'field' => null];
        }

        return null;
    }
}
