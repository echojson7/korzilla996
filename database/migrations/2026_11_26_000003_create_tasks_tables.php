<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Задачи как в Битрикс24: постановщик, ответственный, соисполнители и
 * наблюдатели, статусы (ждёт, выполняется, на контроле, отложена,
 * завершена), срок, приоритет, проект, теги, связь со сделкой, подзадачи,
 * чек-лист, файлы, учёт времени, комментарии и история изменений.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->string('title', 250);
            /* Описание в Markdown. */
            $table->longText('description')->nullable();
            /* pending, work, review, deferred, done. */
            $table->string('status', 12)->default('pending')->index();
            /* low, normal, high. */
            $table->string('priority', 8)->default('normal');
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('deadline')->nullable()->index();
            $table->timestamp('start_at')->nullable();
            /* Принять работу после завершения: ответственный сдаёт на контроль. */
            $table->boolean('needs_review')->default(false);
            /* Плановые трудозатраты, минуты. */
            $table->unsignedInteger('estimate')->nullable();
            $table->string('project', 120)->nullable()->index();
            /* Сделка пока из демо-данных — без внешнего ключа. */
            $table->unsignedBigInteger('deal_id')->nullable()->index();
            /* Порядок в канбане. */
            $table->double('sort')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        /* Соисполнители (accomplice) и наблюдатели (auditor). */
        Schema::create('task_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 10);
            $table->unique(['task_id', 'user_id', 'role']);
            $table->index('user_id');
        });

        Schema::create('task_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->unique(['task_id', 'name']);
            $table->index('name');
        });

        Schema::create('task_checklist', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->string('title', 500);
            $table->boolean('done')->default(false);
            $table->unsignedInteger('sort')->default(0);
            $table->foreignId('done_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('task_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('path');
            $table->string('mime', 128)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();
        });

        Schema::create('task_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();
        });

        /* Учёт времени: запись с таймера (stopped_at пусто — идёт) или вручную. */
        Schema::create('task_time', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('stopped_at')->nullable();
            $table->unsignedInteger('seconds')->default(0);
            $table->string('note', 250)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'stopped_at']);
        });

        Schema::create('task_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('field', 32);
            $table->text('old')->nullable();
            $table->text('new')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        foreach (['task_history', 'task_time', 'task_comments', 'task_files', 'task_checklist', 'task_tags', 'task_members', 'tasks'] as $name) {
            Schema::dropIfExists($name);
        }
    }
};
