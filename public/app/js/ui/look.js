/* Вид этой админки — личный выбор в этом браузере («Внешний вид → Персонализация»,
   переключатели темы и плотности в меню аккаунта): тема, акцент, размер
   контролов, вид таблиц, шрифт, анимации. Один ключ kza.look без приставки сайта: вид
   админки — привычка человека, а не свойство сайта. index.html читает тот же
   ключ до первого кадра (там копия правил применения — без модулей), поэтому
   тёмная тема не мигает светлой.

   Плюс CSS админки, который пишут на «CSS стили»: <style id="admin-css"> в конце
   <head>. ?nocss в адресе его не ставит — на случай, если стиль спрятал всё. */

import { setTheme, setDensity, setMotion } from "./kit.js";

const KEY = "kza.look";

export const DEFAULTS = Object.freeze({ theme: "light", accent: "korzilla", size: "auto", tables: "default", font: "onest", motion: "auto" });
/* Анимации: auto — кит сам облегчает их на слабой машине (core/motion.js). */
const MOTIONS = ["auto", "full", "lite", "off"];

/* Акценты-образцы: токен палитры кита, поэтому в тёмной теме цвет свой.
   korzilla — фирменный зелёный (data-ui-accent="brand"). */
export const ACCENTS = ["korzilla", "blue", "violet", "pink", "orange", "green", "teal"];
const FONTS = ["onest", "inter", "golos", "manrope"];
const HEX = /^#[0-9a-f]{6}$/;

/* Тот же запрос — в index.html до первого кадра. */
const TOUCH = "(hover: none) and (pointer: coarse)";
const isLarge = (size) => size === "large" || (size === "auto" && matchMedia(TOUCH).matches);

export function readLook() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!saved || typeof saved !== "object") {
    /* Прежний ключ переключателя темы: kza.theme. */
    saved = {};
    try {
      const theme = JSON.parse(localStorage.getItem("kza.theme"));
      if (theme === "dark" || theme === "light") saved.theme = theme;
    } catch {}
  }
  return clean(saved);
}

export function clean(look) {
  const out = { ...DEFAULTS };
  if (["system", "light", "dark"].includes(look?.theme)) out.theme = look.theme;
  if (ACCENTS.includes(look?.accent) || HEX.test(look?.accent ?? "")) out.accent = look.accent;
  /* Размер: auto — крупный на сенсорном экране (телефон, планшет), иначе база;
     base — шкала кита; large — крупный режим. Прежнее поле density не читается:
     его «Крупный» стал базой кита (1.63.0). */
  if (["base", "large"].includes(look?.size)) out.size = look.size;
  if (look?.tables === "compact") out.tables = "compact";
  if (FONTS.includes(look?.font)) out.font = look.font;
  if (MOTIONS.includes(look?.motion)) out.motion = look.motion;
  return out;
}

export function writeLook(look) {
  const next = clean(look);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

/* Светлый ли цвет: относительная яркость по WCAG выше 0,4 — такой акцент
   нечитаем текстом на белом, ссылки берут его же, но глубже. */
function isLight(hex) {
  const channel = (at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) > 0.4;
}

/* Применить вид к <html>. Возвращает, тёмная ли тема получилась. */
export function applyLook(look) {
  const root = document.documentElement;
  const next = clean(look);
  const dark = setTheme(next.theme);
  setDensity(isLarge(next.size) ? "large" : "medium");
  setMotion(next.motion);
  if (next.tables === "compact") root.dataset.uiTables = "compact";
  else delete root.dataset.uiTables;
  root.style.removeProperty("--ui-accent");
  root.style.removeProperty("--ui-accent-fg");
  if (next.accent === "korzilla") root.dataset.uiAccent = "brand";
  else {
    delete root.dataset.uiAccent;
    if (HEX.test(next.accent)) {
      root.style.setProperty("--ui-accent", next.accent);
      root.style.setProperty("--ui-accent-fg", isLight(next.accent) ? `color-mix(in srgb, ${next.accent} 60%, #000)` : next.accent);
    } else {
      root.style.setProperty("--ui-accent", `var(--ui-${next.accent})`);
      root.style.setProperty("--ui-accent-fg", `var(--ui-${next.accent}-fg)`);
    }
  }
  if (next.font === DEFAULTS.font) root.style.removeProperty("--ui-font");
  else root.style.setProperty("--ui-font", `var(--ui-font-${next.font})`);
  return dark;
}

/* Сохранить и применить часть вида: { theme } из меню аккаунта и т. п. */
export function setLook(part) {
  const next = writeLook({ ...readLook(), ...part });
  applyLook(next);
  return next;
}

/* CSS админки: пустой — стиль снимается. */
export function applyAdminCss(css) {
  let node = document.getElementById("admin-css");
  if (!css || new URLSearchParams(location.search).has("nocss")) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement("style");
    node.id = "admin-css";
    document.head.append(node);
  }
  node.textContent = css;
}
