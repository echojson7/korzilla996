<?php

use App\Support\CrmSearch;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Строка для поиска в нижнем регистре: LIKE в SQLite не сворачивает
 * кириллицу, и «ромашка» не находила «Ромашка». Заполняет
 * App\Support\CrmSearch при записи; здесь — для уже перенесённого.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['crm_companies', 'crm_contacts', 'crm_deals'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->text('search')->nullable());
            DB::table($table)->orderBy('id')->chunkById(1000, function ($rows) use ($table) {
                DB::transaction(function () use ($rows, $table) {
                    foreach ($rows as $row) {
                        DB::table($table)->where('id', $row->id)->update(['search' => CrmSearch::of($table, (array) $row)]);
                    }
                });
            });
        }
    }

    public function down(): void
    {
        foreach (['crm_companies', 'crm_contacts', 'crm_deals'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn('search'));
        }
    }
};
