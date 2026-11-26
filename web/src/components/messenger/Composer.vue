<!-- Поле ввода: Enter — отправить, Shift+Enter — новая строка. Скрепка,
     вставка из буфера и перетаскивание добавляют файлы. Над полем —
     ответ на сообщение или правка своего. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import { Paperclip, Smile, SendHorizontal, X, Reply, Pencil, FileText, Check } from "@lucide/vue";
import Popover from "../Popover.vue";
import EmojiPicker from "./EmojiPicker.vue";
import GifPicker from "./GifPicker.vue";
import type { GifItem } from "../../lib/gifs";
import { person, people, meId, fileSize, type ChatMessage } from "../../lib/messenger";
import ChatFace from "./ChatFace.vue";
import { toast } from "../../lib/toast";

const props = defineProps<{ replyTo: ChatMessage | null; editing: ChatMessage | null; draftKey: number }>();
const emit = defineEmits<{ send: [body: string, files: File[]]; gif: [item: GifItem]; save: [body: string]; cancel: []; typing: [] }>();

const MAX_FILES = 10;
const MAX_SIZE = 50 * 1024 * 1024;

const text = ref("");
const files = ref<File[]>([]);
const box = ref<HTMLTextAreaElement | null>(null);
const drafts = new Map<number, string>();

const previews = computed(() => files.value.map((file) => ({ file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null })));
const canSend = computed(() => (props.editing ? true : text.value.trim().length > 0 || files.value.length > 0));

/* Высота поля по тексту. Пустое поле не меряем: замер (height=auto и
   scrollHeight) заставляет браузер пересчитать раскладку всей ленты, а при
   смене чата это и было главной задержкой. */
function grow() {
  const el = box.value;
  if (!el) return;
  if (!text.value) {
    el.style.height = "";
    return;
  }
  el.style.height = "auto";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 60), 220)}px`;
}
watch(text, (next, prev) => {
  nextTick(grow);
  /* «Печатает…» — только когда человек сам набирает, не при смене чата. */
  if (next && next.length > (prev?.length ?? 0) && !props.editing && document.activeElement === box.value) emit("typing");
});

/* Черновик у каждого чата свой. */
watch(() => props.draftKey, (next, prev) => {
  if (prev != null) drafts.set(prev, text.value);
  text.value = drafts.get(next) ?? "";
  files.value = [];
  focus();
});
watch(() => props.editing, (message) => {
  text.value = message ? message.body ?? "" : "";
  focus();
});
watch(() => props.replyTo, (message) => message && focus());

/* Фокус — в следующем кадре, когда лента уже разложена: так он не
   заставляет пересчитывать её ещё раз посреди смены чата. */
let focusing = 0;
function focus() {
  cancelAnimationFrame(focusing);
  focusing = requestAnimationFrame(() => {
    box.value?.focus({ preventScroll: true });
    grow();
  });
}

function addFiles(list: FileList | File[] | null | undefined) {
  if (!list) return;
  for (const file of Array.from(list)) {
    if (file.size > MAX_SIZE) {
      toast(`«${file.name}» больше 50 МБ`, "danger");
      continue;
    }
    if (files.value.length >= MAX_FILES) {
      toast(`Не больше ${MAX_FILES} файлов за раз`, "danger");
      break;
    }
    files.value.push(file);
  }
  focus();
}
defineExpose({ addFiles, focus });

function onPaste(event: ClipboardEvent) {
  const pasted = Array.from(event.clipboardData?.files ?? []);
  if (pasted.length) {
    event.preventDefault();
    addFiles(pasted);
  }
}

function submit() {
  if (!canSend.value) return;
  if (props.editing) emit("save", text.value.trim());
  else {
    emit("send", text.value.trim(), [...files.value]);
    drafts.delete(props.draftKey);
  }
  text.value = "";
  files.value = [];
  mention.value = null;
  focus();
}

/* ---------- @упоминания: «@» и начало имени — список сотрудников ---------- */

const mention = ref<{ start: number; query: string } | null>(null);
const pickAt = ref(0);
function findMention() {
  const el = box.value;
  if (!el || el.selectionStart !== el.selectionEnd) return (mention.value = null);
  const before = text.value.slice(0, el.selectionStart);
  const hit = /(^|\s)@([\p{L}\p{N}]*(?: [\p{L}\p{N}]*)?)$/u.exec(before);
  mention.value = hit ? { start: before.length - hit[2].length - 1, query: hit[2].toLowerCase() } : null;
  pickAt.value = 0;
}
const candidates = computed(() => {
  const query = mention.value?.query;
  if (query == null) return [];
  return [...people.values()]
    .filter((one) => one.active && one.id !== meId.value && (!query || one.name.toLowerCase().startsWith(query) || one.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(query))))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .slice(0, 6);
});
/* Список упоминаний — в body, над полем по его ширине (Floating UI). */
const root = ref<HTMLElement | null>(null);
const mentionList = ref<HTMLElement | null>(null);
let stopMention: (() => void) | null = null;
function placeMention() {
  const anchor = root.value;
  const el = mentionList.value;
  if (!anchor || !el) return;
  computePosition(anchor, el, {
    strategy: "fixed",
    placement: "top-start",
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({ padding: 8, apply({ availableHeight, rects, elements }) {
        elements.floating.style.width = `${Math.round(rects.reference.width)}px`;
        elements.floating.style.maxHeight = `${Math.max(120, Math.floor(availableHeight))}px`;
      } }),
    ],
  }).then(({ x, y }) => Object.assign(el.style, { left: `${x}px`, top: `${y}px` }));
}
watch(() => !!(mention.value && candidates.value.length), async (on) => {
  stopMention?.();
  stopMention = null;
  if (!on) return;
  await nextTick();
  if (root.value && mentionList.value) stopMention = autoUpdate(root.value, mentionList.value, placeMention);
});
onBeforeUnmount(() => stopMention?.());

function pickMention(one: { name: string }) {
  const at = mention.value;
  const el = box.value;
  if (!at || !el) return;
  const insert = `@${one.name} `;
  const end = el.selectionStart;
  text.value = text.value.slice(0, at.start) + insert + text.value.slice(end);
  mention.value = null;
  nextTick(() => {
    el.focus();
    el.setSelectionRange(at.start + insert.length, at.start + insert.length);
  });
}

function onKey(event: KeyboardEvent) {
  if (mention.value && candidates.value.length && !event.isComposing) {
    const n = candidates.value.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      pickAt.value = (pickAt.value + (event.key === "ArrowDown" ? 1 : n - 1)) % n;
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pickMention(candidates.value[pickAt.value]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      mention.value = null;
      return;
    }
  }
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  } else if (event.key === "Escape" && (props.editing || props.replyTo)) {
    event.preventDefault();
    emit("cancel");
  }
}

function insertEmoji(emoji: string) {
  const el = box.value;
  const start = el?.selectionStart ?? text.value.length;
  const end = el?.selectionEnd ?? text.value.length;
  text.value = text.value.slice(0, start) + emoji + text.value.slice(end);
  nextTick(() => {
    el?.focus();
    el?.setSelectionRange(start + emoji.length, start + emoji.length);
  });
}

const input = ref<HTMLInputElement | null>(null);
function onPick(event: Event) {
  const el = event.target as HTMLInputElement;
  addFiles(el.files);
  el.value = "";
}
</script>

<template>
  <div ref="root" class="relative rounded-2xl bg-surface px-2 py-2 shadow-[0_2px_12px_-2px_rgb(0_0_0/0.14)] ring-1 ring-black/5 dark:ring-white/10" @click.self="box?.focus()">
    <Teleport to="body">
      <ul v-if="mention && candidates.length" ref="mentionList" class="popover-layer fixed top-0 left-0 overflow-y-auto overscroll-contain rounded-xl bg-overlay p-1 shadow-overlay thin-scroll" role="listbox" aria-label="Упомянуть">
        <li v-for="(one, i) in candidates" :key="one.id">
          <button
            type="button"
            role="option"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm"
            :class="i === pickAt ? 'bg-default' : 'hover:bg-default'"
            :aria-selected="i === pickAt"
            @mousedown.prevent="pickMention(one)"
            @mouseenter="pickAt = i"
          >
            <ChatFace :user="one" size="xs" /><span class="truncate">{{ one.name }}</span>
          </button>
        </li>
      </ul>
    </Teleport>
    <div v-if="editing || replyTo" class="mx-1 mt-0.5 mb-1.5 flex items-center gap-2 rounded-xl bg-surface-secondary px-3 py-2 text-sm">
      <Pencil v-if="editing" class="size-4 shrink-0 text-accent" />
      <Reply v-else class="size-4 shrink-0 text-accent" />
      <div class="min-w-0 flex-1 border-l-2 border-accent pl-2">
        <p class="text-xs font-semibold text-accent">{{ editing ? "Правка сообщения" : person(replyTo?.userId)?.name ?? "Ответ" }}</p>
        <p class="truncate text-muted">{{ (editing ?? replyTo)?.body || "Файл" }}</p>
      </div>
      <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Отменить" @click="emit('cancel')"><X class="size-4" /></button>
    </div>

    <div v-if="files.length" class="mx-1 mt-1 mb-1 flex gap-2 overflow-x-auto pb-1 thin-scroll">
      <div v-for="(one, i) in previews" :key="i" class="group relative flex h-16 shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-separator bg-surface-secondary" :class="one.url ? 'w-16' : 'max-w-56 px-3'">
        <img v-if="one.url" :src="one.url" alt="" class="size-full object-cover" />
        <template v-else>
          <FileText class="size-6 shrink-0 text-muted" />
          <span class="min-w-0 text-xs"><span class="block truncate font-medium">{{ one.file.name }}</span><span class="text-muted">{{ fileSize(one.file.size) }}</span></span>
        </template>
        <button type="button" class="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Убрать файл" @click="files.splice(i, 1)"><X class="size-3" /></button>
      </div>
    </div>

    <!-- Вся полоса — поле ввода, как в Telegram: кнопки по 40 px по краям,
         текст растёт вверх, кнопки остаются на уровне последней строки. -->
    <div class="flex cursor-text items-end gap-1" @click.self="box?.focus()">
      <button v-if="!editing" type="button" class="composer-btn self-start" aria-label="Прикрепить файл" title="Прикрепить файл" @click="input?.click()"><Paperclip class="size-[22px]" /></button>
      <input ref="input" type="file" multiple class="hidden" @change="onPick" />
      <textarea
        ref="box"
        v-model="text"
        rows="1"
        class="thin-scroll block max-h-[220px] min-h-[60px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-5 outline-none placeholder:text-muted"
        :class="editing ? 'pl-3' : ''"
        placeholder="Напишите сообщение…"
        aria-label="Сообщение"
        @keydown="onKey"
        @input="findMention"
        @click="findMention"
        @keyup.left="findMention"
        @keyup.right="findMention"
        @blur="mention = null"
        @paste="onPaste"
      />
      <Popover v-if="!editing" align="right" up width="w-auto" class="flex shrink-0">
        <template #trigger="{ toggle, open }">
          <button type="button" class="composer-btn" :class="open ? 'text-accent' : ''" aria-label="GIF и стикеры" title="GIF и стикеры" @click="toggle"><span class="flex h-[18px] items-center rounded-[5px] border-2 border-current px-[3px] text-[10px] leading-none font-extrabold tracking-tight">GIF</span></button>
        </template>
        <template #default="{ close }"><GifPicker @pick="(item) => { close(); emit('gif', item); }" /></template>
      </Popover>
      <Popover align="right" up width="w-auto" class="flex shrink-0">
        <template #trigger="{ toggle }">
          <button type="button" class="composer-btn" aria-label="Смайлики" title="Смайлики" @click="toggle"><Smile class="size-[22px]" /></button>
        </template>
        <EmojiPicker @pick="insertEmoji" />
      </Popover>
      <button type="button" class="composer-btn composer-btn--send" :disabled="!canSend" :aria-label="editing ? 'Сохранить' : 'Отправить'" :title="editing ? 'Сохранить' : 'Отправить'" @click="submit"><Check v-if="editing" class="size-[22px]" /><SendHorizontal v-else class="size-[22px]" /></button>
    </div>
  </div>
</template>

