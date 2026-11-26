<!-- Счета сделки или лида: номер, статус, сумма, даты; щелчок раскрывает товары. -->
<script setup lang="ts">
import { ref } from "vue";
import ProductRows from "./ProductRows.vue";
import { money } from "../../lib/format";
import type { Invoice } from "../../lib/crm";

defineProps<{ rows: Invoice[] }>();
const open = ref<number | null>(null);
const TONE: Record<string, string> = { success: "chip--success", failure: "chip--danger", process: "chip--default" };
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("ru-RU") : "");
</script>

<template>
  <div class="divide-y divide-separator">
    <div v-for="one in rows" :key="one.id" class="py-2 first:pt-0 last:pb-0">
      <button type="button" class="flex w-full items-center gap-2 text-left text-sm" :disabled="!one.products.length" @click="open = open === one.id ? null : one.id">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">Счёт {{ one.number ? `№ ${one.number}` : "" }}<span v-if="one.title" class="font-normal text-muted"> · {{ one.title }}</span></span>
          <span class="block text-xs text-muted">{{ [one.dateBill && `от ${day(one.dateBill)}`, one.paidAt && `оплачен ${day(one.paidAt)}`, !one.paidAt && one.payBefore && `оплатить до ${day(one.payBefore)}`].filter(Boolean).join(" · ") }}</span>
        </span>
        <span v-if="one.status" class="chip chip--sm chip--soft shrink-0" :class="TONE[one.semantic] ?? 'chip--default'"><span class="chip__label">{{ one.status }}</span></span>
        <span class="shrink-0 font-medium tabular-nums">{{ money(one.amount) }}</span>
      </button>
      <div v-if="open === one.id" class="mt-2"><ProductRows :rows="one.products" /></div>
    </div>
  </div>
</template>
