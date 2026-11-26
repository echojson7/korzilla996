<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/* Все контакты сделки, как в Битрикс24 (основной — crm_deals.contact_id). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_deal_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('deal_id')->constrained('crm_deals')->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('crm_contacts')->cascadeOnDelete();
            $table->unsignedInteger('sort')->default(0);
            $table->unique(['deal_id', 'contact_id']);
            $table->index('contact_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_deal_contacts');
    }
};
