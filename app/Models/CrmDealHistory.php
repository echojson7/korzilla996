<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmDealHistory extends Model
{
    protected $table = 'crm_deal_history';

    public const UPDATED_AT = null;

    protected $fillable = ['deal_id', 'user_id', 'field', 'old', 'new', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }
}
