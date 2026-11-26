<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Профиль сотрудника: аватар (версия набора картинок разных размеров,
 * см. App\Support\Avatars), контакты, о себе, день рождения и статус
 * вроде «В отпуске до 5 декабря».
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar', 64)->nullable()->after('department');
            $table->string('phone', 40)->nullable()->after('avatar');
            $table->json('messengers')->nullable()->after('phone');
            $table->text('about')->nullable()->after('messengers');
            $table->date('birthday')->nullable()->after('about');
            $table->boolean('birthday_year_hidden')->default(false)->after('birthday');
            $table->string('status_emoji', 16)->nullable()->after('birthday_year_hidden');
            $table->string('status_text', 80)->nullable()->after('status_emoji');
            $table->timestamp('status_until')->nullable()->after('status_text');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['avatar', 'phone', 'messengers', 'about', 'birthday', 'birthday_year_hidden', 'status_emoji', 'status_text', 'status_until']);
        });
    }
};
