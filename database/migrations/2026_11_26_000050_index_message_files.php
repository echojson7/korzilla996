<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Вложения сообщений ищутся по message_id в каждой ленте чата и в списке
 * чатов (with('files')), а при удалении сообщения или чата их чистит
 * каскад. MySQL индексирует внешний ключ сам, SQLite — нет: без индекса
 * каждая такая выборка перебирает всю таблицу файлов.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('message_files', fn (Blueprint $table) => $table->index('message_id', 'message_files_message_idx'));
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('message_files', fn (Blueprint $table) => $table->dropIndex('message_files_message_idx'));
        }
    }
};
