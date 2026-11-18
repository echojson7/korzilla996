/* Откуда админка берёт данные сайта и куда пишет правки — один слой на все
   экраны. Источников три, у каждого один способ обращения:

     local      — демо в браузере: свежая копия при первом обращении (seed),
                  дальше правки в localStorage под ключом (js/core/store.js);
                  копия одна на ключ за визит, страницы меняют её и зовут keep;
     legacy*    — старые адреса движка /admin-old/*: JSON по сессии старой
                  админки, токен формы приходит в ответах и уходит с правками;
     api        — JSON API движка /admin/api/v1 (api.js).

   Экран, который работает и с движком, и без него (вид сайта, иконки,
   раскладка), спрашивает legacyGet: ответ есть — данные движка, null — свои
   из браузера, а экран о разнице не знает. */

import { read, write } from "../core/store.js";

/* ---- Браузер --------------------------------------------------------------------- */

const copies = new Map();

/* adopt — довести сохранённое до нынешнего вида (или отвергнуть: вернуть null —
   и будет свежая копия). */
export function local(key, seed, adopt = (saved) => saved) {
  if (!copies.has(key)) {
    const saved = read(key, null);
    copies.set(key, (saved != null && adopt(saved)) || seed());
  }
  return copies.get(key);
}

/* Сохранить копию ключа; value — новая копия целиком (откат, сброс). */
export function keep(key, value = copies.get(key)) {
  copies.set(key, value);
  write(key, value);
  return value;
}

/* ---- Старые адреса движка ------------------------------------------------------------ */

let csrf = "";
const ACCEPT = { Accept: "application/json" };

/* JSON ответа или null: движка нет, не вошли (редирект на вход), ошибка сети. */
export async function legacyGet(path) {
  /* У портала пока нет сервера: всё на демо. */
  if (path) return null;
  try {
    const response = await fetch(path, { credentials: "same-origin", redirect: "manual", headers: ACCEPT });
    if (!response.ok || !response.headers.get("content-type")?.includes("json")) return null;
    const data = await response.json();
    if (data?.csrf) csrf = data.csrf;
    return data;
  } catch {
    return null;
  }
}

/* Правка: ответ как есть (успех у старых экранов — редирект, за ним не ходим). */
export const legacySend = (method, path, body) => fetch(path, {
  method,
  credentials: "same-origin",
  redirect: "manual",
  headers: { ...ACCEPT, "Content-Type": "application/json", "X-CSRF-TOKEN": csrf, "X-Requested-With": "XMLHttpRequest" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/* Правка с ответом JSON: данные после правки; ошибка — текстом сервера. */
export async function legacyPut(path, body) {
  const response = await legacySend("PUT", path, body);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message ?? `Сервер ответил ${response.status}`);
  if (data.csrf) csrf = data.csrf;
  return data;
}
