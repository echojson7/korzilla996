<!-- Канбан на всю высоту, как в Битрикс24: колонки прокручиваются каждая
     сама, доска — вбок. Карточку тянут в любую колонку и на любое место;
     у краёв доска сама прокручивается. «+» в шапке открывает быстрое
     добавление: Enter добавляет и оставляет поле для следующей, Esc закрывает.
     Перетаскивание — своё, на событиях указателя, без библиотек. -->
<script setup lang="ts" generic="T">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { Plus } from "@lucide/vue";

import type { BoardColumn } from "../lib/move";
import { useReveal } from "../lib/reveal";

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
const slotHeight = ref(64);
const adding = ref<string | null>(null);
const draft = ref("");
const board = ref<HTMLElement | null>(null);
const lists = new Map<string, HTMLElement>();
const sections = new Map<string, HTMLElement>();

/* Раскладка по колонкам — один проход по списку, а не по проходу на
   каждую колонку и каждый вызов. */
const grouped = computed(() => {
  const map = new Map<string, T[]>();
  for (const column of props.columns) map.set(column.id, []);
  for (const item of props.items) map.get(props.columnOf(item))?.push(item);
  return map;
});
const inColumn = (id: string) => grouped.value.get(id) ?? [];
/* В колонке сначала 40 карточек, дальше — по прокрутке. */
const reveal = useReveal(40);
/* Строки колонки: карточки и, пока тянут, пустой слот на месте вставки. */
function rowsOf(id: string): { key: string; slot: boolean; item?: T }[] {
  const rows: { key: string; slot: boolean; item?: T }[] = [];
  const target = dragging.value != null && over.value?.column === id ? over.value : null;
  const all = inColumn(id);
  const shown = all.slice(0, reveal.limit(id));
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
function columnAt(x: number): string | null {
  for (const [id, el] of sections) {
    const box = el.getBoundingClientRect();
    if (x >= box.left && x < box.right) return id;
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
  if (dragging.value != null) track();
  scrollTimer = requestAnimationFrame(autoscroll);
}

/* ---------- Перетаскивание указателем ----------
   Карточку берут мышью (сдвиг на 5 px) или пальцем (удержание 250 мс).
   Поднятая карточка — копия поверх страницы: чуть наклонена, с тенью,
   идёт за курсором; на её месте в колонке — пустой слот той же высоты,
   соседние карточки плавно расступаются. Отпустили — копия садится
   в слот и исчезает. */
let press: { key: Key; el: HTMLElement; x: number; y: number; dx: number; dy: number; touch: boolean; timer: number } | null = null;
let ghost: HTMLElement | null = null;
let justDragged = false;

function onPointerDown(event: PointerEvent, key: Key) {
  if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
  const el = event.currentTarget as HTMLElement;
  const box = el.getBoundingClientRect();
  const touch = event.pointerType === "touch";
  press = { key, el, x: event.clientX, y: event.clientY, dx: event.clientX - box.left, dy: event.clientY - box.top, touch, timer: 0 };
  if (touch) press.timer = window.setTimeout(() => press && begin(), 250);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", cancelPress);
}
function onPointerMove(event: PointerEvent) {
  if (!press) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (dragging.value == null) {
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (press.touch) {
      if (moved > 8) cancelPress();
    } else if (moved > 5) begin();
    return;
  }
  event.preventDefault();
  track();
}
function begin() {
  if (!press) return;
  const box = press.el.getBoundingClientRect();
  slotHeight.value = box.height;
  ghost = press.el.cloneNode(true) as HTMLElement;
  ghost.classList.add("drag-ghost");
  ghost.removeAttribute("data-key");
  Object.assign(ghost.style, { width: `${box.width}px`, height: `${box.height}px`, left: "0px", top: "0px" });
  document.body.appendChild(ghost);
  moveGhost(pointer.x || press.x, pointer.y || press.y);
  requestAnimationFrame(() => ghost?.classList.add("is-lifted"));
  const column = props.columnOf(props.items.find((item) => props.keyOf(item) === press!.key)!);
  const list = inColumn(column);
  const next = list[list.findIndex((item) => props.keyOf(item) === press!.key) + 1];
  dragging.value = press.key;
  over.value = { column, before: next ? props.keyOf(next) : null };
  document.documentElement.classList.add("is-board-dragging");
  window.addEventListener("touchmove", blockTouch, { passive: false });
  scrollTimer = requestAnimationFrame(autoscroll);
}
function moveGhost(x: number, y: number) {
  if (ghost && press) ghost.style.transform = `translate3d(${x - press.dx}px, ${y - press.dy}px, 0)`;
}
function track() {
  moveGhost(pointer.x, pointer.y);
  const column = columnAt(pointer.x);
  if (!column) return;
  pointer.column = column;
  const before = beforeAt(column, pointer.y);
  if (over.value?.column !== column || over.value.before !== before) over.value = { column, before };
}
const blockTouch = (event: TouchEvent) => event.preventDefault();

function onPointerUp() {
  if (!press) return;
  if (dragging.value == null) return cancelPress();
  const key = dragging.value;
  const target = over.value;
  justDragged = true;
  setTimeout(() => (justDragged = false), 0);
  const slot = target ? lists.get(target.column)?.querySelector<HTMLElement>("[data-slot]") : null;
  const el = ghost;
  const box = slot?.getBoundingClientRect();
  if (el && box && box.width > 0) {
    // Фиксируем текущее положение копии, чтобы посадка шла от курсора.
    el.getBoundingClientRect();
    el.classList.remove("is-lifted");
    el.classList.add("is-landing");
    el.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      land(key);
      if (target) emit("move", key, target.column, target.before);
      cleanup();
    };
    el.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 260);
  } else {
    land(key);
    if (target) emit("move", key, target.column, target.before);
    cleanup();
  }
  unlisten();
  press = null;
}
// Брошенная карточка встаёт на место слота сразу, без появления.
const landed = ref<Key | null>(null);
let landTimer = 0;
function land(key: Key) {
  landed.value = key;
  clearTimeout(landTimer);
  landTimer = window.setTimeout(() => (landed.value = null), 400);
}
function cancelPress() {
  if (press?.timer) clearTimeout(press.timer);
  unlisten();
  press = null;
  cleanup();
}
function unlisten() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", cancelPress);
  window.removeEventListener("touchmove", blockTouch);
}
function cleanup() {
  cancelAnimationFrame(scrollTimer);
  ghost?.remove();
  ghost = null;
  dragging.value = null;
  over.value = null;
  document.documentElement.classList.remove("is-board-dragging");
}
onBeforeUnmount(() => {
  unlisten();
  cleanup();
});
function openItem(item: T) {
  if (!justDragged) emit("open", item);
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
      :ref="(el) => (el ? sections.set(column.id, el as HTMLElement) : sections.delete(column.id))"
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
        :ref="(el) => { const node = (el as { $el?: HTMLElement } | null)?.$el; node ? lists.set(column.id, node) : lists.delete(column.id); }"
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
              @pointerdown="onPointerDown($event, keyOf(row.item!))"
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
