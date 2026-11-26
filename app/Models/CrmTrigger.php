<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Триггер стадии CRM: событие переводит сделку на эту стадию. */
class CrmTrigger extends Model
{
    protected $fillable = [
        'entity', 'pipeline_id', 'stage_id', 'type', 'title', 'settings', 'conditions', 'allow_back', 'active', 'sort', 'token', 'external_ref',
    ];

    protected function casts(): array
    {
        return ['settings' => 'array', 'conditions' => 'array', 'allow_back' => 'boolean', 'active' => 'boolean', 'sort' => 'integer'];
    }
}
