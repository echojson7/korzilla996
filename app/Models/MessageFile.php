<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageFile extends Model
{
    /** Картинки, которые можно показать прямо в ленте (без SVG: в нём бывает код). */
    public const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    /* Видео, которое браузер покажет сам (ролики в Changelog и т. п.). */
    public const VIDEOS = ['video/mp4', 'video/webm'];

    protected $fillable = ['message_id', 'name', 'path', 'mime', 'size', 'width', 'height'];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class)->withTrashed();
    }

    public function isVideo(): bool
    {
        return in_array($this->mime, self::VIDEOS, true);
    }

    public function isImage(): bool
    {
        return in_array($this->mime, self::IMAGES, true);
    }
}
