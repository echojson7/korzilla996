<!-- Открытый чат: шапка, лента сообщений по дням, поле ввода. Свои
     сообщения справа. Наведение на сообщение — реакции, ответ, правка,
     удаление; на телефоне то же по нажатию. Файлы можно бросить в ленту. -->
<script setup lang="ts">
import { backdrop } from "../../lib/backdrop";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Info, Pin, PinOff, List, X, ExternalLink, Download, ChevronDown, Upload } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import ReleaseCard from "./ReleaseCard.vue";
import { href, route, setQuery } from "../../lib/router";
import Composer from "./Composer.vue";
import ChatInfo from "./ChatInfo.vue";
import SystemLine from "./SystemLine.vue";
import MessageMenu from "./MessageMenu.vue";
import MessageRow from "./MessageRow.vue";
import ForwardDialog from "./ForwardDialog.vue";
import { apiUrl } from "../../lib/api";
import { remember } from "../../lib/emoji";
import { plural } from "../../lib/format";
import {
  chatById, threadOf, openThread, loadOlder, sendMessage, sendGif, editMessage, deleteMessage, toggleReaction, markRead, togglePin, togglePinMessage, previewOf, messageHref, dropFailed,
  typingIn, sendTyping, person, forgetChat, meId, focused, dayLabel, fileSize, type ChatMessage, type ChatFile, type ChatUser,
} from "../../lib/messenger";
import { toast } from "../../lib/toast";
import { entityOf, entityTitle } from "../../lib/entities";
import { messageLayout } from "../../lib/look";
import type { GifItem } from "../../lib/gifs";
import { can } from "../../lib/access";
import NoAccess from "../NoAccess.vue";
import { deniedOf, atLeast, type Denied } from "../../lib/denied";

/* closeTab — крестик закрытия рисует сама панель снаружи (ярлычок), в шапке его нет. */
const props = withDefaults(defineProps<{ chatId: number; panel?: boolean; back?: boolean; closeTab?: boolean }>(), { panel: false, back: false, closeTab: false });
const emit = defineEmits<{ close: []; back: [] }>();

/* Нет доступа / чата нет: вместо ленты — экран NoAccess, данные чата не берём. */
const denied = ref<"forbidden" | "not_found" | null>(null);
const chat = computed(() => (denied.value ? null : chatById(props.chatId)));
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
const shutViewer = backdrop(() => (viewer.value = null));
const shutViewer2 = backdrop(() => (viewer.value = null));
const dropping = ref(false);
const atBottom = ref(true);

/* Скелетон ленты: пузыри разной ширины. */
const SKELETON = ["46%", "34%", "58%", "40%", "28%", "52%"];
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

/* В ленте рисуем только последние WINDOW сообщений: длинная переписка
   целиком — это десятки тысяч узлов, и любое обновление (кто печатает,
   реакция, наведение) пересчитывает всю ленту. Выше — по прокрутке:
   сначала из уже загруженных, потом с сервера. Вернулись вниз — окно
   снова короткое. */
const WINDOW = 120;
const pinsOnly = ref(false);
const shown = ref(WINDOW);
const start = computed(() => Math.max(0, thread.value.messages.length - shown.value));

/* Лента: разделители дней и «шапка» у первого сообщения серии. */
const rows = computed(() => {
  const out: { message: ChatMessage; day: string | null; head: boolean; tail: boolean }[] = [];
  /* Режим «только закреплённые» — та же лента, но из списка закреплённых. */
  const list = pinsOnly.value ? [...thread.value.pins].sort((a, b) => a.id - b.id) : thread.value.messages;
  for (let i = pinsOnly.value ? 0 : start.value; i < list.length; i++) {
    const message = list[i];
    const prev = list[i - 1];
    const next = list[i + 1];
    const day = !prev || new Date(prev.at).toDateString() !== new Date(message.at).toDateString() ? dayLabel(message.at) : null;
    const near = (a?: ChatMessage, b?: ChatMessage) => !!a && !!b && a.userId === b.userId && !a.deleted && a.kind !== "system" && b.kind !== "system" && Math.abs(Date.parse(b.at) - Date.parse(a.at)) < 5 * 60_000 && new Date(a.at).toDateString() === new Date(b.at).toDateString();
    out.push({ message, day, head: !!day || !near(prev, message), tail: !near(message, next) });
  }
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
  denied.value = null;
  replyTo.value = null;
  editing.value = null;
  active.value = null;
  shown.value = WINDOW;
  focused.value = props.chatId;
  const known = thread.value.loaded;
  loading.value = !known;
  settling = true;
  try {
    await (known ? openThread(props.chatId) : atLeast(openThread(props.chatId)));
    unreadMark.value = firstUnread.value;
  } catch (error) {
    const state: Denied = deniedOf(error);
    if (state === "error") failed.value = true;
    else {
      forgetChat(props.chatId);
      denied.value = state;
    }
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
    consumeMsg();
  });
}

/* Пришли по «Перейти к сообщению» (msg=чат.сообщение в адресе) — к нему. */
async function consumeMsg() {
  const [chatId, id] = (route.value.query.get("msg") ?? "").split(".").map(Number);
  if (!id || chatId !== props.chatId || loading.value || failed.value) return;
  setQuery({ msg: null });
  await jump(id);
}
watch(() => route.value.query.get("msg"), () => !settling && consumeMsg());

/* «Перейти к сообщению»: из мини-чата, из чата карточки в мессенджере или к
   оригиналу пересланного. Если сообщение здесь же — просто прокрутка. */
const goTarget = (message: ChatMessage) => message.forwardedMsg ?? { chatId: props.chatId, id: message.id };
const canGo = (message: ChatMessage) => !!message.forwardedMsg || props.panel || pinsOnly.value || (route.value.path === "/messenger" && !!chat.value?.entity);
function goTo(message: ChatMessage) {
  const target = goTarget(message);
  const here = target.chatId === props.chatId;
  if (here && pinsOnly.value) return void showPins(false, target.id);
  if (here && !props.panel && !(route.value.path === "/messenger" && chat.value?.entity)) return void jump(target.id);
  location.hash = messageHref(target.chatId, target.id);
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

let growing = false;
async function onScroll() {
  const el = scroller.value;
  if (!el) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  if (pinsOnly.value) return;
  if (atBottom.value) {
    read();
    if (shown.value > WINDOW && !settling) shown.value = WINDOW;
  }
  if (el.scrollTop >= 120 || growing) return;
  const before = el.scrollHeight;
  if (start.value > 0) shown.value += 80;
  else if (thread.value.hasMore && !thread.value.loadingOlder) {
    const was = thread.value.messages.length;
    growing = true;
    await loadOlder(props.chatId).catch(() => toast("Не получилось загрузить старые сообщения", "danger"));
    growing = false;
    shown.value += thread.value.messages.length - was;
  } else return;
  await nextTick();
  el.scrollTop += el.scrollHeight - before;
}

/* Плавно — только к новому сообщению в уже открытом чате. */
watch(() => [props.chatId, thread.value.messages.length] as const, ([id, now], [wasId, was]) => {
  const last = thread.value.messages.at(-1);
  if (!last || settling || id !== wasId || !was || pinsOnly.value) return;
  /* Читают выше — новые снизу не должны сдвигать окно ленты. */
  if (!atBottom.value && now > was) shown.value += now - was;
  if (atBottom.value || (last.userId === meId.value && now > was)) toBottom(true);
  read();
});

watch(() => props.chatId, load);
onMounted(load);
/* Вернулись на вкладку — отметить прочитанным, что видно. */
const onVisible = () => !document.hidden && read();
onMounted(() => document.addEventListener("visibilitychange", onVisible));
/* Поле ввода выросло (ответ, правка, файлы, длинный текст) — лента ниже
   ужимается. Если стояли внизу, держим низ: последнее сообщение и строка
   «печатает» не уходят под поле ввода. */
let resize: ResizeObserver | null = null;
let lastHeight = 0;
onMounted(() => {
  if (!scroller.value || typeof ResizeObserver === "undefined") return;
  lastHeight = scroller.value.clientHeight;
  resize = new ResizeObserver(() => {
    const el = scroller.value;
    if (!el) return;
    const shrank = el.clientHeight < lastHeight;
    lastHeight = el.clientHeight;
    if (shrank && atBottom.value) el.scrollTop = el.scrollHeight;
  });
  resize.observe(scroller.value);
});
onBeforeUnmount(() => resize?.disconnect());
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
  /* В списке закреплённых щелчок ведёт к сообщению в общей ленте. */
  if (pinsOnly.value) return void showPins(false, message.id);
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
function menuAction(name: "reply" | "copy" | "forward" | "edit" | "remove" | "pin" | "go") {
  const message = menu.value?.message;
  menu.value = null;
  if (!message) return;
  if (name === "reply") startReply(message);
  else if (name === "copy") copyText(message);
  else if (name === "forward") forwarding.value = message;
  else if (name === "edit") startEdit(message);
  else if (name === "pin") togglePinMessage(message);
  else if (name === "go") goTo(message);
  else deleteMessage(message);
}
function forwarded(ids: number[]) {
  forwarding.value = null;
  toast(ids.length === 1 ? "Сообщение переслано" : `Переслано в ${ids.length} чата`, "success");
}

/* Закреплённые, как в Telegram: плашка под шапкой показывает одно,
   щелчок ведёт к нему и переключает на следующее (более старое). */
const pinIndex = ref(0);
watch(() => props.chatId, () => {
  pinIndex.value = 0;
  pinsOnly.value = false;
});
/* Открепили последнее, пока смотрели список, — назад в ленту. */
watch(() => thread.value.pins.length, (n) => n || (pinsOnly.value && showPins(false)));

/* Переключение ленты «все ↔ закреплённые» — на месте, мягким проявлением;
   при возврате лента встаёт туда же, где была. */
let feedTop = 0;
async function showPins(on: boolean, target?: number) {
  const el = scroller.value;
  if (!el || pinsOnly.value === on) return;
  if (on) feedTop = el.scrollTop;
  active.value = null;
  pinsOnly.value = on;
  await nextTick();
  if (on) el.scrollTop = el.scrollHeight;
  else if (target) await jump(target);
  else el.scrollTop = feedTop;
  el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
}
const pins = computed(() => thread.value.pins);
const pinShown = computed(() => pins.value[Math.min(pinIndex.value, pins.value.length - 1)] ?? null);
function pinText(message: ChatMessage) {
  const who = message.userId ? person(message.userId)?.name : "Korzilla CRM";
  return { who, text: previewOf(message).replace(/[#*_`>]+/g, "").trim() };
}
async function openPin() {
  const message = pinShown.value;
  if (!message) return;
  pinIndex.value = (Math.min(pinIndex.value, pins.value.length - 1) + 1) % pins.value.length;
  await jump(message.id);
}

async function jump(id: number) {
  /* Сообщение старше загруженного — догружаем ленту, пока не найдём. */
  for (let i = 0; i < 20 && !thread.value.messages.some((m) => m.id === id) && thread.value.hasMore; i++) {
    await loadOlder(props.chatId).catch(() => undefined);
  }
  const at = thread.value.messages.findIndex((m) => m.id === id);
  if (at >= 0 && at < start.value) {
    shown.value = thread.value.messages.length - at + 10;
    await nextTick();
  }
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
          <span class="block truncate font-semibold">{{ kind ? entityTitle(chat.title, chat.entity) : chat.title }}</span>
          <!-- Вторая строка: участники (или «печатает»), затем тип карточки. -->
          <span class="flex min-w-0 items-center gap-1.5 text-xs" :class="typers.length ? 'text-accent' : 'text-muted'">
            <span class="truncate">{{ sub }}</span>
            <template v-if="kind"><span aria-hidden="true">·</span><span class="inline-flex shrink-0 items-center gap-1 font-medium text-accent"><component :is="kind.icon" class="size-3.5" />{{ kind.label }}</span></template>
          </span>
        </span>
      </button>
      <span v-else-if="loading" class="flex min-w-0 flex-1 animate-pulse items-center gap-3" aria-hidden="true">
        <span class="size-10 shrink-0 rounded-full bg-default" />
        <span class="flex-1 space-y-1.5"><span class="block h-3.5 w-40 max-w-full rounded bg-default" /><span class="block h-3 w-24 rounded bg-default" /></span>
      </span>
      <span v-else-if="denied" class="min-w-0 flex-1 truncate font-semibold">Чат №{{ chatId }}</span>
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

    <!-- Закреплённые сообщения: полоски слева — сколько их и какое сейчас. -->
    <div v-if="pinShown" class="pin-bar flex h-[52px] shrink-0 items-center gap-1.5 border-b border-separator bg-surface pr-2 pl-3 md:pl-4">
      <Transition name="pin-swap" mode="out-in">
        <!-- Список закреплённых: назад к ленте. -->
        <button v-if="pinsOnly" key="back" type="button" class="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left" title="Назад к чату" @click="showPins(false)">
          <ArrowLeft class="size-[18px] shrink-0 text-accent" />
          <span class="truncate text-[14px] font-semibold">{{ plural(pins.length, "закреплённое сообщение", "закреплённых сообщения", "закреплённых сообщений") }}</span>
        </button>
        <button v-else key="one" type="button" class="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left" :title="pins.length > 1 ? 'К сообщению; следующий щелчок — к предыдущему закреплённому' : 'К сообщению'" @click="openPin">
          <span class="flex h-9 w-[3px] shrink-0 flex-col gap-[2px]" aria-hidden="true">
            <span v-for="(one, i) in pins.slice(0, 4)" :key="one.id" class="min-h-0 flex-1 rounded-full" :class="Math.min(pinIndex, pins.length - 1) % 4 === i ? 'bg-accent' : 'bg-accent/25'" />
          </span>
          <span class="min-w-0">
            <span class="block text-[13px] leading-4 font-semibold text-accent">Закреплённое сообщение{{ pins.length > 1 ? ` ${Math.min(pinIndex, pins.length - 1) + 1} из ${pins.length}` : "" }}</span>
            <span class="block truncate text-[13px] leading-5"><span v-if="pinText(pinShown).who" class="text-muted">{{ pinText(pinShown).who }}: </span>{{ pinText(pinShown).text }}</span>
          </span>
        </button>
      </Transition>
      <button v-if="chat?.canPin && !pinsOnly" type="button" class="button button--secondary button--sm shrink-0" @click="togglePinMessage(pinShown)"><PinOff class="size-4" />Открепить</button>
      <button type="button" class="button button--secondary button--sm shrink-0" :aria-pressed="pinsOnly" @click="showPins(!pinsOnly)"><ArrowLeft v-if="pinsOnly" class="size-4" /><List v-else class="size-4" />{{ pinsOnly ? "К чату" : "Все закреплённые" }}</button>
    </div>

    <div class="chat-wall relative flex min-h-0 flex-1 flex-col" :class="chat?.changelog ? 'chat-wall--changelog' : chat?.general ? 'chat-wall--general' : ''">
    <!-- Лента и кнопка «вниз» в одной обёртке: кнопка стоит над полем ввода
         при любой его высоте (ответ, правка, файлы, длинный текст). -->
    <div class="relative flex min-h-0 flex-1 flex-col">
    <div ref="scroller" class="relative min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-1 sm:px-4 lg:px-5 thin-scroll" @scroll.passive="onScroll" @click.self="active = null">
      <div v-if="loading" class="flex h-full animate-pulse flex-col justify-end gap-3 pb-2" aria-label="Загружаем сообщения…">
        <span v-for="(w, i) in SKELETON" :key="i" class="h-10 rounded-2xl bg-surface/80" :class="i % 3 === 1 ? 'self-end' : 'self-start'" :style="{ width: w }" />
      </div>
      <div v-else-if="denied" class="flex h-full items-center justify-center">
        <NoAccess :state="denied" what="chat" class="rounded-3xl bg-surface/90 shadow-sm backdrop-blur">
          <button v-if="back" type="button" class="button button--ghost button--sm md:hidden" @click="emit('back')">К списку чатов</button>
          <button v-if="panel" type="button" class="button button--ghost button--sm" @click="emit('close')">Закрыть</button>
        </NoAccess>
      </div>
      <div v-else-if="failed" class="flex h-full items-center justify-center">
        <NoAccess state="error" what="chat" class="rounded-3xl bg-surface/90 shadow-sm backdrop-blur" @retry="load" />
      </div>
      <template v-else>
        <p v-if="pinsOnly" class="wall-note py-3 text-center text-xs text-muted">Закреплённые сообщения · щелчок — к сообщению в чате</p>
        <p v-else-if="thread.loadingOlder" class="wall-note py-2 text-center text-xs text-muted">Загружаем…</p>
        <p v-else-if="!thread.hasMore && !start && thread.messages.length" class="wall-note py-3 text-center text-xs text-muted">Начало переписки</p>
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
            <span class="rounded-full bg-surface/55 px-3 py-1 text-xs font-medium text-foreground/75 shadow-sm backdrop-blur-[2px]">{{ group.day }}</span>
          </div>
          <div v-if="group.unread" class="my-2 flex items-center gap-3 text-xs font-medium text-accent wall-unread">
            <span class="h-px flex-1 bg-accent/40" />Новые сообщения<span class="h-px flex-1 bg-accent/40" />
          </div>
          <!-- Системное: карточкой события, без действий. -->
          <SystemLine v-if="group.system" :data-id="group.rows[0].message.id" :message="group.rows[0].message" />
          <!-- Changelog: записи портала — карточками релиза. -->
          <template v-else-if="chat?.changelog && !group.rows[0].message.userId">
            <ReleaseCard v-for="row in group.rows" :key="row.message.id" :message="row.message" :chat="chat" @react="(emoji) => react(row.message, emoji)" @view="(file) => (viewer = file)" />
          </template>
          <div v-else class="mt-2.5 flex gap-2" :class="onRight(group.rows[0].message) ? 'flex-row-reverse' : ''">
            <div v-if="withAuthor(group.rows[0].message)" class="flex w-8 shrink-0 flex-col justify-end">
              <ChatFace v-if="!group.rows[0].message.userId && chat?.changelog" :chat="chat" size="sm" class="sticky bottom-1" />
              <a v-else-if="group.rows[0].message.userId" :href="href('/profile', { id: group.rows[0].message.userId })" class="sticky bottom-1 rounded-full" :aria-label="`Профиль: ${person(group.rows[0].message.userId)?.name ?? ''}`" @click.stop><ChatFace :user="person(group.rows[0].message.userId)" size="sm" /></a>
            </div>
            <div class="min-w-0 flex-1">
          <MessageRow
            v-for="row in group.rows"
            :key="row.message.id"
            :message="row.message"
            :head="row.head"
            :right="onRight(row.message)"
            :author="withAuthor(row.message)"
            :active="active === row.message.id"
            :menu-open="menu?.message.id === row.message.id"
            :read="readUpTo >= row.message.id"
            :readers="readersAt.get(row.message.id)"
            :markdown="!!chat?.changelog"
            @tap="(event) => tap(row.message, event)"
            @quick="(event) => quickReply(row.message, event)"
            @leave="active = null"
            @menu="(event, views) => openMenu(row.message, event, views)"
            @react="(emoji) => react(row.message, emoji)"
            @jump="jump"
            @view="(file) => (viewer = file)"
            @media="atBottom && jumpToBottom()"
            @drop="dropFailed(chatId, row.message.id)"
          />
            </div>
          </div>
        </template>
      </template>
      <!-- Отступ в конце ленты, после последнего сообщения: виден, только
           когда долистал вниз. В нём — «кто печатает» и будущие подсказки. -->
      <div v-if="!loading && !failed && !denied" class="flex h-8 items-center pt-1">
        <Transition name="fade">
          <p v-if="typingText" class="flex max-w-full items-center gap-2 rounded-full bg-surface/85 px-3 py-0.5 text-[13px] text-muted shadow-sm backdrop-blur" aria-live="polite">
            <span class="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            <span class="truncate">{{ typingText }}</span>
          </p>
        </Transition>
      </div>
    </div>
      <button v-if="!atBottom" type="button" class="absolute right-4 bottom-3 z-20 flex size-10 items-center justify-center rounded-full bg-overlay shadow-overlay" aria-label="К последним сообщениям" @click="toBottom(true)">
      <ChevronDown class="size-5" />
      <span v-if="chat?.unread" class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground">{{ chat.unread }}</span>
    </button>
    </div>
    <!-- В списке закреплённых вместо поля ввода — возврат к ленте. -->
    <div v-if="pinsOnly" class="relative z-10 mx-1.5 mb-1.5 flex justify-center rounded-2xl bg-surface/85 p-2 shadow-sm backdrop-blur">
      <button type="button" class="button button--ghost button--sm" @click="showPins(false)"><ArrowLeft class="size-4" />Назад к чату</button>
    </div>
    <p v-else-if="chat?.readonly" class="relative z-10 mx-1.5 mb-1.5 rounded-2xl bg-surface/85 px-4 py-3 text-center text-sm text-muted shadow-sm backdrop-blur">{{ chat.changelog ? "Здесь владелец и администраторы рассказывают, что нового в портале" : "В общий чат писать нельзя: так настроена ваша роль" }}</p>
    <Composer v-else-if="!denied && !failed" class="relative z-10 mx-1.5 mb-1.5" ref="composer" :draft-key="chatId" :reply-to="replyTo" :editing="editing" @send="send" @gif="sendGifHere" @typing="sendTyping(chatId)" @save="save" @cancel="replyTo = null; editing = null" />
    </div>



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
      :can-go="canGo(menu.message)"
      :can-pin="!!chat?.canPin && menu.message.kind !== 'system' && !menu.message.deleted"
      @close="menu = null"
      @react="(emoji) => { const m = menu!.message; menu = null; react(m, emoji); }"
      @reply="menuAction('reply')"
      @copy="menuAction('copy')"
      @forward="menuAction('forward')"
      @edit="menuAction('edit')"
      @remove="menuAction('remove')"
      @pin="menuAction('pin')"
      @go="menuAction('go')"
    />
    <ForwardDialog :message="forwarding" @close="forwarding = null" @done="forwarded" />
    <ChatInfo :open="infoOpen" :chat="chat" @close="infoOpen = false" @left="panel ? emit('close') : emit('back')" />

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="viewer" class="fixed inset-0 z-[70] flex flex-col bg-black/90" v-on="shutViewer">
          <div class="flex items-center gap-3 p-3 text-white">
            <span class="min-w-0 flex-1 truncate text-sm">{{ viewer.name }} · {{ fileSize(viewer.size) }}</span>
            <a :href="`${apiUrl(viewer.url)}?download=1`" class="flex size-10 items-center justify-center rounded-full hover:bg-white/15" aria-label="Скачать"><Download class="size-5" /></a>
            <button type="button" class="flex size-10 items-center justify-center rounded-full hover:bg-white/15" aria-label="Закрыть" @click="viewer = null"><X class="size-5" /></button>
          </div>
          <div class="flex min-h-0 flex-1 items-center justify-center p-4" v-on="shutViewer2">
            <img :src="apiUrl(viewer.url)" :alt="viewer.name" class="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
