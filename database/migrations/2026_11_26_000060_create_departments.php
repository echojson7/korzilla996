<?php

use App\Models\Department;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Отделы — справочник, а не свободный текст у сотрудника. Права уровня
 * «отдел» сравнивали строки, и «Продажи», «продажи» и «Продажи » были
 * тремя разными отделами. key — имя в нижнем регистре без лишних пробелов:
 * по нему одинаковые по смыслу названия сходятся в один отдел (NOCASE в
 * SQLite кириллицу не сворачивает).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('key', 120)->unique();
            $table->timestamps();
        });
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('position')->constrained()->nullOnDelete();
            $table->index('department_id', 'users_department_idx');
        });

        $now = now();
        foreach (DB::table('users')->whereNotNull('department')->orderBy('id')->get(['id', 'department']) as $row) {
            $name = Department::clean($row->department);
            if ($name === null) {
                continue;
            }
            $key = Department::keyOf($name);
            $id = DB::table('departments')->where('key', $key)->value('id')
                ?? DB::table('departments')->insertGetId(['name' => $name, 'key' => $key, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('users')->where('id', $row->id)->update(['department_id' => $id]);
        }

        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('department'));
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->string('department')->nullable()->after('position'));
        foreach (DB::table('departments')->get(['id', 'name']) as $row) {
            DB::table('users')->where('department_id', $row->id)->update(['department' => $row->name]);
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_department_idx');
            $table->dropConstrainedForeignId('department_id');
        });
        Schema::dropIfExists('departments');
    }
};
