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
  initials: string;
  position: string | null;
  department: string | null;
  active: boolean;
  hue: number;
}
export interface ChatItem {
  id: number;
  type: "direct" | "group";
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
  last: { id: number; userId: number | null; text: string; at: string } | null;
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
  body: string | null;
  deleted: boolean;
  replyTo: { id: number; userId: number | null; text: string } | null;
  files: ChatFile[];
  reactions: { emoji: string; users: number[] }[];
  editedAt: string | null;
  at: string;
  /* Своё, ещё не дошедшее до сервера. */
  pending?: boolean;
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
}

export async function loadChats() {
  const state = await api<{ chats: ChatItem[]; me: number }>("GET", "messenger/chats");
  meId.value = state.me;
  /* Если в чатах появился незнакомый человек — обновить список людей. */
  if (state.chats.some((chat) => chat.members.some((id) => !people.has(id)))) await loadPeople().catch(() => undefined);
  chats.value = state.chats;
  ready.value = true;
}

let started = false;
let chatTimer = 0;
let threadTimer = 0;

export function startMessenger() {
  if (started || !enabled.value) return;
  started = true;
  Promise.all([loadPeople(), loadChats()]).catch(() => undefined);
  const tickChats = async () => {
    if (!document.hidden) await loadChats().catch(() => undefined);
    chatTimer = window.setTimeout(tickChats, document.hidden ? 20_000 : 5_000);
  };
  const tickThread = async () => {
    const id = focused.value;
    if (id && !document.hidden && threads.get(id)?.loaded) await refreshThread(id).catch(() => undefined);
    threadTimer = window.setTimeout(tickThread, 2_500);
  };
  chatTimer = window.setTimeout(tickChats, 5_000);
  threadTimer = window.setTimeout(tickThread, 2_500);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    loadChats().catch(() => undefined);
    if (focused.value) refreshThread(focused.value).catch(() => undefined);
  });
}
export function stopMessenger() {
  clearTimeout(chatTimer);
  clearTimeout(threadTimer);
  started = false;
}

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
  };
  one.messages.push(temp);
  const form = new FormData();
  if (body) form.append("body", body);
  if (replyTo) form.append("reply_to_id", String(replyTo.id));
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
  const text = message.body?.replace(/\s+/g, " ").trim() || (message.files.every((f) => f.image) ? "🖼 Картинка" : `📎 ${message.files[0]?.name ?? "Файл"}`);
  chat.last = { id: message.id, userId: message.userId, text, at: message.at };
  chat.at = message.at;
  chat.lastReadId = Math.max(chat.lastReadId, message.id);
  chats.value = [...chats.value].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
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
  chats.value = list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  return chat;
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
