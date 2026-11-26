<?php

namespace App\Support\Bitrix;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Документы из шаблонов Битрикс24 (crm.documentgenerator.document.list):
 * сам файл скачивается к нам — PDF, если Битрикс его сделал, иначе DOCX.
 * Адреса скачивания с токеном вебхука нигде не сохраняются. Владелец —
 * по типу Битрикса: 1 лид, 2 сделка, 5 старый счёт, 31 смарт-счёт;
 * остальные (смарт-процессы) привяжутся, когда переедут сами элементы.
 */
class ImportDocuments
{
    public array $report = ['new' => 0, 'kept' => 0, 'files' => 0, 'bytes' => 0, 'no_file' => 0];

    public function __construct(private Client $bitrix, private bool $files = true, private ?\Closure $progress = null) {}

    public function run(): array
    {
        $users = DB::table('users')->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        $templates = [];
        try {
            foreach ($this->bitrix->each('crm.documentgenerator.template.list', [], 'templates') as $one) {
                $templates[(string) $one['id']] = (string) $one['name'];
            }
        } catch (Throwable) {
        }
        $owners = [
            1 => ['lead', DB::table('crm_leads')->whereNotNull('external_id')->pluck('id', 'external_id')->all(), ''],
            2 => ['deal', DB::table('crm_deals')->whereNotNull('external_id')->pluck('id', 'external_id')->all(), ''],
            5 => ['invoice', DB::table('crm_invoices')->whereNotNull('external_id')->pluck('id', 'external_id')->all(), 'o'],
            31 => ['invoice', DB::table('crm_invoices')->whereNotNull('external_id')->pluck('id', 'external_id')->all(), 'n'],
        ];
        $disk = Storage::disk('local');
        $progress = $this->progress ? fn ($done, $total) => ($this->progress)('documents', $done, $total) : null;
        foreach ($this->bitrix->pages('crm.documentgenerator.document.list', ['order' => ['id' => 'asc']], $progress, 'documents') as $rows) {
            $known = DB::table('crm_documents')->whereIn('external_id', array_map(fn ($row) => (string) $row['id'], $rows))->pluck('id', 'external_id')->all();
            foreach ($rows as $row) {
                $external = (string) $row['id'];
                if (isset($known[$external])) {
                    $this->report['kept']++;

                    continue;
                }
                $type = (int) ($row['entityTypeId'] ?? 0);
                $owner = $owners[$type] ?? null;
                $ownerId = $owner ? ($owner[1][$owner[2].($row['entityId'] ?? '')] ?? null) : null;
                $title = mb_substr(trim((string) ($row['title'] ?? '')), 0, 250) ?: 'Документ №'.$external;
                $created = $this->time($row['createTime'] ?? null) ?? now()->toDateTimeString();
                $id = DB::table('crm_documents')->insertGetId([
                    'title' => $title,
                    'number' => mb_substr((string) ($row['number'] ?? ''), 0, 100) ?: null,
                    'template' => $templates[(string) ($row['templateId'] ?? '')] ?? null,
                    'owner_type' => $ownerId ? $owner[0] : null,
                    'owner_id' => $ownerId,
                    'bitrix_type' => $type ?: null,
                    'bitrix_owner' => isset($row['entityId']) ? (string) $row['entityId'] : null,
                    'creator_id' => $users[(int) ($row['createdBy'] ?? 0)] ?? null,
                    'external_id' => $external,
                    'created_at' => $created,
                    'updated_at' => $this->time($row['updateTime'] ?? null) ?? $created,
                ]);
                $this->report['new']++;
                if ($this->files) {
                    $this->file($id, $row, $title, $disk);
                }
            }
        }

        return $this->report;
    }

    /** Скачать файл документа: PDF, если есть, иначе DOCX. */
    private function file(int $id, array $row, string $title, $disk): void
    {
        foreach ([['pdfUrlMachine', 'pdf', 'application/pdf'], ['downloadUrlMachine', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']] as [$key, $ext, $mime]) {
            $url = (string) ($row[$key] ?? '');
            if ($url === '') {
                continue;
            }
            try {
                $bytes = $this->bitrix->download($url);
            } catch (Throwable) {
                $bytes = null;
            }
            /* Битрикс на ошибку отвечает JSON, а не файлом. */
            if (! $bytes || str_starts_with(ltrim($bytes), '{')) {
                continue;
            }
            $path = "crm-documents/{$id}.{$ext}";
            $disk->put($path, $bytes);
            $name = trim(preg_replace('~[\\\\/:*?"<>|]+~', ' ', $title)).'.'.$ext;
            DB::table('crm_documents')->where('id', $id)->update(['path' => $path, 'file_name' => mb_substr($name, 0, 250), 'mime' => $mime, 'size' => strlen($bytes)]);
            $this->report['files']++;
            $this->report['bytes'] += strlen($bytes);

            return;
        }
        $this->report['no_file']++;
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
