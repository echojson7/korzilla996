<?php

use App\Support\GeneralChat;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* Общий чат портала со всеми действующими сотрудниками. */
return new class extends Migration
{
    public function up(): void
    {
        GeneralChat::sync();
    }

    public function down(): void
    {
        $id = DB::table('chats')->where('entity', GeneralChat::ENTITY)->value('id');
        if ($id) {
            DB::table('chats')->where('id', $id)->delete();
        }
    }
};
