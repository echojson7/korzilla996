<!-- Открытый чат: шапка, лента сообщений по дням, поле ввода. Свои
     сообщения справа. Наведение на сообщение — реакции, ответ, правка,
     удаление; на телефоне то же по нажатию. Файлы можно бросить в ленту. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Info, Pin, PinOff, X, Smile, ExternalLink, MoreHorizontal, Forward, Check, CheckCheck, Clock, AlertCircle, Download, FileText, ChevronDown, Upload } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import { href } from "../../lib/router";
import Composer from "./Composer.vue";
import EmojiPicker from "./EmojiPicker.vue";
import ChatInfo from "./ChatInfo.vue";
import SystemLine from "./SystemLine.vue";
import MessageMenu from "./MessageMenu.vue";
import GifView from "./GifView.vue";
import ForwardDialog from "./ForwardDialog.vue";
import Popover from "../Popover.vue";
import { apiUrl } from "../../lib/api";
import { QUICK, remember } from "../../lib/emoji";
import { plural } from "../../lib/format";
import {
  chatById, threadOf, openThread, loadOlder, sendMessage, sendGif, editMessage, deleteMessage, toggleReaction, markRead, togglePin, dropFailed,
  typingIn, sendTyping, person, people, meId, focused, clock, dayLabel, fileSize, type ChatMessage, type ChatFile, type ChatUser,
} from "../../lib/messenger";
import { toast } from "../../lib/toast";
import { entityOf, entityTitle } from "../../lib/entities";
import { messageLayout } from "../../lib/look";
import type { GifItem } from "../../lib/gifs";
import { can } from "../../lib/access";

/* closeTab — крестик закрытия рисует сама панель снаружи (ярлычок), в шапке его нет. */
const props = withDefaults(defineProps<{ chatId: number; panel?: boolean; back?: boolean; closeTab?: boolean }>(), { panel: false, back: false, closeTab: false });
const emit = defineEmits<{ close: []; back: [] }>();

const chat = computed(() => chatById(props.chatId));
const kind = computed(() => entityOf(chat.value?.entity));
const thread = computed(() => threadOf(props.chatId));
const loading = ref(false);
const failed = ref(false);
const scroller = ref<HTMLElement | null>(null);
const composer = ref<InstanceType<typeof Composer> | null>(null);
const replyTo = ref<ChatMessage | null>(null);
const editing = ref<ChatMessage | null>(null);
const active = ref<number | null>(null);
const infoOpen = ref(false);
const viewer = ref<ChatFile | null>(null);
const dropping = ref(false);
const atBottom = ref(true);

const typers = computed(() => typingIn(props.chatId));
/* «Анна печатает…», «Анна, Глеб печатают…», «Анна, Глеб, Вера и ещё 2 печатают…». */
const typingText = computed(() => {
  const names = typers.value.map((one) => one.name.split(/\s+/)[0]);
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} печатает…`;
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} и ещё ${names.length - 3} печатают…` : `${shown} печатают…`;
});
const sub = computed(() => {
  const one = chat.value;
  if (!one) return "";
  if (typers.value.length === 1) return one.type === "group" ? `${typers.value[0].name} печатает…` : "печатает…";
  if (typers.value.length > 1) return `${typers.value.length} человека печатают…`;
  if (one.type === "group") return plural(one.members.length, "участник", "участника", "участников");
  const peer = person(one.peer);
  return [peer?.position, peer?.department].filter(Boolean).join(" · ") || "Личный чат";
});
/* Аватарки прочитавших — под последним своим сообщением, до которого
   дочитал каждый, как в Битрикс24. */
const readersAt = computed(() => {
  const out = new Map<number, ChatUser[]>();
  const own = thread.value.messages.filter((m) => m.userId === meId.value && !m.pending && !m.deleted && m.kind !== "system");
  for (const [id, upto] of Object.entries(chat.value?.reads ?? {})) {
    const who = person(Number(id));
    if (!who || !upto) continue;
    let target: ChatMessage | undefined;
    for (let i = own.length - 1; i >= 0; i--) if (own[i].id <= upto) { target = own[i]; break; }
    if (!target) continue;
    if (!out.has(target.id)) out.set(target.id, []);
    out.get(target.id)!.push(who);
  }
  return out;
});
const seenCount = (message: ChatMessage) => Object.entries(chat.value?.reads ?? {}).filter(([id, upto]) => upto >= message.id && Number(id) !== message.userId).length;
const readUpTo = computed(() => Math.max(thread.value.readUpTo, chat.value?.readUpTo ?? 0));

/* Лента: разделители дней и «шапка» у первого сообщения серии. */
const rows = computed(() => {
  const out: { message: ChatMessage; day: string | null; head: boolean; tail: boolean }[] = [];
  const list = thread.value.messages;
  list.forEach((message, i) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    const day = !prev || new Date(prev.at).toDateString() !== new Date(message.at).toDateString() ? dayLabel(message.at) : null;
    const near = (a?: ChatMessage, b?: ChatMessage) => !!a && !!b && a.userId === b.userId && !a.deleted && a.kind !== "system" && b.kind !== "system" && Math.abs(Date.parse(b.at) - Date.parse(a.at)) < 5 * 60_000 && new Date(a.at).toDateString() === new Date(b.at).toDateString();
    out.push({ message, day, head: !!day || !near(prev, message), tail: !near(message, next) });
  });
  return out;
});
/* Серии для ленты: новая — у нового автора, дня, системного сообщения и
   у отметки «Новые сообщения». */
const series = computed(() => {
  const out: { key: number; day: string | null; unread: boolean; system: boolean; rows: typeof rows.value }[] = [];
  for (const row of rows.value) {
    const unread = !!unreadMark.value && row.message.id === unreadMark.value;
    const system = row.message.kind === "system";
    const last = out[out.length - 1];
    if (!last || row.head || unread || system || last.system) out.push({ key: row.message.id, day: row.day, unread, system, rows: [{ ...row, head: true }] });
    else last.rows.push(row);
  }
  return out;
});
const firstUnread = computed(() => {
  const last = chat.value?.lastReadId ?? 0;
  return thread.value.messages.find((m) => m.id > last && m.userId !== meId.value && !m.pending && m.kind !== "system")?.id ?? null;
});
const unreadMark = ref<number | null>(null);

/* ---------- Загрузка и прокрутка ---------- */

function toBottom(smooth = false) {
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  });
}

async function load() {
  failed.value = false;
  replyTo.value = null;
  editing.value = null;
  active.value = null;
  focused.value = props.chatId;
  const known = thread.value.loaded;
  loading.value = !known;
  settling = true;
  try {
    await openThread(props.chatId);
    unreadMark.value = firstUnread.value;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
  /* Открытый чат сразу стоит на последних сообщениях, без прокрутки
     через всю ленту: прыжок после того, как лента отрисована. */
  await nextTick();
  jumpToBottom();
  requestAnimationFrame(() => {
    jumpToBottom();
    settling = false;
    read();
  });
}

let settling = true;
function jumpToBottom() {
  const el = scroller.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  atBottom.value = true;
}

function read() {
  if (!document.hidden && atBottom.value && focused.value === props.chatId) markRead(props.chatId);
}

async function onScroll() {
  const el = scroller.value;
  if (!el) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  if (atBottom.value) read();
  if (el.scrollTop < 120 && thread.value.hasMore && !thread.value.loadingOlder) {
    const before = el.scrollHeight;
    await loadOlder(props.chatId).catch(() => toast("Не получилось загрузить старые сообщения", "danger"));
    await nextTick();
    el.scrollTop += el.scrollHeight - before;
  }
}

/* Плавно — только к новому сообщению в уже открытом чате. */
watch(() => [props.chatId, thread.value.messages.length] as const, ([id, now], [wasId, was]) => {
  const last = thread.value.messages.at(-1);
  if (!last || settling || id !== wasId || !was) return;
  if (atBottom.value || (last.userId === meId.value && now > was)) toBottom(true);
  read();
});

watch(() => props.chatId, load);
onMounted(load);
/* Вернулись на вкладку — отметить прочитанным, что видно. */
const onVisible = () => !document.hidden && read();
onMounted(() => document.addEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => {
  if (focused.value === props.chatId) focused.value = null;
});

/* ---------- Действия ---------- */

function send(body: string, files: File[]) {
  const reply = replyTo.value;
  replyTo.value = null;
  unreadMark.value = null;
  atBottom.value = true;
  sendMessage(props.chatId, body, files, reply);
}
function sendGifHere(item: GifItem) {
  const reply = replyTo.value;
  replyTo.value = null;
  unreadMark.value = null;
  atBottom.value = true;
  sendGif(props.chatId, item, reply);
}
function save(body: string) {
  const message = editing.value;
  editing.value = null;
  if (message && body !== (message.body ?? "")) editMessage(message, body);
}
function startReply(message: ChatMessage) {
  editing.value = null;
  replyTo.value = message;
  active.value = null;
}
function startEdit(message: ChatMessage) {
  replyTo.value = null;
  editing.value = message;
  active.value = null;
}
/* Нажатие пальцем показывает панель реакций (наведения нет). Мышью панель
   живёт только под курсором — щелчок её не «залипает». */
function tap(message: ChatMessage, event: MouseEvent) {
  const kind = (event as PointerEvent).pointerType;
  if (kind === "mouse" || !kind) {
    active.value = null;
    return;
  }
  active.value = active.value === message.id ? null : message.id;
}
/* Двойной щелчок по сообщению — ответ на него (выделенное двойным
   щелчком слово снимаем). В ссылках, картинках и кнопках не срабатывает. */
function quickReply(message: ChatMessage, event: MouseEvent) {
  if (message.deleted || message.pending || (event.target as HTMLElement).closest("a, button, img, video, input")) return;
  window.getSelection()?.removeAllRanges();
  startReply(message);
}
function react(message: ChatMessage, emoji: string) {
  remember(emoji);
  active.value = null;
  toggleReaction(message, emoji);
}
/* Меню действий: у кнопки «⋯» или в точке правого щелчка. */
const menu = ref<{ message: ChatMessage; x: number; y: number; views?: boolean } | null>(null);
const forwarding = ref<ChatMessage | null>(null);
function openMenu(message: ChatMessage, event: MouseEvent, views = false) {
  if (event.type === "contextmenu") {
    /* Свой текст можно выделить и скопировать штатно — в ссылке и выделении меню не мешаем. */
    if ((event.target as HTMLElement).closest("a") || String(window.getSelection() ?? "").trim()) return;
    event.preventDefault();
    menu.value = { message, x: event.clientX, y: event.clientY };
  } else {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu.value = { message, x: rect.left, y: rect.bottom + 6, views };
  }
  active.value = null;
}
/* Раскладка ленты из персонализации: свои справа (как в Telegram) или все
   слева с аватаркой и именем (как в Битрикс24 и Slack). */
const leftLayout = computed(() => messageLayout.value === "left");
const onRight = (message: ChatMessage) => !leftLayout.value && message.userId === meId.value;
const withAuthor = (message: ChatMessage) => leftLayout.value || (message.userId !== meId.value && chat.value?.type === "group");
const canDelete = (message: ChatMessage) => message.userId === meId.value || can("messenger", "moderate");
async function copyText(message: ChatMessage) {
  menu.value = null;
  try {
    await navigator.clipboard.writeText(message.body ?? "");
    toast("Текст скопирован");
  } catch {
    toast("Не получилось скопировать", "danger");
  }
}
function menuAction(name: "reply" | "copy" | "forward" | "edit" | "remove") {
  const message = menu.value?.message;
  menu.value = null;
  if (!message) return;
  if (name === "reply") startReply(message);
  else if (name === "copy") copyText(message);
  else if (name === "forward") forwarding.value = message;
  else if (name === "edit") startEdit(message);
  else deleteMessage(message);
}
function forwarded(ids: number[]) {
  forwarding.value = null;
  toast(ids.length === 1 ? "Сообщение переслано" : `Переслано в ${ids.length} чата`, "success");
}

function jump(id: number) {
  const el = scroller.value?.querySelector<HTMLElement>(`[data-id="${id}"]`);
  if (!el) return toast("Сообщение выше, прокрутите ленту");
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1400);
}

/* Перетаскивание файлов в чат. */
let depth = 0;
const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");
function onDragEnter(event: DragEvent) {
  if (!hasFiles(event)) return;
  depth++;
  dropping.value = true;
}
function onDragLeave() {
  depth = Math.max(0, depth - 1);
  if (!depth) dropping.value = false;
}
function onDrop(event: DragEvent) {
  depth = 0;
  dropping.value = false;
  composer.value?.addFiles(event.dataTransfer?.files);
}

/* Текст со ссылками — без v-html. */
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
/* @Имя сотрудника — подсвечено, длинные имена проверяются первыми. */
const MENTION_RE = computed(() => {
  const names = [...people.values()].map((one) => one.name.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  return names.length ? new RegExp(`(@(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))(?![\\p{L}\\p{N}])`, "giu") : null;
});
function parts(text: string) {
  const out: { text: string; link?: boolean; mention?: boolean }[] = [];
  text.split(URL_RE).forEach((chunk, i) => {
    if (i % 2 === 1 || !MENTION_RE.value || !chunk.includes("@")) return out.push({ text: chunk, link: i % 2 === 1 });
    chunk.split(MENTION_RE.value).forEach((piece, j) => out.push({ text: piece, mention: j % 2 === 1 }));
  });
  return out;
}
const onlyEmoji = (text: string | null) => !!text && text.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s|‍|️)+$/u.test(text) && !/^[\d#*\s]+$/.test(text);

function imageBox(file: ChatFile, many: boolean) {
  if (many || !file.width || !file.height) return {};
  const width = Math.min(320, file.width);
  return { width: `${width}px`, aspectRatio: `${file.width} / ${file.height}` };
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === "Escape" && viewer.value) viewer.value = null;
};
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col bg-surface" @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave="onDragLeave" @drop.prevent="onDrop">
    <header class="flex h-16 shrink-0 items-center gap-3 border-b border-separator px-3 md:px-4">
      <button v-if="back" type="button" class="button button--ghost button--icon-only md:hidden" aria-label="К списку чатов" @click="emit('back')"><ArrowLeft class="size-5" /></button>
      <button v-if="chat" type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="infoOpen = true">
        <ChatFace :chat="chat" size="md" />
        <span class="min-w-0">
          <span class="flex min-w-0 items-center gap-2">
            <span v-if="kind" class="chip chip--sm chip--soft chip--accent shrink-0"><component :is="kind.icon" class="size-3.5" /><span class="chip__label">{{ kind.label }}</span></span>
            <span class="truncate font-semibold">{{ kind ? entityTitle(chat.title, chat.entity) : chat.title }}</span>
          </span>
          <span class="block truncate text-xs" :class="typers.length ? 'text-accent' : 'text-muted'">{{ sub }}</span>
        </span>
      </button>
      <span v-else class="flex-1" />
      <!-- Чат карточки: открыть саму задачу, сделку… -->
      <a v-if="kind" :href="kind.href" class="button button--secondary button--sm shrink-0" :title="kind.open" @click="panel && emit('close')"><ExternalLink class="size-4" /><span class="hidden sm:inline">{{ kind.open }}</span></a>
      <slot name="header-extra" />
      <button v-if="chat" type="button" class="button button--ghost button--icon-only" :aria-label="chat.pinned ? 'Открепить' : 'Закрепить'" :title="chat.pinned ? 'Открепить' : 'Закрепить наверху'" @click="togglePin(chat)">
        <PinOff v-if="chat.pinned" class="size-[18px]" /><Pin v-else class="size-[18px]" />
      </button>
      <button v-if="chat" type="button" class="button button--ghost button--icon-only" aria-label="О чате" title="О чате" @click="infoOpen = true"><Info class="size-[18px]" /></button>
      <button v-if="panel && !closeTab" type="button" class="button button--ghost button--icon-only" aria-label="Закрыть" @click="emit('close')"><X class="size-5" /></button>
    </header>

    <div class="chat-wall relative flex min-h-0 flex-1 flex-col">
    <div ref="scroller" class="relative min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-1 sm:px-4 lg:px-5 thin-scroll" @scroll.passive="onScroll" @click.self="active = null">
      <p v-if="loading" class="py-16 text-center text-sm text-muted">Загружаем сообщения…</p>
      <div v-else-if="failed" class="py-16 text-center text-sm text-muted">
        Не получилось загрузить чат.
        <button type="button" class="link" @click="load">Ещё раз</button>
      </div>
      <template v-else>
        <p v-if="thread.loadingOlder" class="py-2 text-center text-xs text-muted">Загружаем…</p>
        <p v-else-if="!thread.hasMore && thread.messages.length" class="py-3 text-center text-xs text-muted">Начало переписки</p>
        <div v-if="!thread.messages.length" class="flex h-full flex-col items-center justify-center text-center text-sm text-muted">
          <ChatFace v-if="chat" :chat="chat" size="xl" />
          <p class="mt-3 font-medium text-foreground">Сообщений пока нет</p>
          <p>Напишите первым 👋</p>
        </div>

        <!-- Серия — подряд идущие сообщения одного автора. Аватар у серии один:
             внизу, «прилипает» к низу экрана и едет вместе с серией до
             следующего автора, как в Telegram. Имя — у первого сообщения. -->
        <template v-for="group in series" :key="group.key">
          <div v-if="group.day" class="sticky top-0 z-10 flex justify-center py-2">
            <span class="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur">{{ group.day }}</span>
          </div>
          <div v-if="group.unread" class="my-2 flex items-center gap-3 text-xs font-medium text-accent">
            <span class="h-px flex-1 bg-accent/40" />Новые сообщения<span class="h-px flex-1 bg-accent/40" />
          </div>
          <!-- Системное: карточкой события, без действий. -->
          <SystemLine v-if="group.system" :data-id="group.rows[0].message.id" :message="group.rows[0].message" />
          <div v-else class="mt-2.5 flex gap-2" :class="onRight(group.rows[0].message) ? 'flex-row-reverse' : ''">
            <div v-if="withAuthor(group.rows[0].message)" class="flex w-8 shrink-0 flex-col justify-end">
              <a v-if="group.rows[0].message.userId" :href="href('/profile', { id: group.rows[0].message.userId })" class="sticky bottom-1 rounded-full" :aria-label="`Профиль: ${person(group.rows[0].message.userId)?.name ?? ''}`" @click.stop><ChatFace :user="person(group.rows[0].message.userId)" size="sm" /></a>
            </div>
            <div class="min-w-0 flex-1">
          <div
            v-for="row in group.rows"
            :key="row.message.id"
            :data-id="row.message.id"
            class="group/msg relative flex gap-2 rounded-xl transition-colors"
            :class="[onRight(row.message) ? 'flex-row-reverse' : '', row.head ? '' : 'mt-0.5']"
            @click="tap(row.message, $event)"
            @dblclick="quickReply(row.message, $event)"
            @pointerleave="(event) => event.pointerType === 'mouse' && active === row.message.id && (active = null)"
            @contextmenu="!row.message.deleted && !row.message.pending && openMenu(row.message, $event)"
          >
            <div class="flex max-w-[min(540px,82%)] min-w-0 flex-col" :class="onRight(row.message) ? 'items-end' : 'items-start'">
              <div
                class="relative min-w-0 rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-sm"
                :class="[
                  row.message.deleted ? 'bg-surface-secondary text-muted italic' : row.message.userId === meId ? 'bubble-mine' : 'bg-surface',
                  onlyEmoji(row.message.body) && !row.message.files.length && !row.message.replyTo ? '!bg-transparent !shadow-none text-[40px] leading-tight px-0' : '',
                  row.message.gif && !row.message.deleted && !row.message.replyTo && !row.message.forwardedFrom ? '!bg-transparent !shadow-none !p-0' : '',
                  row.message.failed ? 'ring-2 ring-danger/50' : '',
                ]"
              >
                <p v-if="row.head && withAuthor(row.message) && !row.message.deleted" class="text-[13px] font-semibold" :style="{ color: `oklch(0.55 0.14 ${person(row.message.userId)?.hue ?? 220})` }">
                  {{ person(row.message.userId)?.name ?? "Сотрудник" }}
                </p>
                <template v-if="row.message.deleted">Сообщение удалено</template>
                <template v-else>
                  <p v-if="row.message.forwardedFrom" class="mb-0.5 flex items-center gap-1 text-[13px] text-accent"><Forward class="size-3.5" />Переслано от <b class="font-semibold">{{ person(row.message.forwardedFrom)?.name ?? "сотрудника" }}</b></p>
                  <button v-if="row.message.replyTo" type="button" class="my-1 block w-full max-w-72 rounded-lg border-l-2 border-accent bg-black/5 px-2 py-1 text-left text-[13px] dark:bg-white/5" @click.stop="jump(row.message.replyTo.id)">
                    <span class="block font-semibold text-accent">{{ person(row.message.replyTo.userId)?.name ?? "Сотрудник" }}</span>
                    <span class="block truncate text-muted">{{ row.message.replyTo.text }}</span>
                  </button>
                  <GifView v-if="row.message.gif" :gif="row.message.gif" class="my-0.5" @load="atBottom && jumpToBottom()" />

                  <div v-if="row.message.files.some((f) => f.image)" class="my-1 grid gap-1" :class="row.message.files.filter((f) => f.image).length > 1 ? 'grid-cols-2' : ''">
                    <button v-for="file in row.message.files.filter((f) => f.image)" :key="file.id" type="button" class="block max-w-[320px] overflow-hidden rounded-xl bg-black/5" :style="imageBox(file, row.message.files.filter((f) => f.image).length > 1)" @click.stop="viewer = file">
                      <img :src="apiUrl(file.url)" :alt="file.name" class="size-full max-h-[360px] object-cover" :class="row.message.files.filter((f) => f.image).length > 1 ? 'aspect-square' : ''" loading="lazy" @load="atBottom && jumpToBottom()" />
                    </button>
                  </div>
                  <component
                    :is="row.message.pending ? 'div' : 'a'"
                    v-for="file in row.message.files.filter((f) => !f.image || row.message.pending)"
                    :key="file.id"
                    :href="row.message.pending ? undefined : `${apiUrl(file.url)}?download=1`"
                    class="my-1 flex max-w-72 items-center gap-2.5 rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5"
                    :class="row.message.pending ? '' : 'hover:bg-black/10'"
                    @click.stop
                  >
                    <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FileText class="size-5" /></span>
                    <span class="min-w-0 flex-1 text-[13px]"><span class="block truncate font-medium">{{ file.name }}</span><span class="text-muted">{{ fileSize(file.size) }}</span></span>
                    <Download v-if="!row.message.pending" class="size-4 shrink-0 text-muted" />
                  </component>
                  <div v-if="row.message.pending && row.message.files.length && !row.message.failed" class="my-1 h-1 overflow-hidden rounded-full bg-black/10"><div class="h-full bg-accent transition-[width]" :style="{ width: `${Math.round((row.message.progress ?? 0) * 100)}%` }" /></div>

                  <p v-if="row.message.body" class="break-words whitespace-pre-wrap">
                    <template v-for="(part, i) in parts(row.message.body)" :key="i"><a v-if="part.link" :href="part.text" target="_blank" rel="noopener noreferrer" class="link break-all" @click.stop>{{ part.text }}</a><span v-else-if="part.mention" class="font-medium text-accent">{{ part.text }}</span><template v-else>{{ part.text }}</template></template>
                  </p>
                </template>
                <span class="float-right mt-1 ml-2 flex items-center gap-1 text-[11px] leading-4 text-muted not-italic select-none" :class="onlyEmoji(row.message.body) ? 'text-xs' : ''">
                  <span v-if="row.message.editedAt && !row.message.deleted">изм.</span>
                  {{ clock(row.message.at) }}
                  <template v-if="row.message.userId === meId && !row.message.deleted">
                    <AlertCircle v-if="row.message.failed" class="size-3.5 text-danger" />
                    <Clock v-else-if="row.message.pending" class="size-3" />
                    <CheckCheck v-else-if="readUpTo >= row.message.id" class="size-4 text-sky-500 dark:text-sky-400" aria-label="Прочитано" />
                    <Check v-else class="size-3.5" aria-label="Доставлено" />
                  </template>
                </span>
                <!-- Реакция — кружок в нижнем углу пузыря, только при наведении. -->
                <template v-if="!row.message.deleted && !row.message.pending">
                <Popover class="!absolute -bottom-2.5 z-10 transition-opacity" :class="[onRight(row.message) ? '-left-3' : '-right-3', active === row.message.id ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 has-[[aria-expanded=true]]:opacity-100']" :align="onRight(row.message) ? 'right' : 'left'" up width="w-auto">
                  <template #trigger="{ toggle, open }">
                    <button type="button" class="msg-side-btn !size-7" aria-label="Поставить реакцию" title="Реакция" :aria-expanded="open" @click="toggle"><Smile class="size-4" /></button>
                  </template>
                  <template #default="{ close }">
                    <div class="flex items-center gap-0.5 px-1 pb-1">
                      <button v-for="emoji in QUICK.slice(0, 7)" :key="emoji" type="button" class="flex size-9 items-center justify-center rounded-full text-[22px] leading-none transition hover:scale-125 hover:bg-default" :aria-label="`Реакция ${emoji}`" @click="close(); react(row.message, emoji)">{{ emoji }}</button>
                    </div>
                    <EmojiPicker @pick="(emoji) => { close(); react(row.message, emoji); }" />
                  </template>
                </Popover>
                </template>
              </div>

              <p v-if="row.message.failed" class="mt-1 text-xs text-danger">
                Не отправлено · <button type="button" class="underline" @click.stop="dropFailed(chatId, row.message.id)">убрать</button>
              </p>

              <div v-if="row.message.reactions.length" class="mt-1 flex flex-wrap gap-1">
                <button
                  v-for="one in row.message.reactions"
                  :key="one.emoji"
                  type="button"
                  class="flex h-6 items-center gap-1 rounded-full border px-1.5 text-sm transition"
                  :class="one.users.includes(meId) ? 'border-accent bg-accent-soft text-accent-soft-foreground' : 'border-separator bg-surface hover:border-accent/50'"
                  :title="one.users.map((id) => person(id)?.name ?? 'Сотрудник').join(', ')"
                  @click.stop="react(row.message, one.emoji)"
                >
                  <span class="leading-none">{{ one.emoji }}</span><span class="text-xs font-medium tabular-nums">{{ one.users.length }}</span>
                </button>
              </div>
              <!-- Кто дочитал до этого сообщения. -->
              <button
                v-if="readersAt.get(row.message.id)?.length"
                type="button"
                class="mt-1 flex items-center -space-x-1.5 rounded-full p-0.5 transition hover:bg-black/5"
                :title="`Просмотрели: ${readersAt.get(row.message.id)!.map((one) => one.name).join(', ')}`"
                @click.stop="openMenu(row.message, $event, true)"
              >
                <ChatFace v-for="one in readersAt.get(row.message.id)!.slice(0, 3)" :key="one.id" :user="one" size="xs" class="!size-[18px] !text-[8px] ring-2 ring-[var(--surface-secondary)]" />
                <span v-if="readersAt.get(row.message.id)!.length > 3" class="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-default px-1 text-[10px] font-semibold text-muted ring-2 ring-[var(--surface-secondary)]">+{{ readersAt.get(row.message.id)!.length - 3 }}</span>
              </button>
            </div>

            <!-- Сбоку пузыря при наведении: «⋯» — все действия (то же — правый
                 щелчок). Ответ — двойной щелчок по сообщению. -->
            <div
              v-if="!row.message.deleted && !row.message.pending"
              class="flex shrink-0 flex-col pt-0.5 transition-opacity"
              :class="active === row.message.id || menu?.message.id === row.message.id ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100'"
              @click.stop
              @dblclick.stop
            >
              <button
                type="button"
                class="msg-side-btn"
                aria-label="Действия с сообщением"
                title="Действия"
                @click="openMenu(row.message, $event)"
              ><MoreHorizontal class="size-[18px]" /></button>
            </div>
          </div>
            </div>
          </div>
        </template>
      </template>
      <!-- Отступ в конце ленты, после последнего сообщения: виден, только
           когда долистал вниз. В нём — «кто печатает» и будущие подсказки. -->
      <div v-if="!loading && !failed" class="flex h-8 items-center pt-1">
        <Transition name="fade">
          <p v-if="typingText" class="flex max-w-full items-center gap-2 rounded-full bg-surface/85 px-3 py-0.5 text-[13px] text-muted shadow-sm backdrop-blur" aria-live="polite">
            <span class="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            <span class="truncate">{{ typingText }}</span>
          </p>
        </Transition>
      </div>
    </div>
    <p v-if="chat?.readonly" class="relative z-10 mx-1.5 mb-1.5 rounded-2xl bg-surface/85 px-4 py-3 text-center text-sm text-muted shadow-sm backdrop-blur">В общий чат писать нельзя: так настроена ваша роль</p>
    <Composer v-else class="relative z-10 mx-1.5 mb-1.5" ref="composer" :draft-key="chatId" :reply-to="replyTo" :editing="editing" @send="send" @gif="sendGifHere" @typing="sendTyping(chatId)" @save="save" @cancel="replyTo = null; editing = null" />
    </div>

    <button v-if="!atBottom" type="button" class="absolute right-5 bottom-24 z-20 flex size-10 items-center justify-center rounded-full bg-overlay shadow-overlay" aria-label="К последним сообщениям" @click="toBottom(true)">
      <ChevronDown class="size-5" />
      <span v-if="chat?.unread" class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground">{{ chat.unread }}</span>
    </button>


    <div v-if="dropping" class="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/90 text-accent-soft-foreground">
      <Upload class="size-10" />
      <p class="mt-2 font-semibold">Отпустите, чтобы прикрепить</p>
    </div>

    <MessageMenu
      v-if="menu"
      :key="menu.message.id"
      :message="menu.message"
      :x="menu.x"
      :y="menu.y"
      :mine="menu.message.userId === meId"
      :can-delete="canDelete(menu.message)"
      :seen="menu.message.userId === meId ? seenCount(menu.message) : 0"
      :start-views="!!menu.views"
      @close="menu = null"
      @react="(emoji) => { const m = menu!.message; menu = null; react(m, emoji); }"
      @reply="menuAction('reply')"
      @copy="menuAction('copy')"
      @forward="menuAction('forward')"
      @edit="menuAction('edit')"
      @remove="menuAction('remove')"
    />
    <ForwardDialog :message="forwarding" @close="forwarding = null" @done="forwarded" />
    <ChatInfo :open="infoOpen" :chat="chat" @close="infoOpen = false" @left="panel ? emit('close') : emit('back')" />

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="viewer" class="fixed inset-0 z-[70] flex flex-col bg-black/90" @click.self="viewer = null">
          <div class="flex items-center gap-3 p-3 text-white">
            <span class="min-w-0 flex-1 truncate text-sm">{{ viewer.name }} · {{ fileSize(viewer.size) }}</span>
            <a :href="`${apiUrl(viewer.url)}?download=1`" class="flex size-10 items-center justify-center rounded-full hover:bg-white/15" aria-label="Скачать"><Download class="size-5" /></a>
            <button type="button" class="flex size-10 items-center justify-center rounded-full hover:bg-white/15" aria-label="Закрыть" @click="viewer = null"><X class="size-5" /></button>
          </div>
          <div class="flex min-h-0 flex-1 items-center justify-center p-4" @click.self="viewer = null">
            <img :src="apiUrl(viewer.url)" :alt="viewer.name" class="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
