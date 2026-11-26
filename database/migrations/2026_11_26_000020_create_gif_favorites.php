<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Избранные GIF и стикеры: у каждого сотрудника свои. item — карточка
 * в том виде, в каком её отдаёт App\Support\Gifs (адреса превью и
 * полной картинки), поэтому вкладке «Избранное» сервис не нужен.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gif_favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            /* klipy:gif:slug — сервис, вид и id у сервиса. */
            $table->string('key', 191);
            $table->json('item');
            $table->timestamps();
            $table->unique(['user_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gif_favorites');
    }
};
