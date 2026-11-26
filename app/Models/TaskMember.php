<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskMember extends Model
{
    public $timestamps = false;

    protected $fillable = ['task_id', 'user_id', 'role'];
}
