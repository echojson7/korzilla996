<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Когда сотрудник дочитал чат до сообщения upto_id: по этим отметкам
 * видно, кто и когда просмотрел сообщение («Просмотрено» в меню).
 * Строка — на каждое продвижение отметки прочитанного, не на сообщение.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('upto_id');
            $table->timestamp('created_at')->nullable();
            $table->index(['chat_id', 'user_id', 'upto_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_reads');
    }
};
