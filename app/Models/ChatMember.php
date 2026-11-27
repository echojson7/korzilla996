<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMember extends Model
{
    protected $fillable = ['chat_id', 'user_id', 'last_read_id', 'is_pinned', 'is_muted', 'marked_unread'];

    protected function casts(): array
    {
        return ['is_pinned' => 'boolean', 'is_muted' => 'boolean', 'marked_unread' => 'boolean'];
    }

    public function chat(): BelongsTo
    {
        return $this->belongsTo(Chat::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
