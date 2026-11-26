<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Чат сущности: у задачи, сделки, проекта свой групповой чат, как в
 * Битрикс24. entity — «вид:id», например «task:12». Один чат на сущность.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chats', function (Blueprint $table) {
            $table->string('entity', 64)->nullable()->unique()->after('direct_key');
        });
    }

    public function down(): void
    {
        Schema::table('chats', function (Blueprint $table) {
            $table->dropUnique(['entity']);
            $table->dropColumn('entity');
        });
    }
};
