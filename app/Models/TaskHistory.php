<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskHistory extends Model
{
    protected $table = 'task_history';

    public const UPDATED_AT = null;

    protected $fillable = ['task_id', 'user_id', 'field', 'old', 'new'];
}
