/* Права текущего сотрудника по разделам (как в Битрикс24). Сервер
   проверяет всё сам, здесь — только чтобы прятать то, что нельзя.

   Уровни: none — нет, own — свои, dept — отдела, all — все. Без сервера
   (демо) и у владельца с администратором — всё. */

import { auth } from "./session";
import type { Level } from "./api";

const RANK: Record<Level, number> = { none: 0, own: 1, dept: 2, all: 3 };

export function level(section: string, action: string): Level {
  const me = auth.me;
  if (!me) return "none";
  if (auth.demo || me.manager || me.permissions.includes("*")) return "all";
  return me.access?.[section]?.[action] ?? "none";
}

/* Есть ли право хотя бы на уровне at (по умолчанию — «свои»). */
export const can = (section: string, action: string, at: Level = "own") => RANK[level(section, action)] >= RANK[at];

/* Настройки, роли и учётки. */
export const isManager = () => !!auth.me && (auth.demo || !!auth.me.manager || auth.me.permissions.includes("*"));
export const isOwner = () => !!auth.me && (auth.demo || !!auth.me.owner || auth.me.role === "owner");
