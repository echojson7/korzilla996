/* Цвет для палитры: разбор записи, перевод RGB ↔ HSV и запись в hex. Чистые
   функции — без DOM, кроме разбора имён (canvas, лениво, только в браузере).

   Палитра хранит цвет в HSV: тон остаётся на месте, когда насыщенность или
   яркость в нуле, — в RGB у серого тона нет, и ползунок тона прыгал бы в 0. */

import { clamp } from "../../core/math.js";

const HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i;

const byte = (value) => clamp(Math.round(value), 0, 255);
const hex2 = (value) => byte(value).toString(16).padStart(2, "0");

function fromHex(digits) {
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join("") : digits;
  const n = (at) => parseInt(full.slice(at, at + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

/* Аргументы rgb()/hsl(): запятые или пробелы, альфа через «/» или четвёртым. */
function args(body) {
  const [main, slash] = body.split("/");
  const list = main.split(/[\s,]+/).filter(Boolean);
  if (slash !== undefined) list.push(slash.trim());
  return list;
}

const alphaOf = (text) => {
  if (text === undefined) return 1;
  const value = parseFloat(text);
  return Number.isFinite(value) ? clamp(text.endsWith("%") ? value / 100 : value, 0, 1) : NaN;
};

function fromFunc(name, body) {
  const list = args(body);
  if (list.length < 3 || list.length > 4) return null;
  const a = alphaOf(list[3]);
  if (name.startsWith("rgb")) {
    const [r, g, b] = list.slice(0, 3).map((part) => (part.endsWith("%") ? parseFloat(part) * 2.55 : parseFloat(part)));
    return [r, g, b, a].every(Number.isFinite) ? { r: byte(r), g: byte(g), b: byte(b), a } : null;
  }
  const h = ((parseFloat(list[0]) % 360) + 360) % 360;
  const s = parseFloat(list[1]) / 100;
  const l = parseFloat(list[2]) / 100;
  if (![h, s, l, a].every(Number.isFinite)) return null;
  return { ...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)), a };
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const c = s * Math.min(l, 1 - l);
  const f = (n) => l - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: byte(f(0) * 255), g: byte(f(8) * 255), b: byte(f(4) * 255) };
}

/* Имена и прочие записи CSS («white», «rebeccapurple») — через canvas: браузер
   сам приводит fillStyle к #rrggbb или rgba(). Чужое значение fillStyle не
   принимает — остаётся пробное. */
let probe = null;
function fromCss(text) {
  if (typeof document === "undefined" || !/^[a-z]+$/i.test(text)) return null;
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const marks = ["#010203", "#030201"].map((mark) => {
    probe.fillStyle = mark;
    probe.fillStyle = text;
    return probe.fillStyle;
  });
  if (marks[0] !== marks[1]) return null;
  return parse(marks[0], false);
}

/* Запись → { r, g, b, a } или null. Решётка у hex необязательна: «e8f1de». */
export function parse(text, names = true) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  const hex = HEX_RE.exec(value);
  if (hex) return fromHex(hex[1]);
  const func = FUNC_RE.exec(value);
  if (func) return fromFunc(func[1].toLowerCase(), func[2]);
  return names ? fromCss(value) : null;
}

/* h 0…360, s и v 0…1. */
export function rgbToHsv({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return byte((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return { r: f(5), g: f(3), b: f(1) };
}

/* #rrggbb, а с alpha и неполной непрозрачностью — #rrggbbaa. Нижний регистр. */
export function toHex({ r, g, b, a = 1 }, alpha = false) {
  const tail = alpha && a < 1 ? hex2(a * 255) : "";
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${tail}`;
}

/* Список образцов из data-swatches: через пробел или запятую, без повторов. */
export function swatchList(text, alpha = false) {
  const seen = new Set();
  for (const part of String(text ?? "").split(/[\s,]+/)) {
    const color = parse(part, false);
    if (color) seen.add(toHex(color, alpha));
  }
  return [...seen];
}
