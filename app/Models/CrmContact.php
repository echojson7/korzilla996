<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmContact extends Model
{
    protected $table = 'crm_contacts';

    protected $guarded = ['id'];

    /* Строка поиска (App\Support\CrmSearch) — при каждой записи. */
    protected static function booted(): void
    {
        static::saving(fn (self $one) => $one->search = \App\Support\CrmSearch::of('crm_contacts', $one->getAttributes()));
    }

    protected function casts(): array
    {
        return [
            'phones' => 'array',
            'emails' => 'array',
            'fields' => 'array',
            'birthday' => 'date',
        ];
    }

    public function deals(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(CrmDeal::class, 'contact_id');
    }

    public function company(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(CrmCompany::class, 'company_id');
    }
}
