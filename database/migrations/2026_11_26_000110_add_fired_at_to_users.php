<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * «Уволен» — как в Битрикс24: пометка у сотрудника рядом с ролью.
 * Уволенный не входит (учётка выключена), но остаётся ответственным
 * в старых сделках и задачах. Выключенная учётка без пометки — просто
 * ещё не начал работать или временно закрыт доступ.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->timestamp('fired_at')->nullable());
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('fired_at'));
    }
};
