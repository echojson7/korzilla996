<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;
use App\Support\Realtime;

class Chat extends Model
{
    public const TYPES = ['direct', 'group'];

    protected $fillable = ['type', 'title', 'avatar', 'direct_key', 'entity', 'created_by', 'last_message_at'];

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime'];
    }

    public function members(): HasMany
    {
        return $this->hasMany(ChatMember::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'chat_members')->withPivot('last_read_id')->withTimestamps();
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    /** Удалить чат вместе с файлами и аватаркой; участникам — обновить список. */
    public function drop(): void
    {
        $members = $this->members()->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        Storage::disk('local')->deleteDirectory('messenger/'.$this->id);
        if ($this->avatar) {
            Storage::disk('local')->delete($this->avatar);
        }
        $this->delete();
        if ($members) {
            Realtime::emit($members, 'chat', ['chatId' => $this->id]);
        }
    }

    /** Чат сущности (task:12) уходит вместе с ней: иначе остаётся «сирота» без задачи. */
    public static function dropEntity(string $entity): void
    {
        static::query()->where('entity', $entity)->get()->each->drop();
    }

    public static function directKey(int $a, int $b): string
    {
        return min($a, $b).':'.max($a, $b);
    }
}
