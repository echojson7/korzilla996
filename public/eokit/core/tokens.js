/* Чтение токенов, которые нужны JS: длины (px или rem) и длительности (ms или s).
   source — элемент или уже посчитанный CSSStyleDeclaration: одно getComputedStyle
   на действие обслуживает все чтения. */

const stylesOf = (source) => (source instanceof Element ? getComputedStyle(source) : source);

export function readVar(source, name, fallback = "") {
  return stylesOf(source).getPropertyValue(name).trim() || fallback;
}

let rootFont = 0;

/* «12px» → 12, «0.75rem» → 12. calc и em не разбираем: такие токены JS не читает. */
export function readPx(source, name, fallback = 0) {
  const raw = readVar(source, name);
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (!raw.endsWith("rem")) return value;
  rootFont ||= Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return value * rootFont;
}

/* «150ms» → 150, «0.15s» → 150. */
export function readMs(source, name, fallback = 0) {
  const raw = readVar(source, name);
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith("ms") ? value : raw.endsWith("s") ? value * 1000 : value;
}

export function readNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

/* Медиазапросы — живые и закешированные: ответ читается в момент вопроса. */
const queries = new Map();
export function media(query) {
  let list = queries.get(query);
  if (!list) queries.set(query, (list = matchMedia(query)));
  return list.matches;
}

/* Движение выключено: системой или уровнем «без анимаций» (core/motion.js). */
export const reducedMotion = () => media("(prefers-reduced-motion: reduce)") || globalThis.document?.documentElement?.dataset?.uiMotion === "off";
