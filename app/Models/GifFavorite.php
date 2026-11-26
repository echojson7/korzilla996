<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GifFavorite extends Model
{
    protected $fillable = ['user_id', 'key', 'item'];

    protected function casts(): array
    {
        return ['item' => 'array'];
    }
}
