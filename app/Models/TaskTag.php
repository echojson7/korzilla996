<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskTag extends Model
{
    public $timestamps = false;

    protected $fillable = ['task_id', 'name'];
}
