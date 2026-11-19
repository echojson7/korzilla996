<!-- Таблица HeroUI: сортировка щелчком по заголовку, щелчок по строке
     открывает запись. Ячейки — слоты #<ключ колонки>. -->
<script setup lang="ts" generic="T">
import { computed, ref } from "vue";
import { ChevronDown } from "@lucide/vue";

import type { Column } from "../lib/move";

const props = defineProps<{ columns: Column<T>[]; rows: T[]; keyOf: (row: T) => string | number; label: string }>();
const emit = defineEmits<{ open: [row: T] }>();

const sortKey = ref<string | null>(null);
const desc = ref(false);
const sorted = computed(() => {
  const column = props.columns.find((one) => one.key === sortKey.value);
  if (!column?.sort) return props.rows;
  const by = column.sort;
  return [...props.rows].sort((a, b) => {
    const x = by(a), y = by(b);
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ru");
    return desc.value ? -order : order;
  });
});
function toggle(column: Column<T>) {
  if (!column.sort) return;
  if (sortKey.value === column.key) desc.value = !desc.value;
  else {
    sortKey.value = column.key;
    desc.value = false;
  }
}
</script>

<template>
  <div class="table-root table-root--primary">
    <div class="table__scroll-container">
      <table class="table__content" :aria-label="label">
        <thead class="table__header">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              class="table__column whitespace-nowrap"
              :class="column.class"
              :data-allows-sorting="column.sort ? 'true' : undefined"
              :aria-sort="sortKey === column.key ? (desc ? 'descending' : 'ascending') : undefined"
              @click="toggle(column)"
            >
              <span class="inline-flex items-center gap-1">
                {{ column.label }}
                <ChevronDown v-if="sortKey === column.key" class="size-3.5 transition-transform" :class="{ 'rotate-180': !desc }" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody class="table__body">
          <tr v-for="row in sorted" :key="keyOf(row)" class="table__row cursor-pointer" tabindex="0" @click="emit('open', row)" @keydown.enter="emit('open', row)">
            <td v-for="column in columns" :key="column.key" class="table__cell" :class="column.class">
              <slot :name="column.key" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
