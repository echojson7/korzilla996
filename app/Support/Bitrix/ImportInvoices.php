<?php

namespace App\Support\Bitrix;

use App\Support\CrmSearch;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Счета из Битрикс24: старые (crm.invoice.list, товары — из crm.invoice.get
 * пачками по 50) и новые смарт-счета (crm.item.list, entityTypeId 31,
 * товары — crm.item.productrow.list, ownerType SI). Привязки — по
 * external_id сделок, лидов, компаний и контактов (сначала bitrix:crm).
 */
class ImportInvoices
{
    public array $report = ['old' => 0, 'new' => 0, 'kept' => 0, 'rows' => 0];

    private array $users = [];

    private array $deals = [];

    private array $leads = [];

    private array $companies = [];

    private array $contacts = [];

    /** STATUS_ID → [название, смысл] из crm.status.list. */
    private array $statuses = [];

    public function __construct(private Client $bitrix, private ?\Closure $progress = null) {}

    public function run(): array
    {
        $ids = fn (string $table) => DB::table($table)->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        $this->users = DB::table('users')->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        $this->deals = $ids('crm_deals');
        $this->leads = $ids('crm_leads');
        $this->companies = $ids('crm_companies');
        $this->contacts = $ids('crm_contacts');
        foreach ($this->bitrix->each('crm.status.list', ['order' => ['SORT' => 'ASC']]) as $status) {
            $semantic = $status['EXTRA']['SEMANTICS'] ?? $status['SEMANTICS'] ?? null;
            $this->statuses[$status['ENTITY_ID'].'|'.$status['STATUS_ID']] = [$status['NAME'], match ($semantic) { 'success', 'S' => 'success', 'failure', 'apology', 'F' => 'failure', default => 'process' }];
            $this->statuses['*|'.$status['STATUS_ID']] ??= $this->statuses[$status['ENTITY_ID'].'|'.$status['STATUS_ID']];
        }

        $this->old();
        $this->smart();

        return $this->report;
    }

    private function old(): void
    {
        $progress = $this->progress ? fn ($done, $total) => ($this->progress)('old', $done, $total) : null;
        foreach ($this->bitrix->pages('crm.invoice.list', ['select' => ['*', 'UF_*']], $progress) as $rows) {
            $insert = [];
            $known = $this->known(array_map(fn ($row) => 'o'.$row['ID'], $rows));
            foreach ($rows as $row) {
                if (isset($known['o'.$row['ID']])) {
                    $this->report['kept']++;

                    continue;
                }
                $status = (string) ($row['STATUS_ID'] ?? '');
                [$title, $semantic] = $this->statuses['INVOICE_STATUS|'.$status] ?? [$status, 'process'];
                if ($status === 'P') {
                    $semantic = 'success';
                } elseif ($status === 'D') {
                    $semantic = 'failure';
                }
                $own = array_filter($row, fn ($value, $key) => str_starts_with($key, 'UF_') && ! in_array($key, ['UF_DEAL_ID', 'UF_COMPANY_ID', 'UF_CONTACT_ID', 'UF_QUOTE_ID', 'UF_MYCOMPANY_ID'], true) && $value !== null && $value !== '' && $value !== [], ARRAY_FILTER_USE_BOTH);
                $created = $this->time($row['DATE_INSERT'] ?? null) ?? now()->toDateTimeString();
                $insert[] = $this->withSearch([
                    'number' => mb_substr((string) ($row['ACCOUNT_NUMBER'] ?? ''), 0, 100) ?: null,
                    'title' => mb_substr(trim((string) ($row['ORDER_TOPIC'] ?? '')), 0, 250) ?: null,
                    'status' => $status ?: null,
                    'status_title' => mb_substr((string) $title, 0, 120) ?: null,
                    'semantic' => $semantic,
                    'amount' => round((float) ($row['PRICE'] ?? 0), 2),
                    'currency' => mb_substr((string) ($row['CURRENCY'] ?? ''), 0, 3) ?: 'RUB',
                    'date_bill' => $this->date($row['DATE_BILL'] ?? null),
                    'pay_before' => $this->date($row['DATE_PAY_BEFORE'] ?? null),
                    'paid_at' => $status === 'P' ? ($this->date($row['PAY_VOUCHER_DATE'] ?? null) ?? $this->date($row['DATE_MARKED'] ?? null)) : null,
                    'deal_id' => $this->deals[(string) ($row['UF_DEAL_ID'] ?? '')] ?? null,
                    'lead_id' => null,
                    'company_id' => $this->companies[(string) ($row['UF_COMPANY_ID'] ?? '')] ?? null,
                    'contact_id' => $this->contacts[(string) ($row['UF_CONTACT_ID'] ?? '')] ?? null,
                    'responsible_id' => $this->users[(int) ($row['RESPONSIBLE_ID'] ?? 0)] ?? null,
                    'creator_id' => $this->users[(int) ($row['CREATED_BY'] ?? 0)] ?? null,
                    'comments' => ImportCrm::comments(trim(($row['COMMENTS'] ?? '')."\n\n".($row['USER_DESCRIPTION'] ?? ''))),
                    'fields' => $own ? json_encode($own, JSON_UNESCAPED_UNICODE) : null,
                    'external_id' => 'o'.$row['ID'],
                    'created_at' => $created,
                    'updated_at' => $this->time($row['DATE_UPDATE'] ?? null) ?? $created,
                ]);
            }
            $this->save($insert, 'old');
            $this->oldRows(array_map(fn ($one) => substr($one['external_id'], 1), $insert));
        }
    }

    /** Товары старых счетов: crm.invoice.get пачкой по 50 в одном batch. */
    private function oldRows(array $externals): void
    {
        if (! $externals) {
            return;
        }
        $ids = $this->known(array_map(fn ($id) => 'o'.$id, $externals));
        $cmd = [];
        foreach ($externals as $external) {
            $cmd['i'.$external] = 'crm.invoice.get?'.http_build_query(['id' => $external]);
        }
        $body = $this->bitrix->call('batch', ['halt' => 0, 'cmd' => $cmd]);
        $rows = [];
        foreach ($externals as $external) {
            foreach ((array) ($body['result']['result']['i'.$external]['PRODUCT_ROWS'] ?? []) as $i => $row) {
                $rows[] = $this->row($ids['o'.$external] ?? null, [
                    'id' => 'io'.$row['ID'], 'productId' => $row['PRODUCT_ID'] ?? null, 'productName' => $row['PRODUCT_NAME'] ?? '',
                    'price' => $row['PRICE'] ?? 0, 'quantity' => $row['QUANTITY'] ?? 1, 'discountSum' => ($row['DISCOUNT_PRICE'] ?? 0) * ($row['QUANTITY'] ?? 1),
                    'taxRate' => isset($row['VAT_RATE']) ? (float) $row['VAT_RATE'] * 100 : null, 'measureName' => $row['MEASURE_NAME'] ?? null, 'sort' => $i,
                ]);
            }
        }
        $this->insertRows(array_values(array_filter($rows)));
    }

    private function smart(): void
    {
        $progress = $this->progress ? fn ($done, $total) => ($this->progress)('new', $done, $total) : null;
        try {
            $pages = $this->bitrix->pages('crm.item.list', ['entityTypeId' => 31, 'select' => ['*'], 'order' => ['id' => 'ASC']], $progress, 'items');
            foreach ($pages as $rows) {
                $insert = [];
                $known = $this->known(array_map(fn ($row) => 'n'.$row['id'], $rows));
                foreach ($rows as $row) {
                    if (isset($known['n'.$row['id']])) {
                        $this->report['kept']++;

                        continue;
                    }
                    $stage = (string) ($row['stageId'] ?? '');
                    [$title, $semantic] = $this->statuses['*|'.$stage] ?? [$stage, 'process'];
                    $created = $this->time($row['createdTime'] ?? null) ?? now()->toDateTimeString();
                    $insert[] = $this->withSearch([
                        'number' => mb_substr((string) ($row['accountNumber'] ?? ''), 0, 100) ?: null,
                        'title' => mb_substr(trim((string) ($row['title'] ?? '')), 0, 250) ?: null,
                        'status' => $stage ?: null,
                        'status_title' => mb_substr((string) $title, 0, 120) ?: null,
                        'semantic' => $semantic,
                        'amount' => round((float) ($row['opportunity'] ?? 0), 2),
                        'currency' => mb_substr((string) ($row['currencyId'] ?? ''), 0, 3) ?: 'RUB',
                        'date_bill' => $this->date($row['begindate'] ?? null),
                        'pay_before' => $this->date($row['closedate'] ?? null),
                        'paid_at' => $semantic === 'success' ? $this->date($row['movedTime'] ?? null) : null,
                        'deal_id' => $this->deals[(string) ($row['parentId2'] ?? '')] ?? null,
                        'lead_id' => $this->leads[(string) ($row['parentId1'] ?? '')] ?? null,
                        'company_id' => $this->companies[(string) ($row['companyId'] ?? '')] ?? null,
                        'contact_id' => $this->contacts[(string) ($row['contactId'] ?? '')] ?? null,
                        'responsible_id' => $this->users[(int) ($row['assignedById'] ?? 0)] ?? null,
                        'creator_id' => $this->users[(int) ($row['createdBy'] ?? 0)] ?? null,
                        'comments' => ImportCrm::comments($row['comments'] ?? null),
                        'fields' => null,
                        'external_id' => 'n'.$row['id'],
                        'created_at' => $created,
                        'updated_at' => $this->time($row['updatedTime'] ?? null) ?? $created,
                    ]);
                }
                $this->save($insert, 'new');
                $this->smartRows(array_map(fn ($one) => substr($one['external_id'], 1), $insert));
            }
        } catch (Throwable $error) {
            $this->report['new_error'] = $error->getMessage();
        }
    }

    private function smartRows(array $externals): void
    {
        if (! $externals) {
            return;
        }
        $ids = $this->known(array_map(fn ($id) => 'n'.$id, $externals));
        $start = 0;
        do {
            $body = $this->bitrix->call('crm.item.productrow.list', ['filter' => ['=ownerType' => 'SI', '@ownerId' => array_map('intval', $externals)], 'start' => $start]);
            $rows = [];
            foreach ((array) ($body['result']['productRows'] ?? []) as $row) {
                $rows[] = $this->row($ids['n'.($row['ownerId'] ?? '')] ?? null, ['id' => 'in'.$row['id']] + $row);
            }
            $this->insertRows(array_values(array_filter($rows)));
            $start = $body['next'] ?? null;
        } while ($start !== null);
    }

    private function row(?int $invoice, array $row): ?array
    {
        if (! $invoice) {
            return null;
        }

        return [
            'owner_type' => 'invoice', 'owner_id' => $invoice, 'product_id' => null,
            'name' => mb_substr(trim((string) ($row['productName'] ?? '')), 0, 500) ?: 'Товар',
            'price' => round((float) ($row['price'] ?? 0), 2), 'quantity' => (float) ($row['quantity'] ?? 1),
            'discount_sum' => round((float) ($row['discountSum'] ?? 0), 2),
            'tax_rate' => isset($row['taxRate']) && $row['taxRate'] !== null ? (float) $row['taxRate'] : null,
            'measure' => mb_substr((string) ($row['measureName'] ?? ''), 0, 30) ?: null,
            'sort' => (int) ($row['sort'] ?? 0), 'external_id' => (string) $row['id'],
            'created_at' => now(), 'updated_at' => now(),
        ];
    }

    private function insertRows(array $rows): void
    {
        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('crm_product_rows')->insertOrIgnore($chunk);
        }
        $this->report['rows'] += count($rows);
    }

    private function save(array $insert, string $key): void
    {
        if (! $insert) {
            return;
        }
        DB::transaction(function () use ($insert) {
            foreach (array_chunk($insert, 50) as $chunk) {
                DB::table('crm_invoices')->insert($chunk);
            }
        });
        $this->report[$key] += count($insert);
    }

    private function known(array $externals): array
    {
        return DB::table('crm_invoices')->whereIn('external_id', $externals)->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
    }

    private function withSearch(array $row): array
    {
        return $row + ['search' => CrmSearch::of('crm_invoices', $row)];
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
