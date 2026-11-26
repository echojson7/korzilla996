<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * CRM как в Битрикс24: у сущности (пока сделки, дальше контакты, компании,
 * смарт-процессы) — воронки со стадиями и набор полей, который
 * администратор правит сам. Значения своих полей лежат в JSON-колонке
 * fields записи: новое поле заводится из интерфейса, без миграций.
 *
 * Стадия: semantic — process (в работе), success (успех), failure (провал).
 * external_id — ключ в Битрикс24 (воронка CATEGORY_ID, стадия STATUS_ID,
 * сделка ID, поле UF_CRM_…): по нему импорт не плодит дубли.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_pipelines', function (Blueprint $table) {
            $table->id();
            $table->string('entity', 40)->default('deal');
            $table->string('title', 120);
            $table->integer('sort')->default(100);
            $table->boolean('is_default')->default(false);
            $table->string('external_id', 40)->nullable();
            $table->timestamps();
            $table->unique(['entity', 'external_id']);
        });

        Schema::create('crm_stages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pipeline_id')->constrained('crm_pipelines')->cascadeOnDelete();
            $table->string('title', 120);
            $table->string('color', 9)->default('#39a8ef');
            $table->string('semantic', 10)->default('process');
            $table->integer('sort')->default(100);
            $table->string('external_id', 60)->nullable();
            $table->timestamps();
            $table->index(['pipeline_id', 'sort']);
        });

        Schema::create('crm_fields', function (Blueprint $table) {
            $table->id();
            $table->string('entity', 40)->default('deal');
            $table->string('code', 60);
            $table->string('title', 200);
            /* string, text, number, date, datetime, boolean, list, user, url, file. */
            $table->string('type', 20);
            $table->boolean('multiple')->default(false);
            $table->boolean('required')->default(false);
            /* Варианты списка: [{id, label}]. */
            $table->json('options')->nullable();
            /* Блок в карточке («О сделке», «Договор»…); пусто — «Дополнительно». */
            $table->string('section', 80)->nullable();
            $table->integer('sort')->default(100);
            $table->boolean('show_in_list')->default(false);
            $table->boolean('show_on_kanban')->default(false);
            /* Выключенное поле не видно в карточке, значения сохраняются. */
            $table->boolean('active')->default(true);
            $table->string('external_code', 60)->nullable();
            $table->timestamps();
            $table->unique(['entity', 'code']);
        });

        Schema::create('crm_deals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pipeline_id')->constrained('crm_pipelines');
            $table->foreignId('stage_id')->constrained('crm_stages');
            $table->string('title', 250);
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('currency', 3)->default('RUB');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            /* До этапа 2 (контакты и компании) — просто текст. */
            $table->string('company', 250)->nullable();
            $table->string('contact', 250)->nullable();
            $table->date('close_date')->nullable();
            /* Комментарий в Markdown. */
            $table->longText('comments')->nullable();
            $table->json('fields')->nullable();
            /* Порядок в колонке канбана. */
            $table->double('sort')->default(0);
            $table->boolean('closed')->default(false);
            $table->timestamp('stage_changed_at')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index(['pipeline_id', 'closed', 'stage_id', 'sort']);
            $table->index('responsible_id');
            $table->index('creator_id');
        });

        Schema::create('crm_deal_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('deal_id')->constrained('crm_deals')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('field', 60);
            $table->text('old')->nullable();
            $table->text('new')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['deal_id', 'id']);
        });

        /* Воронка по умолчанию: без неё сделку некуда положить. */
        $now = now();
        $pipeline = DB::table('crm_pipelines')->insertGetId(['entity' => 'deal', 'title' => 'Общая', 'sort' => 100, 'is_default' => true, 'created_at' => $now, 'updated_at' => $now]);
        foreach ([['Новая', '#39a8ef', 'process'], ['В работе', '#ffa900', 'process'], ['Сделка успешна', '#7bd500', 'success'], ['Сделка провалена', '#ff5752', 'failure']] as $i => [$title, $color, $semantic]) {
            DB::table('crm_stages')->insert(['pipeline_id' => $pipeline, 'title' => $title, 'color' => $color, 'semantic' => $semantic, 'sort' => ($i + 1) * 10, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_deal_history');
        Schema::dropIfExists('crm_deals');
        Schema::dropIfExists('crm_fields');
        Schema::dropIfExists('crm_stages');
        Schema::dropIfExists('crm_pipelines');
    }
};
