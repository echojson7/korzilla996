<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* Меню чата в списке: без звука и «отметить непрочитанным». */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_members', function (Blueprint $table) {
            $table->boolean('is_muted')->default(false);
            $table->boolean('marked_unread')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('chat_members', function (Blueprint $table) {
            $table->dropColumn(['is_muted', 'marked_unread']);
        });
    }
};
