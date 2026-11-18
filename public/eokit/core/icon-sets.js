/* Наборы иконок на замену глифам кита: icon-sets/<набор>.json (собирает
   tools/icon-sets.mjs из открытых наборов — Hugeicons, Tabler, Phosphor,
   Iconoir, Solar). Выбор — { глиф кита: набор }; глиф без выбора остаётся
   глифом кита.

     await apply({ "shopping-cart": "hugeicons", settings: "tabler" })
     await loadIndex()        → { slots, sets: [{ id, name, note, author, license, url }] }
     await loadSet("tabler")  → { id, name, attrs, icons: { глиф: тело } } | null
     refresh(["settings"])    — уже нарисованные иконки берут новый глиф на месте

   Подмена идёт через тот же реестр, что register(): её видят и data-ui-icon
   в разметке, и модули кита, которые ставят иконки сами. Тот же файл набора
   читает сервер сайта и рисует им иконки витрины — поэтому выбор, сохранённый
   в админке, меняет иконку везде одинаково. */

import { glyphs } from "./glyphs.js";
import { icon, register } from "./icons.js";

const DIR = new URL("../icon-sets/", import.meta.url);
const ID = /^[a-z][a-z0-9-]*$/;
export const KIT_SET = "kit";

const cache = new Map();
const json = (file) => fetch(new URL(file, DIR)).then((response) => (response.ok ? response.json() : null)).catch(() => null);

export function loadSet(id) {
  if (!ID.test(id ?? "")) return Promise.resolve(null);
  if (!cache.has(id)) cache.set(id, json(`${id}.json`));
  return cache.get(id);
}

let index = null;
export const loadIndex = () => (index ??= json("index.json").then((data) => data ?? { slots: [], sets: [] }));

/* Глиф набора: [тело, атрибуты корня] или null — в наборе его нет. */
export async function glyphOf(name, setId) {
  if (!setId || setId === KIT_SET) {
    const own = glyphs[name];
    return own == null ? null : Array.isArray(own) ? own : [own, null];
  }
  const set = await loadSet(setId);
  const body = set?.icons?.[name];
  return body ? [body, Object.keys(set.attrs ?? {}).length ? set.attrs : null] : null;
}

/* Что подменено сейчас: снятая замена возвращает глиф кита. */
const applied = new Map();

/* choice — { глиф: набор }. Возвращает имена, чей глиф поменялся. */
export async function apply(choice = {}) {
  const wanted = Object.entries(choice).filter(([name, setId]) => ID.test(name) && setId && setId !== KIT_SET);
  const loaded = await Promise.all(wanted.map(async ([name, setId]) => [name, setId, await glyphOf(name, setId)]));
  const changed = [];
  const next = new Map();
  for (const [name, setId, glyph] of loaded) {
    if (!glyph) continue;
    next.set(name, setId);
    if (applied.get(name) === setId) continue;
    register(name, glyph[0], glyph[1]);
    changed.push(name);
  }
  for (const name of applied.keys()) {
    if (next.has(name)) continue;
    const own = await glyphOf(name, KIT_SET);
    if (own) register(name, own[0], own[1]);
    changed.push(name);
  }
  applied.clear();
  for (const [name, setId] of next) applied.set(name, setId);
  return changed;
}

/* Корень <svg> несёт оболочку глифа: её и тело берём у свежей иконки, класс,
   data-* и стиль места остаются. */
const ROOT = ["viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"];
export function refresh(names, root = document) {
  for (const name of names) {
    for (const svg of root.querySelectorAll(`svg[data-ui-icon="${name}"]`)) {
      const fresh = icon(name);
      if (!fresh) continue;
      for (const attr of ROOT) {
        if (fresh.hasAttribute(attr)) svg.setAttribute(attr, fresh.getAttribute(attr));
        else svg.removeAttribute(attr);
      }
      svg.classList.toggle("ui-icon--art", fresh.classList.contains("ui-icon--art"));
      svg.replaceChildren(...fresh.childNodes);
    }
  }
}
