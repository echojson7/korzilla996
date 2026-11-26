<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CrmPipeline extends Model
{
    protected $fillable = ['entity', 'title', 'sort', 'is_default', 'external_id'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'sort' => 'integer'];
    }

    public function stages(): HasMany
    {
        return $this->hasMany(CrmStage::class, 'pipeline_id')->orderBy('sort')->orderBy('id');
    }
}
