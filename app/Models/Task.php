<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    /** Статусы как в Битрикс24. */
    public const STATUSES = [
        'pending' => 'Ждёт выполнения',
        'work' => 'Выполняется',
        'review' => 'Ждёт контроля',
        'deferred' => 'Отложена',
        'done' => 'Завершена',
    ];

    public const PRIORITIES = ['low' => 'Низкий', 'normal' => 'Обычный', 'high' => 'Высокий'];

    protected $fillable = [
        'parent_id', 'title', 'description', 'status', 'priority', 'creator_id', 'responsible_id',
        'deadline', 'start_at', 'needs_review', 'estimate', 'project', 'deal_id', 'sort', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'deadline' => 'datetime',
            'start_at' => 'datetime',
            'completed_at' => 'datetime',
            'needs_review' => 'boolean',
            'sort' => 'float',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Task::class, 'parent_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(TaskMember::class);
    }

    public function tags(): HasMany
    {
        return $this->hasMany(TaskTag::class);
    }

    public function checklist(): HasMany
    {
        return $this->hasMany(TaskChecklistItem::class)->orderBy('sort')->orderBy('id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(TaskFile::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class);
    }

    public function time(): HasMany
    {
        return $this->hasMany(TaskTime::class);
    }

    public function history(): HasMany
    {
        return $this->hasMany(TaskHistory::class);
    }

    /** Ид всех участников: постановщик, ответственный, соисполнители, наблюдатели. */
    public function participantIds(): array
    {
        $ids = $this->members->pluck('user_id')->all();
        $ids[] = $this->creator_id;
        $ids[] = $this->responsible_id;

        return array_values(array_unique(array_filter($ids)));
    }
}
