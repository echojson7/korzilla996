/* Роботы и триггеры стадий сделок (как «Роботы» в Битрикс24). Сервер —
   RobotController и App\Support\Robots. Грузятся на воронку; правка — право
   crm.robots, смотреть могут все, кто видит сделки. */

import { reactive } from "vue";
import { api } from "./api";

export type Spec = string; // responsible | creator | actor | u:12 | f:uf_crm_…
export interface Rule { field: string; op: string; value: string; join: "and" | "or" }
export interface Delay { type: "now" | "after" | "field"; value: string; unit: "m" | "h" | "d" | "wd"; field?: string | null }
export interface Robot {
  id: number;
  pipelineId: number;
  stageId: number;
  type: string;
  title: string;
  settings: Record<string, any>;
  conditions: Rule[];
  delay: Delay | null;
  active: boolean;
  sort: number;
  note: string | null;
  imported: boolean;
  stats?: Record<string, number>;
}
export interface Trigger {
  id: number;
  pipelineId: number;
  stageId: number;
  type: string;
  title: string;
  settings: Record<string, any>;
  conditions: Rule[];
  allowBack: boolean;
  active: boolean;
  sort: number;
  hook: string | null;
}
export interface RobotRun { id: number; robotId: number; robot: string | null; dealId: number; deal: string | null; status: string; result: string | null; runAt: string | null; finishedAt: string | null }
export interface Key { key: string; title: string; type: string }

export const robots = reactive({
  pipelineId: 0,
  list: [] as Robot[],
  triggers: [] as Trigger[],
  types: {} as Record<string, string>,
  triggerTypes: {} as Record<string, string>,
  keys: [] as Key[],
  placeholders: [] as string[],
  ops: [] as string[],
  can: { edit: false },
  loading: false,
  loaded: false,
});

export async function loadRobots(pipelineId: number) {
  robots.loading = true;
  try {
    const data = await api<Omit<typeof robots, "pipelineId" | "loading" | "loaded" | "list"> & { robots: Robot[] }>("GET", `crm/robots?pipeline=${pipelineId}`);
    Object.assign(robots, { ...data, list: data.robots, pipelineId, loaded: true });
  } finally {
    robots.loading = false;
  }
}

const reload = () => robots.pipelineId && loadRobots(robots.pipelineId);

export interface RobotInput { stage_id?: number; type?: string; title?: string; settings?: Record<string, any>; conditions?: Rule[]; delay?: Delay | null; active?: boolean }
export async function saveRobot(id: number | null, input: RobotInput): Promise<Robot> {
  const one = await api<Robot>(id ? "PATCH" : "POST", id ? `crm/robots/${id}` : "crm/robots", input);
  await reload();
  return one;
}
export async function deleteRobot(id: number) {
  await api("DELETE", `crm/robots/${id}`);
  await reload();
}
export async function orderRobots(stageId: number, ids: number[]) {
  await api("POST", "crm/robots/order", { stage_id: stageId, ids });
  await reload();
}

export interface TriggerInput { stage_id?: number; type?: string; title?: string; settings?: Record<string, any>; conditions?: Rule[]; allow_back?: boolean; active?: boolean }
export async function saveTrigger(id: number | null, input: TriggerInput): Promise<Trigger> {
  const one = await api<Trigger>(id ? "PATCH" : "POST", id ? `crm/triggers/${id}` : "crm/triggers", input);
  await reload();
  return one;
}
export async function deleteTrigger(id: number) {
  await api("DELETE", `crm/triggers/${id}`);
  await reload();
}

export const robotRuns = (query: { robot?: number; deal?: number }) =>
  api<RobotRun[]>("GET", `crm/robot-runs?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))}`);

export const OPS: Record<string, string> = {
  "=": "равно", "!=": "не равно", ">": "больше", ">=": "больше или равно", "<": "меньше", "<=": "меньше или равно",
  contain: "содержит", "!contain": "не содержит", empty: "пусто", "!empty": "не пусто",
};
export const UNITS: Record<string, string> = { m: "мин", h: "ч", d: "дн", wd: "раб. дн" };
export const RUN_STATUS: Record<string, string> = { pending: "Ждёт", running: "Выполняется", done: "Выполнен", skipped: "Не подошло условие", failed: "Ошибка", cancelled: "Отменён" };

export function delayText(delay: Delay | null, fieldTitle: (code: string) => string): string {
  if (!delay || delay.type === "now") return "Сразу";
  const n = String(delay.value ?? "0");
  const unit = UNITS[delay.unit] ?? delay.unit;
  if (delay.type === "after") return `Через ${n} ${unit}`;
  const num = Number(n);
  const shift = !num ? "" : num > 0 ? ` + ${num} ${unit}` : ` − ${-num} ${unit}`;
  return `${fieldTitle(delay.field ?? "")}${shift}`;
}
