<?php

namespace App\Support\Bitrix;

use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Support\CrmSearch;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Смарт-процессы Битрикс24 (crm.type.list): тип, воронки и стадии, свои
 * поля (crm.item.fields) и элементы (crm.item.list) со связями. Документы
 * из шаблонов, сделанные по элементам, привязываются к ним в конце.
 */
class ImportSmart
{
    private const TYPES = [
        'string' => 'string', 'integer' => 'number', 'double' => 'number', 'date' => 'date', 'datetime' => 'datetime',
        'boolean' => 'boolean', 'enumeration' => 'list', 'employee' => 'user', 'url' => 'url', 'address' => 'string', 'file' => 'file', 'money' => 'number',
    ];

    public array $report = ['types' => 0, 'stages' => 0, 'fields' => 0, 'items' => 0, 'kept' => 0, 'documents' => 0];

    private array $users = [];

    public function __construct(private Client $bitrix, private string $portal, private ?\Closure $progress = null) {}

    public function run(): array
    {
        $this->users = DB::table('users')->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        $ids = fn (string $table) => DB::table($table)->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $links = ['deal' => $ids('crm_deals'), 'lead' => $ids('crm_leads'), 'company' => $ids('crm_companies'), 'contact' => $ids('crm_contacts')];
        $statuses = collect(iterator_to_array($this->bitrix->each('crm.status.list', ['order' => ['SORT' => 'ASC']]), false));

        $types = $this->bitrix->call('crm.type.list')['result']['types'] ?? [];
        foreach ($types as $one) {
            $etid = (int) $one['entityTypeId'];
            $typeId = DB::table('crm_smart_types')->where('bitrix_type', $etid)->value('id');
            if (! $typeId) {
                $typeId = DB::table('crm_smart_types')->insertGetId(['title' => mb_substr((string) $one['title'], 0, 120), 'bitrix_type' => $etid, 'sort' => 100 + $this->report['types'] * 10, 'created_at' => now(), 'updated_at' => now()]);
                $this->report['types']++;
            }
            $entity = 'smart:'.$typeId;
            [$pipelines, $stages, $first] = $this->stages($entity, $etid, $statuses);
            $fields = $this->fields($entity, $etid);
            $this->items($typeId, $etid, $pipelines, $stages, $first, $fields, $links);
        }

        return $this->report;
    }

    /** Воронки (категории) и стадии типа. */
    private function stages(string $entity, int $etid, $statuses): array
    {
        $pipelines = [];
        $stages = [];
        $first = [];
        $categories = $this->bitrix->call('crm.category.list', ['entityTypeId' => $etid])['result']['categories'] ?? [];
        foreach ($categories as $category) {
            $pipeline = CrmPipeline::query()->firstOrNew(['entity' => $entity, 'external_id' => (string) $category['id']]);
            $pipeline->fill(['title' => $category['name'], 'sort' => (int) ($category['sort'] ?? 100), 'is_default' => (bool) ($category['isDefault'] ?? false)])->save();
            $pipelines[(string) $category['id']] = $pipeline->id;
            foreach ($statuses->where('ENTITY_ID', "DYNAMIC_{$etid}_STAGE_{$category['id']}")->sortBy(fn ($s) => (int) $s['SORT']) as $status) {
                $semantic = $status['EXTRA']['SEMANTICS'] ?? $status['SEMANTICS'] ?? 'process';
                $stage = CrmStage::query()->firstOrNew(['pipeline_id' => $pipeline->id, 'external_id' => $status['STATUS_ID']]);
                $this->report['stages'] += $stage->exists ? 0 : 1;
                $color = $status['COLOR'] ?? $status['EXTRA']['COLOR'] ?? null;
                $stage->fill([
                    'title' => $status['NAME'],
                    'color' => $color && preg_match('/^#[0-9a-f]{6}$/i', $color) ? strtolower($color) : '#39a8ef',
                    'semantic' => match ($semantic) { 'success', 'S' => 'success', 'failure', 'apology', 'F' => 'failure', default => 'process' },
                    'sort' => (int) $status['SORT'],
                ])->save();
                $stages[$pipeline->id][$status['STATUS_ID']] = [$stage->id, $stage->semantic];
                $first[$pipeline->id] ??= $stage->id;
            }
        }

        return [$pipelines, $stages, $first];
    }

    /** @return array<string, CrmField> ключ поля в ответе crm.item.list → поле */
    private function fields(string $entity, int $etid): array
    {
        $out = [];
        $all = $this->bitrix->call('crm.item.fields', ['entityTypeId' => $etid])['result']['fields'] ?? [];
        $sort = 10;
        foreach ($all as $key => $one) {
            if (! str_starts_with($key, 'ufCrm')) {
                continue;
            }
            $type = self::TYPES[$one['type'] ?? ''] ?? null;
            if (! $type) {
                continue;
            }
            $title = trim((string) ($one['listLabel'] ?? $one['formLabel'] ?? $one['title'] ?? '')) ?: $key;
            $field = CrmField::query()->where('entity', $entity)->where('external_code', $key)->first();
            if (! $field) {
                $field = CrmField::query()->create([
                    'entity' => $entity, 'external_code' => $key, 'code' => strtolower((string) ($one['upperName'] ?? $key)), 'title' => mb_substr($title, 0, 200),
                    'type' => $type, 'multiple' => (bool) ($one['isMultiple'] ?? false) || $type === 'file', 'required' => false,
                    'options' => $type === 'list' ? collect($one['items'] ?? [])->map(fn ($item) => ['id' => (string) $item['ID'], 'label' => trim((string) $item['VALUE'])])->values()->all() : null,
                    'active' => true, 'section' => null, 'sort' => $sort,
                ]);
                $this->report['fields']++;
            }
            $sort += 10;
            $out[$key] = $field;
        }

        return $out;
    }

    private function items(int $typeId, int $etid, array $pipelines, array $stages, array $first, array $fields, array $links): void
    {
        $progress = $this->progress ? fn ($done, $total) => ($this->progress)("smart {$etid}", $done, $total) : null;
        foreach ($this->bitrix->pages('crm.item.list', ['entityTypeId' => $etid, 'select' => ['*'], 'order' => ['id' => 'ASC']], $progress, 'items') as $rows) {
            $known = DB::table('crm_smart_items')->whereIn('external_id', array_map(fn ($row) => "{$etid}:{$row['id']}", $rows))->pluck('id', 'external_id')->all();
            $insert = [];
            foreach ($rows as $row) {
                $external = "{$etid}:{$row['id']}";
                if (isset($known[$external])) {
                    $this->report['kept']++;

                    continue;
                }
                $pipeline = $pipelines[(string) ($row['categoryId'] ?? '')] ?? (reset($pipelines) ?: null);
                [$stage, $semantic] = $stages[$pipeline][(string) ($row['stageId'] ?? '')] ?? [$first[$pipeline] ?? null, 'process'];
                $values = [];
                foreach ($fields as $key => $field) {
                    $value = $this->value($field, $row[$key] ?? null);
                    if ($value !== null) {
                        $values[$field->code] = $value;
                    }
                }
                $created = $this->time($row['createdTime'] ?? null) ?? now()->toDateTimeString();
                $data = [
                    'type_id' => $typeId, 'pipeline_id' => $pipeline, 'stage_id' => $stage,
                    'title' => mb_substr(trim((string) ($row['title'] ?? '')), 0, 250) ?: 'Элемент №'.$row['id'],
                    'amount' => round((float) ($row['opportunity'] ?? 0), 2),
                    'currency' => mb_substr((string) ($row['currencyId'] ?? ''), 0, 3) ?: 'RUB',
                    'responsible_id' => $this->users[(int) ($row['assignedById'] ?? 0)] ?? null,
                    'creator_id' => $this->users[(int) ($row['createdBy'] ?? 0)] ?? null,
                    'deal_id' => $links['deal'][(string) ($row['parentId2'] ?? '')] ?? null,
                    'lead_id' => $links['lead'][(string) ($row['parentId1'] ?? '')] ?? null,
                    'company_id' => $links['company'][(string) ($row['companyId'] ?? '')] ?? null,
                    'contact_id' => $links['contact'][(string) ($row['contactId'] ?? '')] ?? null,
                    'begin_date' => $this->date($row['begindate'] ?? null),
                    'close_date' => $this->date($row['closedate'] ?? null),
                    'closed' => $semantic !== 'process',
                    'fields' => $values ? json_encode($values, JSON_UNESCAPED_UNICODE) : null,
                    'external_id' => $external,
                    'created_at' => $created,
                    'updated_at' => $this->time($row['updatedTime'] ?? null) ?? $created,
                ];
                $insert[] = $data + ['search' => CrmSearch::of('crm_smart_items', $data)];
            }
            if ($insert) {
                DB::transaction(fn () => collect($insert)->chunk(50)->each(fn ($part) => DB::table('crm_smart_items')->insert($part->values()->all())));
                $this->report['items'] += count($insert);
            }
        }

        /* Документы, сделанные по элементам этого типа. */
        $map = DB::table('crm_smart_items')->where('type_id', $typeId)->pluck('id', 'external_id')->all();
        foreach (DB::table('crm_documents')->where('bitrix_type', $etid)->whereNull('owner_id')->get(['id', 'bitrix_owner']) as $doc) {
            $id = $map["{$etid}:{$doc->bitrix_owner}"] ?? null;
            if ($id) {
                DB::table('crm_documents')->where('id', $doc->id)->update(['owner_type' => 'smart', 'owner_id' => $id]);
                $this->report['documents']++;
            }
        }
    }

    private function value(CrmField $field, mixed $raw): mixed
    {
        $list = is_array($raw) && array_is_list($raw) ? $raw : [$raw];
        $out = [];
        foreach ($list as $one) {
            if ($one === null || $one === '' || $one === false || $one === []) {
                continue;
            }
            $one = match ($field->type) {
                'number' => is_numeric($n = str_replace([' ', ','], ['', '.'], explode('|', (string) $one)[0])) ? (float) $n : null,
                'date' => $this->date($one),
                'datetime' => $this->time($one) ? Carbon::parse($this->time($one))->toIso8601String() : null,
                'boolean' => in_array((string) $one, ['1', 'Y', 'true'], true) ? true : null,
                'list' => (string) $one,
                'user' => $this->users[(int) $one] ?? null,
                'file' => is_array($one) && ! empty($one['showUrl']) && ! str_contains((string) $one['showUrl'], '/rest/')
                    ? ['name' => 'Файл №'.($one['id'] ?? ''), 'url' => str_starts_with($one['showUrl'], 'http') ? $one['showUrl'] : $this->portal.$one['showUrl']] : null,
                'string' => mb_substr(explode('|', (string) $one)[0], 0, 1000) ?: null,
                default => mb_substr((string) $one, 0, 20000) ?: null,
            };
            if ($one !== null && ! in_array($one, $out, true)) {
                $out[] = $one;
            }
        }
        if (! $out) {
            return null;
        }

        return $field->multiple || $field->type === 'file' ? $out : $out[0];
    }

    private function date(mixed $value): ?string
    {
        $value = trim((string) $value);

        return preg_match('/^\d{4}-\d{2}-\d{2}/', $value) ? substr($value, 0, 10) : null;
    }

    private function time(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }
        try {
            return Carbon::parse((string) $value)->setTimezone(config('app.timezone'))->toDateTimeString();
        } catch (Throwable) {
            return null;
        }
    }
}
