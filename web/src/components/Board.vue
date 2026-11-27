<!-- Канбан на всю высоту, как в Битрикс24: колонки прокручиваются каждая
     сама, доска — вбок. Карточку тянут в любую колонку и на любое место;
     у краёв доска сама прокручивается. «+» в шапке открывает быстрое
     добавление: Enter добавляет и оставляет поле для следующей, Esc закрывает.
     Перетаскивание — общее для всех канбанов, lib/drag.ts. -->
<script setup lang="ts" generic="T">
import { computed, nextTick, ref } from "vue";
import { Plus } from "@lucide/vue";

import type { BoardColumn } from "../lib/move";
import { useReveal } from "../lib/reveal";
import { useCardDrag } from "../lib/drag";

type Key = number | string;

const props = defineProps<{
  columns: BoardColumn[];
  items: T[];
  columnOf: (item: T) => string;
  keyOf: (item: T) => Key;
  addPlaceholder?: string;
}>();
const emit = defineEmits<{
  move: [key: Key, column: string, before: Key | null];
  open: [item: T];
  add: [column: string, title: string];
}>();
defineSlots<{ card(props: { item: T }): unknown }>();

const adding = ref<string | null>(null);
const draft = ref("");

/* Раскладка по колонкам — один проход по списку, а не по проходу на
   каждую колонку и каждый вызов. */
const grouped = computed(() => {
  const map = new Map<string, T[]>();
  for (const column of props.columns) map.set(column.id, []);
  for (const item of props.items) map.get(props.columnOf(item))?.push(item);
  return map;
});
const inColumn = (id: string) => grouped.value.get(id) ?? [];

/* Перетаскивание — общее для всех канбанов (lib/drag.ts). */
const drag = useCardDrag({
  columnOf: (key) => {
    const item = props.items.find((one) => props.keyOf(one) === key);
    return item ? props.columnOf(item) : null;
  },
  keysIn: (column) => inColumn(column).map(props.keyOf),
  onDrop: (key, column, before) => emit("move", key, column, before),
});
const { dragging, over, slotHeight, landed, board } = drag;

/* В колонке сначала 40 карточек, дальше — по прокрутке. */
const reveal = useReveal(40);
/* Строки колонки: карточки и, пока тянут, пустой слот на месте вставки. */
function rowsOf(id: string): { key: string; slot: boolean; item?: T }[] {
  const rows: { key: string; slot: boolean; item?: T }[] = [];
  const target = drag.targetIn(id);
  const shown = inColumn(id).slice(0, reveal.limit(id));
  for (const item of shown) {
    if (target && target.before === props.keyOf(item)) rows.push({ key: "__slot", slot: true });
    // Перетаскиваемую карточку убираем из списка, а не прячем: у скрытого
    // элемента нулевые координаты, и после броска анимация вела бы его из угла.
    if (dragging.value === props.keyOf(item)) continue;
    rows.push({ key: `i:${props.keyOf(item)}`, slot: false, item });
  }
  if (target && target.before == null) rows.push({ key: "__slot", slot: true });
  return rows;
}
function openItem(item: T) {
  if (!drag.wasDragged()) emit("open", item);
}

async function openAdd(column: string) {
  adding.value = column;
  draft.value = "";
  await nextTick();
  board.value?.querySelector<HTMLInputElement>(`[data-add="${column}"]`)?.focus();
}
function submitAdd(column: string) {
  const title = draft.value.trim();
  if (!title) return;
  emit("add", column, title);
  draft.value = "";
}
defineExpose({ openAdd });
</script>

<template>
  <div ref="board" class="flex h-full min-h-0 overflow-x-auto overflow-y-hidden pb-1 photo-scroll">
    <section
      v-for="column in columns"
      :key="column.id"
      :ref="drag.registerSection(column.id)"
      class="flex h-full w-[278px] min-w-[262px] shrink-0 flex-col border-l border-white/45 px-[7px] first:w-[271px] first:border-l-0 first:pl-0"
      :style="{ '--hue': column.hue }"
    >
      <header class="shrink-0">
        <div class="hue-bar flex h-8 items-center gap-2 rounded-xl px-3 text-white transition-shadow" :class="dragging != null && over?.column === column.id ? 'shadow-[inset_0_0_0_2px_rgb(255_255_255/0.9)]' : ''">
          <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ column.label }}</h2>
          <span class="rounded-full bg-black/15 px-1.5 text-xs font-semibold tabular-nums">{{ inColumn(column.id).length }}</span>
          <button v-if="addPlaceholder" type="button" class="-mr-1.5 flex size-6 items-center justify-center rounded-lg hover:bg-black/15" :aria-label="`Добавить в «${column.label}»`" @click="openAdd(column.id)">
            <Plus class="size-4" />
          </button>
        </div>
        <p v-if="column.total" class="on-photo px-1 pt-1 text-xs font-medium tabular-nums">{{ column.total }}</p>
        <input
          v-if="adding === column.id"
          v-model="draft"
          :data-add="column.id"
          class="input input--full-width mt-2 text-sm"
          :placeholder="addPlaceholder"
          @keydown.enter="submitAdd(column.id)"
          @keydown.esc="adding = null"
          @blur="draft.trim() || (adding = null)"
        />
      </header>
      <TransitionGroup
        :ref="drag.registerList(column.id)"
        tag="ol"
        name="card"
        class="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pt-1.5 pb-2 photo-scroll"
      >
        <template v-for="row in rowsOf(column.id)" :key="row.key">
          <li v-if="row.slot" data-slot class="drop-slot" :style="{ height: `${slotHeight}px` }" />
          <li v-else :class="landed === keyOf(row.item!) ? 'card-landed' : ''">
            <div
              :data-key="String(keyOf(row.item!))"
              role="button"
              tabindex="0"
              class="board-card cursor-grab rounded-xl border border-transparent bg-surface px-3 py-2.5 text-sm shadow-surface transition-[border-color,box-shadow,transform] duration-150 select-none hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing"
              @pointerdown="drag.onPointerDown($event, keyOf(row.item!))"
              @click="openItem(row.item!)"
              @keydown.enter="emit('open', row.item!)"
            >
              <slot name="card" :item="row.item!" />
            </div>
          </li>
        </template>
        <li v-if="inColumn(column.id).length > reveal.limit(column.id) && dragging == null" key="__more" :ref="reveal.mark(column.id)" :data-more="column.id" class="text-center">
          <button type="button" class="button button--ghost button--sm on-photo" @click="reveal.more(column.id)">Ещё {{ inColumn(column.id).length - reveal.limit(column.id) }}</button>
        </li>
        <li v-if="!inColumn(column.id).filter((item) => keyOf(item) !== dragging).length && !(dragging != null && over?.column === column.id)" key="__empty" class="on-photo py-6 text-center text-sm opacity-75">Пусто</li>
      </TransitionGroup>
    </section>
  </div>
</template>
