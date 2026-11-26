<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Real-time для всего портала.
 *
 * realtime_events — журнал «что поменялось» у каждого сотрудника: по нему
 * вкладка после обрыва связи догружает пропущенное, а без Mercure
 * работает лёгкий опрос. Строки старше трёх суток удаляются.
 *
 * tasks.version — номер правки задачи: браузер не перетирает свежие
 * данные старыми, если ответы пришли не по порядку.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('realtime_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            /* task, deal, … */
            $table->string('type', 20);
            $table->unsignedBigInteger('entity_id');
            $table->timestamp('created_at')->nullable()->index();
            $table->index(['user_id', 'id']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedInteger('version')->default(1);
            /* Под выборки «мои задачи» и порядок канбана на больших списках. */
            $table->index('responsible_id', 'tasks_responsible_idx');
            $table->index('creator_id', 'tasks_creator_idx');
            $table->index(['sort', 'id'], 'tasks_sort_idx');
            $table->index('updated_at', 'tasks_updated_idx');
        });

        /* MySQL сам индексирует внешние ключи, SQLite — нет: без индекса
           счётчики в списке задач (чек-лист, файлы, время) идут перебором. */
        if (DB::getDriverName() === 'sqlite') {
            foreach (self::CHILDREN as $name) {
                Schema::table($name, fn (Blueprint $table) => $table->index('task_id', $name.'_task_idx'));
            }
            Schema::table('tasks', fn (Blueprint $table) => $table->index('parent_id', 'tasks_parent_idx'));
        }
    }

    private const CHILDREN = ['task_checklist', 'task_files', 'task_comments', 'task_time', 'task_history'];

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            foreach (self::CHILDREN as $name) {
                Schema::table($name, fn (Blueprint $table) => $table->dropIndex($name.'_task_idx'));
            }
            Schema::table('tasks', fn (Blueprint $table) => $table->dropIndex('tasks_parent_idx'));
        }
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex('tasks_responsible_idx');
            $table->dropIndex('tasks_creator_idx');
            $table->dropIndex('tasks_sort_idx');
            $table->dropIndex('tasks_updated_idx');
            $table->dropColumn('version');
        });
        Schema::dropIfExists('realtime_events');
    }
};
