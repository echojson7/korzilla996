<!-- Открытый чат: шапка, лента сообщений по дням, поле ввода. Свои
     сообщения справа. Наведение на сообщение — реакции, ответ, правка,
     удаление; на телефоне то же по нажатию. Файлы можно бросить в ленту. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, Info, Pin, PinOff, X, Reply, Pencil, Trash2, Smile, Check, CheckCheck, Clock, AlertCircle, Download, FileText, ChevronDown, Upload } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import Composer from "./Composer.vue";
import EmojiPicker from "./EmojiPicker.vue";
import ChatInfo from "./ChatInfo.vue";
import Popover from "../Popover.vue";
import { apiUrl } from "../../lib/api";
import { QUICK, remember } from "../../lib/emoji";
import { plural } from "../../lib/format";
import {
  chatById, threadOf, openThread, loadOlder, sendMessage, editMessage, deleteMessage, toggleReaction, markRead, togglePin, dropFailed,
  person, meId, focused, clock, dayLabel, fileSize, type ChatMessage, type ChatFile,
} from "../../lib/messenger";
import { toast } from "../../lib/toast";

/* closeTab — крестик закрытия рисует сама панель снаружи (ярлычок), в шапке его нет. */
const props = withDefaults(defineProps<{ chatId: number; panel?: boolean; back?: boolean; closeTab?: boolean }>(), { panel: false, back: false, closeTab: false });
const emit = defineEmits<{ close: []; back: [] }>();

const chat = computed(() => chatById(props.chatId));
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

const sub = computed(() => {
  const one = chat.value;
  if (!one) return "";
  if (one.type === "group") return plural(one.members.length, "участник", "участника", "участников");
  const peer = person(one.peer);
  return [peer?.position, peer?.department].filter(Boolean).join(" · ") || "Личный чат";
});
const readUpTo = computed(() => Math.max(thread.value.readUpTo, chat.value?.readUpTo ?? 0));

/* Лента: разделители дней и «шапка» у первого сообщения серии. */
const rows = computed(() => {
  const out: { message: ChatMessage; day: string | null; head: boolean; tail: boolean }[] = [];
  const list = thread.value.messages;
  list.forEach((message, i) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    const day = !prev || new Date(prev.at).toDateString() !== new Date(message.at).toDateString() ? dayLabel(message.at) : null;
    const near = (a?: ChatMessage, b?: ChatMessage) => !!a && !!b && a.userId === b.userId && !a.deleted && Math.abs(Date.parse(b.at) - Date.parse(a.at)) < 5 * 60_000 && new Date(a.at).toDateString() === new Date(b.at).toDateString();
    out.push({ message, day, head: !!day || !near(prev, message), tail: !near(message, next) });
  });
  return out;
});
const firstUnread = computed(() => {
  const last = chat.value?.lastReadId ?? 0;
  return thread.value.messages.find((m) => m.id > last && m.userId !== meId.value && !m.pending)?.id ?? null;
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
const confirmDelete = ref<number | null>(null);
function remove(message: ChatMessage) {
  if (confirmDelete.value !== message.id) {
    confirmDelete.value = message.id;
    setTimeout(() => confirmDelete.value === message.id && (confirmDelete.value = null), 3000);
    return;
  }
  confirmDelete.value = null;
  active.value = null;
  deleteMessage(message);
}
function react(message: ChatMessage, emoji: string) {
  remember(emoji);
  active.value = null;
  toggleReaction(message, emoji);
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
function parts(text: string) {
  return text.split(URL_RE).map((chunk, i) => ({ text: chunk, link: i % 2 === 1 }));
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
          <span class="block truncate font-semibold">{{ chat.title }}</span>
          <span class="block truncate text-xs text-muted">{{ sub }}</span>
        </span>
      </button>
      <span v-else class="flex-1" />
      <button v-if="chat" type="button" class="button button--ghost button--icon-only" :aria-label="chat.pinned ? 'Открепить' : 'Закрепить'" :title="chat.pinned ? 'Открепить' : 'Закрепить наверху'" @click="togglePin(chat)">
        <PinOff v-if="chat.pinned" class="size-[18px]" /><Pin v-else class="size-[18px]" />
      </button>
      <button v-if="chat" type="button" class="button button--ghost button--icon-only" aria-label="О чате" title="О чате" @click="infoOpen = true"><Info class="size-[18px]" /></button>
      <button v-if="panel && !closeTab" type="button" class="button button--ghost button--icon-only" aria-label="Закрыть" @click="emit('close')"><X class="size-5" /></button>
    </header>

    <div class="chat-wall relative flex min-h-0 flex-1 flex-col">
    <div ref="scroller" class="relative min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-6 thin-scroll" @scroll.passive="onScroll" @click.self="active = null">
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

        <template v-for="row in rows" :key="row.message.id">
          <div v-if="row.day" class="sticky top-0 z-10 flex justify-center py-2">
            <span class="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur">{{ row.day }}</span>
          </div>
          <div v-if="unreadMark && row.message.id === unreadMark" class="my-2 flex items-center gap-3 text-xs font-medium text-accent">
            <span class="h-px flex-1 bg-accent/40" />Новые сообщения<span class="h-px flex-1 bg-accent/40" />
          </div>

          <div
            :data-id="row.message.id"
            class="group/msg relative flex gap-2 rounded-xl px-1 transition-colors"
            :class="[row.message.userId === meId ? 'flex-row-reverse' : '', row.head ? 'mt-2.5' : 'mt-0.5']"
            @click="active = active === row.message.id ? null : row.message.id"
          >
            <div class="w-8 shrink-0">
              <ChatFace v-if="row.tail && row.message.userId !== meId && chat?.type === 'group'" :user="person(row.message.userId)" size="sm" />
            </div>

            <div class="flex max-w-[min(560px,78%)] min-w-0 flex-col" :class="row.message.userId === meId ? 'items-end' : 'items-start'">
              <div
                class="relative min-w-0 rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-sm"
                :class="[
                  row.message.deleted ? 'bg-surface-secondary text-muted italic' : row.message.userId === meId ? 'bubble-mine' : 'bg-surface',
                  onlyEmoji(row.message.body) && !row.message.files.length && !row.message.replyTo ? '!bg-transparent !shadow-none text-[40px] leading-tight px-0' : '',
                  row.message.failed ? 'ring-2 ring-danger/50' : '',
                ]"
              >
                <p v-if="row.head && row.message.userId !== meId && chat?.type === 'group' && !row.message.deleted" class="text-[13px] font-semibold" :style="{ color: `oklch(0.55 0.14 ${person(row.message.userId)?.hue ?? 220})` }">
                  {{ person(row.message.userId)?.name ?? "Сотрудник" }}
                </p>
                <template v-if="row.message.deleted">Сообщение удалено</template>
                <template v-else>
                  <button v-if="row.message.replyTo" type="button" class="my-1 block w-full max-w-72 rounded-lg border-l-2 border-accent bg-black/5 px-2 py-1 text-left text-[13px] dark:bg-white/5" @click.stop="jump(row.message.replyTo.id)">
                    <span class="block font-semibold text-accent">{{ person(row.message.replyTo.userId)?.name ?? "Сотрудник" }}</span>
                    <span class="block truncate text-muted">{{ row.message.replyTo.text }}</span>
                  </button>

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
                    <template v-for="(part, i) in parts(row.message.body)" :key="i"><a v-if="part.link" :href="part.text" target="_blank" rel="noopener noreferrer" class="link break-all" @click.stop>{{ part.text }}</a><template v-else>{{ part.text }}</template></template>
                  </p>
                </template>
                <span class="float-right mt-1 ml-2 flex items-center gap-1 text-[11px] leading-4 text-muted not-italic select-none" :class="onlyEmoji(row.message.body) ? 'text-xs' : ''">
                  <span v-if="row.message.editedAt && !row.message.deleted">изм.</span>
                  {{ clock(row.message.at) }}
                  <template v-if="row.message.userId === meId && !row.message.deleted">
                    <AlertCircle v-if="row.message.failed" class="size-3.5 text-danger" />
                    <Clock v-else-if="row.message.pending" class="size-3" />
                    <CheckCheck v-else-if="readUpTo >= row.message.id" class="size-3.5 text-accent" aria-label="Прочитано" />
                    <Check v-else class="size-3.5" aria-label="Доставлено" />
                  </template>
                </span>
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
            </div>

            <!-- Действия: наведение или нажатие. -->
            <div
              v-if="!row.message.deleted && !row.message.pending"
              class="absolute -top-8 z-20 items-center gap-0.5 rounded-full border border-separator bg-overlay p-0.5 shadow-overlay"
              :class="[row.message.userId === meId ? 'right-10' : 'left-10', active === row.message.id ? 'flex' : 'hidden group-hover/msg:flex has-[[aria-expanded=true]]:flex']"
              @click.stop
            >
              <button v-for="emoji in QUICK.slice(0, 5)" :key="emoji" type="button" class="flex size-7 items-center justify-center rounded-full text-base transition hover:scale-125" :aria-label="`Реакция ${emoji}`" @click="react(row.message, emoji)">{{ emoji }}</button>
              <Popover :align="row.message.userId === meId ? 'right' : 'left'" width="w-auto">
                <template #trigger="{ toggle, open }">
                  <button type="button" class="flex size-7 items-center justify-center rounded-full text-muted hover:bg-default" aria-label="Другая реакция" :aria-expanded="open" @click="toggle"><Smile class="size-4" /></button>
                </template>
                <template #default="{ close }"><EmojiPicker @pick="(emoji) => { close(); react(row.message, emoji); }" /></template>
              </Popover>
              <span class="mx-0.5 h-4 w-px bg-separator" />
              <button type="button" class="flex size-7 items-center justify-center rounded-full text-muted hover:bg-default" aria-label="Ответить" title="Ответить" @click="startReply(row.message)"><Reply class="size-4" /></button>
              <button v-if="row.message.userId === meId" type="button" class="flex size-7 items-center justify-center rounded-full text-muted hover:bg-default" aria-label="Изменить" title="Изменить" @click="startEdit(row.message)"><Pencil class="size-4" /></button>
              <button v-if="row.message.userId === meId" type="button" class="flex h-7 items-center justify-center gap-1 rounded-full px-1.5 text-danger hover:bg-danger/10" :aria-label="confirmDelete === row.message.id ? 'Точно удалить' : 'Удалить'" :title="confirmDelete === row.message.id ? 'Нажмите ещё раз' : 'Удалить'" @click="remove(row.message)"><Trash2 class="size-4" /><span v-if="confirmDelete === row.message.id" class="text-xs font-medium">Удалить?</span></button>
            </div>
          </div>
        </template>
      </template>
    </div>
    <Composer class="relative z-10 mx-2 mb-2 md:mx-4 md:mb-3" ref="composer" :draft-key="chatId" :reply-to="replyTo" :editing="editing" @send="send" @save="save" @cancel="replyTo = null; editing = null" />
    </div>

    <button v-if="!atBottom" type="button" class="absolute right-5 bottom-28 z-20 flex size-10 items-center justify-center rounded-full bg-overlay shadow-overlay" aria-label="К последним сообщениям" @click="toBottom(true)">
      <ChevronDown class="size-5" />
      <span v-if="chat?.unread" class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground">{{ chat.unread }}</span>
    </button>


    <div v-if="dropping" class="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/90 text-accent-soft-foreground">
      <Upload class="size-10" />
      <p class="mt-2 font-semibold">Отпустите, чтобы прикрепить</p>
    </div>

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
