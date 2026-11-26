/* Экран «Нет доступа» / «Не найдено»: какое состояние показать по ошибке
   API. Сервер отвечает 403 { reason: "forbidden" } на чужую задачу или чат
   и 404 { reason: "not_found" } на несуществующую — без названий и полей
   (bootstrap/app.php). Показывая экран, вызывающий обязан выбросить свои
   данные о сущности (кэш списка, ленту чата), чтобы не мелькнуло лишнего. */

import { ApiError } from "./api";

export type Denied = "forbidden" | "not_found" | "error";
/* Что открывали: от этого зависят слова на экране. */
export type DeniedWhat = "task" | "chat" | "deal" | "profile" | "section" | "process";

export function deniedOf(error: unknown): Denied {
  if (error instanceof ApiError && error.status === 403) return "forbidden";
  if (error instanceof ApiError && error.status === 404) return "not_found";
  return "error";
}

/* Скелетон отыгрывает хотя бы столько, даже если сервер ответил сразу:
   экран ошибки не «мигает» поверх только что открытого окна. */
export const SKELETON_MS = 350;
export const atLeast = <T>(promise: Promise<T>, ms = SKELETON_MS): Promise<T> => {
  const wait = new Promise((resolve) => setTimeout(resolve, ms));
  return Promise.allSettled([promise, wait]).then(() => promise);
};
