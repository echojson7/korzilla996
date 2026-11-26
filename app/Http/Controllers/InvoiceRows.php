<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

/** Счета сделки или лида для карточки, с товарами. */
class InvoiceRows
{
    public static function of(string $column, int $id): array
    {
        return DB::table('crm_invoices')->where($column, $id)->orderByDesc('date_bill')->orderByDesc('id')->limit(100)->get()
            ->map(fn ($one) => [
                'id' => (int) $one->id, 'number' => $one->number, 'title' => $one->title, 'status' => $one->status_title, 'semantic' => $one->semantic,
                'amount' => (float) $one->amount, 'currency' => $one->currency, 'dateBill' => $one->date_bill, 'payBefore' => $one->pay_before, 'paidAt' => $one->paid_at,
                'products' => ProductRows::of('invoice', (int) $one->id),
            ])->all();
    }
}
