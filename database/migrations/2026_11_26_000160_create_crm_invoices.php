<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Счета, как в Битрикс24: и старые (crm.invoice), и новые (смарт-счета,
 * entityTypeId 31) — в одной таблице. Статус — название и смысл
 * (process / success — оплачен / failure — отклонён), товары — в
 * crm_product_rows с owner_type = invoice. external_id: «o123» — старый,
 * «n45» — новый счёт Битрикса.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('number', 100)->nullable();
            $table->string('title', 250)->nullable();
            $table->string('status', 60)->nullable();
            $table->string('status_title', 120)->nullable();
            $table->string('semantic', 10)->default('process');
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('currency', 3)->default('RUB');
            $table->date('date_bill')->nullable();
            $table->date('pay_before')->nullable();
            $table->date('paid_at')->nullable();
            $table->foreignId('deal_id')->nullable()->constrained('crm_deals')->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('crm_leads')->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('crm_companies')->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained('crm_contacts')->nullOnDelete();
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->longText('comments')->nullable();
            $table->json('fields')->nullable();
            $table->text('search')->nullable();
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index('deal_id');
            $table->index('lead_id');
            $table->index('company_id');
            $table->index('contact_id');
            $table->index('responsible_id');
            $table->index('date_bill');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_invoices');
    }
};
