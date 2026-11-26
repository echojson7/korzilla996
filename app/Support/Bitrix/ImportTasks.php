<?php

namespace App\Support\Bitrix;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Задачи из Битрикс24 по вебхуку: постановщик, ответственный,
 * соисполнители, наблюдатели, статус, срок, приоритет, контроль,
 * проект (группа), связь со сделкой (UF_CRM_TASK «D_123»), подзадачи,
 * чек-листы (только у незавершённых — у остальных их никто не откроет,
 * а запрос на каждую задачу дорогой). Сотрудники — по users.bitrix_id
 * (сначала bitrix:users), сделки — по crm_deals.external_id (bitrix:crm).
 * Уже перенесённые (tasks.external_id) пропускаются.
 */
class ImportTasks
{
    /** Статусы Битрикса → наши (Task::STATUSES). 7 — «отклонена», у нас такой нет. */
    private const STATUS = [1 => 'pending', 2 => 'pending', 3 => 'work', 4 => 'review', 5 => 'done', 6 => 'deferred', 7 => 'deferred'];

    private const PRIORITY = [0 => 'low', 1 => 'normal', 2 => 'high'];

    private const SELECT = [
        'ID', 'PARENT_ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'PRIORITY', 'CREATED_BY', 'RESPONSIBLE_ID', 'ACCOMPLICES', 'AUDITORS',
        'DEADLINE', 'START_DATE_PLAN', 'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'TASK_CONTROL', 'TIME_ESTIMATE', 'GROUP_ID', 'UF_CRM_TASK',
    ];

    public array $report = ['total' => 0, 'new' => 0, 'kept' => 0, 'members' => 0, 'deals' => 0, 'parents' => 0, 'checklists' => 0];

    private array $users = [];

    private array $deals = [];

    /** ID группы Битрикса → название (проект задачи). */
    private array $groups = [];

    public function __construct(private Client $bitrix, private bool $checklists = true, private ?\Closure $progress = null) {}

    public function run(): array
    {
        $this->users = DB::table('users')->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        $this->deals = DB::table('crm_deals')->whereNotNull('external_id')->pluck('id', 'external_id')->map(fn ($id) => (int) $id)->all();
        try {
            foreach ($this->bitrix->each('sonet_group.get', ['ORDER' => ['ID' => 'ASC']]) as $group) {
                $this->groups[(int) $group['ID']] = mb_substr(trim((string) $group['NAME']), 0, 120);
            }
        } catch (Throwable) {
            /* Нет права на группы — проекты останутся пустыми. */
        }

        $parents = [];
        $progress = $this->progress ? fn ($done, $total) => ($this->progress)('tasks', $done, $total) : null;
        foreach ($this->bitrix->pages('tasks.task.list', ['select' => self::SELECT], $progress, 'tasks') as $rows) {
            $this->report['total'] += count($rows);
            $ids = array_map(fn ($row) => (string) $this->get($row, 'id'), $rows);
            $known = DB::table('tasks')->whereIn('external_id', $ids)->pluck('id', 'external_id')->all();
            $insert = [];
            $members = [];
            foreach ($rows as $row) {
                $external = (string) $this->get($row, 'id');
                if (isset($known[$external])) {
                    $this->report['kept']++;

                    continue;
                }
                [$data, $people, $parent] = $this->task($row);
                $insert[$external] = $data;
                $members[$external] = $people;
                if ($parent) {
                    $parents[$external] = $parent;
                }
            }
            if (! $insert) {
                continue;
            }
            DB::transaction(function () use ($insert, $members) {
                foreach (array_chunk($insert, 50, true) as $chunk) {
                    DB::table('tasks')->insert(array_values($chunk));
                }
                $ids = DB::table('tasks')->whereIn('external_id', array_map('strval', array_keys($insert)))->pluck('id', 'external_id')->all();
                $rows = [];
                foreach ($members as $external => $people) {
                    foreach ($people as [$userId, $role]) {
                        $rows[] = ['task_id' => $ids[$external], 'user_id' => $userId, 'role' => $role];
                    }
                }
                foreach (array_chunk($rows, 200) as $chunk) {
                    DB::table('task_members')->insertOrIgnore($chunk);
                }
                $this->report['members'] += count($rows);
            });
            $this->report['new'] += count($insert);
        }

        /* Подзадачи: родитель мог прийти позже ребёнка — связываем в конце. */
        $map = DB::table('tasks')->whereNotNull('external_id')->pluck('id', 'external_id')->all();
        foreach (array_chunk($parents, 500, true) as $chunk) {
            DB::transaction(function () use ($chunk, $map) {
                foreach ($chunk as $child => $parent) {
                    if (isset($map[$child], $map[(string) $parent])) {
                        DB::table('tasks')->where('id', $map[$child])->update(['parent_id' => $map[(string) $parent]]);
                        $this->report['parents']++;
                    }
                }
            });
        }

        if ($this->checklists) {
            $this->checklists($map);
        }

        return $this->report;
    }

    /** @return array{0: array, 1: array<int, array{0: int, 1: string}>, 2: ?int} */
    private function task(array $row): array
    {
        $status = self::STATUS[(int) $this->get($row, 'status')] ?? 'pending';
        $responsible = $this->users[(int) $this->get($row, 'responsibleId')] ?? null;
        $created = $this->time($this->get($row, 'createdDate')) ?? now()->toDateTimeString();
        $deal = null;
        foreach ((array) $this->get($row, 'ufCrmTask') as $link) {
            if (preg_match('/^D_(\d+)$/', (string) $link, $m) && isset($this->deals[$m[1]])) {
                $deal = $this->deals[$m[1]];
                $this->report['deals']++;
                break;
            }
        }
        $people = [];
        $seen = [$responsible => true];
        foreach (['accomplices' => 'accomplice', 'auditors' => 'auditor'] as $key => $role) {
            foreach ((array) $this->get($row, $key) as $bid) {
                $id = $this->users[(int) $bid] ?? null;
                if ($id && ! isset($seen[$id])) {
                    $seen[$id] = true;
                    $people[] = [$id, $role];
                }
            }
        }
        $estimate = (int) $this->get($row, 'timeEstimate');
        $group = (int) $this->get($row, 'groupId');
        $parent = (int) $this->get($row, 'parentId');

        return [[
            'title' => mb_substr(trim((string) $this->get($row, 'title')), 0, 250) ?: 'Задача №'.$this->get($row, 'id'),
            'description' => ImportCrm::comments($this->get($row, 'description')),
            'status' => $status,
            'priority' => self::PRIORITY[(int) $this->get($row, 'priority')] ?? 'normal',
            'creator_id' => $this->users[(int) $this->get($row, 'createdBy')] ?? null,
            'responsible_id' => $responsible,
            'deadline' => $this->time($this->get($row, 'deadline')),
            'start_at' => $this->time($this->get($row, 'startDatePlan')),
            'needs_review' => $this->get($row, 'taskControl') === 'Y',
            'estimate' => $estimate > 0 ? intdiv($estimate, 60) : null,
            'project' => $group ? ($this->groups[$group] ?? null) : null,
            'deal_id' => $deal,
            /* Свежие — выше, как в Битриксе. */
            'sort' => -(float) $this->get($row, 'id'),
            'completed_at' => $status === 'done' ? ($this->time($this->get($row, 'closedDate')) ?? $created) : null,
            'created_at' => $created,
            'updated_at' => $this->time($this->get($row, 'changedDate')) ?? $created,
            'external_id' => (string) $this->get($row, 'id'),
        ], $people, $parent ?: null];
    }

    /** Чек-листы незавершённых задач: batch по 50 задач за запрос. */
    private function checklists(array $map): void
    {
        $open = DB::table('tasks')->whereNotNull('external_id')->where('status', '!=', 'done')
            ->whereNotExists(fn ($q) => $q->from('task_checklist')->whereColumn('task_checklist.task_id', 'tasks.id'))
            ->pluck('external_id')->all();
        $done = 0;
        foreach (array_chunk($open, 50) as $chunk) {
            $cmd = [];
            foreach ($chunk as $external) {
                $cmd['t'.$external] = 'task.checklistitem.getlist?'.http_build_query(['TASKID' => $external]);
            }
            $body = $this->bitrix->call('batch', ['halt' => 0, 'cmd' => $cmd]);
            $rows = [];
            foreach ($chunk as $external) {
                $items = array_values((array) ($body['result']['result']['t'.$external] ?? []));
                /* В новых чек-листах корневой пункт (PARENT_ID 0) — заголовок группы «Чек-лист», пункты висят под ним. */
                $nested = collect($items)->contains(fn ($item) => (int) ($item['PARENT_ID'] ?? 0) !== 0);
                $sort = 0;
                foreach ($items as $item) {
                    $title = trim((string) ($item['TITLE'] ?? ''));
                    if ($title === '' || ($nested && (int) ($item['PARENT_ID'] ?? 0) === 0)) {
                        continue;
                    }
                    $rows[] = [
                        'task_id' => $map[$external], 'title' => mb_substr($title, 0, 500), 'done' => ($item['IS_COMPLETE'] ?? 'N') === 'Y',
                        'sort' => $sort++, 'created_at' => now(), 'updated_at' => now(),
                    ];
                }
            }
            if ($rows) {
                DB::transaction(fn () => collect($rows)->chunk(200)->each(fn ($part) => DB::table('task_checklist')->insert($part->values()->all())));
                $this->report['checklists'] += count($rows);
            }
            $done += count($chunk);
            $this->progress && ($this->progress)('checklists', $done, count($open));
        }
    }

    /** Поле ответа: tasks.task.list отдаёт camelCase, старые порталы — UPPER_CASE. */
    private function get(array $row, string $key): mixed
    {
        return $row[$key] ?? $row[strtoupper(preg_replace('/(?<!^)[A-Z]/', '_$0', $key))] ?? null;
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
