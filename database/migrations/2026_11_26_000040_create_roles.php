<?php

use App\Support\Access;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Роли и наборы прав как в Битрикс24. У сотрудника одна роль
 * (users.role — ключ роли). Владелец и администратор — системные, им можно
 * всё; «Сотрудник» — набор по умолчанию, его права правятся; свои роли
 * заводятся в настройках.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('name', 80);
            $table->boolean('system')->default(false);
            $table->json('permissions')->nullable();
            $table->unsignedInteger('sort')->default(100);
            $table->timestamps();
        });

        $now = now();
        DB::table('roles')->insert([
            ['key' => 'owner', 'name' => 'Владелец', 'system' => true, 'permissions' => null, 'sort' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'admin', 'name' => 'Администратор', 'system' => true, 'permissions' => null, 'sort' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'staff', 'name' => 'Сотрудник', 'system' => true, 'permissions' => json_encode(Access::defaults()), 'sort' => 3, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        $custom = DB::table('roles')->where('system', false)->pluck('key');
        DB::table('users')->whereIn('role', $custom)->update(['role' => 'staff']);
        Schema::dropIfExists('roles');
    }
};
