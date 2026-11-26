/* Фильтр задач как в Битрикс24: готовый набор (Мои, Делаю, Помогаю…),
   поля (статус, ответственный, постановщик, приоритет, срок, проект, тег),
   строка поиска, сортировка и счётчики-переключатели («Просрочены»,
   «Комментарии»). Всё лежит в адресе: ?tab, q, st, who, by, pr, due, pj,
   tg, sort, only — ссылкой можно поделиться, назад работает. */

import { computed } from "vue";
import { route, setQuery } from "../../lib/router";
import { chats } from "../../lib/messenger";
import { deals } from "../../lib/data";
import { taskStore, isOpenTask, isOverdueTask, nameOf, PRIORITIES, STATUSES, type Status, type TaskBrief } from "../../lib/tasks";

const me = () => taskStore.me;

export const PRESETS = {
  mine: { label: "Мои", hint: "Все, где я участник", test: (one: TaskBrief) => [one.creatorId, one.responsibleId, ...one.accomplices, ...one.auditors].includes(me()) },
  doing: { label: "Делаю", hint: "Я ответственный", test: (one: TaskBrief) => one.responsibleId === me() },
  helping: { label: "Помогаю", hint: "Я соисполнитель", test: (one: TaskBrief) => one.accomplices.includes(me()) },
  given: { label: "Поручил", hint: "Я поставил другому", test: (one: TaskBrief) => one.creatorId === me() && one.responsibleId !== me() },
  watching: { label: "Наблюдаю", hint: "Я наблюдатель", test: (one: TaskBrief) => one.auditors.includes(me()) },
  all: { label: "Все задачи", hint: "Всё, что мне видно", test: () => true },
} as const;
export type Preset = keyof typeof PRESETS;

export const DUES = [
  { id: "overdue", label: "Просрочены" },
  { id: "today", label: "Сегодня" },
  { id: "week", label: "На этой неделе" },
  { id: "nodate", label: "Без срока" },
] as const;
export type Due = (typeof DUES)[number]["id"];

export const SORTS = [
  { id: "manual", label: "Вручную", hint: "Как расставили на доске" },
  { id: "deadline", label: "По сроку", hint: "Сначала ближайшие" },
  { id: "activity", label: "По активности", hint: "Сначала недавно изменённые" },
  { id: "created", label: "По дате создания", hint: "Сначала новые" },
  { id: "priority", label: "По приоритету", hint: "Сначала высокий" },
  { id: "title", label: "По названию", hint: "От А до Я" },
] as const;
export type Sort = (typeof SORTS)[number]["id"];

/* ---------- Чтение из адреса ---------- */

const q = () => route.value.query;
const list = (key: string) => (q().get(key) ?? "").split(",").filter(Boolean);
const num = (key: string) => (/^\d+$/.test(q().get(key) ?? "") ? Number(q().get(key)) : null);

export const preset = computed<Preset>(() => {
  const raw = q().get("tab");
  return raw && raw in PRESETS ? (raw as Preset) : "mine";
});
export const search = computed(() => q().get("q") ?? "");
export const statuses = computed(() => list("st").filter((one): one is Status => STATUSES.some((s) => s.id === one)));
export const responsible = computed(() => num("who"));
export const creator = computed(() => num("by"));
export const priority = computed(() => q().get("pr") ?? "");
export const due = computed(() => (DUES.some((one) => one.id === q().get("due")) ? (q().get("due") as Due) : null));
export const project = computed(() => q().get("pj") ?? "");
export const tag = computed(() => q().get("tg") ?? "");
export const sort = computed<Sort>(() => (SORTS.some((one) => one.id === q().get("sort")) ? (q().get("sort") as Sort) : "manual"));
export const only = computed(() => (q().get("only") === "overdue" || q().get("only") === "comments" ? (q().get("only") as "overdue" | "comments") : null));

/* ---------- Запись ---------- */

export const setPreset = (key: Preset) => setQuery({ tab: key === "mine" ? null : key });
export const setSearch = (text: string) => setQuery({ q: text || null });
export const setSort = (key: Sort) => setQuery({ sort: key === "manual" ? null : key });
export const toggleOnly = (key: "overdue" | "comments") => setQuery({ only: only.value === key ? null : key });
export function setField(key: "st" | "who" | "by" | "pr" | "due" | "pj" | "tg", value: string | number | string[] | null) {
  setQuery({ [key]: Array.isArray(value) ? value.join(",") || null : value === "" ? null : value });
}
export const resetFilter = () => setQuery({ tab: null, q: null, st: null, who: null, by: null, pr: null, due: null, pj: null, tg: null, only: null });

/* Поля, заданные сверх набора, — чипами в строке поиска. */
export const chips = computed(() => {
  const out: { key: "st" | "who" | "by" | "pr" | "due" | "pj" | "tg"; label: string }[] = [];
  if (statuses.value.length) out.push({ key: "st", label: statuses.value.map((id) => STATUSES.find((s) => s.id === id)!.label).join(", ") });
  if (responsible.value) out.push({ key: "who", label: `Ответственный: ${nameOf(responsible.value)}` });
  if (creator.value) out.push({ key: "by", label: `Постановщик: ${nameOf(creator.value)}` });
  if (priority.value) out.push({ key: "pr", label: `Приоритет: ${PRIORITIES.find((p) => p.id === priority.value)?.label.toLowerCase() ?? priority.value}` });
  if (due.value) out.push({ key: "due", label: DUES.find((d) => d.id === due.value)!.label });
  if (project.value) out.push({ key: "pj", label: `Проект: ${project.value}` });
  if (tag.value) out.push({ key: "tg", label: `#${tag.value}` });
  return out;
});
export const filtered = computed(() => preset.value !== "mine" || chips.value.length > 0 || !!search.value || !!only.value);

/* ---------- Отбор ---------- */

function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start);
  tomorrow.setDate(start.getDate() + 1);
  const weekEnd = new Date(start);
  weekEnd.setDate(start.getDate() + ((7 - ((start.getDay() + 6) % 7)) % 7) + 1);
  return { tomorrow: tomorrow.getTime(), weekEnd: weekEnd.getTime() };
}

/* Чаты задач с непрочитанным: задача → сколько новых сообщений. */
export const unreadByTask = computed(() => {
  const map = new Map<number, number>();
  for (const chat of chats.value) {
    const hit = chat.unread > 0 && /^task:(\d+)$/.exec(chat.entity ?? "");
    if (hit) map.set(Number(hit[1]), chat.unread);
  }
  return map;
});

export function matches(one: TaskBrief, opts: { skipOnly?: boolean } = {}) {
  if (!PRESETS[preset.value].test(one)) return false;
  if (statuses.value.length && !statuses.value.includes(one.status)) return false;
  if (responsible.value && one.responsibleId !== responsible.value) return false;
  if (creator.value && one.creatorId !== creator.value) return false;
  if (priority.value && one.priority !== priority.value) return false;
  if (project.value && one.project !== project.value) return false;
  if (tag.value && !one.tags.includes(tag.value)) return false;
  if (due.value) {
    const at = one.deadline ? new Date(one.deadline).getTime() : null;
    const { tomorrow, weekEnd } = dayBounds();
    if (due.value === "overdue" && !isOverdueTask(one)) return false;
    if (due.value === "nodate" && at != null) return false;
    if (due.value === "today" && (at == null || at >= tomorrow || !isOpenTask(one))) return false;
    if (due.value === "week" && (at == null || at >= weekEnd || !isOpenTask(one))) return false;
  }
  if (!opts.skipOnly) {
    if (only.value === "overdue" && !isOverdueTask(one)) return false;
    if (only.value === "comments" && !unreadByTask.value.has(one.id)) return false;
  }
  const words = search.value.trim().toLowerCase();
  if (words) {
    const deal = one.dealId ? deals.find((d) => d.id === one.dealId) : null;
    const people = [one.responsibleId, one.creatorId, ...one.accomplices, ...one.auditors].map(nameOf).join(" ");
    const hay = `${one.title} ${one.id} №${one.id} ${people} ${deal?.title ?? ""} ${deal?.company ?? ""} ${one.project ?? ""} ${one.tags.map((t) => `#${t}`).join(" ")}`.toLowerCase();
    if (!words.split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

const PRIO_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };
const time = (iso: string | null | undefined, empty: number) => (iso ? new Date(iso).getTime() : empty);
export function sorted(items: TaskBrief[]) {
  const by = sort.value;
  if (by === "manual") return items;
  const copy = [...items];
  const cmp: Record<Exclude<Sort, "manual">, (a: TaskBrief, b: TaskBrief) => number> = {
    deadline: (a, b) => time(a.deadline, Infinity) - time(b.deadline, Infinity),
    activity: (a, b) => time(b.updatedAt, 0) - time(a.updatedAt, 0),
    created: (a, b) => time(b.createdAt, 0) - time(a.createdAt, 0) || b.id - a.id,
    priority: (a, b) => (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1),
    title: (a, b) => a.title.localeCompare(b.title, "ru"),
  };
  return copy.sort((a, b) => cmp[by](a, b) || a.sort - b.sort);
}
