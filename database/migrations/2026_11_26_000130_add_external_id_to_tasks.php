<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* ID задачи в Битрикс24: повторный перенос не заводит дубли. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('external_id', 40)->nullable()->unique();
            $table->index(['status', 'completed_at'], 'tasks_status_completed_idx');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex('tasks_status_completed_idx');
            $table->dropUnique(['external_id']);
            $table->dropColumn('external_id');
        });
    }
};
