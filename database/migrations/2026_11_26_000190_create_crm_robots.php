<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Роботы и триггеры CRM как в Битрикс24 (App\Support\Robots).
 *
 * Робот висит на стадии: сделка вошла на стадию — робот ставится в очередь
 * crm_robot_runs (сразу или с задержкой), при выполнении проверяет условие
 * и делает действие (задача, уведомление, поле, стадия…). Ушла сделка со
 * стадии — ждущие роботы старой стадии отменяются.
 *
 * Триггер тоже висит на стадии: событие (задача завершена, поле изменилось,
 * внешний вебхук) переводит сделку на его стадию.
 *
 * settings — параметры действия/события, conditions — [{field, op, value,
 * join}], delay — {type: now|after|field, value, unit, field}.
 * external_ref — откуда перенесён (БП Битрикс24), чтобы повтор не плодил дубли.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_robots', function (Blueprint $table) {
            $table->id();
            $table->string('entity', 40)->default('deal');
            $table->foreignId('pipeline_id')->constrained('crm_pipelines')->cascadeOnDelete();
            $table->foreignId('stage_id')->constrained('crm_stages')->cascadeOnDelete();
            $table->string('type', 30);
            $table->string('title', 250);
            $table->json('settings')->nullable();
            $table->json('conditions')->nullable();
            $table->json('delay')->nullable();
            $table->boolean('active')->default(true);
            $table->integer('sort')->default(100);
            $table->text('note')->nullable();
            $table->string('external_ref', 120)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['stage_id', 'active', 'sort']);
            $table->index('external_ref');
        });

        Schema::create('crm_triggers', function (Blueprint $table) {
            $table->id();
            $table->string('entity', 40)->default('deal');
            $table->foreignId('pipeline_id')->constrained('crm_pipelines')->cascadeOnDelete();
            $table->foreignId('stage_id')->constrained('crm_stages')->cascadeOnDelete();
            $table->string('type', 30);
            $table->string('title', 250);
            $table->json('settings')->nullable();
            $table->json('conditions')->nullable();
            /* Можно ли вернуть сделку на стадию раньше текущей. */
            $table->boolean('allow_back')->default(false);
            $table->boolean('active')->default(true);
            $table->integer('sort')->default(100);
            /* Ключ внешнего вебхука: POST api/crm/hook/{token}. */
            $table->string('token', 64)->nullable()->unique();
            $table->string('external_ref', 120)->nullable();
            $table->timestamps();
            $table->index(['pipeline_id', 'type', 'active']);
        });

        Schema::create('crm_robot_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('robot_id')->constrained('crm_robots')->cascadeOnDelete();
            $table->string('entity', 40)->default('deal');
            $table->unsignedBigInteger('entity_id');
            /* Стадия, на которой робот поставлен: ушла сделка — не выполнять. */
            $table->unsignedBigInteger('stage_id');
            /* Кто перевёл сделку: от его имени пишется история. */
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('run_at');
            /* pending, done, skipped (условие/ушла со стадии), failed, cancelled. */
            $table->string('status', 12)->default('pending');
            $table->text('result')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'run_at']);
            $table->index(['entity', 'entity_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_robot_runs');
        Schema::dropIfExists('crm_triggers');
        Schema::dropIfExists('crm_robots');
    }
};
