<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Смарт-процессы, как в Битрикс24 («Договоры», «Претензии»…): тип,
 * его воронки и стадии — crm_pipelines / crm_stages с entity = smart:{id},
 * свои поля — crm_fields с тем же entity, элементы — crm_smart_items
 * (связь со сделкой, лидом, компанией и контактом, как в Битриксе).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_smart_types', function (Blueprint $table) {
            $table->id();
            $table->string('title', 120);
            $table->unsignedInteger('bitrix_type')->nullable()->unique();
            $table->integer('sort')->default(100);
            $table->timestamps();
        });

        Schema::create('crm_smart_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('type_id')->constrained('crm_smart_types')->cascadeOnDelete();
            $table->foreignId('pipeline_id')->nullable()->constrained('crm_pipelines')->nullOnDelete();
            $table->foreignId('stage_id')->nullable()->constrained('crm_stages')->nullOnDelete();
            $table->string('title', 250);
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('currency', 3)->default('RUB');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('deal_id')->nullable()->constrained('crm_deals')->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('crm_leads')->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('crm_companies')->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained('crm_contacts')->nullOnDelete();
            $table->date('begin_date')->nullable();
            $table->date('close_date')->nullable();
            $table->boolean('closed')->default(false);
            $table->json('fields')->nullable();
            $table->text('search')->nullable();
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index(['type_id', 'stage_id']);
            $table->index('deal_id');
            $table->index('lead_id');
            $table->index('company_id');
            $table->index('responsible_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_smart_items');
        Schema::dropIfExists('crm_smart_types');
    }
};
