<!-- Элементы смарт-процессов у сделки или лида («Договоры», «Претензии»). -->
<script setup lang="ts">
import HueChip from "../HueChip.vue";
import { hueOf, type SmartBrief } from "../../lib/crm";
import { money } from "../../lib/format";
import { navigate } from "../../lib/router";

defineProps<{ rows: SmartBrief[] }>();
</script>

<template>
  <div class="divide-y divide-separator">
    <button v-for="one in rows" :key="one.id" type="button" class="flex w-full items-center gap-2 py-2 text-left text-sm first:pt-0 last:pb-0" @click="navigate('/smart', { type: one.typeId, open: one.id })">
      <span class="min-w-0 flex-1">
        <span class="block truncate font-medium">{{ one.title }}</span>
        <span class="block text-xs text-muted">{{ one.typeTitle }}</span>
      </span>
      <HueChip v-if="one.stage" :hue="hueOf(one.stage.color)" class="shrink-0">{{ one.stage.title }}</HueChip>
      <span v-if="one.amount" class="shrink-0 tabular-nums">{{ money(one.amount) }}</span>
    </button>
  </div>
</template>
