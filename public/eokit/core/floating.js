/* Положение всплывающей поверхности у якоря.

   computePosition — чистая арифметика: сторона с переворотом, выравнивание, прижим
   к кромке окна, место до кромки (предел высоты), смещение стрелки и
   transform-origin. При rtl стороны left и right и выравнивание start и end
   зеркальны: подменю data-side="right" открывается по ходу текста, туда же, куда
   его открывает стрелка. Результат — сторона физическая (для CSS).

   place — одно чтение (прямоугольник якоря, размер поверхности, токены) и одна
   запись: data-side, data-align и --<prefix>-x / -y / -space (+ -arrow-offset,
   -origin со стрелкой), только изменившиеся, с округлением к физическим пикселям.

   autoUpdate — держит открытые поверхности у якорей: общие слушатели прокрутки и
   размера окна и общий ResizeObserver, перекладка раз в кадр. */

import { isRtl, setData, setVar } from "./dom.js";
import { clamp } from "./math.js";
import { readPx } from "./tokens.js";
import { observeSize } from "./observe.js";
import { frame } from "./schedule.js";

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };
/* Порядок переворота «all»: своя сторона, противоположная, затем боковые. */
const ALL = {
  top: ["top", "bottom", "right", "left"],
  bottom: ["bottom", "top", "right", "left"],
  left: ["left", "right", "bottom", "top"],
  right: ["right", "left", "bottom", "top"],
};
const SIDES = new Set(Object.keys(OPPOSITE));
const MIRROR = { top: "top", bottom: "bottom", left: "right", right: "left" };
/* Высота, в которой меню ещё пользуются: четыре-пять строк. Меньше места и сверху,
   и снизу — панель лучше поставить сбоку. */
const MIN_SPACE = 120;
const ALIGNS = new Set(["start", "center", "end"]);

export const sideOf = (value, fallback = "bottom") => (SIDES.has(value) ? value : fallback);
export const alignOf = (value, fallback = "start") => (ALIGNS.has(value) ? value : fallback);


export function computePosition({
  anchor, size, viewport, side = "bottom", align = "start", gap = 4, edge = 8,
  flip = "all", rtl = false, inset = 0, arrowInset = 0,
}) {
  /* Место до кромки по высоте: сверху и снизу — до края окна, сбоку — всё окно. */
  const spaceOf = (s) =>
    s === "top" ? anchor.top - gap - edge : s === "bottom" ? viewport.height - anchor.bottom - gap - edge : viewport.height - edge * 2;
  const room = (s) => {
    if (s === "top" || s === "bottom") return spaceOf(s) - size.height;
    if (s === "left") return anchor.left - gap - size.width - edge;
    return viewport.width - anchor.right - gap - size.width - edge;
  };
  const order = (flip === "all" ? ALL[side] : flip === "opposite" ? [side, OPPOSITE[side]] : [side]).map((s) => (rtl ? MIRROR[s] : s));
  let chosen = order.find((s) => room(s) >= 0);
  /* Высокая панель не влезла ни снизу, ни сверху: остаться над или под якорем, где
     места больше, лучше, чем уйти вбок, — там она прокрутится (--…-space). */
  if (flip === "all" && (side === "top" || side === "bottom") && chosen !== side && chosen !== OPPOSITE[side]) {
    const best = room(OPPOSITE[side]) > room(side) ? OPPOSITE[side] : side;
    if (spaceOf(best) >= Math.min(size.height, MIN_SPACE)) chosen = best;
  }
  /* Не влезло нигде — сторона с наибольшим запасом, остальное дожмёт прижим. */
  chosen ??= order.reduce((best, s) => (room(s) > room(best) ? s : best), order[0]);

  let x;
  let y;
  if (chosen === "top" || chosen === "bottom") {
    const end = rtl ? align === "start" : align === "end";
    x = align === "center" ? anchor.left + anchor.width / 2 - size.width / 2 : end ? anchor.right - size.width : anchor.left;
    x = clamp(x, edge, viewport.width - size.width - edge);
    y = chosen === "top" ? anchor.top - size.height - gap : anchor.bottom + gap;
  } else {
    y = align === "center" ? anchor.top + anchor.height / 2 - size.height / 2 : align === "end" ? anchor.bottom - size.height : anchor.top;
    y = clamp(y - inset, edge, viewport.height - size.height - edge);
    x = chosen === "left" ? anchor.left - size.width - gap : anchor.right + gap;
  }

  /* Место до кромки на выбранной стороне — предел высоты: длинное меню прокручивается. */
  const space = Math.max(0, spaceOf(chosen));

  const vertical = chosen === "top" || chosen === "bottom";
  /* Отступ стрелки от угла — не больше половины кромки: у низкой подсказки сбоку
     (24 px при отступе 14) иначе стрелка съезжала бы с центра вниз. */
  const length = vertical ? size.width : size.height;
  const margin = Math.min(arrowInset, length / 2);
  const arrow = vertical
    ? clamp(anchor.left + anchor.width / 2 - x, margin, length - margin)
    : clamp(anchor.top + anchor.height / 2 - y, margin, length - margin);
  const at = `${Math.round(arrow)}px`;
  const origin = { top: `${at} 100%`, bottom: `${at} 0%`, left: `100% ${at}`, right: `0% ${at}` }[chosen];

  return { side: chosen, align, x, y, space, arrow, origin };
}

const snap = (value) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
};

/* options: side, align, flip, inset, arrow (писать стрелку и origin), prefix
   (по умолчанию --ui-popover), gap/edge/arrowInset — числом или из токенов
   поверхности: <prefix>-gap, <prefix>-edge, <prefix>-arrow-inset. */
export function place(floating, anchorElement, options = {}) {
  const prefix = options.prefix ?? "--ui-popover";
  const styles = getComputedStyle(floating);
  const rect = anchorElement.getBoundingClientRect();
  const root = document.documentElement;
  const result = computePosition({
    anchor: rect,
    size: { width: floating.offsetWidth, height: floating.offsetHeight },
    viewport: { width: root.clientWidth, height: root.clientHeight },
    side: options.side,
    align: options.align,
    flip: options.flip,
    inset: options.inset ?? 0,
    rtl: options.rtl ?? isRtl(anchorElement),
    gap: options.gap ?? readPx(styles, `${prefix}-gap`, 4),
    edge: options.edge ?? readPx(styles, `${prefix}-edge`, 8),
    arrowInset: options.arrowInset ?? readPx(styles, `${prefix}-arrow-inset`, 0),
  });
  setData(floating, "side", result.side);
  setData(floating, "align", result.align);
  setVar(floating, `${prefix}-x`, `${snap(result.x)}px`);
  setVar(floating, `${prefix}-y`, `${snap(result.y)}px`);
  setVar(floating, `${prefix}-space`, `${Math.round(result.space)}px`);
  if (options.arrow) {
    setVar(floating, `${prefix}-arrow-offset`, `${Math.round(result.arrow)}px`);
    setVar(floating, `${prefix}-origin`, result.origin);
  }
  return result;
}

/* Открытые поверхности: floating → { anchor, update, onDetach, stops }. */
const entries = new Map();
const flush = frame(() => {
  for (const [floating, entry] of [...entries]) {
    /* Перекладка или onDetach раньше по списку могли закрыть эту панель. */
    if (entries.get(floating) !== entry) continue;
    if (!entry.anchor.isConnected) entry.onDetach?.();
    else entry.update();
  }
});

function listen(on) {
  const method = on ? "addEventListener" : "removeEventListener";
  window[method]("scroll", flush, { capture: true, passive: true });
  window[method]("resize", flush, { passive: true });
  window.visualViewport?.[method]("resize", flush, { passive: true });
}

/* const stop = autoUpdate(anchor, floating, () => place(…), { onDetach: close }) */
export function autoUpdate(anchor, floating, update, { onDetach } = {}) {
  entries.get(floating)?.stop();
  if (!entries.size) listen(true);
  const stops = [anchor, floating, document.documentElement].map((target) => observeSize(target, () => flush()));
  const entry = {
    anchor,
    update,
    onDetach,
    stop() {
      if (entries.get(floating) !== entry) return;
      entries.delete(floating);
      for (const off of stops) off();
      if (!entries.size) {
        listen(false);
        flush.cancel();
      }
    },
  };
  entries.set(floating, entry);
  return entry.stop;
}
