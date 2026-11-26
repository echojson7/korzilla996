<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\Task;
use App\Models\TaskChecklistItem;
use App\Models\TaskComment;
use App\Models\TaskFile;
use App\Models\TaskHistory;
use App\Models\TaskMember;
use App\Models\TaskTag;
use App\Models\TaskTime;
use App\Models\User;
use App\Policies\TaskPolicy;
use App\Support\Access;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Задачи как в Битрикс24. Видят задачу её участники (постановщик,
 * ответственный, соисполнители, наблюдатели) и администраторы; чужая
 * задача отвечает 403 «Нет доступа к задаче» без названия и полей,
 * несуществующая — 404 (портал показывает экран «Нет доступа»).
 *
 * Права — по роли (App\Policies\TaskPolicy): видеть свои / отдела / все,
 * менять, удалять. На уровне «свои»: поля меняют постановщик и ответственный;
 * соисполнители — статус, чек-лист, файлы и время; комментировать могут все
 * участники. Каждое изменение полей пишется в историю.
 */
class TaskController extends Controller
{
    private const FILE_KB = 51200;

    private const ROLES = ['accomplice', 'auditor'];

    /* ---------- Список ---------- */

    public function index(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $query = Task::query()->with(['members', 'tags'])
            ->withCount(['comments', 'files', 'children'])
            ->withCount(['checklist as checklist_total', 'checklist as checklist_done' => fn ($q) => $q->where('done', true)])
            ->withSum('time as time_spent', 'seconds');
        TaskPolicy::visible($query, $me);
        /* ids=1,2,3 — только эти задачи (догрузка по событиям real-time). */
        if ($request->filled('ids')) {
            $ids = array_slice(array_filter(array_map('intval', explode(',', (string) $request->input('ids')))), 0, 500);

            return response()->json(['data' => [
                'tasks' => $query->whereIn('id', $ids)->get()->map(fn (Task $task) => $this->brief($task)),
            ]]);
        }
        /* Завершённые давно (в том числе перенесённые из Битрикс24 — их десятки
           тысяч) в общий список не идут: только открытые и завершённые за 30 дней. */
        $query->where(fn ($q) => $q->where('status', '!=', 'done')->orWhere('completed_at', '>=', now()->subDays(30)));
        $tasks = $query->orderBy('sort')->orderByDesc('id')->get();
        $running = TaskTime::query()->where('user_id', $me->id)->whereNull('stopped_at')->first();

        return response()->json(['data' => [
            'tasks' => $tasks->map(fn (Task $task) => $this->brief($task)),
            'me' => $me->id,
            'timer' => $running ? ['taskId' => $running->task_id, 'startedAt' => $running->started_at->toIso8601String()] : null,
            'projects' => Task::query()->whereNotNull('project')->distinct()->orderBy('project')->pluck('project'),
            'tags' => TaskTag::query()->distinct()->orderBy('name')->pluck('name'),
            'now' => now()->toIso8601String(),
        ]]);
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);

        return response()->json(['data' => $this->full($task, $me)]);
    }

    /* ---------- Создание и правка ---------- */

    public function store(Request $request): JsonResponse
    {
        $me = $this->me($request);
        abort_unless($me->can('create', Task::class), 403, 'Ставить задачи нельзя: нет права');
        $data = $this->validated($request, true);
        if (! empty($data['parent_id'])) {
            $this->see(Task::query()->findOrFail($data['parent_id']), $me);
        }

        $task = DB::transaction(function () use ($data, $me) {
            $status = $data['status'] ?? 'pending';
            $task = Task::query()->create([
                ...collect($data)->except(['accomplices', 'auditors', 'tags'])->all(),
                'status' => $status,
                'creator_id' => $me->id,
                'responsible_id' => $data['responsible_id'] ?? $me->id,
                'priority' => $data['priority'] ?? 'normal',
                'sort' => (float) (Task::query()->min('sort') ?? 0) - 1,
                'completed_at' => $status === 'done' ? now() : null,
            ]);
            $this->syncMembers($task, 'accomplice', $data['accomplices'] ?? []);
            $this->syncMembers($task, 'auditor', $data['auditors'] ?? []);
            $this->syncTags($task, $data['tags'] ?? []);
            $this->log($task, $me, 'created', null, $task->title);

            return $task;
        });

        return response()->json(['data' => $this->full($task->fresh(), $me)], 201);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canEdit($task, $me);
        $data = $this->validated($request, false);
        if (array_key_exists('parent_id', $data) && $data['parent_id']) {
            abort_if($this->wouldLoop($task, (int) $data['parent_id']), 422, 'Задача не может быть подзадачей самой себя');
        }

        DB::transaction(function () use ($task, $data, $me) {
            $plain = collect($data)->except(['accomplices', 'auditors', 'tags', 'status'])->all();
            foreach ($plain as $field => $value) {
                $old = $task->getAttribute($field);
                $task->setAttribute($field, $value);
                if ($task->isDirty($field)) {
                    $this->log($task, $me, $field, $this->asText($old), $this->asText($task->getAttribute($field)));
                }
            }
            $titleChanged = $task->isDirty('title');
            $task->save();
            if ($titleChanged) {
                Chat::query()->where('entity', 'task:'.$task->id)->update(['title' => Str::limit('Задача: '.$task->title, 120, '')]);
            }
            if (array_key_exists('status', $data)) {
                $this->applyStatus($task, $me, $data['status']);
            }
            foreach (['accomplices' => 'accomplice', 'auditors' => 'auditor'] as $key => $role) {
                if (array_key_exists($key, $data)) {
                    $this->syncMembers($task, $role, $data[$key] ?? [], $me);
                }
            }
            if (array_key_exists('tags', $data)) {
                $this->syncTags($task, $data['tags'] ?? [], $me);
            }
        });

        return response()->json(['data' => $this->full($task->fresh(), $me)]);
    }

    /** Смена статуса кнопками: начать, завершить, принять, вернуть, отложить. */
    public function status(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $data = $request->validate(['status' => ['required', Rule::in(array_keys(Task::STATUSES))]]);
        DB::transaction(fn () => $this->applyStatus($task, $me, $data['status']));

        return response()->json(['data' => $this->full($task->fresh(), $me)]);
    }

    /** Перенос в канбане: новый статус и место перед задачей before. */
    public function move(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $data = $request->validate([
            'status' => ['nullable', Rule::in(array_keys(Task::STATUSES))],
            'before' => ['nullable', 'integer'],
        ]);
        DB::transaction(function () use ($task, $me, $data) {
            /* Место в общем порядке: между before и тем, кто стоит перед ней. */
            $before = isset($data['before']) ? Task::query()->find($data['before']) : null;
            if ($before && $before->id !== $task->id) {
                $prev = Task::query()->where('sort', '<', $before->sort)->whereKeyNot($task->id)->orderByDesc('sort')->first();
                /* Середина между соседями: после ~50 бросков в одну щель точности
                   double не хватит и номера совпадут. Щель стала узкой — сначала
                   перенумеровать все задачи с шагом, порядок не меняется. */
                if ($prev && $before->sort - $prev->sort < self::SORT_GAP) {
                    $this->renumber();
                    [$before, $prev] = [$before->fresh(), $prev->fresh()];
                }
                $task->sort = $prev ? ($prev->sort + $before->sort) / 2 : $before->sort - 1;
            } elseif (! $before) {
                $task->sort = (float) Task::query()->whereKeyNot($task->id)->max('sort') + 1;
            }
            $task->save();
            if (! empty($data['status']) && $data['status'] !== $task->status) {
                $this->applyStatus($task, $me, $data['status']);
            }
        });

        return response()->json(['data' => $this->brief($this->reloadBrief($task))]);
    }

    public function destroy(Request $request, Task $task): Response
    {
        $me = $this->me($request);
        $this->see($task, $me);
        abort_unless($me->can('delete', $task), 403, 'Удалить задачу может постановщик');
        DB::transaction(function () use ($task) {
            Storage::disk('local')->deleteDirectory('tasks/'.$task->id);
            $task->delete();
            Chat::dropEntity('task:'.$task->id);
        });

        return response()->noContent();
    }

    /* ---------- Чек-лист ---------- */

    public function addCheck(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $data = $request->validate(['title' => ['required', 'string', 'max:500']], ['title.required' => 'Напишите пункт']);
        $item = TaskChecklistItem::query()->create([
            'task_id' => $task->id,
            'title' => trim($data['title']),
            'sort' => (int) TaskChecklistItem::query()->where('task_id', $task->id)->max('sort') + 1,
        ]);
        $this->log($task, $me, 'checklist_add', null, $item->title);
        $task->touch();

        return response()->json(['data' => $this->check($item)], 201);
    }

    public function updateCheck(Request $request, TaskChecklistItem $item): JsonResponse
    {
        $me = $this->me($request);
        $task = Task::query()->findOrFail($item->task_id);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $data = $request->validate(['title' => ['sometimes', 'string', 'max:500'], 'done' => ['sometimes', 'boolean']]);
        if (array_key_exists('done', $data) && $data['done'] !== $item->done) {
            $item->done = $data['done'];
            $item->done_by = $data['done'] ? $me->id : null;
            $this->log($task, $me, $data['done'] ? 'checklist_done' : 'checklist_undone', null, $item->title);
        }
        if (isset($data['title']) && trim($data['title']) !== '') {
            $item->title = trim($data['title']);
        }
        $item->save();
        $task->touch();

        return response()->json(['data' => $this->check($item)]);
    }

    public function deleteCheck(Request $request, TaskChecklistItem $item): Response
    {
        $me = $this->me($request);
        $task = Task::query()->findOrFail($item->task_id);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $this->log($task, $me, 'checklist_delete', $item->title, null);
        $item->delete();
        $task->touch();

        return response()->noContent();
    }

    public function orderChecks(Request $request, Task $task): Response
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $data = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']]);
        foreach (array_values($data['ids']) as $sort => $id) {
            TaskChecklistItem::query()->where('task_id', $task->id)->where('id', $id)->update(['sort' => $sort]);
        }

        return response()->noContent();
    }

    /* ---------- Файлы ---------- */

    public function addFiles(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $request->validate(['files' => ['required', 'array', 'max:20'], 'files.*' => ['file', 'max:'.self::FILE_KB]], [
            'files.*.max' => 'Файл больше 50 МБ',
        ]);
        $saved = collect($request->file('files'))->map(function (UploadedFile $upload) use ($task, $me) {
            $file = TaskFile::query()->create([
                'task_id' => $task->id,
                'user_id' => $me->id,
                'name' => Str::limit($upload->getClientOriginalName() ?: 'файл', 250, ''),
                'path' => $upload->store('tasks/'.$task->id, 'local'),
                'mime' => $upload->getMimeType(),
                'size' => $upload->getSize(),
            ]);
            $this->log($task, $me, 'file_add', null, $file->name);

            return $this->file($file);
        });
        $task->touch();

        return response()->json(['data' => $saved], 201);
    }

    public function getFile(Request $request, TaskFile $file): StreamedResponse
    {
        $me = $this->me($request);
        $this->see(Task::query()->findOrFail($file->task_id), $me);
        abort_unless(Storage::disk('local')->exists($file->path), 404);
        $inline = str_starts_with((string) $file->mime, 'image/') && ! $request->boolean('download');

        return Storage::disk('local')->response($file->path, $file->name, [
            'Content-Type' => $inline ? $file->mime : 'application/octet-stream',
            'Cache-Control' => 'private, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        ], $inline ? 'inline' : 'attachment');
    }

    public function deleteFile(Request $request, TaskFile $file): Response
    {
        $me = $this->me($request);
        $task = Task::query()->findOrFail($file->task_id);
        $this->see($task, $me);
        abort_unless($file->user_id === $me->id || $this->editor($task, $me), 403, 'Удалить файл может тот, кто его добавил');
        Storage::disk('local')->delete($file->path);
        $this->log($task, $me, 'file_delete', $file->name, null);
        $file->delete();
        $task->touch();

        return response()->noContent();
    }

    /* ---------- Комментарии ---------- */

    public function addComment(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $data = $request->validate(['body' => ['required', 'string', 'max:20000']], ['body.required' => 'Напишите комментарий']);
        $comment = TaskComment::query()->create(['task_id' => $task->id, 'user_id' => $me->id, 'body' => trim($data['body'])]);
        $task->touch();

        return response()->json(['data' => $this->comment($comment)], 201);
    }

    public function updateComment(Request $request, TaskComment $comment): JsonResponse
    {
        $me = $this->me($request);
        $this->see(Task::query()->findOrFail($comment->task_id), $me);
        abort_unless($comment->user_id === $me->id, 403, 'Править можно свой комментарий');
        $data = $request->validate(['body' => ['required', 'string', 'max:20000']]);
        $comment->update(['body' => trim($data['body']), 'edited_at' => now()]);

        return response()->json(['data' => $this->comment($comment)]);
    }

    public function deleteComment(Request $request, TaskComment $comment): Response
    {
        $me = $this->me($request);
        $task = Task::query()->findOrFail($comment->task_id);
        $this->see($task, $me);
        abort_unless($comment->user_id === $me->id || $me->can('moderate', $task), 403, 'Удалить можно свой комментарий');
        $comment->delete();

        return response()->noContent();
    }

    /* ---------- Учёт времени ---------- */

    /** Таймер: запустить на этой задаче (остановив другой) или остановить. */
    public function timer(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $running = TaskTime::query()->where('user_id', $me->id)->whereNull('stopped_at')->get();
        $wasHere = $running->contains('task_id', $task->id);
        foreach ($running as $entry) {
            $this->stop($entry);
        }
        if (! $wasHere) {
            TaskTime::query()->create(['task_id' => $task->id, 'user_id' => $me->id, 'started_at' => now()]);
            if ($task->status === 'pending') {
                $this->applyStatus($task, $me, 'work');
            }
        }

        return response()->json(['data' => $this->full($task->fresh(), $me)]);
    }

    public function addTime(Request $request, Task $task): JsonResponse
    {
        $me = $this->me($request);
        $this->see($task, $me);
        $this->canWork($task, $me);
        $data = $request->validate([
            'minutes' => ['required', 'integer', 'min:1', 'max:14400'],
            'date' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:250'],
        ], ['minutes.required' => 'Сколько минут?', 'minutes.min' => 'Хотя бы минуту']);
        $start = isset($data['date']) ? Carbon::parse($data['date']) : now()->subMinutes($data['minutes']);
        TaskTime::query()->create([
            'task_id' => $task->id, 'user_id' => $me->id, 'started_at' => $start,
            'stopped_at' => $start->copy()->addMinutes($data['minutes']), 'seconds' => $data['minutes'] * 60,
            'note' => $data['note'] ?? null,
        ]);
        $task->touch();

        return response()->json(['data' => $this->full($task->fresh(), $me)], 201);
    }

    /** Поправить свою запись: сколько, когда, что делали. Идущий таймер не правится. */
    public function updateTime(Request $request, TaskTime $entry): JsonResponse
    {
        $me = $this->me($request);
        $task = Task::query()->findOrFail($entry->task_id);
        $this->see($task, $me);
        abort_unless($entry->user_id === $me->id || $this->isAdmin($me), 403, 'Править можно своё время');
        abort_if($entry->stopped_at === null, 422, 'Сначала остановите таймер');
        $data = $request->validate([
            'minutes' => ['sometimes', 'integer', 'min:1', 'max:14400'],
            'date' => ['sometimes', 'nullable', 'date'],
            'note' => ['sometimes', 'nullable', 'string', 'max:250'],
        ], ['minutes.min' => 'Хотя бы минуту']);
        $minutes = $data['minutes'] ?? intdiv((int) $entry->seconds, 60);
        $start = ! empty($data['date']) ? Carbon::parse($data['date']) : $entry->started_at;
        $entry->update([
            'started_at' => $start,
            'stopped_at' => $start->copy()->addMinutes($minutes),
            'seconds' => array_key_exists('minutes', $data) ? $minutes * 60 : $entry->seconds,
            'note' => array_key_exists('note', $data) ? ($data['note'] ?: null) : $entry->note,
        ]);
        $task->touch();

        return response()->json(['data' => $this->full($task->fresh(), $me)]);
    }

    public function deleteTime(Request $request, TaskTime $entry): Response
    {
        $me = $this->me($request);
        $task = Task::query()->findOrFail($entry->task_id);
        $this->see($task, $me);
        abort_unless($entry->user_id === $me->id || $me->can('moderate', $task), 403, 'Удалить можно своё время');
        $entry->delete();
        $task->touch();

        return response()->noContent();
    }

    /* ---------- Картинки в описаниях (задачи и сделки) ---------- */

    public function uploadImage(Request $request): JsonResponse
    {
        $this->me($request);
        $request->validate(['file' => ['required', 'image', 'max:20480']], ['file.image' => 'Нужна картинка', 'file.max' => 'Картинка больше 20 МБ']);
        $path = $request->file('file')->store('editor', 'local');

        return response()->json(['data' => ['name' => basename($path)]], 201);
    }

    public function image(Request $request, string $name): StreamedResponse
    {
        $this->me($request);
        abort_unless(preg_match('/^[A-Za-z0-9]{20,80}\.[a-z0-9]{2,5}$/', $name), 404);
        $path = 'editor/'.$name;
        abort_unless(Storage::disk('local')->exists($path), 404);
        $mime = Storage::disk('local')->mimeType($path);
        abort_unless(str_starts_with((string) $mime, 'image/') && $mime !== 'image/svg+xml', 404);

        return Storage::disk('local')->response($path, $name, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ], 'inline');
    }

    /* ---------- Внутреннее: правила ---------- */

    private function me(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user && $user->is_active, 401);

        return $user;
    }

    /** Сверх правил задачи: с правом «менять все задачи» (как раньше администратор). */
    private function isAdmin(User $me): bool
    {
        return Access::level($me, 'tasks', 'edit') === 'all';
    }

    private function see(Task $task, User $me): void
    {
        abort_unless($me->can('view', $task), 403, 'Нет доступа к задаче');
    }

    private function editor(Task $task, User $me): bool
    {
        return $me->can('update', $task);
    }

    private function canEdit(Task $task, User $me): void
    {
        abort_unless($this->editor($task, $me), 403, 'Менять задачу могут постановщик и ответственный');
    }

    /** Работать с задачей: постановщик, ответственный, соисполнители. */
    private function canWork(Task $task, User $me): void
    {
        abort_unless($me->can('work', $task), 403, 'Наблюдатель может только комментировать');
    }

    /**
     * Статус по правилам Битрикс24: если задача «с контролем» и завершает
     * не постановщик — она уходит на контроль. Перенос в канбане в колонку
     * «Завершены» ведёт себя так же.
     */
    private function applyStatus(Task $task, User $me, string $status): void
    {
        if ($status === 'done' && $task->needs_review && $task->creator_id !== $me->id && ! $this->isAdmin($me)) {
            $status = 'review';
        }
        if ($status === $task->status) {
            return;
        }
        $old = $task->status;
        $task->status = $status;
        $task->completed_at = $status === 'done' ? now() : null;
        $task->save();
        if (in_array($status, ['done', 'deferred', 'review'], true)) {
            TaskTime::query()->where('task_id', $task->id)->whereNull('stopped_at')->get()->each(fn ($e) => $this->stop($e));
        }
        $this->log($task, $me, 'status', $old, $status);
    }

    private function stop(TaskTime $entry): void
    {
        $entry->stopped_at = now();
        $entry->seconds = max(1, (int) $entry->started_at->diffInSeconds($entry->stopped_at));
        $entry->save();
        Task::query()->whereKey($entry->task_id)->update(['updated_at' => now()]);
    }

    /** Меньше — перенумеровать порядок канбана (см. move). */
    private const SORT_GAP = 1e-6;

    /**
     * Порядок канбана заново: 1024, 2048, … в том же порядке, что видит
     * список (sort, затем новые выше). Без updated_at и version: порядок
     * не меняется, браузеры держат его сами по списку, а не по числам.
     */
    private function renumber(): void
    {
        $ids = Task::query()->orderBy('sort')->orderByDesc('id')->pluck('id');
        $n = 0;
        foreach ($ids->chunk(500) as $chunk) {
            /* В case только целые из базы и счётчика — подставляются как есть. */
            $cases = $chunk->map(function ($id) use (&$n) {
                return 'when '.(int) $id.' then '.(++$n * 1024);
            })->implode(' ');
            DB::table('tasks')->whereIn('id', $chunk->values()->all())->update(['sort' => DB::raw("case id {$cases} end")]);
        }
    }

    private function wouldLoop(Task $task, int $parentId): bool
    {
        for ($id = $parentId, $guard = 0; $id && $guard < 50; $guard++) {
            if ($id === $task->id) {
                return true;
            }
            $id = (int) Task::query()->whereKey($id)->value('parent_id');
        }

        return false;
    }

    private function validated(Request $request, bool $creating): array
    {
        $need = $creating ? 'required' : 'sometimes';

        $data = $request->validate([
            'title' => [$need, 'string', 'max:250'],
            'description' => ['sometimes', 'nullable', 'string', 'max:200000'],
            'status' => ['sometimes', Rule::in(array_keys(Task::STATUSES))],
            'priority' => ['sometimes', Rule::in(array_keys(Task::PRIORITIES))],
            'responsible_id' => ['sometimes', 'integer', Rule::exists('users', 'id')],
            'deadline' => ['sometimes', 'nullable', 'date'],
            'start_at' => ['sometimes', 'nullable', 'date'],
            'needs_review' => ['sometimes', 'boolean'],
            'estimate' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'project' => ['sometimes', 'nullable', 'string', 'max:120'],
            'deal_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'parent_id' => ['sometimes', 'nullable', 'integer', Rule::exists('tasks', 'id')],
            'accomplices' => ['sometimes', 'array', 'max:100'],
            'accomplices.*' => ['integer', Rule::exists('users', 'id')],
            'auditors' => ['sometimes', 'array', 'max:100'],
            'auditors.*' => ['integer', Rule::exists('users', 'id')],
            'tags' => ['sometimes', 'array', 'max:30'],
            'tags.*' => ['string', 'max:60'],
        ], [
            'title.required' => 'Назовите задачу',
            'title.max' => 'Название длиннее 250 знаков',
        ]);
        if (isset($data['title'])) {
            $data['title'] = trim($data['title']);
            abort_if($data['title'] === '', 422, 'Назовите задачу');
        }
        foreach (['deadline', 'start_at'] as $field) {
            if (! empty($data[$field])) {
                $data[$field] = Carbon::parse($data[$field])->setTimezone(config('app.timezone'));
            }
        }
        if (array_key_exists('project', $data)) {
            $data['project'] = trim((string) $data['project']) ?: null;
        }

        return $data;
    }

    private function syncMembers(Task $task, string $role, array $ids, ?User $me = null): void
    {
        $ids = collect($ids)->map(fn ($id) => (int) $id)->unique()->values();
        $had = TaskMember::query()->where('task_id', $task->id)->where('role', $role)->pluck('user_id');
        TaskMember::query()->where('task_id', $task->id)->where('role', $role)->whereNotIn('user_id', $ids)->delete();
        foreach ($ids->diff($had) as $id) {
            TaskMember::query()->create(['task_id' => $task->id, 'user_id' => $id, 'role' => $role]);
        }
        if ($me && $had->sort()->values()->all() !== $ids->sort()->values()->all()) {
            $this->log($task, $me, $role === 'accomplice' ? 'accomplices' : 'auditors', $this->names($had), $this->names($ids));
        }
        $task->unsetRelation('members');
    }

    private function syncTags(Task $task, array $tags, ?User $me = null): void
    {
        $tags = collect($tags)->map(fn ($t) => mb_strtolower(trim(ltrim((string) $t, '#'))))->filter()->unique()->values();
        $had = TaskTag::query()->where('task_id', $task->id)->pluck('name');
        TaskTag::query()->where('task_id', $task->id)->whereNotIn('name', $tags)->delete();
        foreach ($tags->diff($had) as $name) {
            TaskTag::query()->create(['task_id' => $task->id, 'name' => $name]);
        }
        if ($me && $had->sort()->values()->all() !== $tags->sort()->values()->all()) {
            $this->log($task, $me, 'tags', $had->implode(', ') ?: null, $tags->implode(', ') ?: null);
        }
    }

    private function log(Task $task, User $me, string $field, ?string $old, ?string $new): void
    {
        TaskHistory::query()->create([
            'task_id' => $task->id, 'user_id' => $me->id, 'field' => $field,
            'old' => $old === null ? null : Str::limit($old, 500), 'new' => $new === null ? null : Str::limit($new, 500),
        ]);
    }

    private function asText(mixed $value): ?string
    {
        return match (true) {
            $value === null => null,
            $value instanceof \DateTimeInterface => Carbon::instance($value)->toIso8601String(),
            is_bool($value) => $value ? '1' : '0',
            default => (string) $value,
        };
    }

    private function names(Collection $ids): ?string
    {
        if ($ids->isEmpty()) {
            return null;
        }

        return User::query()->whereIn('id', $ids)->orderBy('name')->pluck('name')->implode(', ');
    }

    /* ---------- Внутреннее: ответы ---------- */

    private function reloadBrief(Task $task): Task
    {
        return Task::query()->with(['members', 'tags'])
            ->withCount(['comments', 'files', 'children'])
            ->withCount(['checklist as checklist_total', 'checklist as checklist_done' => fn ($q) => $q->where('done', true)])
            ->withSum('time as time_spent', 'seconds')
            ->findOrFail($task->id);
    }

    private function brief(Task $task): array
    {
        $members = $task->members;

        return [
            'id' => $task->id,
            'parentId' => $task->parent_id,
            'title' => $task->title,
            'status' => $task->status,
            'priority' => $task->priority,
            'creatorId' => $task->creator_id,
            'responsibleId' => $task->responsible_id,
            'accomplices' => $members->where('role', 'accomplice')->pluck('user_id')->values(),
            'auditors' => $members->where('role', 'auditor')->pluck('user_id')->values(),
            'deadline' => $task->deadline?->toIso8601String(),
            'startAt' => $task->start_at?->toIso8601String(),
            'needsReview' => $task->needs_review,
            'estimate' => $task->estimate,
            'project' => $task->project,
            'dealId' => $task->deal_id,
            'tags' => $task->tags->pluck('name')->values(),
            'sort' => $task->sort,
            'checklist' => ['done' => (int) ($task->checklist_done ?? 0), 'total' => (int) ($task->checklist_total ?? 0)],
            'comments' => (int) ($task->comments_count ?? 0),
            'files' => (int) ($task->files_count ?? 0),
            'children' => (int) ($task->children_count ?? 0),
            'timeSpent' => (int) ($task->time_spent ?? 0),
            'completedAt' => $task->completed_at?->toIso8601String(),
            'createdAt' => $task->created_at?->toIso8601String(),
            'updatedAt' => $task->updated_at?->toIso8601String(),
            'version' => (int) $task->version,
        ];
    }

    private function full(Task $task, User $me): array
    {
        $task = $this->reloadBrief($task);
        $task->load(['checklist', 'files', 'comments', 'time', 'history' => fn ($q) => $q->orderByDesc('id')->limit(300)]);
        $children = Task::query()->where('parent_id', $task->id)->with(['members', 'tags'])
            ->withCount(['comments', 'files', 'children'])
            ->withCount(['checklist as checklist_total', 'checklist as checklist_done' => fn ($q) => $q->where('done', true)])
            ->withSum('time as time_spent', 'seconds')->orderBy('id')->get();
        $parent = $task->parent_id ? Task::query()->find($task->parent_id) : null;
        $canSeeParent = $parent && $me->can('view', $parent);
        $working = $me->can('work', $task);

        return [
            ...$this->brief($task),
            'description' => $task->description,
            'checklistItems' => $task->checklist->map(fn ($item) => $this->check($item))->values(),
            'fileItems' => $task->files->sortBy('id')->map(fn ($file) => $this->file($file))->values(),
            'commentItems' => $task->comments->sortBy('id')->map(fn ($c) => $this->comment($c))->values(),
            'timeItems' => $task->time->sortByDesc('started_at')->map(fn ($t) => [
                'id' => $t->id, 'userId' => $t->user_id, 'startedAt' => $t->started_at->toIso8601String(),
                'stoppedAt' => $t->stopped_at?->toIso8601String(), 'seconds' => $t->seconds, 'note' => $t->note,
            ])->values(),
            'historyItems' => $task->history->map(fn ($h) => [
                'id' => $h->id, 'userId' => $h->user_id, 'field' => $h->field, 'old' => $h->old, 'new' => $h->new,
                'at' => $h->created_at?->toIso8601String(),
            ])->values(),
            'childItems' => $children->map(fn ($child) => $this->brief($child))->values(),
            'parent' => $canSeeParent ? ['id' => $parent->id, 'title' => $parent->title, 'status' => $parent->status] : null,
            'can' => [
                'edit' => $this->editor($task, $me),
                'work' => $working,
                'delete' => $me->can('delete', $task),
            ],
        ];
    }

    private function check(TaskChecklistItem $item): array
    {
        return ['id' => $item->id, 'title' => $item->title, 'done' => $item->done, 'doneBy' => $item->done_by, 'sort' => $item->sort];
    }

    private function file(TaskFile $file): array
    {
        return [
            'id' => $file->id, 'name' => $file->name, 'size' => $file->size, 'mime' => $file->mime,
            'image' => str_starts_with((string) $file->mime, 'image/'), 'userId' => $file->user_id,
            'url' => 'task-files/'.$file->id, 'at' => $file->created_at?->toIso8601String(),
        ];
    }

    private function comment(TaskComment $comment): array
    {
        return [
            'id' => $comment->id, 'userId' => $comment->user_id, 'body' => $comment->body,
            'editedAt' => $comment->edited_at?->toIso8601String(), 'at' => $comment->created_at?->toIso8601String(),
        ];
    }
}
