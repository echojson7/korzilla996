/* CRM с сервера (как в Битрикс24): схема (воронки, стадии, свои поля) и
   сделки. Канбан держит открытые сделки одной воронки; список грузится
   страницами. Живое обновление: событие deal из общего канала
   (lib/realtime.ts) догружает только поменявшиеся сделки, событие crm —
   схему. Номер version не даёт старому ответу перетереть свежий. */

import { computed, reactive, watch } from "vue";
import { api } from "./api";
import { auth } from "./session";
import { can } from "./access";
import { people, loadPeople } from "./messenger";
import { on, startRealtime } from "./realtime";
import { taskStore } from "./tasks";

export type Semantic = "process" | "success" | "failure";
export type FieldType = "string" | "text" | "number" | "date" | "datetime" | "boolean" | "list" | "user" | "url" | "file";

export interface Stage { id: number; pipelineId: number; title: string; color: string; semantic: Semantic; sort: number }
export interface Pipeline { id: number; title: string; sort: number; isDefault: boolean; stages: Stage[]; open?: number }
export interface Option { id: string; label: string }
export interface Field {
  id: number;
  code: string;
  title: string;
  type: FieldType;
  multiple: boolean;
  required: boolean;
  options: Option[];
  section: string | null;
  sort: number;
  showInList: boolean;
  showOnKanban: boolean;
  active: boolean;
  externalCode: string | null;
}
export type FieldValue = string | number | boolean | null | (string | number)[] | { name?: string; url?: string }[];
export interface DealBrief {
  id: number;
  pipelineId: number;
  stageId: number;
  title: string;
  amount: number;
  currency: string;
  responsibleId: number | null;
  creatorId: number | null;
  company: string | null;
  contact: string | null;
  closeDate: string | null;
  closed: boolean;
  fields: Record<string, FieldValue>;
  sort: number;
  stageChangedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;
}
export interface DealHistory { id: number; userId: number | null; field: string; old: string | null; new: string | null; at: string | null }
export interface DealFull extends DealBrief {
  comments: string | null;
  externalId: string | null;
  history: DealHistory[];
  can: { edit: boolean; delete: boolean };
}
export interface DealInput {
  title?: string;
  amount?: number | null;
  currency?: string;
  responsible_id?: number | null;
  company?: string | null;
  contact?: string | null;
  close_date?: string | null;
  comments?: string | null;
  pipeline_id?: number;
  stage_id?: number;
  fields?: Record<string, FieldValue>;
}

export const SEMANTICS: Record<Semantic, string> = { process: "В работе", success: "Успех", failure: "Провал" };
export const CURRENCIES = ["RUB", "USD", "EUR", "KZT"];

export const crm = reactive({
  pipelines: [] as Pipeline[],
  fields: [] as Field[],
  types: {} as Record<FieldType, string>,
  can: { settings: false, create: false },
  loaded: false,
  error: "",
});

/* Канбан: открытые сделки воронки pipelineId. */
export const board = reactive({ pipelineId: 0, list: [] as DealBrief[], loading: false, loaded: false, me: 0 });

/* Названия сделок для задач, поиска и истории: всё, что уже приходило. */
export const dealIndex = reactive(new Map<number, { id: number; title: string; company: string | null; pipelineId: number; stageId: number }>());

/* Сводка для меню и обзора. */
export const summary = reactive({ open: { count: 0, sum: 0 }, week: { count: 0, sum: 0 }, stages: {} as Record<string, { count: number; sum: number }>, loaded: false });

export const crmEnabled = computed(() => !!auth.me && !auth.demo && can("crm", "view"));

export const pipelineById = computed(() => new Map(crm.pipelines.map((one) => [one.id, one])));
export const stageById = computed(() => {
  const out = new Map<number, Stage>();
  for (const pipeline of crm.pipelines) for (const stage of pipeline.stages) out.set(stage.id, stage);
  return out;
});
export const fieldByCode = computed(() => new Map(crm.fields.map((one) => [one.code, one])));
export const defaultPipeline = computed(() => crm.pipelines.find((one) => one.isDefault) ?? crm.pipelines[0] ?? null);
/* Новые сделки — на первой стадии своих воронок (счётчик в меню). */
export const newDeals = computed(() => crm.pipelines.reduce((total, one) => total + (summary.stages[one.stages[0]?.id ?? 0]?.count ?? 0), 0));

/* Цвет стадии #rrggbb → оттенок для hue-bar. */
export function hueOf(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 220;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 220;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60);
}

function remember(list: DealBrief[]) {
  for (const one of list) dealIndex.set(one.id, { id: one.id, title: one.title, company: one.company, pipelineId: one.pipelineId, stageId: one.stageId });
}

/* ---------- Загрузка ---------- */

export async function loadSchema() {
  const state = await api<{ pipelines: Pipeline[]; fields: Field[]; types: Record<FieldType, string>; can: typeof crm.can }>("GET", "crm/schema");
  crm.pipelines = state.pipelines;
  crm.fields = state.fields;
  crm.types = state.types;
  crm.can = state.can;
  crm.loaded = true;
  crm.error = "";
}

let boardSeq = 0;
export async function loadBoard(pipelineId: number) {
  const seq = ++boardSeq;
  if (board.pipelineId !== pipelineId) {
    board.pipelineId = pipelineId;
    board.list = [];
    board.loaded = false;
  }
  board.loading = true;
  try {
    const state = await api<{ deals: DealBrief[]; me: number }>("GET", `crm/deals?pipeline=${pipelineId}&closed=0&per=3000`);
    if (seq !== boardSeq) return;
    board.list = state.deals;
    board.me = state.me;
    board.loaded = true;
    remember(state.deals);
  } finally {
    if (seq === boardSeq) board.loading = false;
  }
}

export interface ListQuery { pipeline?: number; closed?: "0" | "1" | "all"; q?: string; stage?: number; order?: string; page?: number; per?: number }
export async function loadList(query: ListQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "" && value !== 0) params.set(key, String(value));
  const state = await api<{ deals: DealBrief[]; total: number; sum: number; me: number }>("GET", `crm/deals?${params}`);
  remember(state.deals);
  return state;
}

export async function loadSummary() {
  const state = await api<typeof summary>("GET", "crm/summary");
  Object.assign(summary, state, { loaded: true });
}

/* Названия сделок по id (для задач): чего нет в справочнике — догрузить. */
const asked = new Set<number>();
export async function ensureDeals(ids: (number | null | undefined)[]) {
  if (!crmEnabled.value) return;
  const need = [...new Set(ids.filter((id): id is number => !!id && !dealIndex.has(id) && !asked.has(id)))];
  if (!need.length) return;
  need.forEach((id) => asked.add(id));
  const state = await api<{ deals: DealBrief[] }>("GET", `crm/deals?ids=${need.slice(0, 500).join(",")}`);
  remember(state.deals);
}

export async function searchDeals(q: string) {
  const state = await loadList({ q, closed: "all", per: 30, order: "-updated" });
  return state.deals;
}

export const getDeal = (id: number) => api<DealFull>("GET", `crm/deals/${id}`).then((one) => (remember([one]), one));

/* ---------- Действия ---------- */

function adopt(one: DealBrief) {
  remember([one]);
  const at = board.list.findIndex((deal) => deal.id === one.id);
  const fits = one.pipelineId === board.pipelineId && !one.closed;
  if (at >= 0) {
    if ((board.list[at].version ?? 0) > (one.version ?? 0)) return;
    if (fits) board.list[at] = { ...board.list[at], ...one };
    else board.list.splice(at, 1);
  } else if (fits) {
    board.list.unshift(one);
  }
}

export async function createDeal(input: DealInput) {
  const one = await api<DealFull>("POST", "crm/deals", input);
  adopt(one);
  bump();
  return one;
}

export async function updateDeal(id: number, input: DealInput) {
  const one = await api<DealFull>("PATCH", `crm/deals/${id}`, input);
  adopt(one);
  bump();
  return one;
}

export async function moveDeal(id: number, stageId: number, before: number | null) {
  const one = await api<DealBrief>("POST", `crm/deals/${id}/move`, { stage_id: stageId, before });
  adopt(one);
  bump();
  return one;
}

export async function deleteDeal(id: number) {
  await api("DELETE", `crm/deals/${id}`);
  board.list = board.list.filter((one) => one.id !== id);
  dealIndex.delete(id);
  bump();
}

/* ---------- Настройки ---------- */

export const settings = {
  addPipeline: (title: string) => api<Pipeline>("POST", "crm/pipelines", { title }).then(afterSettings),
  updatePipeline: (id: number, input: { title?: string; is_default?: boolean }) => api<Pipeline>("PATCH", `crm/pipelines/${id}`, input).then(afterSettings),
  orderPipelines: (ids: number[]) => api("POST", "crm/pipelines/order", { ids }).then(afterSettings),
  deletePipeline: (id: number) => api("DELETE", `crm/pipelines/${id}`).then(afterSettings),
  addStage: (pipelineId: number, input: { title: string; color?: string; semantic?: Semantic; after?: number | null }) => api<Stage>("POST", `crm/pipelines/${pipelineId}/stages`, input).then(afterSettings),
  updateStage: (id: number, input: { title?: string; color?: string; semantic?: Semantic }) => api<Stage>("PATCH", `crm/stages/${id}`, input).then(afterSettings),
  orderStages: (pipelineId: number, ids: number[]) => api("POST", `crm/pipelines/${pipelineId}/stages/order`, { ids }).then(afterSettings),
  deleteStage: (id: number, moveTo?: number | null) => api("DELETE", `crm/stages/${id}`, moveTo ? { move_to: moveTo } : {}).then(afterSettings),
  addField: (input: Partial<FieldInput> & { title: string; type: FieldType }) => api<Field>("POST", "crm/fields", input).then(afterSettings),
  updateField: (id: number, input: Partial<FieldInput>) => api<Field>("PATCH", `crm/fields/${id}`, input).then(afterSettings),
  orderFields: (ids: number[]) => api("POST", "crm/fields/order", { ids }).then(afterSettings),
  deleteField: (id: number) => api("DELETE", `crm/fields/${id}`).then(afterSettings),
};
export interface FieldInput {
  title: string;
  type: FieldType;
  multiple: boolean;
  required: boolean;
  section: string | null;
  show_in_list: boolean;
  show_on_kanban: boolean;
  active: boolean;
  options: { id?: string; label: string }[];
}
async function afterSettings<T>(result: T): Promise<T> {
  await loadSchema();
  return result;
}

/* ---------- Живое обновление ---------- */

let started = false;
const listeners = new Set<(ids: number[]) => void>();
/* Карточка открытой сделки подписывается: её сделку поменяли — перечитать. */
export function onDealChange(fn: (ids: number[]) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startCrm() {
  if (started || !crmEnabled.value) return;
  started = true;
  if (!people.size) loadPeople().catch(() => undefined);
  loadSchema().catch((error) => (crm.error = error instanceof Error ? error.message : "CRM не загрузилась"));
  loadSummary().catch(() => undefined);
  on("deal", (event) => {
    for (const id of event.ids ?? []) pending.add(id);
    flushSoon();
  });
  on("crm", () => void loadSchema().catch(() => undefined));
  on("reset", () => {
    void loadSchema().catch(() => undefined);
    if (board.pipelineId) void loadBoard(board.pipelineId).catch(() => undefined);
    bump();
  });
  startRealtime();
}

const pending = new Set<number>();
let flushTimer = 0;
function flushSoon(delay = 80) {
  clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, delay);
}
async function flush() {
  const ids = [...pending];
  pending.clear();
  if (!ids.length) return;
  try {
    const state = await api<{ deals: DealBrief[] }>("GET", `crm/deals?ids=${ids.join(",")}`);
    const found = new Set(state.deals.map((one) => one.id));
    state.deals.forEach(adopt);
    /* Пропала (удалили или закрыли доступ) — убрать с доски. */
    board.list = board.list.filter((one) => !ids.includes(one.id) || found.has(one.id));
  } catch {
    /* Сеть моргнула — следующее событие или переход догрузит. */
  }
  listeners.forEach((fn) => fn(ids));
  bump();
}

/* Сводку меню пересчитываем не чаще раза в 3 с. */
let summaryTimer = 0;
function bump() {
  clearTimeout(summaryTimer);
  summaryTimer = window.setTimeout(() => void loadSummary().catch(() => undefined), 3000);
}

/* Вошли с правом на сделки — схема и сводка для меню; у задач — названия их сделок. */
watch(crmEnabled, (on) => on && startCrm(), { immediate: true });
watch(() => taskStore.list.map((one) => one.dealId), (ids) => void ensureDeals(ids).catch(() => undefined));
