/* Всплывающие уведомления внизу справа. */

import { reactive } from "vue";

export interface Toast {
  id: number;
  text: string;
  tone: "default" | "success" | "danger";
}
export const toasts = reactive<Toast[]>([]);
let seq = 0;

export function toast(text: string, tone: Toast["tone"] = "default") {
  const id = ++seq;
  toasts.push({ id, text, tone });
  setTimeout(() => {
    const at = toasts.findIndex((one) => one.id === id);
    if (at >= 0) toasts.splice(at, 1);
  }, 3200);
}
