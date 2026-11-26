<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskTime extends Model
{
    protected $table = 'task_time';

    protected $fillable = ['task_id', 'user_id', 'started_at', 'stopped_at', 'seconds', 'note'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'stopped_at' => 'datetime'];
    }
}
