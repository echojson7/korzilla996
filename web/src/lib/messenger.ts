/* Мессенджер: чаты, сообщения и опрос сервера. Список чатов обновляется
   каждые несколько секунд (счётчики в меню и колонка справа), открытый
   чат — чаще и только изменениями с прошлого раза (since). */

import { computed, reactive, ref, shallowRef } from "vue";
import { api, upload, ApiError } from "./api";
import { auth } from "./session";
import { toast } from "./toast";

export interface ChatUser {
  id: number;
  name: string;
  email?: string;
  role?: "owner" | "admin" | "staff";
  initials: string;
  position: string | null;
  department: string | null;
  active: boolean;
  hue: number;
}
export interface ChatItem {
  id: number;
  type: "direct" | "group";
  /* Чат задачи, сделки и т. п.: «task:12». */
  entity?: string | null;
  title: string;
  initials: string;
  hue: number;
  avatar: string | null;
  peer: number | null;
  members: number[];
  createdBy: number | null;
  pinned: boolean;
  lastReadId: number;
  readUpTo: number;
  unread: number;
  last: { id: number; userId: number | null; kind?: string; text: string; at: string } | null;
  at: string;
}
export interface ChatFile {
  id: number;
  name: string;
  size: number;
  mime: string | null;
  image: boolean;
  width: number | null;
  height: number | null;
  url: string;
}
export interface ChatMessage {
  id: number;
  chatId: number;
  userId: number | null;
  kind?: "text" | "system";
  meta?: { event?: string; users?: number[]; title?: string } | null;
  body: string | null;
  deleted: boolean;
  replyTo: { id: number; userId: number | null; text: string } | null;
  files: ChatFile[];
  reactions: { emoji: string; users: number[] }[];
  editedAt: string | null;
  at: string;
  /* Своё, ещё не дошедшее до сервера. */
  pending?: boolean;
  clientId?: string;
  failed?: boolean;
  progress?: number;
}
interface Thread {
  messages: ChatMessage[];
  hasMore: boolean;
  loaded: boolean;
  loadingOlder: boolean;
  since: string;
  readUpTo: number;
}

export const people = reactive(new Map<number, ChatUser>());
export const chats = ref<ChatItem[]>([]);
export const meId = ref(0);
export const ready = ref(false);
/* Чат, открытый сейчас на экране (страница или панель): опрашивается чаще. */
export const focused = shallowRef<number | null>(null);
export const threads = reactive(new Map<number, Thread>());

export const enabled = computed(() => !!auth.me && !auth.demo);
export const totalUnread = computed(() => chats.value.reduce((sum, one) => sum + one.unread, 0));
export const chatById = (id: number | null | undefined) => chats.value.find((one) => one.id === id) ?? null;
export const person = (id: number | null | undefined) => (id == null ? null : people.get(id) ?? null);

/* ---------- Загрузка и опрос ---------- */

export async function loadPeople() {
  const list = await api<ChatUser[]>("GET", "messenger/users");
  people.clear();
  for (const one of list) people.set(one.id, one);
  saveSnapshot();
}

/* ---------- Снимок: список чатов виден сразу, ещё до ответа сервера ---------- */

const snapshotKey = () => `k996.messenger.${auth.me?.email ?? "?"}`;
let snapshotTimer = 0;
function saveSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(snapshotKey(), JSON.stringify({ me: meId.value, chats: chats.value, people: [...people.values()] }));
    } catch {
      /* места нет — без снимка */
    }
  }, 500);
}
function restoreSnapshot() {
  try {
    const raw = localStorage.getItem(snapshotKey());
    if (!raw) return;
    const state = JSON.parse(raw) as { me: number; chats: ChatItem[]; people: ChatUser[] };
    meId.value = state.me;
    for (const one of state.people) people.set(one.id, one);
    chats.value = state.chats;
    ready.value = true;
  } catch {
    /* битый снимок — просто ждём сервер */
  }
}

/* ---------- Чаты с сервера ---------- */

interface Realtime {
  hub: string;
  topic: string;
  token: string;
}
let stamp = 0;
let loadedOnce = false;
const sortChats = (list: ChatItem[]) => list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));

async function applyChats(list: ChatItem[]) {
  if (list.some((chat) => chat.members.some((id) => !people.has(id)))) await loadPeople().catch(() => undefined);
  /* Новые сообщения в фоне — уведомление браузера. */
  if (loadedOnce) {
    const before = new Map(chats.value.map((one) => [one.id, one.last?.id ?? 0]));
    for (const chat of list) {
      if (chat.last && chat.unread && chat.last.id > (before.get(chat.id) ?? 0) && chat.last.userId !== meId.value) notify(chat, chat.last.text, chat.last.userId);
    }
  }
  const gone = chats.value.filter((one) => !list.some((next) => next.id === one.id));
  for (const one of gone) threads.delete(one.id);
  chats.value = list;
  ready.value = true;
  loadedOnce = true;
  saveSnapshot();
}

export async function loadChats() {
  const state = await api<{ chats: ChatItem[]; me: number; v: number; realtime: Realtime | null }>("GET", "messenger/chats");
  meId.value = state.me;
  stamp = state.v;
  await applyChats(state.chats);
  connect(state.realtime);
}
let reloadTimer = 0;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => loadChats().catch(() => undefined), 120);
}

/* ---------- Живые события (Mercure, SSE) ---------- */

export const live = ref(false);
let source: EventSource | null = null;
let sourceTopic = "";
let retryAt = 0;

function connect(realtime: Realtime | null) {
  if (!realtime || typeof EventSource === "undefined") return;
  if (source && sourceTopic === realtime.topic && source.readyState !== EventSource.CLOSED) return;
  if (Date.now() < retryAt) return;
  source?.close();
  const url = new URL(realtime.hub, location.href);
  url.searchParams.append("topic", realtime.topic);
  url.searchParams.set("authorization", realtime.token);
  sourceTopic = realtime.topic;
  source = new EventSource(url.toString());
  source.onopen = () => {
    const was = live.value;
    live.value = true;
    /* Переподключились — добрать пропущенное. */
    if (was === false && loadedOnce) sync().catch(() => undefined);
  };
  source.onerror = () => {
    live.value = false;
    /* Токен истёк или хаб недоступен — снова через минуту, с новым токеном. */
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      retryAt = Date.now() + 60_000;
    }
  };
  source.onmessage = (event) => {
    try {
      handle(JSON.parse(event.data));
    } catch {
      /* чужой формат — пропускаем */
    }
  };
}

type LiveEvent =
  | { type: "message"; chatId: number; message: ChatMessage; clientId?: string | null; new?: boolean }
  | { type: "chat"; chatId: number }
  | { type: "read"; chatId: number; userId: number; id: number }
  | { type: "typing"; chatId: number; userId: number };

const OWN = new Set(["message", "chat", "read", "typing"]);
function handle(event: LiveEvent) {
  /* В общей теме идут и события других разделов (task…) — не наши. */
  if (!OWN.has(event.type)) return;
  const chat = chatById(event.chatId);
  if (event.type === "typing") return setTyping(event.chatId, event.userId);
  if (event.type === "chat" || !chat) return reloadSoon();
  if (event.type === "read") {
    if (event.userId === meId.value) {
      chat.lastReadId = Math.max(chat.lastReadId, event.id);
      if (!chat.last || event.id >= chat.last.id) chat.unread = 0;
      else reloadSoon();
    } else {
      chat.readUpTo = Math.max(chat.readUpTo, event.id);
      const one = threads.get(event.chatId);
      if (one) one.readUpTo = Math.max(one.readUpTo, event.id);
    }
    return;
  }
  const { message } = event;
  const one = threads.get(event.chatId);
  if (one?.loaded) {
    if (event.clientId) {
      const temp = one.messages.findIndex((m) => m.pending && m.clientId === event.clientId);
      if (temp >= 0) one.messages.splice(temp, 1);
    }
    merge(one, [message]);
  }
  clearTyping(event.chatId, message.userId);
  if (event.new) {
    const mine = message.userId === meId.value;
    const fresh = !chat.last || message.id > chat.last.id;
    if (fresh && !mine && message.kind !== "system" && message.id > chat.lastReadId) chat.unread += 1;
    bumpChat(event.chatId, message);
    if (fresh && !mine && message.kind !== "system") notify(chat, previewOf(message), message.userId);
  } else if (chat.last?.id === message.id) {
    chat.last = { ...chat.last, text: previewOf(message) };
  }
}

/* ---------- Лёгкий опрос: запасной путь и страховка ---------- */

async function sync() {
  const id = focused.value;
  const one = id ? threads.get(id) : undefined;
  const params = new URLSearchParams({ v: String(stamp) });
  if (id && one?.loaded && one.since) {
    params.set("chat", String(id));
    params.set("since", one.since);
  }
  const state = await api<{ v: number; chats?: ChatItem[]; thread?: ({ chatId: number } & Page) | null }>("GET", `messenger/sync?${params}`);
  stamp = state.v;
  if (!state.chats) return;
  await applyChats(state.chats);
  if (state.thread) {
    const target = threads.get(state.thread.chatId);
    if (target) {
      merge(target, state.thread.messages);
      for (const message of state.thread.messages) {
        if (!message.pending) {
          const temp = target.messages.findIndex((m) => m.pending && m.userId === message.userId && m.body === message.body);
          if (temp >= 0 && message.userId === meId.value) target.messages.splice(temp, 1);
        }
      }
      target.readUpTo = state.thread.readUpTo;
      target.since = state.thread.now;
    }
  }
}

let started = false;
let timer = 0;

export function startMessenger() {
  if (started || !enabled.value) return;
  started = true;
  restoreSnapshot();
  Promise.all([loadPeople(), loadChats()]).then(prefetchTop).catch(() => undefined);
  /* С живыми событиями опрос — раз в 30 с на всякий случай, без них — раз
     в 1,5 с (пустой ответ — одна метка из кэша). Скрытая вкладка — реже. */
  const tick = async () => {
    if (loadedOnce) await sync().catch(() => undefined);
    timer = window.setTimeout(tick, live.value ? 30_000 : document.hidden ? 10_000 : 1_500);
  };
  timer = window.setTimeout(tick, 1_500);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    clearTimeout(timer);
    tick();
  });
}
export function stopMessenger() {
  clearTimeout(timer);
  source?.close();
  source = null;
  started = false;
}

/* ---------- Предзагрузка: верхние чаты и чат под курсором ---------- */

const prefetching = new Set<number>();
export function prefetch(id: number) {
  const one = threads.get(id);
  if (one?.loaded || prefetching.has(id)) return;
  prefetching.add(id);
  openThread(id).catch(() => undefined).finally(() => prefetching.delete(id));
}
function prefetchTop() {
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
  const queue = chats.value.slice(0, 6).map((one) => one.id);
  const next = () => {
    const id = queue.shift();
    if (id == null) return;
    const one = threads.get(id);
    if (one?.loaded) return next();
    openThread(id).catch(() => undefined).finally(() => idle(next));
  };
  idle(next);
}

/* ---------- «Печатает…» ---------- */

export const typing = reactive(new Map<number, Map<number, number>>());
function setTyping(chatId: number, userId: number) {
  if (userId === meId.value) return;
  let map = typing.get(chatId);
  if (!map) {
    typing.set(chatId, new Map());
    map = typing.get(chatId)!;
  }
  map.set(userId, Date.now() + 5_000);
  setTimeout(() => {
    const at = typing.get(chatId)?.get(userId);
    if (at && at <= Date.now()) clearTyping(chatId, userId);
  }, 5_100);
}
function clearTyping(chatId: number, userId: number | null) {
  if (userId == null) return;
  typing.get(chatId)?.delete(userId);
}
export const typingIn = (chatId: number) => [...(typing.get(chatId)?.keys() ?? [])].map((id) => person(id)).filter((one): one is ChatUser => !!one);
let typedAt = 0;
let typedChat = 0;
export function sendTyping(chatId: number) {
  if (!live.value || (typedChat === chatId && Date.now() - typedAt < 3_000)) return;
  typedAt = Date.now();
  typedChat = chatId;
  api("POST", `messenger/chats/${chatId}/typing`).catch(() => undefined);
}

/* ---------- Уведомления браузера ---------- */

export const canNotify = ref(typeof Notification !== "undefined" ? Notification.permission : "denied");
export async function askNotify() {
  if (typeof Notification === "undefined") return;
  canNotify.value = await Notification.requestPermission();
}
const notified = new Set<string>();
function notify(chat: ChatItem, text: string, userId: number | null) {
  if (!document.hidden || canNotify.value !== "granted" || chat.last == null) return;
  const key = `${chat.id}:${chat.last.id}`;
  if (notified.has(key)) return;
  notified.add(key);
  const who = person(userId)?.name;
  try {
    const shown = new Notification(chat.type === "group" && who ? `${who} · ${chat.title}` : chat.title, { body: text, tag: `chat-${chat.id}` });
    shown.onclick = () => {
      window.focus();
      location.hash = `#/messenger?chat=${chat.id}`;
      shown.close();
    };
  } catch {
    /* на телефоне new Notification недоступен */
  }
}

const previewOf = (message: ChatMessage) =>
  message.deleted ? "Сообщение удалено" : message.body?.replace(/\s+/g, " ").trim() || (message.files.length && message.files.every((f) => f.image) ? "🖼 Картинка" : `📎 ${message.files[0]?.name ?? "Файл"}`);

/* ---------- Сообщения ---------- */

function thread(id: number): Thread {
  let one = threads.get(id);
  if (!one) {
    threads.set(id, { messages: [], hasMore: false, loaded: false, loadingOlder: false, since: "", readUpTo: 0 });
    one = threads.get(id)!;
  }
  return one;
}
export const threadOf = thread;

interface Page {
  messages: ChatMessage[];
  hasMore: boolean;
  readUpTo: number;
  now: string;
}

function merge(one: Thread, rows: ChatMessage[]) {
  for (const row of rows) {
    const at = one.messages.findIndex((m) => m.id === row.id);
    if (at >= 0) one.messages.splice(at, 1, row);
    else {
      /* Вставить по порядку id; временные (pending) — всегда в конце. */
      let index = one.messages.length;
      while (index > 0 && (one.messages[index - 1].pending || one.messages[index - 1].id > row.id)) index--;
      one.messages.splice(index, 0, row);
    }
  }
}

export async function openThread(id: number): Promise<void> {
  const one = thread(id);
  if (one.loaded) return refreshThread(id);
  const page = await api<Page>("GET", `messenger/chats/${id}/messages`);
  one.messages = page.messages;
  one.hasMore = page.hasMore;
  one.readUpTo = page.readUpTo;
  one.since = page.now;
  one.loaded = true;
}

export async function refreshThread(id: number): Promise<void> {
  const one = thread(id);
  if (!one.since) return openThread(id);
  const page = await api<Page>("GET", `messenger/chats/${id}/messages?since=${encodeURIComponent(one.since)}`);
  merge(one, page.messages);
  one.readUpTo = page.readUpTo;
  one.since = page.now;
}

export async function loadOlder(id: number) {
  const one = thread(id);
  const first = one.messages.find((m) => !m.pending);
  if (!one.hasMore || one.loadingOlder || !first) return;
  one.loadingOlder = true;
  try {
    const page = await api<Page>("GET", `messenger/chats/${id}/messages?before=${first.id}`);
    one.messages.unshift(...page.messages);
    one.hasMore = page.hasMore;
  } finally {
    one.loadingOlder = false;
  }
}

let tempId = -1;

export async function sendMessage(chatId: number, body: string, files: File[], replyTo: ChatMessage | null) {
  const one = thread(chatId);
  const temp: ChatMessage = {
    id: tempId--, chatId, userId: meId.value, body: body || null, deleted: false,
    replyTo: replyTo ? { id: replyTo.id, userId: replyTo.userId, text: replyTo.body ?? "Файл" } : null,
    files: files.map((file, i) => ({ id: -i - 1, name: file.name, size: file.size, mime: file.type, image: false, width: null, height: null, url: "" })),
    reactions: [], editedAt: null, at: new Date().toISOString(), pending: true, progress: 0,
    clientId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  };
  one.messages.push(temp);
  const form = new FormData();
  if (body) form.append("body", body);
  if (replyTo) form.append("reply_to_id", String(replyTo.id));
  form.append("client_id", temp.clientId!);
  for (const file of files) form.append("files[]", file, file.name);
  const find = () => one.messages.find((m) => m.id === temp.id);
  try {
    const saved = await upload<ChatMessage>(`messenger/chats/${chatId}/messages`, form, (part) => {
      const row = find();
      if (row) row.progress = part;
    });
    const at = one.messages.findIndex((m) => m.id === temp.id);
    if (at >= 0) one.messages.splice(at, 1);
    merge(one, [saved]);
    bumpChat(chatId, saved);
  } catch (error) {
    const row = find();
    if (row) row.failed = true;
    toast(error instanceof ApiError ? error.first : "Сообщение не отправилось", "danger");
  }
}

export function dropFailed(chatId: number, id: number) {
  const one = thread(chatId);
  const at = one.messages.findIndex((m) => m.id === id);
  if (at >= 0) one.messages.splice(at, 1);
}

function bumpChat(chatId: number, message: ChatMessage) {
  const chat = chatById(chatId);
  if (!chat) return;
  if (chat.last && chat.last.id > message.id) return;
  chat.last = { id: message.id, userId: message.userId, kind: message.kind, text: previewOf(message), at: message.at };
  chat.at = message.at;
  if (message.userId === meId.value) chat.lastReadId = Math.max(chat.lastReadId, message.id);
  chats.value = sortChats([...chats.value]);
  saveSnapshot();
}

function replace(message: ChatMessage) {
  merge(thread(message.chatId), [message]);
}

export async function editMessage(message: ChatMessage, body: string) {
  try {
    replace(await api<ChatMessage>("PATCH", `messenger/messages/${message.id}`, { body }));
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось сохранить", "danger");
  }
}

export async function deleteMessage(message: ChatMessage) {
  try {
    await api("DELETE", `messenger/messages/${message.id}`);
    replace({ ...message, deleted: true, body: null, files: [], reactions: [], replyTo: null });
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось удалить", "danger");
  }
}

export async function toggleReaction(message: ChatMessage, emoji: string) {
  /* Сразу на экране, потом — ответ сервера. */
  const mine = meId.value;
  const list = message.reactions.map((r) => ({ ...r, users: [...r.users] }));
  const found = list.find((r) => r.emoji === emoji);
  if (found?.users.includes(mine)) found.users = found.users.filter((id) => id !== mine);
  else if (found) found.users.push(mine);
  else list.push({ emoji, users: [mine] });
  replace({ ...message, reactions: list.filter((r) => r.users.length) });
  try {
    replace(await api<ChatMessage>("POST", `messenger/messages/${message.id}/reactions`, { emoji }));
  } catch (error) {
    replace(message);
    toast(error instanceof ApiError ? error.first : "Реакция не сохранилась", "danger");
  }
}

const reading = new Map<number, number>();
export async function markRead(chatId: number) {
  const chat = chatById(chatId);
  const one = threads.get(chatId);
  const last = one?.messages.filter((m) => !m.pending).at(-1)?.id ?? 0;
  if (!chat || !last || last <= chat.lastReadId || (reading.get(chatId) ?? 0) >= last) return;
  reading.set(chatId, last);
  chat.lastReadId = last;
  chat.unread = 0;
  await api("POST", `messenger/chats/${chatId}/read`, { id: last }).catch(() => reading.delete(chatId));
}

/* ---------- Чаты ---------- */

function upsert(chat: ChatItem) {
  const list = chats.value.filter((one) => one.id !== chat.id);
  list.push(chat);
  chats.value = sortChats(list);
  saveSnapshot();
  return chat;
}

/* Чат карточки (задачи, сделки…): один на сущность, создаётся при первом открытии. */
export async function openEntityChat(entity: string, title: string) {
  return upsert(await api<ChatItem>("POST", "messenger/entity-chats", { entity, title }));
}

export async function startDirect(userId: number) {
  return upsert(await api<ChatItem>("POST", "messenger/chats", { type: "direct", user_id: userId }));
}
export async function createGroup(title: string, userIds: number[]) {
  return upsert(await api<ChatItem>("POST", "messenger/chats", { type: "group", title, user_ids: userIds }));
}
export async function renameChat(chatId: number, title: string) {
  return upsert(await api<ChatItem>("PATCH", `messenger/chats/${chatId}`, { title }));
}
export async function addMembers(chatId: number, userIds: number[]) {
  return upsert(await api<ChatItem>("POST", `messenger/chats/${chatId}/members`, { user_ids: userIds }));
}
export async function removeMember(chatId: number, userId: number) {
  await api("DELETE", `messenger/chats/${chatId}/members/${userId}`);
  if (userId === meId.value) {
    chats.value = chats.value.filter((one) => one.id !== chatId);
    threads.delete(chatId);
  } else await loadChats();
}
export async function togglePin(chat: ChatItem) {
  return upsert(await api<ChatItem>("POST", `messenger/chats/${chat.id}/pin`, { pinned: !chat.pinned }));
}
export async function setCover(chatId: number, file: File | null) {
  if (!file) return upsert(await api<ChatItem>("DELETE", `messenger/chats/${chatId}/avatar`));
  const form = new FormData();
  form.append("avatar", file, file.name);
  return upsert(await upload<ChatItem>(`messenger/chats/${chatId}/avatar`, form));
}

/* ---------- Подписи ---------- */

const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const clock = (iso: string) => timeFmt.format(new Date(iso));
export function when(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return timeFmt.format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "вчера";
  return dayFmt.format(date).replace(".", "");
}
export function dayLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return "Сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Вчера";
  const text = longDayFmt.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
