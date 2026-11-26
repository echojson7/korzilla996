<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Перенос из Битрикс24: сотрудник и отдел помнят свой ID в Битриксе.
 * По нему сделки, контакты и задачи находят ответственного, а повторный
 * перенос обновляет записи, а не заводит дубли.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('bitrix_id')->nullable()->unique();
        });
        Schema::table('departments', function (Blueprint $table) {
            $table->unsignedInteger('bitrix_id')->nullable()->unique();
            $table->foreignId('parent_id')->nullable()->constrained('departments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
            $table->dropUnique(['bitrix_id']);
            $table->dropColumn('bitrix_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['bitrix_id']);
            $table->dropColumn('bitrix_id');
        });
    }
};
