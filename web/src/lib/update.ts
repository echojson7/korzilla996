/* Новая версия портала. Сборка лежит статикой, index.html не кэшируется,
   а у файлов сборки в имени хеш. Значит, новая выкатка — это другой
   адрес главного скрипта в index.html. Вкладка периодически берёт
   index.html в обход кэша и сравнивает его со своим. Не совпало —
   показываем окно «Портал обновлён», остальной интерфейс блокируется.

   Когда проверяем: раз в минуту, при возврате на вкладку, при появлении
   сети и после переподключения real-time (служба перезапускалась). */

import { ref, watch } from "vue";
import { live } from "./realtime";

export const outdated = ref(false);

const entryOf = (html: string) => html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;
const mine = (() => {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src");
  return src ?? null;
})();

let checking = false;
export async function checkUpdate() {
  if (!mine || outdated.value || checking) return;
  checking = true;
  try {
    const response = await fetch(new URL("./index.html", location.href), { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const next = entryOf(await response.text());
    if (next && next !== mine) outdated.value = true;
  } catch {
    /* нет сети — проверим позже */
  } finally {
    checking = false;
  }
}

/* Перезагрузка мимо кэша: свежий index.html и метка в адресе. */
export async function reloadFresh() {
  try {
    await fetch(new URL("./index.html", location.href), { cache: "reload" });
  } catch {
    /* всё равно перезагружаем */
  }
  const url = new URL(location.href);
  url.searchParams.set("v", Date.now().toString(36));
  location.replace(url.toString());
}

let started = false;
export function watchUpdates() {
  if (started || !mine) return;
  started = true;
  window.setInterval(() => !document.hidden && checkUpdate(), 60_000);
  document.addEventListener("visibilitychange", () => !document.hidden && checkUpdate());
  window.addEventListener("online", () => checkUpdate());
  window.addEventListener("focus", () => checkUpdate());
  watch(live, (on) => on && checkUpdate());
}
