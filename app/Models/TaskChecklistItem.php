<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskChecklistItem extends Model
{
    protected $table = 'task_checklist';

    protected $fillable = ['task_id', 'title', 'done', 'sort', 'done_by'];

    protected function casts(): array
    {
        return ['done' => 'boolean'];
    }
}
