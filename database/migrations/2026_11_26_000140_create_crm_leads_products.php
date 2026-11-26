<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Лиды и товары, как в Битрикс24. Статусы лида — стадии единственной
 * «воронки» с entity = lead (crm_pipelines / crm_stages), свои поля —
 * crm_fields с entity = lead. Контакты лида — список (основной — в
 * contact_id). Товары: каталог crm_products и строки товаров у сделки
 * или лида (crm_product_rows: owner_type deal | lead).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pipeline_id')->constrained('crm_pipelines');
            $table->foreignId('stage_id')->constrained('crm_stages');
            $table->string('title', 250);
            $table->string('name', 250)->nullable();
            $table->string('first_name', 100)->nullable();
            $table->string('last_name', 100)->nullable();
            $table->string('second_name', 100)->nullable();
            $table->string('post', 200)->nullable();
            $table->string('company_title', 250)->nullable();
            $table->json('phones')->nullable();
            $table->json('emails')->nullable();
            $table->json('webs')->nullable();
            $table->string('address', 500)->nullable();
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('currency', 3)->default('RUB');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained('crm_contacts')->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained('crm_companies')->nullOnDelete();
            $table->longText('comments')->nullable();
            $table->json('fields')->nullable();
            $table->boolean('closed')->default(false);
            $table->timestamp('stage_changed_at')->nullable();
            $table->double('sort')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->text('search')->nullable();
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index(['pipeline_id', 'closed', 'stage_id', 'sort']);
            $table->index('responsible_id');
            $table->index('creator_id');
            $table->index('contact_id');
            $table->index('company_id');
        });

        Schema::create('crm_lead_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('crm_leads')->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('crm_contacts')->cascadeOnDelete();
            $table->unsignedInteger('sort')->default(0);
            $table->unique(['lead_id', 'contact_id']);
            $table->index('contact_id');
        });

        Schema::create('crm_products', function (Blueprint $table) {
            $table->id();
            $table->string('name', 500);
            $table->decimal('price', 15, 2)->default(0);
            $table->string('currency', 3)->default('RUB');
            $table->text('description')->nullable();
            $table->string('measure', 30)->nullable();
            $table->boolean('active')->default(true);
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index('name');
        });

        Schema::create('crm_product_rows', function (Blueprint $table) {
            $table->id();
            $table->string('owner_type', 10);
            $table->unsignedBigInteger('owner_id');
            $table->foreignId('product_id')->nullable()->constrained('crm_products')->nullOnDelete();
            $table->string('name', 500);
            $table->decimal('price', 15, 2)->default(0);
            $table->decimal('quantity', 15, 3)->default(1);
            $table->decimal('discount_sum', 15, 2)->default(0);
            $table->decimal('tax_rate', 5, 2)->nullable();
            $table->string('measure', 30)->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index(['owner_type', 'owner_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_product_rows');
        Schema::dropIfExists('crm_products');
        Schema::dropIfExists('crm_lead_contacts');
        Schema::dropIfExists('crm_leads');
    }
};
