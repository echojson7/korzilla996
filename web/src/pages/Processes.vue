<!-- Бизнес-процессы: шаблоны, выгруженные из Битрикс24. Сверху — сколько их
     по видам, ниже таблица. Движка процессов ещё нет: у всех «Ждёт движка». -->
<script setup lang="ts">
import { computed } from "vue";
import PageHead from "../components/PageHead.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import DataTable from "../components/DataTable.vue";
import { PROCESSES, BP_KINDS, BP_KIND, type Process } from "../lib/data";
import { number, plural } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { toast } from "../lib/toast";
import type { Column } from "../lib/move";

const kind = computed(() => (BP_KIND[route.value.query.get("kind") ?? ""] ? route.value.query.get("kind")! : "all"));
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });
const tabs = computed(() => [{ key: "all", label: "Все", count: PROCESSES.length }, ...BP_KINDS.map((one) => ({ key: one.id, label: one.label, count: PROCESSES.filter((bp) => bp.kind === one.id).length }))]);
const visible = computed(() => {
  const words = text.value.trim().toLowerCase();
  return PROCESSES.filter((one) => (kind.value === "all" || one.kind === kind.value) && (!words || one.name.toLowerCase().includes(words)));
});
const stats = computed(() => BP_KINDS.map((one) => {
  const list = PROCESSES.filter((bp) => bp.kind === one.id);
  const auto = list.filter((bp) => bp.auto).length;
  return { ...one, count: list.length, actions: list.reduce((s, bp) => s + bp.actions, 0), auto };
}));
const TABLE: Column<Process>[] = [
  { key: "name", label: "Шаблон", sort: (one) => one.name, class: "min-w-[340px]" },
  { key: "kind", label: "Где работает", sort: (one) => BP_KIND[one.kind].label },
  { key: "actions", label: "Действий", sort: (one) => one.actions, class: "text-right" },
  { key: "auto", label: "Запуск", sort: (one) => (one.auto ? 0 : 1) },
  { key: "state", label: "Состояние" },
];
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Бизнес-процессы" :sub="`${plural(PROCESSES.length, 'шаблон', 'шаблона', 'шаблонов')} из Битрикс24`">
      <template #toolbar>
        <Segmented label="Виды" :items="tabs" :model-value="kind" @update:model-value="(key) => setQuery({ kind: key === 'all' ? null : key })" />
        <div class="flex-1" />
        <SearchBox v-model="text" placeholder="Название шаблона" class="w-full sm:w-64" />
      </template>
    </PageHead>
    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <div class="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <button v-for="one in stats" :key="one.id" type="button" class="sheet rounded-2xl p-4 text-left shadow-surface transition hover:-translate-y-0.5" @click="setQuery({ kind: one.id })">
          <p class="text-sm text-muted">{{ one.label }}</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ one.count }}</p>
          <p class="text-xs text-muted">{{ number(one.actions) }} действий · {{ one.auto ? `сами запускаются: ${one.auto}` : "все вручную" }}</p>
        </button>
      </div>
      <DataTable :columns="TABLE" :rows="visible" :key-of="(one) => one.id" label="Шаблоны" class="sheet" @open="(one) => toast(`«${one.name}» заработает вместе с движком процессов`)">
        <template #name="{ row }">
          <span class="block font-medium">{{ row.name }}</span>
          <span v-if="row.note" class="block text-xs text-muted">{{ row.note }}</span>
        </template>
        <template #kind="{ row }">{{ BP_KIND[row.kind].label }}</template>
        <template #actions="{ row }"><span class="tabular-nums">{{ number(row.actions) }}</span></template>
        <template #auto="{ row }">{{ row.auto ? "Автоматически" : "Вручную" }}</template>
        <template #state><span class="chip chip--sm chip--soft chip--warning"><span class="chip__label">Ждёт движка</span></span></template>
      </DataTable>
    </div>
  </div>
</template>
