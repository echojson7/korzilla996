<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Робот стадии CRM (см. App\Support\Robots\Automation). */
class CrmRobot extends Model
{
    protected $fillable = [
        'entity', 'pipeline_id', 'stage_id', 'type', 'title', 'settings', 'conditions', 'delay', 'active', 'sort', 'note', 'external_ref', 'created_by',
    ];

    protected function casts(): array
    {
        return ['settings' => 'array', 'conditions' => 'array', 'delay' => 'array', 'active' => 'boolean', 'sort' => 'integer'];
    }
}
