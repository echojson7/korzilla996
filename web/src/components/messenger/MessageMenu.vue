<!-- Меню действий с сообщением: по кнопке «⋯» у пузыря и по правому
     щелчку. Сверху — быстрые реакции, ниже — действия. Встаёт у точки
     щелчка и не вылезает за экран; Esc, щелчок мимо и прокрутка закрывают. -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Star, Reply, Copy, Forward, Pencil, Trash2, Download, Smile, Eye, ChevronLeft, ChevronRight, Pin, PinOff } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import EmojiPicker from "./EmojiPicker.vue";
import { QUICK } from "../../lib/emoji";
import { apiUrl } from "../../lib/api";
import { person, viewsOf, type ChatMessage } from "../../lib/messenger";
import { isFavorite, loadFavorites, toggleFavorite } from "../../lib/gifs";
import { computePosition, flip, offset, shift, size } from "@floating-ui/dom";

const props = withDefaults(defineProps<{ message: ChatMessage; x: number; y: number; mine: boolean; canDelete: boolean; seen?: number; startViews?: boolean; canPin?: boolean }>(), { seen: 0, startViews: false, canPin: false });
const emit = defineEmits<{ close: []; react: [emoji: string]; reply: []; copy: []; forward: []; edit: []; remove: []; pin: [] }>();

const box = ref<HTMLElement | null>(null);
const pos = ref({ left: props.x, top: props.y });
const picking = ref(false);
/* «Просмотрено»: список прочитавших со временем. */
const viewing = ref(false);
const views = ref<{ userId: number; at: string | null }[] | null>(null);
const viewFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const seenAt = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? `сегодня в ${timeFmt.format(date)}` : viewFmt.format(date).replace(".", "");
};
async function showViews() {
  viewing.value = true;
  try {
    views.value = await viewsOf(props.message.id);
  } catch {
    views.value = [];
  }
}
if (props.startViews) showViews();
const confirming = ref(false);

/* Положение — Floating UI от точки щелчка: не помещается снизу — встаёт
   сверху, к краю экрана не прилипает, высота ограничена видимой областью. */
async function place() {
  await nextTick();
  const el = box.value;
  if (!el) return;
  const point = { getBoundingClientRect: () => ({ x: props.x, y: props.y, left: props.x, top: props.y, right: props.x, bottom: props.y, width: 0, height: 0 }) };
  const result = await computePosition(point, el, {
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [
      offset(4),
      flip({ padding: 8, fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
      shift({ padding: 8 }),
      size({ padding: 8, apply({ availableHeight, elements }) { elements.floating.style.maxHeight = `${Math.max(200, Math.floor(availableHeight))}px`; } }),
    ],
  });
  pos.value = { left: result.x, top: result.y };
}
watch(() => [props.x, props.y, picking.value, viewing.value, views.value], place);

const outside = (event: Event) => !box.value?.contains(event.target as Node) && emit("close");
const key = (event: KeyboardEvent) => event.key === "Escape" && (event.stopPropagation(), emit("close"));
const scroll = (event: Event) => !box.value?.contains(event.target as Node) && emit("close");
onMounted(() => {
  place();
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("contextmenu", outside, true);
  });
  document.addEventListener("keydown", key, true);
  document.addEventListener("scroll", scroll, true);
  window.addEventListener("resize", () => emit("close"), { once: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("contextmenu", outside, true);
  document.removeEventListener("keydown", key, true);
  document.removeEventListener("scroll", scroll, true);
});

if (props.message.gif) loadFavorites();
function favorite() {
  if (props.message.gif) toggleFavorite(props.message.gif);
  emit("close");
}
const file = props.message.files.length === 1 ? props.message.files[0] : null;
function remove() {
  if (!confirming.value) return (confirming.value = true);
  emit("remove");
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="box"
      role="menu"
      aria-label="Действия с сообщением"
      class="popover-layer fixed top-0 left-0 w-[264px] overflow-y-auto overscroll-contain thin-scroll rounded-2xl bg-overlay p-1.5 text-overlay-foreground shadow-overlay"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
      @contextmenu.prevent
    >
      <EmojiPicker v-if="picking" @pick="(emoji) => emit('react', emoji)" />
      <div v-else-if="viewing">
        <button type="button" class="menu-row font-medium" @click="viewing = false"><ChevronLeft class="size-[18px]" />Просмотрено{{ views ? ` · ${views.length}` : "" }}</button>
        <div class="mx-1 mb-1 h-px bg-separator" />
        <p v-if="!views" class="px-3 py-3 text-sm text-muted">Загружаем…</p>
        <p v-else-if="!views.length" class="px-3 py-3 text-sm text-muted">Пока никто не просмотрел</p>
        <ul v-else class="max-h-64 overflow-y-auto thin-scroll" role="list">
          <li v-for="one in views" :key="one.userId" class="flex items-center gap-3 rounded-xl px-2.5 py-1.5">
            <ChatFace :user="person(one.userId)" size="sm" />
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate text-sm font-medium">{{ person(one.userId)?.name ?? "Сотрудник" }}</span>
              <span class="block text-xs text-muted">{{ seenAt(one.at) || "просмотрено" }}</span>
            </span>
          </li>
        </ul>
      </div>
      <template v-else>
        <div class="flex items-center justify-between px-0.5 pb-1">
          <button v-for="emoji in QUICK.slice(0, 6)" :key="emoji" type="button" class="flex size-9 items-center justify-center rounded-full text-[22px] leading-none transition hover:scale-110 hover:bg-default" :aria-label="`Реакция ${emoji}`" @click="emit('react', emoji)">{{ emoji }}</button>
          <button type="button" class="flex size-9 items-center justify-center rounded-full text-muted hover:bg-default" aria-label="Другая реакция" @click="picking = true"><Smile class="size-5" /></button>
        </div>
        <div class="mx-1 mb-1 h-px bg-separator" />
        <button type="button" role="menuitem" class="menu-row" @click="emit('reply')"><Reply class="size-[18px]" />Ответить</button>
        <button v-if="message.body" type="button" role="menuitem" class="menu-row" @click="emit('copy')"><Copy class="size-[18px]" />Копировать текст</button>
        <button type="button" role="menuitem" class="menu-row" @click="emit('forward')"><Forward class="size-[18px]" />Переслать</button>
        <button v-if="canPin && !message.pending" type="button" role="menuitem" class="menu-row" @click="emit('pin')"><PinOff v-if="message.pinnedAt" class="size-[18px]" /><Pin v-else class="size-[18px]" />{{ message.pinnedAt ? "Открепить" : "Закрепить" }}</button>
        <button v-if="message.gif" type="button" role="menuitem" class="menu-row" @click="favorite"><Star class="size-[18px]" :class="isFavorite(message.gif.key) ? 'fill-warning text-warning' : ''" />{{ isFavorite(message.gif.key) ? "Убрать из избранного" : "В избранное" }}</button>
        <a v-if="file" :href="`${apiUrl(file.url)}?download=1`" role="menuitem" class="menu-row" @click="emit('close')"><Download class="size-[18px]" />Скачать файл</a>
        <button v-if="mine && !message.forwardedFrom && !message.gif" type="button" role="menuitem" class="menu-row" @click="emit('edit')"><Pencil class="size-[18px]" />Изменить</button>
        <template v-if="mine">
          <div class="mx-1 my-1 h-px bg-separator" />
          <button type="button" role="menuitem" class="menu-row text-muted" @click="showViews">
            <Eye class="size-[18px]" /><span class="flex-1">{{ seen ? `Просмотрено · ${seen}` : "Никто не просмотрел" }}</span><ChevronRight v-if="seen" class="size-4" />
          </button>
        </template>
        <template v-if="canDelete">
          <div class="mx-1 my-1 h-px bg-separator" />
          <button type="button" role="menuitem" class="menu-row text-danger hover:!bg-danger/10" @click="remove"><Trash2 class="size-[18px]" />{{ confirming ? "Точно удалить? Нажмите ещё раз" : "Удалить" }}</button>
        </template>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  height: 2.5rem;
  padding: 0 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  text-align: left;
  transition: background-color 120ms;
}
.menu-row:hover,
.menu-row:focus-visible {
  background: var(--default);
  outline: none;
}
</style>
