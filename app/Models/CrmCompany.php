<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmCompany extends Model
{
    protected $table = 'crm_companies';

    protected $guarded = ['id'];

    /* Строка поиска (App\Support\CrmSearch) — при каждой записи. */
    protected static function booted(): void
    {
        static::saving(fn (self $one) => $one->search = \App\Support\CrmSearch::of('crm_companies', $one->getAttributes()));
    }

    protected function casts(): array
    {
        return [
            'phones' => 'array',
            'emails' => 'array',
            'fields' => 'array',
            'webs' => 'array',
        ];
    }

    public function deals(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(CrmDeal::class, 'company_id');
    }
}
