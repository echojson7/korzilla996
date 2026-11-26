<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Запуск робота для записи: очередь и журнал. */
class CrmRobotRun extends Model
{
    protected $fillable = ['robot_id', 'entity', 'entity_id', 'stage_id', 'user_id', 'run_at', 'status', 'result', 'attempts', 'finished_at'];

    protected function casts(): array
    {
        return ['run_at' => 'datetime', 'finished_at' => 'datetime', 'attempts' => 'integer'];
    }

    public function robot(): BelongsTo
    {
        return $this->belongsTo(CrmRobot::class, 'robot_id');
    }
}
