<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CrmStage extends Model
{
    public const SEMANTICS = ['process' => 'В работе', 'success' => 'Успех', 'failure' => 'Провал'];

    protected $fillable = ['pipeline_id', 'title', 'color', 'semantic', 'sort', 'external_id'];

    protected function casts(): array
    {
        return ['sort' => 'integer'];
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(CrmPipeline::class, 'pipeline_id');
    }

    public function isClosed(): bool
    {
        return $this->semantic !== 'process';
    }
}
