<?php

namespace App\Support\Bitrix;

use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Компании, контакты и сделки из Битрикс24 по вебхуку. Пишет пачками
 * по странице (50 записей) в своей транзакции, чтобы портал не ждал
 * запись в SQLite. Ответственный и создатель — по users.bitrix_id
 * (сначала bitrix:users); неизвестный — пусто. Уже перенесённые записи
 * (external_id) пропускаются, с update — переписываются из Битрикса.
 *
 * Свои поля сделок — по crm_fields.external_code (crm:import-bitrix).
 * У компаний и контактов своих полей пока нет: их UF_* лежат в fields
 * как есть, до настройки полей этих сущностей.
 */
class ImportCrm
{
    public array $report = [];

    /** @var array<int, int> */
    private array $users;

    /** @var array<string, int> ID в Битриксе → id у нас */
    private array $companies = [];

    private array $contacts = [];

    /** Подписи для текстовых company / contact в сделке. */
    private array $companyTitles = [];

    private array $contactNames = [];

    /** Какие лиды: work — в работе и успешные, year — плюс провальные за год, all — все. */
    public string $leads = 'year';

    public function __construct(private Client $bitrix, private string $portal, private bool $update = false, private ?\Closure $progress = null) {}

    public function run(array $only = ['companies', 'contacts', 'deals']): array
    {
        $this->users = DB::table('users')->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        in_array('companies', $only, true) && $this->companies();
        in_array('contacts', $only, true) && $this->contacts();
        in_array('deals', $only, true) && $this->deals();
        in_array('deal_contacts', $only, true) && $this->ownerContacts('deal');
        in_array('leads', $only, true) && $this->leads();
        in_array('products', $only, true) && $this->products();

        return $this->report;
    }

    private function companies(): void
    {
        $this->each('companies', 'crm.company.list', ['select' => ['*', 'UF_*', 'PHONE', 'EMAIL', 'WEB']], 'crm_companies', fn (array $row) => [
            'title' => $this->cut($row['TITLE'] ?? '', 250) ?: 'Компания №'.$row['ID'],
            'type' => $this->cut($row['COMPANY_TYPE'] ?? '', 40) ?: null,
            'industry' => $this->cut($row['INDUSTRY'] ?? '', 60) ?: null,
            'phones' => $this->multi($row['PHONE'] ?? null),
            'emails' => $this->multi($row['EMAIL'] ?? null),
            'webs' => $this->multi($row['WEB'] ?? null),
            'address' => $this->cut(implode(', ', array_filter([$row['ADDRESS'] ?? null, $row['ADDRESS_CITY'] ?? null])), 500) ?: null,
            'comments' => self::comments($row['COMMENTS'] ?? null),
        ] + $this->common($row));
        $this->companies = DB::table('crm_companies')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
    }

    private function contacts(): void
    {
        $this->companies = $this->companies ?: DB::table('crm_companies')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $this->each('contacts', 'crm.contact.list', ['select' => ['*', 'UF_*', 'PHONE', 'EMAIL']], 'crm_contacts', function (array $row) {
            $first = $this->cut($row['NAME'] ?? '', 100);
            $last = $this->cut($row['LAST_NAME'] ?? '', 100);
            $second = $this->cut($row['SECOND_NAME'] ?? '', 100);

            return [
                'name' => $this->cut(trim(preg_replace('/\s+/u', ' ', "{$last} {$first} {$second}")), 250) ?: 'Контакт №'.$row['ID'],
                'first_name' => $first ?: null,
                'last_name' => $last ?: null,
                'second_name' => $second ?: null,
                'post' => $this->cut($row['POST'] ?? '', 200) ?: null,
                'phones' => $this->multi($row['PHONE'] ?? null),
                'emails' => $this->multi($row['EMAIL'] ?? null),
                'company_id' => $this->companies[(string) ($row['COMPANY_ID'] ?? '')] ?? null,
                'birthday' => $this->date($row['BIRTHDATE'] ?? null),
                'comments' => self::comments($row['COMMENTS'] ?? null),
            ] + $this->common($row);
        });
        $this->contacts = DB::table('crm_contacts')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
    }

    private function deals(): void
    {
        $this->companies = $this->companies ?: DB::table('crm_companies')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $this->contacts = $this->contacts ?: DB::table('crm_contacts')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $this->companyTitles = DB::table('crm_companies')->pluck('title', 'id')->all();
        $this->contactNames = DB::table('crm_contacts')->pluck('name', 'id')->all();

        $pipelines = CrmPipeline::query()->where('entity', 'deal')->whereNotNull('external_id')->pluck('id', 'external_id')->all();
        $stages = [];
        $firstStage = [];
        foreach (CrmStage::query()->orderBy('sort')->get(['id', 'pipeline_id', 'external_id']) as $stage) {
            $stages[$stage->pipeline_id][(string) $stage->external_id] = $stage->id;
            $firstStage[$stage->pipeline_id] ??= $stage->id;
        }
        $fields = CrmField::query()->where('entity', 'deal')->whereNotNull('external_code')->get()->keyBy('external_code');
        $this->report['deals_no_pipeline'] = 0;

        $this->each('deals', 'crm.deal.list', ['select' => ['*', 'UF_*']], 'crm_deals', function (array $row) use ($pipelines, $stages, $firstStage, $fields) {
            $pipeline = $pipelines[(string) ($row['CATEGORY_ID'] ?? '0')] ?? null;
            if (! $pipeline) {
                $this->report['deals_no_pipeline']++;

                return null;
            }
            $stage = $stages[$pipeline][(string) ($row['STAGE_ID'] ?? '')] ?? $firstStage[$pipeline] ?? null;
            if (! $stage) {
                $this->report['deals_no_pipeline']++;

                return null;
            }
            $values = [];
            foreach ($fields as $external => $field) {
                $value = $this->value($field, $row[$external] ?? null);
                if ($value !== null) {
                    $values[$field->code] = $value;
                }
            }
            $company = $this->companies[(string) ($row['COMPANY_ID'] ?? '')] ?? null;
            $contact = $this->contacts[(string) ($row['CONTACT_ID'] ?? '')] ?? null;
            $common = $this->common($row);
            unset($common['fields']);

            return [
                'pipeline_id' => $pipeline,
                'stage_id' => $stage,
                'title' => $this->cut($row['TITLE'] ?? '', 250) ?: 'Сделка №'.$row['ID'],
                'amount' => round((float) ($row['OPPORTUNITY'] ?? 0), 2),
                'currency' => $this->cut($row['CURRENCY_ID'] ?? '', 3) ?: 'RUB',
                'company_id' => $company,
                'contact_id' => $contact,
                'company' => $company ? $this->cut((string) ($this->companyTitles[$company] ?? ''), 250) : null,
                'contact' => $contact ? $this->cut((string) ($this->contactNames[$contact] ?? ''), 250) : null,
                'close_date' => $this->date($row['CLOSEDATE'] ?? null),
                'comments' => self::comments($row['COMMENTS'] ?? null),
                'fields' => $values ? json_encode($values, JSON_UNESCAPED_UNICODE) : null,
                'closed' => ($row['CLOSED'] ?? 'N') === 'Y',
                'stage_changed_at' => $this->time($row['MOVED_TIME'] ?? null) ?? $common['updated_at'],
                /* Свежие сделки — наверху колонки, как в Битриксе. */
                'sort' => -(float) $row['ID'],
            ] + $common;
        });
    }

    private function leads(): void
    {
        $this->companies = $this->companies ?: DB::table('crm_companies')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $this->contacts = $this->contacts ?: DB::table('crm_contacts')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $pipeline = (int) DB::table('crm_pipelines')->where('entity', 'lead')->value('id');
        if (! $pipeline) {
            throw new \RuntimeException('Нет статусов лидов: сначала bitrix:lead-settings');
        }
        $stages = DB::table('crm_stages')->where('pipeline_id', $pipeline)->orderBy('sort')->pluck('id', 'external_id')->all();
        $first = (int) reset($stages);
        $fields = CrmField::query()->where('entity', 'lead')->whereNotNull('external_code')->get()->keyBy('external_code');
        $select = ['*', 'UF_*', 'PHONE', 'EMAIL', 'WEB'];
        $filters = match ($this->leads) {
            'all' => [[]],
            'work' => [['STATUS_SEMANTIC_ID' => ['P', 'S']]],
            default => [['STATUS_SEMANTIC_ID' => ['P', 'S']], ['STATUS_SEMANTIC_ID' => 'F', '>=DATE_MODIFY' => now()->subYear()->format('Y-m-d')]],
        };
        $map = function (array $row) use ($pipeline, $stages, $first, $fields) {
            $values = [];
            foreach ($fields as $external => $field) {
                $value = $this->value($field, $row[$external] ?? null);
                if ($value !== null) {
                    $values[$field->code] = $value;
                }
            }
            $firstName = $this->cut($row['NAME'] ?? '', 100);
            $last = $this->cut($row['LAST_NAME'] ?? '', 100);
            $second = $this->cut($row['SECOND_NAME'] ?? '', 100);
            $common = $this->common($row);
            unset($common['fields']);

            return [
                'pipeline_id' => $pipeline,
                'stage_id' => $stages[(string) ($row['STATUS_ID'] ?? '')] ?? $first,
                'title' => $this->cut($row['TITLE'] ?? '', 250) ?: 'Лид №'.$row['ID'],
                'name' => $this->cut(trim(preg_replace('/\s+/u', ' ', "{$last} {$firstName} {$second}")), 250) ?: null,
                'first_name' => $firstName ?: null,
                'last_name' => $last ?: null,
                'second_name' => $second ?: null,
                'post' => $this->cut($row['POST'] ?? '', 200) ?: null,
                'company_title' => $this->cut($row['COMPANY_TITLE'] ?? '', 250) ?: null,
                'phones' => $this->multi($row['PHONE'] ?? null),
                'emails' => $this->multi($row['EMAIL'] ?? null),
                'webs' => $this->multi($row['WEB'] ?? null),
                'address' => $this->cut(implode(', ', array_filter([$row['ADDRESS'] ?? null, $row['ADDRESS_CITY'] ?? null])), 500) ?: null,
                'amount' => round((float) ($row['OPPORTUNITY'] ?? 0), 2),
                'currency' => $this->cut($row['CURRENCY_ID'] ?? '', 3) ?: 'RUB',
                'contact_id' => $this->contacts[(string) ($row['CONTACT_ID'] ?? '')] ?? null,
                'company_id' => $this->companies[(string) ($row['COMPANY_ID'] ?? '')] ?? null,
                'comments' => self::comments($row['COMMENTS'] ?? null),
                'fields' => $values ? json_encode($values, JSON_UNESCAPED_UNICODE) : null,
                'closed' => in_array($row['STATUS_SEMANTIC_ID'] ?? 'P', ['S', 'F'], true),
                'stage_changed_at' => $this->time($row['MOVED_TIME'] ?? $row['DATE_CLOSED'] ?? null) ?? $common['updated_at'],
                'sort' => -(float) $row['ID'],
            ] + $common;
        };
        foreach ($filters as $filter) {
            $this->each('leads', 'crm.lead.list', ['select' => $select, 'filter' => $filter], 'crm_leads', $map, ! empty($this->report['leads']));
        }
        $this->leadContacts();
    }

    private function leadContacts(): void
    {
        $this->ownerContacts('lead');
    }

    /**
     * Все контакты лида или сделки (их может быть несколько, основной —
     * в contact_id): batch по 50 записей, crm.{lead|deal}.contact.items.get.
     */
    private function ownerContacts(string $type): void
    {
        [$table, $links, $column] = $type === 'lead' ? ['crm_leads', 'crm_lead_contacts', 'lead_id'] : ['crm_deals', 'crm_deal_contacts', 'deal_id'];
        $this->contacts = $this->contacts ?: DB::table('crm_contacts')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $owners = DB::table($table)->whereNotNull('external_id')
            ->whereNotExists(fn ($q) => $q->from($links)->whereColumn("{$links}.{$column}", "{$table}.id"))
            ->whereNotNull('contact_id')->pluck('id', 'external_id')->all();
        $key = $type.'_contacts';
        $this->report[$key] = 0;
        $done = 0;
        foreach (array_chunk($owners, 50, true) as $chunk) {
            $cmd = [];
            foreach ($chunk as $external => $id) {
                $cmd['o'.$external] = "crm.{$type}.contact.items.get?".http_build_query(['id' => $external]);
            }
            $body = $this->bitrix->call('batch', ['halt' => 0, 'cmd' => $cmd]);
            $rows = [];
            foreach ($chunk as $external => $id) {
                foreach ((array) ($body['result']['result']['o'.$external] ?? []) as $i => $item) {
                    $contact = $this->contacts[(string) ($item['CONTACT_ID'] ?? '')] ?? null;
                    if ($contact) {
                        $rows[] = [$column => $id, 'contact_id' => $contact, 'sort' => (int) ($item['SORT'] ?? $i)];
                    }
                }
            }
            $rows && DB::table($links)->insertOrIgnore($rows);
            $this->report[$key] += count($rows);
            $done += count($chunk);
            $this->progress && ($this->progress)($key, $done, count($owners));
        }
    }

    /** Каталог товаров и товары в сделках и лидах. */
    private function products(): void
    {
        $this->each('products', 'crm.product.list', ['select' => ['ID', 'NAME', 'PRICE', 'CURRENCY_ID', 'DESCRIPTION', 'ACTIVE', 'MEASURE', 'DATE_CREATE', 'TIMESTAMP_X']], 'crm_products', fn (array $row) => [
            'name' => $this->cut($row['NAME'] ?? '', 500) ?: 'Товар №'.$row['ID'],
            'price' => round((float) ($row['PRICE'] ?? 0), 2),
            'currency' => $this->cut($row['CURRENCY_ID'] ?? '', 3) ?: 'RUB',
            'description' => self::comments($row['DESCRIPTION'] ?? null),
            'active' => ($row['ACTIVE'] ?? 'Y') === 'Y',
            'created_at' => $this->time($row['DATE_CREATE'] ?? null) ?? now()->toDateTimeString(),
            'updated_at' => $this->time($row['TIMESTAMP_X'] ?? null) ?? now()->toDateTimeString(),
        ]);
        $catalog = DB::table('crm_products')->whereNotNull('external_id')->pluck('id', 'external_id')->all();
        $this->report['product_rows'] = 0;
        foreach (['deal' => ['D', 'crm_deals'], 'lead' => ['L', 'crm_leads']] as $type => [$letter, $table]) {
            $owners = DB::table($table)->whereNotNull('external_id')->pluck('id', 'external_id')->all();
            $done = 0;
            foreach (array_chunk(array_keys($owners), 50) as $chunk) {
                $start = 0;
                do {
                    $body = $this->bitrix->call('crm.item.productrow.list', ['filter' => ['=ownerType' => $letter, '@ownerId' => $chunk], 'start' => $start]);
                    $rows = [];
                    foreach ((array) ($body['result']['productRows'] ?? []) as $row) {
                        $owner = $owners[(string) ($row['ownerId'] ?? '')] ?? null;
                        if (! $owner) {
                            continue;
                        }
                        $rows[] = [
                            'owner_type' => $type, 'owner_id' => $owner,
                            'product_id' => $catalog[(string) ($row['productId'] ?? '')] ?? null,
                            'name' => $this->cut($row['productName'] ?? '', 500) ?: 'Товар',
                            'price' => round((float) ($row['price'] ?? 0), 2),
                            'quantity' => (float) ($row['quantity'] ?? 1),
                            'discount_sum' => round((float) ($row['discountSum'] ?? 0), 2),
                            'tax_rate' => isset($row['taxRate']) && $row['taxRate'] !== null ? (float) $row['taxRate'] : null,
                            'measure' => $this->cut($row['measureName'] ?? '', 30) ?: null,
                            'sort' => (int) ($row['sort'] ?? 0),
                            'external_id' => (string) $row['id'],
                            'created_at' => now(), 'updated_at' => now(),
                        ];
                    }
                    $rows && DB::table('crm_product_rows')->insertOrIgnore($rows);
                    $this->report['product_rows'] += count($rows);
                    $start = $body['next'] ?? null;
                } while ($start !== null);
                $done += count($chunk);
                $this->progress && ($this->progress)('product_rows_'.$type, $done, count($owners));
            }
        }
    }

    /**
     * Перенос одного списка: страница из Битрикса → одна транзакция.
     * $map возвращает колонки строки или null — пропустить.
     */
    private function each(string $key, string $method, array $params, string $table, callable $map, bool $append = false): void
    {
        $append || $this->report[$key] = ['new' => 0, 'updated' => 0, 'kept' => 0, 'total' => 0];
        $progress = $this->progress ? fn ($done, $total) => ($this->progress)($key, $done, $total) : null;
        foreach ($this->bitrix->pages($method, $params, $progress) as $rows) {
            $this->report[$key]['total'] += count($rows);
            $ids = array_map(fn ($row) => (string) $row['ID'], $rows);
            $known = DB::table($table)->whereIn('external_id', $ids)->pluck('id', 'external_id')->all();
            $insert = [];
            $update = [];
            foreach ($rows as $row) {
                $external = (string) $row['ID'];
                if (isset($known[$external]) && ! $this->update) {
                    $this->report[$key]['kept']++;

                    continue;
                }
                $data = $map($row);
                if ($data === null) {
                    continue;
                }
                $data['external_id'] = $external;
                if (\App\Support\CrmSearch::has($table)) {
                    $data['search'] = \App\Support\CrmSearch::of($table, $data);
                }
                if (isset($known[$external])) {
                    $update[$known[$external]] = $data;
                } else {
                    $insert[] = $data;
                }
            }
            DB::transaction(function () use ($table, $insert, $update) {
                foreach (array_chunk($insert, 50) as $chunk) {
                    DB::table($table)->insert($this->uniform($chunk));
                }
                foreach ($update as $id => $data) {
                    DB::table($table)->where('id', $id)->update($data);
                }
            });
            $this->report[$key]['new'] += count($insert);
            $this->report[$key]['updated'] += count($update);
        }
    }

    /** Ответственный, создатель, даты и UF_* как есть (для компаний и контактов). */
    private function common(array $row): array
    {
        $own = [];
        foreach ($row as $key => $value) {
            if (str_starts_with($key, 'UF_') && $value !== null && $value !== '' && $value !== [] && $value !== false) {
                $own[$key] = $value;
            }
        }
        $created = $this->time($row['DATE_CREATE'] ?? null) ?? now()->toDateTimeString();

        return [
            'responsible_id' => $this->users[(int) ($row['ASSIGNED_BY_ID'] ?? 0)] ?? null,
            'creator_id' => $this->users[(int) ($row['CREATED_BY_ID'] ?? 0)] ?? null,
            'fields' => $own ? json_encode($own, JSON_UNESCAPED_UNICODE) : null,
            'created_at' => $created,
            'updated_at' => $this->time($row['DATE_MODIFY'] ?? null) ?? $created,
        ];
    }

    /** Одинаковый набор колонок во всех строках вставки. */
    private function uniform(array $rows): array
    {
        $keys = array_keys(array_merge(...$rows));

        return array_map(fn ($row) => array_merge(array_fill_keys($keys, null), $row), $rows);
    }

    /** Значение своего поля сделки по нашему типу; null — пусто. */
    private function value(CrmField $field, mixed $raw): mixed
    {
        $list = is_array($raw) && ! isset($raw['id']) && ! isset($raw['showUrl']) ? array_values($raw) : [$raw];
        $out = [];
        foreach ($list as $one) {
            $one = $this->single($field, $one);
            if ($one !== null && ! in_array($one, $out, true)) {
                $out[] = $one;
            }
        }
        if (! $out) {
            return null;
        }

        return $field->multiple || $field->type === 'file' ? $out : $out[0];
    }

    private function single(CrmField $field, mixed $value): mixed
    {
        if ($value === null || $value === '' || $value === false || $value === []) {
            return null;
        }
        switch ($field->type) {
            case 'number':
                $text = str_replace([' ', ','], ['', '.'], explode('|', (string) $value)[0]);

                return is_numeric($text) ? (float) $text : null;
            case 'date':
                return $this->date($value);
            case 'datetime':
                try {
                    return Carbon::parse((string) $value)->toIso8601String();
                } catch (Throwable) {
                    return null;
                }
            case 'boolean':
                return in_array((string) $value, ['1', 'Y', 'true'], true) ? true : null;
            case 'list':
                return (string) $value;
            case 'user':
                return $this->users[(int) $value] ?? null;
            case 'file':
                /* Ссылка на файл в Битриксе (открывается под своей учёткой); downloadUrl вебхука несёт токен — его не храним. */
                $url = is_array($value) ? (string) ($value['showUrl'] ?? '') : '';
                if ($url === '' || str_contains($url, '/rest/')) {
                    return null;
                }

                return ['name' => 'Файл №'.($value['id'] ?? ''), 'url' => str_starts_with($url, 'http') ? $url : $this->portal.$url];
            case 'string':
                /* Адрес Битрикса: «улица|широта;долгота|id». */
                return $this->cut(explode('|', (string) $value)[0], 1000) ?: null;
            default:
                return $this->cut((string) $value, 20000) ?: null;
        }
    }

    /** Телефоны, почты, сайты Битрикса → [{value, type}]. */
    private function multi(mixed $list): ?string
    {
        $out = [];
        foreach ((array) $list as $one) {
            $value = trim((string) ($one['VALUE'] ?? ''));
            if ($value !== '') {
                $out[] = ['value' => mb_substr($value, 0, 250), 'type' => (string) ($one['VALUE_TYPE'] ?? 'WORK')];
            }
        }

        return $out ? json_encode($out, JSON_UNESCAPED_UNICODE) : null;
    }

    /** Комментарий Битрикса (HTML или BB-коды) → простой текст для Markdown. */
    public static function comments(?string $text): ?string
    {
        if ($text === null || trim($text) === '') {
            return null;
        }
        $text = preg_replace('~<br\s*/?>|</p>|</div>|</li>~i', "\n", $text);
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('~\[(/?)(b|i|u|s|url|color|size|font|quote|code|list|\*|img|p|left|center|right|justify)(=[^\]]*)?\]~i', '', $text);
        $text = trim(preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $text)));

        return $text === '' ? null : $text;
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

    private function cut(mixed $text, int $max): string
    {
        return mb_substr(trim((string) $text), 0, $max);
    }
}
