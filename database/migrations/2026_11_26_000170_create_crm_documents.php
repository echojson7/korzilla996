<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Документы из шаблонов, как в Битрикс24 (договоры, КП, допсоглашения,
 * акты, счета-оферты): файл лежит у нас (storage/app/crm-documents),
 * владелец — сделка, лид, счёт или элемент смарт-процесса. bitrix_type и
 * bitrix_owner — откуда он в Битриксе: по ним документ привязывается к
 * сущности, которая переедет позже (смарт-процессы).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_documents', function (Blueprint $table) {
            $table->id();
            $table->string('title', 250);
            $table->string('number', 100)->nullable();
            $table->string('template', 250)->nullable();
            $table->string('owner_type', 20)->nullable();
            $table->unsignedBigInteger('owner_id')->nullable();
            $table->unsignedInteger('bitrix_type')->nullable();
            $table->string('bitrix_owner', 40)->nullable();
            $table->string('path')->nullable();
            $table->string('file_name')->nullable();
            $table->string('mime', 128)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index(['owner_type', 'owner_id']);
            $table->index(['bitrix_type', 'bitrix_owner']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_documents');
    }
};
