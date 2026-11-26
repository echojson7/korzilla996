<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmCompany extends Model
{
    protected $table = 'crm_companies';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'phones' => 'array',
            'emails' => 'array',
            'fields' => 'array',
            'webs' => 'array',
        ];
    }
}
