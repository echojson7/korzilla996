<!-- Строка сделки в карточке компании или контакта: цвет стадии полосой
     слева, название, стадия и сумма. Щелчок — карточка сделки. -->
<script setup lang="ts">
import HueChip from "../HueChip.vue";
import { hueOf } from "../../lib/crm";
import { money } from "../../lib/format";

export interface DealLine { id: number; title: string; amount: number; currency: string; closed: boolean; stage: string | null; color: string | null; semantic: string | null; createdAt?: string | null }
defineProps<{ deal: DealLine }>();
const emit = defineEmits<{ open: [] }>();
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "");
</script>

<template>
  <button type="button" class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-default/60" @click="emit('open')">
    <span class="h-8 w-1 shrink-0 rounded-full" :style="{ background: deal.color ?? 'var(--separator)' }" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm" :class="deal.semantic === 'failure' ? 'text-muted line-through decoration-1' : ''">{{ deal.title }}</span>
      <span class="block truncate text-xs text-muted">Сделка №{{ deal.id }}<template v-if="deal.createdAt"> · {{ day(deal.createdAt) }}</template></span>
    </span>
    <HueChip v-if="deal.stage" :hue="hueOf(deal.color ?? '')" class="max-w-[40%] shrink truncate">{{ deal.stage }}</HueChip>
    <span class="w-24 shrink-0 text-right text-sm font-medium tabular-nums">{{ deal.currency === "RUB" || !deal.currency ? money(deal.amount) : `${deal.amount.toLocaleString("ru-RU")} ${deal.currency}` }}</span>
  </button>
</template>
