/* Замена иконок: { глиф кита: набор } (экран «Внешний вид → Иконки»).

   На сайте korzillaX, когда администратор вошёл в /admin-old, выбор хранит
   движок (/admin-old/icons, настройки сайта design.icon.*): по нему же сервер
   рисует иконки витрины. Без движка — в браузере под ключом сайта: экран
   работает так же, только сайт о выборе не знает. */

import { local, keep, legacyGet, legacyPut } from "./source.js";

const URL_ICONS = "/admin-old/icons";
const KEY = "icons";

let choice = {};
let live = false;

export const isLiveIcons = () => live;
export const iconChoice = () => ({ ...choice });

export async function loadIcons() {
  const data = await legacyGet(URL_ICONS);
  live = Boolean(data);
  /* Нет движка — выбор из браузера. */
  choice = { ...(data ? data.icons : local(KEY, () => ({}))) };
  return iconChoice();
}

/* next — весь выбор: глифа, которого в нём нет, замена снимается. */
export async function saveIcons(next) {
  if (!live) {
    choice = { ...next };
    keep(KEY, { ...choice });
    return iconChoice();
  }
  choice = { ...(await legacyPut(URL_ICONS, { icons: next })).icons };
  return iconChoice();
}
