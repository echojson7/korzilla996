<?php

use App\Support\GeneralChat;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* Канал «Changelog»: все сотрудники читают, пишут владелец и администраторы. */
return new class extends Migration
{
    public function up(): void
    {
        GeneralChat::sync();
    }

    public function down(): void
    {
        DB::table('chats')->where('entity', GeneralChat::CHANGELOG)->delete();
    }
};
