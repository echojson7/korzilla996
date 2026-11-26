<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

/** Товары сделки или лида (crm_product_rows) для карточки. */
class ProductRows
{
    public static function of(string $type, int $id): array
    {
        return DB::table('crm_product_rows')->where('owner_type', $type)->where('owner_id', $id)->orderBy('sort')->orderBy('id')->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id, 'productId' => $row->product_id ? (int) $row->product_id : null, 'name' => $row->name,
                'price' => (float) $row->price, 'quantity' => (float) $row->quantity, 'discount' => (float) $row->discount_sum,
                'tax' => $row->tax_rate !== null ? (float) $row->tax_rate : null, 'measure' => $row->measure,
                'sum' => round((float) $row->price * (float) $row->quantity, 2),
            ])->all();
    }
}
