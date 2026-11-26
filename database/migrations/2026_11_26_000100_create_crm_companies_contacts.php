<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Компании и контакты CRM, как в Битрикс24. Телефоны и почты — списки
 * [{value, type}] (WORK, MOBILE, HOME…), свои поля — JSON fields, как у
 * сделок. Сделка ссылается на компанию и основной контакт; текстовые
 * company и contact в сделке остаются подписью для канбана и поиска.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_companies', function (Blueprint $table) {
            $table->id();
            $table->string('title', 250);
            $table->string('type', 40)->nullable();
            $table->string('industry', 60)->nullable();
            $table->json('phones')->nullable();
            $table->json('emails')->nullable();
            $table->json('webs')->nullable();
            $table->string('address', 500)->nullable();
            $table->longText('comments')->nullable();
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('fields')->nullable();
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index('title');
            $table->index('responsible_id');
        });

        Schema::create('crm_contacts', function (Blueprint $table) {
            $table->id();
            $table->string('name', 250);
            $table->string('first_name', 100)->nullable();
            $table->string('last_name', 100)->nullable();
            $table->string('second_name', 100)->nullable();
            $table->string('post', 200)->nullable();
            $table->json('phones')->nullable();
            $table->json('emails')->nullable();
            $table->foreignId('company_id')->nullable()->constrained('crm_companies')->nullOnDelete();
            $table->date('birthday')->nullable();
            $table->longText('comments')->nullable();
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('fields')->nullable();
            $table->string('external_id', 40)->nullable()->unique();
            $table->timestamps();
            $table->index('name');
            $table->index('company_id');
            $table->index('responsible_id');
        });

        Schema::table('crm_deals', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->constrained('crm_companies')->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained('crm_contacts')->nullOnDelete();
            $table->index('company_id', 'crm_deals_company_idx');
            $table->index('contact_id', 'crm_deals_contact_idx');
        });
    }

    public function down(): void
    {
        Schema::table('crm_deals', function (Blueprint $table) {
            $table->dropIndex('crm_deals_company_idx');
            $table->dropIndex('crm_deals_contact_idx');
            $table->dropConstrainedForeignId('company_id');
            $table->dropConstrainedForeignId('contact_id');
        });
        Schema::dropIfExists('crm_contacts');
        Schema::dropIfExists('crm_companies');
    }
};
