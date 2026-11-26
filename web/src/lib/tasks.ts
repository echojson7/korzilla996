/* Задачи с сервера (как в Битрикс24): список видимых мне задач, открытая
   задача целиком и действия с ней. Список обновляется опросом, пока
   вкладка открыта. Люди — общий справочник сотрудников мессенджера. */

import { computed, reactive, watch } from "vue";
import { api, upload } from "./api";
import { auth } from "./session";
import { people, loadPeople, person, type ChatUser } from "./messenger";
import { DAY, startOfDay } from "./format";

export type Status = "pending" | "work" | "review" | "deferred" | "done";
export type Priority = "low" | "normal" | "high";

export const STATUSES: { id: Status; label: string; column: string; hue: number }[] = [
  { id: "pending", label: "Ждёт выполнения", column: "Ждут выполнения", hue: 240 },
  { id: "work", label: "Выполняется", column: "Выполняются", hue: 60 },
  { id: "review", label: "Ждёт контроля", column: "На контроле", hue: 285 },
  { id: "deferred", label: "Отложена", column: "Отложены", hue: 20 },
  { id: "done", label: "Завершена", column: "Завершены", hue: 145 },
];
export const STATUS = Object.fromEntries(STATUSES.map((one) => [one.id, one])) as Record<Status, (typeof STATUSES)[number]>;
export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "low", label: "Низкий" },
  { id: "normal", label: "Обычный" },
  { id: "high", label: "Высокий" },
];

export interface TaskBrief {
  id: number;
  parentId: number | null;
  title: string;
  status: Status;
  priority: Priority;
  creatorId: number | null;
  responsibleId: number | null;
  accomplices: number[];
  auditors: number[];
  deadline: string | null;
  startAt: string | null;
  needsReview: boolean;
  estimate: number | null;
  project: string | null;
  dealId: number | null;
  tags: string[];
  sort: number;
  checklist: { done: number; total: number };
  comments: number;
  files: number;
  children: number;
  timeSpent: number;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface CheckItem { id: number; title: string; done: boolean; doneBy: number | null; sort: number }
export interface TaskFileItem { id: number; name: string; size: number; mime: string | null; image: boolean; userId: number | null; url: string; at: string | null }
export interface CommentItem { id: number; userId: number | null; body: string; editedAt: string | null; at: string | null }
export interface TimeItem { id: number; userId: number | null; startedAt: string; stoppedAt: string | null; seconds: number; note: string | null }
export interface HistoryItem { id: number; userId: number | null; field: string; old: string | null; new: string | null; at: string | null }
export interface TaskFull extends TaskBrief {
  description: string | null;
  checklistItems: CheckItem[];
  fileItems: TaskFileItem[];
  commentItems: CommentItem[];
  timeItems: TimeItem[];
  historyItems: HistoryItem[];
  childItems: TaskBrief[];
  parent: { id: number; title: string; status: Status } | null;
  can: { edit: boolean; work: boolean; delete: boolean };
}

/* Поля для создания и правки — как ждёт сервер. */
export interface TaskInput {
  title?: string;
  description?: string | null;
  status?: Status;
  priority?: Priority;
  responsible_id?: number;
  deadline?: string | null;
  start_at?: string | null;
  needs_review?: boolean;
  estimate?: number | null;
  project?: string | null;
  deal_id?: number | null;
  parent_id?: number | null;
  accomplices?: number[];
  auditors?: number[];
  tags?: string[];
}

export const taskStore = reactive({
  list: [] as TaskBrief[],
  me: 0,
  timer: null as { taskId: number; startedAt: string } | null,
  projects: [] as string[],
  tags: [] as string[],
  loaded: false,
  error: "",
});

export const tasksEnabled = computed(() => !!auth.me && !auth.demo);
export const meTask = () => taskStore.me;
export { people, person, type ChatUser };
export const staffList = computed(() => [...people.values()].filter((one) => one.active).sort((a, b) => a.name.localeCompare(b.name, "ru")));

/* ---------- Загрузка ---------- */

export async function loadTasks() {
  const state = await api<{ tasks: TaskBrief[]; me: number; timer: typeof taskStore.timer; projects: string[]; tags: string[] }>("GET", "tasks");
  taskStore.list = state.tasks;
  taskStore.me = state.me;
  taskStore.timer = state.timer;
  taskStore.projects = state.projects;
  taskStore.tags = state.tags;
  taskStore.loaded = true;
  taskStore.error = "";
}

let started = false;
export function startTasks() {
  if (started || !tasksEnabled.value) return;
  started = true;
  if (!people.size) loadPeople().catch(() => undefined);
  loadTasks().catch((error) => (taskStore.error = error instanceof Error ? error.message : "Задачи не загрузились"));
  const tick = async () => {
    if (!document.hidden && !busy) await loadTasks().catch(() => undefined);
    window.setTimeout(tick, document.hidden ? 60_000 : 15_000);
  };
  window.setTimeout(tick, 15_000);
}
/* Пока идёт своё действие — опрос не перетирает оптимистичный список. */
let busy = 0;
async function act<T>(run: () => Promise<T>): Promise<T> {
  busy++;
  try {
    return await run();
  } finally {
    busy--;
  }
}

/* Обновить строку списка по ответу сервера. */
export function upsert(one: TaskBrief) {
  const at = taskStore.list.findIndex((task) => task.id === one.id);
  const brief = { ...one } as TaskBrief & Partial<TaskFull>;
  for (const key of ["description", "checklistItems", "fileItems", "commentItems", "timeItems", "historyItems", "childItems", "parent", "can"] as const) delete brief[key];
  if (at >= 0) taskStore.list[at] = brief;
  else taskStore.list.unshift(brief);
  for (const child of (one as TaskFull).childItems ?? []) {
    const i = taskStore.list.findIndex((task) => task.id === child.id);
    if (i >= 0) taskStore.list[i] = child;
  }
  if ((one as TaskFull).project && !taskStore.projects.includes((one as TaskFull).project!)) taskStore.projects.push((one as TaskFull).project!);
  for (const tag of one.tags) if (!taskStore.tags.includes(tag)) taskStore.tags.push(tag);
}

/* ---------- Действия ---------- */

export const getTask = (id: number) => api<TaskFull>("GET", `tasks/${id}`);

export const createTask = (input: TaskInput) => act(async () => {
  const task = await api<TaskFull>("POST", "tasks", input);
  upsert(task);
  return task;
});
export const updateTask = (id: number, input: TaskInput) => act(async () => {
  const task = await api<TaskFull>("PATCH", `tasks/${id}`, input);
  upsert(task);
  return task;
});
export const setStatus = (id: number, status: Status) => act(async () => {
  const task = await api<TaskFull>("POST", `tasks/${id}/status`, { status });
  upsert(task);
  return task;
});
export const moveTask = (id: number, status: Status | null, before: number | null) => act(async () => {
  const task = await api<TaskBrief>("POST", `tasks/${id}/move`, { status, before });
  upsert(task);
  return task;
});
export const deleteTask = (id: number) => act(async () => {
  await api("DELETE", `tasks/${id}`);
  taskStore.list = taskStore.list.filter((one) => one.id !== id);
});
export const toggleTimer = (id: number) => act(async () => {
  const task = await api<TaskFull>("POST", `tasks/${id}/timer`);
  upsert(task);
  const running = task.timeItems.find((one) => !one.stoppedAt && one.userId === taskStore.me);
  taskStore.timer = running ? { taskId: id, startedAt: running.startedAt } : null;
  return task;
});
export const addTime = (id: number, minutes: number, note: string, date?: string) => act(async () => {
  const task = await api<TaskFull>("POST", `tasks/${id}/time`, { minutes, note: note || null, date });
  upsert(task);
  return task;
});
export const deleteTime = (entry: number) => api("DELETE", `task-time/${entry}`);

export const addCheck = (id: number, title: string) => api<CheckItem>("POST", `tasks/${id}/checklist`, { title });
export const updateCheck = (item: number, patch: { title?: string; done?: boolean }) => api<CheckItem>("PATCH", `task-checklist/${item}`, patch);
export const deleteCheck = (item: number) => api("DELETE", `task-checklist/${item}`);
export const orderChecks = (id: number, ids: number[]) => api("POST", `tasks/${id}/checklist/order`, { ids });

export function addFiles(id: number, files: File[], onProgress?: (part: number) => void) {
  const form = new FormData();
  for (const file of files) form.append("files[]", file);
  return upload<TaskFileItem[]>(`tasks/${id}/files`, form, onProgress);
}
export const deleteFile = (file: number) => api("DELETE", `task-files/${file}`);

export const addComment = (id: number, body: string) => api<CommentItem>("POST", `tasks/${id}/comments`, { body });
export const updateComment = (comment: number, body: string) => api<CommentItem>("PATCH", `task-comments/${comment}`, { body });
export const deleteComment = (comment: number) => api("DELETE", `task-comments/${comment}`);

/* ---------- Выборки ---------- */

export const isOpenTask = (one: TaskBrief) => one.status !== "done";
export const isOverdueTask = (one: TaskBrief, now = Date.now()) => one.status !== "done" && one.status !== "deferred" && !!one.deadline && new Date(one.deadline).getTime() < now;
export const myOpen = computed(() => taskStore.list.filter((one) => isOpenTask(one) && (one.responsibleId === taskStore.me || one.accomplices.includes(taskStore.me))));
export const myOverdueCount = computed(() => myOpen.value.filter((one) => isOverdueTask(one)).length);
export const overdueAll = computed(() => taskStore.list.filter((one) => isOverdueTask(one)));

/* ---------- Сроки ---------- */

/* Периоды для вида «Сроки», как в Битрикс24. */
export type Period = "overdue" | "today" | "week" | "next" | "later" | "none";
export const PERIODS: { id: Period; label: string; hue: number }[] = [
  { id: "overdue", label: "Просрочены", hue: 25 },
  { id: "today", label: "На сегодня", hue: 60 },
  { id: "week", label: "На этой неделе", hue: 145 },
  { id: "next", label: "На следующей неделе", hue: 200 },
  { id: "later", label: "Больше двух недель", hue: 240 },
  { id: "none", label: "Без срока", hue: 260 },
];
function bounds() {
  const today = startOfDay(new Date());
  const weekday = (today.getDay() + 6) % 7; /* пн = 0 */
  const weekEnd = new Date(today.getTime() + (7 - weekday) * DAY);
  return { today, tomorrow: new Date(today.getTime() + DAY), weekEnd, nextEnd: new Date(weekEnd.getTime() + 7 * DAY) };
}
export function periodOf(one: TaskBrief): Period {
  if (!one.deadline) return "none";
  const at = new Date(one.deadline).getTime();
  const b = bounds();
  if (at < Date.now()) return "overdue";
  if (at < b.tomorrow.getTime()) return "today";
  if (at < b.weekEnd.getTime()) return "week";
  if (at < b.nextEnd.getTime()) return "next";
  return "later";
}
/* Срок при переносе в период: конец рабочего дня последнего дня периода. */
export function deadlineFor(period: Period): string | null | undefined {
  const b = bounds();
  const at19 = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 19, 0).toISOString();
  if (period === "none") return null;
  if (period === "today") return at19(b.today);
  if (period === "week") return at19(new Date(b.weekEnd.getTime() - 3 * DAY)); /* пятница */
  if (period === "next") return at19(new Date(b.nextEnd.getTime() - 3 * DAY));
  if (period === "later") return at19(new Date(b.nextEnd.getTime() + 4 * DAY));
  return undefined;
}

/* ---------- Подписи ---------- */

export function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
export const nameOf = (id: number | null | undefined) => person(id)?.name ?? (id ? `Сотрудник №${id}` : "—");

/* Счётчики в меню нужны сразу после входа, не только на странице задач. */
watch(tasksEnabled, (on) => on && startTasks(), { immediate: true });
