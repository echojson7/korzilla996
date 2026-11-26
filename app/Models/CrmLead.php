<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmLead extends Model
{
    protected $table = 'crm_leads';

    protected $guarded = ['id'];

    /* Строка поиска (App\Support\CrmSearch) — при каждой записи. */
    protected static function booted(): void
    {
        static::saving(fn (self $one) => $one->search = \App\Support\CrmSearch::of('crm_leads', $one->getAttributes()));
    }

    protected function casts(): array
    {
        return ['phones' => 'array', 'emails' => 'array', 'webs' => 'array', 'fields' => 'array', 'amount' => 'float', 'closed' => 'boolean', 'stage_changed_at' => 'datetime'];
    }

    public function stage(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(CrmStage::class, 'stage_id');
    }
}
