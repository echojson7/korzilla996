<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CrmDeal extends Model
{
    protected $fillable = [
        'pipeline_id', 'stage_id', 'title', 'amount', 'currency', 'responsible_id', 'creator_id', 'company', 'contact',
        'close_date', 'comments', 'fields', 'sort', 'closed', 'stage_changed_at', 'external_id', 'created_at', 'updated_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'fields' => 'array',
            'sort' => 'float',
            'closed' => 'boolean',
            'close_date' => 'date',
            'stage_changed_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(CrmPipeline::class, 'pipeline_id');
    }

    public function stage(): BelongsTo
    {
        return $this->belongsTo(CrmStage::class, 'stage_id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(CrmDealHistory::class, 'deal_id');
    }

    /** Чьи это сделки для прав «свои» и «отдела». */
    public function ownerIds(): array
    {
        return array_values(array_unique(array_filter([(int) $this->responsible_id, (int) $this->creator_id])));
    }
}
