/* Общий канал обновлений портала (real-time).

   Одно соединение Mercure (SSE) на вкладку, одна закрытая тема у
   сотрудника, события разных типов: task, message, chat, read, typing…
   Разделы подписываются через on(type, fn) и сами решают, что
   догрузить: событие несёт только «что поменялось» (тип и id записей).

   Надёжность:
   - у событий о записях есть номер ev; после обрыва связи, возврата на
     вкладку и раз в 30 с вкладка спрашивает GET realtime?after=ev и
     получает всё, что пропустила (журнал на сервере хранится трое суток);
   - Mercure нет или он недоступен — тот же запрос опросом раз в 2 с:
     пока ничего не менялось, сервер отвечает из кэша, не трогая базу;
   - пропущено слишком много — событие reset, разделы грузятся целиком. */

import { ref } from "vue";
import { api } from "./api";

export interface Subscription { hub: string; topic: string; token: string }
export type LiveEvent = { type: string; ev?: number; ids?: number[]; [key: string]: unknown };
type Handler = (event: LiveEvent) => void;

interface SyncState { last: number; changes: Record<string, number[]>; reset: boolean; realtime?: Subscription | null }

/* Соединение с Mercure сейчас открыто. */
export const live = ref(false);

const handlers = new Map<string, Set<Handler>>();
let last: number | null = null;
let source: EventSource | null = null;
let retryAt = 0;
let started = false;
let timer = 0;
let syncing: Promise<void> | null = null;

/* Подписка раздела на события типа (task, message…). Возвращает отписку. */
export function on(type: string, fn: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(fn);
  return () => handlers.get(type)?.delete(fn);
}

function dispatch(event: LiveEvent) {
  for (const fn of handlers.get(event.type) ?? []) {
    try {
      fn(event);
    } catch (error) {
      console.error("realtime", event.type, error);
    }
  }
}

/* Догрузить пропущенное. Параллельные вызовы склеиваются в один. */
export function catchUp(withSubscription = false): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const params = new URLSearchParams();
    if (last !== null) params.set("after", String(last));
    if (withSubscription) params.set("sub", "1");
    const state = await api<SyncState>("GET", `realtime?${params}`);
    const first = last === null;
    if (state.reset) dispatch({ type: "reset" });
    else if (!first) for (const [type, ids] of Object.entries(state.changes)) if (ids.length) dispatch({ type, ids, ev: state.last });
    last = Math.max(last ?? 0, state.last);
    if (withSubscription) connect(state.realtime ?? null);
  })().finally(() => (syncing = null));
  return syncing;
}

function connect(sub: Subscription | null) {
  if (!sub || typeof EventSource === "undefined") return;
  source?.close();
  const url = new URL(sub.hub, location.href);
  url.searchParams.append("topic", sub.topic);
  url.searchParams.set("authorization", sub.token);
  source = new EventSource(url.toString());
  source.onopen = () => {
    const was = live.value;
    live.value = true;
    /* Переподключились — добрать то, что пришло, пока связи не было. */
    if (!was) catchUp().catch(() => undefined);
  };
  source.onerror = () => {
    live.value = false;
    /* Токен истёк или хаб недоступен: опрос продолжает работать, а
       соединение пробуем снова через минуту, с новым токеном. */
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      retryAt = Date.now() + 60_000;
    }
  };
  source.onmessage = (message) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string") return;
    if (typeof event.ev === "number" && last !== null) last = Math.max(last, event.ev);
    dispatch(event);
  };
}

export function startRealtime() {
  if (started) return;
  started = true;
  catchUp(true).catch(() => undefined);
  const tick = async () => {
    const reconnect = !source && Date.now() >= retryAt;
    await catchUp(reconnect).catch(() => undefined);
    timer = window.setTimeout(tick, live.value ? 30_000 : document.hidden ? 15_000 : 2_000);
  };
  timer = window.setTimeout(tick, 2_000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    clearTimeout(timer);
    tick();
  });
  window.addEventListener("online", () => {
    clearTimeout(timer);
    tick();
  });
}
