<!-- Канбан на всю высоту, как в Битрикс24: колонки прокручиваются каждая
     сама, доска — вбок. Карточку тянут в любую колонку и на любое место;
     у краёв доска сама прокручивается. «+» в шапке открывает быстрое
     добавление: Enter добавляет и оставляет поле для следующей, Esc закрывает.
     Перетаскивание — родное HTML5, без библиотек. -->
<script setup lang="ts" generic="T">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { Plus } from "@lucide/vue";

import type { BoardColumn } from "../lib/move";

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

const dragging = ref<Key | null>(null);
const over = ref<{ column: string; before: Key | null } | null>(null);
const adding = ref<string | null>(null);
const draft = ref("");
const board = ref<HTMLElement | null>(null);
const lists = new Map<string, HTMLElement>();

const inColumn = (id: string) => props.items.filter((item) => props.columnOf(item) === id);

function beforeAt(column: string, y: number): Key | null {
  const list = lists.get(column);
  if (!list) return null;
  for (const card of list.querySelectorAll<HTMLElement>("[data-key]")) {
    if (card.dataset.key === String(dragging.value)) continue;
    const box = card.getBoundingClientRect();
    if (y < box.top + box.height / 2) {
      const found = props.items.find((item) => String(props.keyOf(item)) === card.dataset.key);
      return found ? props.keyOf(found) : null;
    }
  }
  return null;
}

/* Автопрокрутка: курсор у края доски или колонки — едем в ту сторону. */
let scrollTimer = 0;
let pointer = { x: 0, y: 0, column: "" };
function autoscroll() {
  const edge = 64;
  const step = (distance: number) => Math.ceil(((edge - distance) / edge) * 18);
  const el = board.value;
  if (el) {
    const box = el.getBoundingClientRect();
    if (pointer.x < box.left + edge) el.scrollLeft -= step(pointer.x - box.left);
    else if (pointer.x > box.right - edge) el.scrollLeft += step(box.right - pointer.x);
  }
  const list = lists.get(pointer.column);
  if (list) {
    const box = list.getBoundingClientRect();
    if (pointer.y < box.top + edge && pointer.y > box.top) list.scrollTop -= step(pointer.y - box.top);
    else if (pointer.y > box.bottom - edge && pointer.y < box.bottom) list.scrollTop += step(box.bottom - pointer.y);
  }
  scrollTimer = requestAnimationFrame(autoscroll);
}
function stopDrag() {
  cancelAnimationFrame(scrollTimer);
  dragging.value = null;
  over.value = null;
}
onBeforeUnmount(() => cancelAnimationFrame(scrollTimer));

function start(event: DragEvent, key: Key) {
  event.dataTransfer!.effectAllowed = "move";
  event.dataTransfer!.setData("text/plain", String(key));
  dragging.value = key;
  scrollTimer = requestAnimationFrame(autoscroll);
}
function dragOver(event: DragEvent, column: string) {
  if (dragging.value == null) return;
  event.preventDefault();
  pointer = { x: event.clientX, y: event.clientY, column };
  const before = beforeAt(column, event.clientY);
  if (over.value?.column !== column || over.value.before !== before) over.value = { column, before };
}
function drop(event: DragEvent, column: string) {
  event.preventDefault();
  if (dragging.value != null) emit("move", dragging.value, column, beforeAt(column, event.clientY));
  stopDrag();
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
  <div ref="board" class="flex h-full min-h-0 gap-2.5 overflow-x-auto overflow-y-hidden pb-1 photo-scroll">
    <section
      v-for="column in columns"
      :key="column.id"
      class="column flex h-full w-[272px] min-w-[264px] shrink-0 flex-col rounded-2xl"
      :class="{ 'is-drop-target': dragging != null && over?.column === column.id }"
      :style="{ '--hue': column.hue }"
      @dragover="dragOver($event, column.id)"
      @dragleave="($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node) || (over = null)"
      @drop="drop($event, column.id)"
    >
      <header class="shrink-0 px-2 pt-2">
        <div class="hue-bar flex h-8 items-center gap-2 rounded-xl px-3 text-white">
          <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ column.label }}</h2>
          <span class="rounded-full bg-black/15 px-1.5 text-xs font-semibold tabular-nums">{{ inColumn(column.id).length }}</span>
          <button v-if="addPlaceholder" type="button" class="-mr-1.5 flex size-6 items-center justify-center rounded-lg hover:bg-black/15" :aria-label="`Добавить в «${column.label}»`" @click="openAdd(column.id)">
            <Plus class="size-4" />
          </button>
        </div>
        <p v-if="column.total" class="px-1 pt-1 text-xs font-medium text-muted tabular-nums">{{ column.total }}</p>
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
      <ol :ref="(el) => (el ? lists.set(column.id, el as HTMLElement) : lists.delete(column.id))" class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 thin-scroll">
        <li v-for="item in inColumn(column.id)" :key="keyOf(item)">
          <div v-if="dragging != null && over?.column === column.id && over.before === keyOf(item)" class="mb-1.5 h-0.5 rounded-full bg-accent" />
          <div
            :data-key="String(keyOf(item))"
            draggable="true"
            role="button"
            tabindex="0"
            class="cursor-pointer rounded-xl border border-transparent bg-surface p-2.5 text-sm shadow-surface transition hover:border-border hover:shadow-md focus-visible:outline-2 focus-visible:outline-focus"
            :class="{ 'is-dragging': dragging === keyOf(item) }"
            @dragstart="start($event, keyOf(item))"
            @dragend="stopDrag"
            @click="emit('open', item)"
            @keydown.enter="emit('open', item)"
          >
            <slot name="card" :item="item" />
          </div>
        </li>
        <li v-if="dragging != null && over?.column === column.id && over.before == null" class="h-0.5 rounded-full bg-accent" />
        <li v-if="!inColumn(column.id).length && !(dragging != null && over?.column === column.id)" class="py-8 text-center text-xs text-muted">Пусто</li>
      </ol>
    </section>
  </div>
</template>
