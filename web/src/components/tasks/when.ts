/* Даты в задачах: подписи сроков и поле datetime-local. */

import { DAY, startOfDay } from "../../lib/format";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const yearFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function when(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  const at = new Date(iso);
  const today = startOfDay(new Date()).getTime();
  const day = startOfDay(at).getTime();
  const clock = withTime ? `, ${timeFmt.format(at)}` : "";
  if (day === today) return `Сегодня${clock}`;
  if (day === today + DAY) return `Завтра${clock}`;
  if (day === today - DAY) return `Вчера${clock}`;
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return `${(sameYear ? dateFmt : yearFmt).format(at).replace(".", "")}${clock}`;
}

/* ISO → значение поля datetime-local (местное время) и обратно. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/* Быстрые сроки: конец рабочего дня (19:00). */
export function quickDeadline(kind: "today" | "tomorrow" | "friday" | "week" | "month") {
  const now = new Date();
  const base = startOfDay(now);
  const at = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 19, 0).toISOString();
  if (kind === "today") return at(base);
  if (kind === "tomorrow") return at(new Date(base.getTime() + DAY));
  if (kind === "friday") {
    const shift = (5 - base.getDay() + 7) % 7 || (now.getHours() >= 19 ? 7 : 0);
    return at(new Date(base.getTime() + shift * DAY));
  }
  if (kind === "week") return at(new Date(base.getTime() + 7 * DAY));
  return at(new Date(base.getFullYear(), base.getMonth() + 1, base.getDate()));
}

/* Срок лейблом, цвет по близости — как на карточках канбана. */
export type Tone = "danger" | "warning" | "soon" | "calm" | "none" | "done";
export function dueLook(status: string, deadline: string | null): { text: string; tone: Tone } {
  if (status === "done") return { text: "Завершена", tone: "done" };
  if (!deadline) return { text: "Без срока", tone: "none" };
  const at = new Date(deadline).getTime();
  const today = startOfDay(new Date()).getTime();
  if (at < Date.now()) return { text: `Просрочена · ${when(deadline, false)}`, tone: "danger" };
  if (at < today + DAY) return { text: when(deadline), tone: "warning" };
  if (at < today + 3 * DAY) return { text: when(deadline, false), tone: "soon" };
  return { text: when(deadline, false), tone: "calm" };
}

/* «1:30», «1 ч 30», «90», «2ч» → минуты. */
export function parseMinutes(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(",", ".");
  if (!raw) return null;
  const colon = raw.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hm = raw.match(/^(?:(\d+(?:\.\d+)?)\s*ч\w*)?\s*(?:(\d+)\s*м\w*)?$/);
  if (hm && (hm[1] || hm[2])) return Math.round(Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0));
  const plain = Number(raw);
  return Number.isFinite(plain) && plain > 0 ? Math.round(plain) : null;
}
export const sizeText = (bytes: number) => (bytes < 1024 ? `${bytes} Б` : bytes < 1048576 ? `${Math.round(bytes / 1024)} КБ` : `${(bytes / 1048576).toFixed(1).replace(".", ",")} МБ`);
