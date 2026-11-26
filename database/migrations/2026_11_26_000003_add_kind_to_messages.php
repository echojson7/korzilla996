<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Системные сообщения в ленте чата: «создаёт чат», «добавляет в чат»,
 * «выходит из чата». kind — text или system, meta — подробности события.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->string('kind', 16)->default('text')->after('user_id');
            $table->json('meta')->nullable()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn(['kind', 'meta']);
        });
    }
};
