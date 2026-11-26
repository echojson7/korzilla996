<!-- Товары сделки или лида, как в Битрикс24: название, цена, количество,
     скидка и сумма. Пока только просмотр (перенесено из Битрикса). -->
<script setup lang="ts">
import { computed } from "vue";
import { money } from "../../lib/format";
import type { ProductRow } from "../../lib/crm";

const props = defineProps<{ rows: ProductRow[] }>();
const total = computed(() => props.rows.reduce((sum, one) => sum + one.sum - one.discount, 0));
const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toLocaleString("ru-RU"));
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-muted">
          <th class="py-1.5 pr-2 font-normal">Товар</th>
          <th class="py-1.5 pr-2 text-right font-normal">Цена</th>
          <th class="py-1.5 pr-2 text-right font-normal">Кол-во</th>
          <th class="py-1.5 pr-2 text-right font-normal">Скидка</th>
          <th class="py-1.5 text-right font-normal">Сумма</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="one in rows" :key="one.id" class="border-t border-separator">
          <td class="py-1.5 pr-2">{{ one.name }}</td>
          <td class="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{{ money(one.price) }}</td>
          <td class="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{{ qty(one.quantity) }} {{ one.measure ?? "" }}</td>
          <td class="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{{ one.discount ? money(one.discount) : "—" }}</td>
          <td class="py-1.5 text-right font-medium tabular-nums whitespace-nowrap">{{ money(one.sum - one.discount) }}</td>
        </tr>
      </tbody>
      <tfoot v-if="rows.length > 1">
        <tr class="border-t border-separator"><td colspan="4" class="py-1.5 text-right text-muted">Итого</td><td class="py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">{{ money(total) }}</td></tr>
      </tfoot>
    </table>
  </div>
</template>
