<!-- Сотрудники: отделы вкладками, карточки или таблица, поиск по имени,
     должности и телефону. Щелчок открывает карточку сотрудника справа. -->
<script setup lang="ts">
import { computed } from "vue";
import { Phone, Mail, LayoutGrid, Table2, Crown } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import DataTable from "../components/DataTable.vue";
import Face from "../components/Face.vue";
import { STAFF, DEPARTMENTS, DEPT, tasks, deals, isOpen, type Person } from "../lib/data";
import { plural, money } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { local } from "../lib/prefs";
import type { Column } from "../lib/move";

const dept = computed(() => (DEPT[route.value.query.get("dept") ?? ""] ? route.value.query.get("dept")! : "all"));
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });
const view = local<"cards" | "table">("staff.view", "cards");

const tabs = computed(() => [{ key: "all", label: "Все", count: STAFF.length }, ...DEPARTMENTS.map((one) => ({ key: one.id, label: one.name, count: STAFF.filter((who) => who.dept === one.id).length }))]);
const visible = computed(() => {
  const words = text.value.trim().toLowerCase();
  return STAFF.filter((one) => (dept.value === "all" || one.dept === dept.value) && (!words || `${one.name} ${one.role} ${one.phone} ${one.email}`.toLowerCase().includes(words)));
});
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

const TABLE: Column<Person>[] = [
  { key: "name", label: "Сотрудник", sort: (one) => one.name, class: "min-w-[260px]" },
  { key: "dept", label: "Отдел", sort: (one) => DEPT[one.dept].name },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Почта" },
  { key: "now", label: "Сейчас", sort: (one) => (one.away ? 1 : 0) },
];

const opened = computed(() => STAFF.find((one) => one.id === route.value.query.get("open")) ?? null);
const open = (one: Person) => setQuery({ open: one.id });
const workload = computed(() => (opened.value ? tasks.filter((one) => one.owner === opened.value!.id && isOpen(one)).length : 0));
const theirDeals = computed(() => (opened.value ? deals.filter((one) => one.owner === opened.value!.id) : []));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Сотрудники" :sub="`${plural(STAFF.length, 'сотрудник', 'сотрудника', 'сотрудников')} в ${plural(DEPARTMENTS.length, 'отделе', 'отделах', 'отделах')}`">
      <template #toolbar>
        <Segmented label="Отделы" :items="tabs" :model-value="dept" @update:model-value="(key) => setQuery({ dept: key === 'all' ? null : key })" />
        <div class="flex-1" />
        <SearchBox v-model="text" placeholder="Имя, должность или телефон" class="w-full sm:w-64" />
        <div class="toggle-button-group toggle-button-group--horizontal" role="radiogroup" aria-label="Вид">
          <button type="button" role="radio" class="toggle-button toggle-button--sm toggle-button--icon-only" :aria-checked="view === 'cards'" :data-selected="view === 'cards' ? 'true' : undefined" aria-label="Карточки" @click="view = 'cards'"><LayoutGrid class="size-4" /></button>
          <button type="button" role="radio" class="toggle-button toggle-button--sm toggle-button--icon-only" :aria-checked="view === 'table'" :data-selected="view === 'table' ? 'true' : undefined" aria-label="Таблица" @click="view = 'table'"><Table2 class="size-4" /></button>
        </div>
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <div v-if="view === 'cards'" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <button v-for="one in visible" :key="one.id" type="button" class="sheet flex flex-col items-center rounded-2xl p-5 text-center shadow-surface transition hover:-translate-y-0.5 hover:shadow-md" @click="open(one)">
          <Face :who="one" size="lg" />
          <p class="mt-3 flex items-center gap-1 font-semibold">{{ one.name }}<Crown v-if="one.head" class="size-3.5 text-warning" aria-label="Руководитель отдела" /></p>
          <p class="text-sm text-muted">{{ one.role }}</p>
          <p class="mt-0.5 text-xs text-muted">{{ DEPT[one.dept].name }}</p>
          <span class="chip chip--sm chip--soft mt-3" :class="one.away ? 'chip--warning' : 'chip--success'"><span class="chip__label">{{ one.away ?? "На работе" }}</span></span>
        </button>
      </div>
      <DataTable v-else :columns="TABLE" :rows="visible" :key-of="(one) => one.id" label="Сотрудники" class="sheet" @open="open">
        <template #name="{ row }">
          <span class="flex items-center gap-3">
            <Face :who="row" size="sm" />
            <span><span class="block font-medium">{{ row.name }}</span><span class="block text-xs text-muted">{{ row.role }}</span></span>
          </span>
        </template>
        <template #dept="{ row }">{{ DEPT[row.dept].name }}</template>
        <template #phone="{ row }"><a :href="tel(row.phone)" class="link whitespace-nowrap" @click.stop>{{ row.phone }}</a></template>
        <template #email="{ row }"><a :href="`mailto:${row.email}`" class="link" @click.stop>{{ row.email }}</a></template>
        <template #now="{ row }">
          <span class="chip chip--sm chip--soft" :class="row.away ? 'chip--warning' : 'chip--success'"><span class="chip__label">{{ row.away ?? "На работе" }}</span></span>
        </template>
      </DataTable>
      <p v-if="!visible.length" class="on-photo py-16 text-center">Никого не нашлось</p>
    </div>

    <SidePanel :open="!!opened" :title="opened?.name ?? ''" :sub="opened ? `${opened.role} · ${DEPT[opened.dept].name}` : ''" @close="setQuery({ open: null })">
      <template v-if="opened">
        <div class="flex items-center gap-4">
          <Face :who="opened" size="lg" />
          <div class="text-sm">
            <a :href="tel(opened.phone)" class="link flex items-center gap-2"><Phone class="size-4" />{{ opened.phone }}</a>
            <a :href="`mailto:${opened.email}`" class="link mt-1 flex items-center gap-2"><Mail class="size-4" />{{ opened.email }}</a>
          </div>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <div class="card card--default p-4"><p class="text-xs text-muted">Открытых задач</p><p class="mt-1 text-2xl font-semibold">{{ workload }}</p></div>
          <div class="card card--default p-4"><p class="text-xs text-muted">Сделок</p><p class="mt-1 text-2xl font-semibold">{{ theirDeals.length }}</p><p class="text-xs text-muted">на {{ money(theirDeals.reduce((s, d) => s + d.sum, 0)) }}</p></div>
        </div>
        <p class="mt-4 text-sm"><span class="chip chip--sm chip--soft" :class="opened.away ? 'chip--warning' : 'chip--success'"><span class="chip__label">{{ opened.away ?? "На работе" }}</span></span></p>
      </template>
    </SidePanel>
  </div>
</template>
