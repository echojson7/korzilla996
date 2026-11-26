<!-- Меню действий с сообщением: по кнопке «⋯» у пузыря и по правому
     щелчку. Сверху — быстрые реакции, ниже — действия. Встаёт у точки
     щелчка и не вылезает за экран; Esc, щелчок мимо и прокрутка закрывают. -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Reply, Copy, Forward, Pencil, Trash2, Download, Smile } from "@lucide/vue";
import EmojiPicker from "./EmojiPicker.vue";
import { QUICK } from "../../lib/emoji";
import { apiUrl } from "../../lib/api";
import type { ChatMessage } from "../../lib/messenger";

const props = defineProps<{ message: ChatMessage; x: number; y: number; mine: boolean; canDelete: boolean }>();
const emit = defineEmits<{ close: []; react: [emoji: string]; reply: []; copy: []; forward: []; edit: []; remove: [] }>();

const box = ref<HTMLElement | null>(null);
const pos = ref({ left: props.x, top: props.y });
const picking = ref(false);
const confirming = ref(false);

async function place() {
  await nextTick();
  const el = box.value;
  if (!el) return;
  const { width, height } = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, props.x), window.innerWidth - width - 8);
  const top = props.y + height > window.innerHeight - 8 ? Math.max(8, props.y - height) : props.y;
  pos.value = { left, top };
}
watch(() => [props.x, props.y, picking.value], place);

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
      class="fixed z-[80] w-[264px] rounded-2xl bg-overlay p-1.5 text-overlay-foreground shadow-overlay"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
      @contextmenu.prevent
    >
      <EmojiPicker v-if="picking" @pick="(emoji) => emit('react', emoji)" />
      <template v-else>
        <div class="flex items-center justify-between px-0.5 pb-1">
          <button v-for="emoji in QUICK.slice(0, 6)" :key="emoji" type="button" class="flex size-9 items-center justify-center rounded-full text-[22px] leading-none transition hover:scale-110 hover:bg-default" :aria-label="`Реакция ${emoji}`" @click="emit('react', emoji)">{{ emoji }}</button>
          <button type="button" class="flex size-9 items-center justify-center rounded-full text-muted hover:bg-default" aria-label="Другая реакция" @click="picking = true"><Smile class="size-5" /></button>
        </div>
        <div class="mx-1 mb-1 h-px bg-separator" />
        <button type="button" role="menuitem" class="menu-row" @click="emit('reply')"><Reply class="size-[18px]" />Ответить</button>
        <button v-if="message.body" type="button" role="menuitem" class="menu-row" @click="emit('copy')"><Copy class="size-[18px]" />Копировать текст</button>
        <button type="button" role="menuitem" class="menu-row" @click="emit('forward')"><Forward class="size-[18px]" />Переслать</button>
        <a v-if="file" :href="`${apiUrl(file.url)}?download=1`" role="menuitem" class="menu-row" @click="emit('close')"><Download class="size-[18px]" />Скачать файл</a>
        <button v-if="mine && !message.forwardedFrom" type="button" role="menuitem" class="menu-row" @click="emit('edit')"><Pencil class="size-[18px]" />Изменить</button>
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
