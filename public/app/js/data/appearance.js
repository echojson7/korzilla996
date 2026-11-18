/* Внешний вид сайта: персонализация (цвет бренда, шрифт, скругление) и свой CSS
   сайта и админки — экраны «Персонализация» и «CSS стили».

   На сайте korzillaX, когда администратор вошёл в /admin-old, всё хранит движок
   (/admin-old/appearance, настройки сайта design.*): сайт получает переменные
   и CSS файлом /kz-site.css. Без движка — в браузере под ключом сайта: экраны
   работают так же, только сайт о выборе не знает.

   look — { brand: "#rrggbb" | "", font: "" | system | onest | inter | golos |
   manrope, radius: "" | none | sm | lg } (пусто — как у темы);
   css — { all, tablet, phone, admin }. */

import { local, keep, legacyGet, legacyPut } from "./source.js";

const URL_LOOK = "/admin-old/appearance";
const KEY = "appearance";

const EMPTY = () => ({ look: { brand: "", font: "", radius: "" }, css: { all: "", tablet: "", phone: "", admin: "" } });

let state = EMPTY();
let live = false;
let loading = null;

export const isLiveAppearance = () => live;
export const appearance = () => structuredClone(state);

function adopt(data) {
  const base = EMPTY();
  state = { look: { ...base.look, ...data?.look }, css: { ...base.css, ...data?.css } };
}

/* fresh — спросить движок заново (после входа); иначе ответ один на визит. */
export function loadAppearance(fresh = false) {
  if (fresh) loading = null;
  loading ??= (async () => {
    const data = await legacyGet(URL_LOOK);
    live = Boolean(data);
    /* Нет движка — из браузера. */
    adopt(data ?? local(KEY, EMPTY));
    return appearance();
  })();
  return loading;
}

/* part — { look } и/или { css }: присланная часть заменяется целиком. */
export async function saveAppearance(part) {
  if (!live) {
    adopt({ look: { ...state.look, ...part.look }, css: { ...state.css, ...part.css } });
    keep(KEY, structuredClone(state));
    return appearance();
  }
  adopt(await legacyPut(URL_LOOK, part));
  return appearance();
}
