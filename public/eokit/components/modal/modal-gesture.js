/* Жесты модалки на жесте кита (core/gesture): смахивание листа и боковой панели,
   перетаскивание окна за шапку, изменение размера за край. Порог, захват,
   блокировку оси, кадр и скорость держит track; здесь — только своя арифметика.

   Смещение живёт переменными на хосте (--ui-modal-x/y), гашение подложки — на ней
   самой (--ui-modal-progress): они зарегистрированы ненаследуемыми, и кадр жеста
   не пересчитывает стили содержимого. CSS складывает смещение с переходом
   transform, поэтому окно уходит оттуда, куда его поставили, а прерванный жест
   доезжает переходом из текущей точки. Размер (--ui-modal-w/h) — на слое: он и так
   перекладывает окно. */

import { setAttr, setData, setVar } from "../../core/dom.js";
import { SWIPE, isFling, track } from "../../core/gesture.js";
import { clamp } from "../../core/math.js";
import { rubber } from "../../core/motion.js";
import { readPx } from "../../core/tokens.js";

const DRAGGING_CLASS = "is-dragging";

/* Перетаскивание начинается с поверхности, не с контрола и не с выделяемого
   текста поля: нажатие на кнопку остаётся нажатием. Тело с tabindex от модуля
   (остановка Tab у прокрутки) — не контрол: панель за него смахивается. */
const INTERACTIVE_SELECTOR =
  "a[href], button, input, select, textarea, label, summary, [contenteditable], [tabindex]:not([tabindex='-1'])";

export function interactive(target, session) {
  const hit = target.closest(INTERACTIVE_SELECTOR);
  return !!hit && hit !== session.stop && session.host.contains(hit);
}

/* Палец во внутренней прокрутке по оси жеста (таблица, лента чипов, список) —
   жест её, а не окна: иначе окно дёрнулось бы до того, как браузер заберёт его. */
export function scrolls(target, within, axis) {
  for (let node = target; node && node !== within; node = node.parentElement) {
    const styles = getComputedStyle(node);
    const room = axis === "x" ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight;
    if (room && /auto|scroll/.test(axis === "x" ? styles.overflowX : styles.overflowY)) return true;
  }
  return false;
}


function dragging(session, on) {
  session.layer.classList.toggle(DRAGGING_CLASS, on);
  if (!on) session.gesture = null;
}

/* Ноль — снять: у зарегистрированного свойства начальное значение и есть 0px. */
export function setOffset(session, x, y) {
  session.offset = { x, y };
  setVar(session.host, "--ui-modal-x", x ? `${x}px` : null);
  setVar(session.host, "--ui-modal-y", y ? `${y}px` : null);
}

/* Поле до кромки окна — padding слоя: окно не уходит за него. */
function bounds(session) {
  const box = session.layer.getBoundingClientRect();
  const styles = getComputedStyle(session.layer);
  return {
    left: box.left + Number.parseFloat(styles.paddingLeft),
    right: box.right - Number.parseFloat(styles.paddingRight),
    top: box.top + Number.parseFloat(styles.paddingTop),
    bottom: box.bottom - Number.parseFloat(styles.paddingBottom),
  };
}

/* Замер окна и поля одной раскладкой: для общего ResizeObserver — в фазе чтения. */
export function measureFrame(session) {
  return { rect: session.host.getBoundingClientRect(), edge: bounds(session) };
}

/* --- Смахивание: лист вниз, боковая — к своему краю --------------------------- */

export function swipe(event, session, { onClose }) {
  const sheet = session.type === "sheet";
  const sign = sheet || session.options.side === "right" ? 1 : -1;
  let size = 0;
  let limit = 0;

  const place = (distance) => {
    /* Против хода — резиновый край: тянется, но всё туже, не дальше предела. */
    const along = distance * sign > 0 ? distance : rubber(distance, limit);
    setVar(session.backdrop, "--ui-modal-progress", String(clamp((along * sign) / size, 0, 1)));
    if (sheet) setOffset(session, 0, along);
    else setOffset(session, along, 0);
  };

  session.gesture = track(event, {
    axis: sheet ? "y" : "x",
    slop: SWIPE.slop,
    onStart() {
      size = sheet ? session.host.offsetHeight : session.host.offsetWidth;
      limit = readPx(session.host, "--ui-modal-overdrag", 24);
      dragging(session, true);
    },
    onMove({ dx, dy }) {
      place(sheet ? dy : dx);
    },
    onEnd({ dx, dy, vx, vy, completed }) {
      dragging(session, false);
      const distance = (sheet ? dy : dx) * sign;
      const speed = (sheet ? vy : vx) * sign;
      setVar(session.backdrop, "--ui-modal-progress", null);
      /* Дотянул или бросил к краю — закрыть; брошенное назад остаётся, как бы
         далеко его ни утащили. */
      if (completed && speed > -SWIPE.velocity && isFling(distance, size, speed)) {
        onClose({ remaining: Math.max(size - distance, 0), speed });
        return;
      }
      /* Не дотянули — назад переходом открытого состояния, из текущей точки. */
      setOffset(session, 0, 0);
    },
  });
}

/* --- Перетаскивание окна за шапку --------------------------------------------- */

export function move(event, session) {
  let start = null;
  let room = null;

  session.gesture = track(event, {
    slop: 3,
    onStart() {
      const { rect, edge } = measureFrame(session);
      start = { ...session.offset };
      room = { left: edge.left - rect.left, right: edge.right - rect.right, top: edge.top - rect.top, bottom: edge.bottom - rect.bottom };
      dragging(session, true);
    },
    onMove({ dx, dy }) {
      setOffset(
        session,
        start.x + clamp(dx, Math.min(room.left, 0), Math.max(room.right, 0)),
        start.y + clamp(dy, Math.min(room.top, 0), Math.max(room.bottom, 0)),
      );
    },
    onEnd() {
      dragging(session, false);
    },
  });
}

/* Окно браузера сузилось — сдвинутое окно возвращается в поле. Без сдвига окно
   стоит по центру и в поле уже. */
export function contain(session, { rect, edge } = measureFrame(session)) {
  const { x, y } = session.offset;
  if (session.type !== "dialog" || (!x && !y)) return;
  setOffset(
    session,
    clamp(x, Math.min(edge.left - rect.left + x, 0), Math.max(edge.right - rect.right + x, 0)),
    clamp(y, Math.min(edge.top - rect.top + y, 0), Math.max(edge.bottom - rect.bottom + y, 0)),
  );
}

/* --- Размер ---------------------------------------------------------------- */

/* Направление ручки → множители по осям: e/s растят вправо/вниз, w/n — влево/вверх. */
const GRIP_AXES = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
  ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
};
export const GRIPS = Object.keys(GRIP_AXES);

function setSize(session, width, height = session.size?.height ?? null) {
  session.size = { width, height };
  setVar(session.layer, "--ui-modal-w", `${width}px`);
  if (session.splitter) setAttr(session.splitter, "aria-valuenow", Math.round(width));
  if (height == null) return;
  setVar(session.layer, "--ui-modal-h", `${height}px`);
  setData(session.layer, "height", true);
}

/* Пределы на старте: минимум — переменные CSS, максимум — место до поля окна со
   стороны тянущегося края. Окно по центру растёт от центра, поэтому смещение
   доводит его на половину прироста: противоположный край стоит на месте. */
function frame(session, grip, { rect, edge } = measureFrame(session)) {
  const [ex, ey] = GRIP_AXES[grip];
  const styles = getComputedStyle(session.host);
  const roomX = ex > 0 ? edge.right - rect.right : rect.left - edge.left;
  const roomY = ey > 0 ? edge.bottom - rect.bottom : rect.top - edge.top;
  return {
    ex,
    ey,
    shift: session.type === "dialog" ? 0.5 : 0,
    width: rect.width,
    height: rect.height,
    min: {
      width: Math.min(readPx(styles, "--ui-modal-min-w"), rect.width),
      height: Math.min(readPx(styles, "--ui-modal-min-h"), rect.height),
    },
    max: { width: rect.width + Math.max(roomX, 0), height: rect.height + Math.max(roomY, 0) },
    offset: { ...session.offset },
  };
}

function resizeTo(session, from, dx, dy) {
  const width = clamp(from.width + from.ex * dx, from.min.width, from.max.width);
  const height = from.ey ? clamp(from.height + from.ey * dy, from.min.height, from.max.height) : undefined;
  setSize(session, width, height);
  setOffset(
    session,
    from.offset.x + from.ex * (width - from.width) * from.shift,
    from.offset.y + (from.ey ? from.ey * (height - from.height) * from.shift : 0),
  );
}

export function resize(event, session, grip) {
  let from = null;
  session.gesture = track(event, {
    onStart() {
      from = frame(session, grip);
      dragging(session, true);
    },
    onMove({ dx, dy }) {
      resizeTo(session, from, dx, dy);
    },
    onEnd() {
      dragging(session, false);
    },
  });
}

/* Разделитель называет свои пределы, когда на него приходит фокус и когда окно
   браузера меняется: заранее они зависели бы от размера окна. */
export function describeSplitter(session, box) {
  const { splitter } = session;
  if (!splitter) return;
  const from = frame(session, splitter.dataset.grip, box);
  setAttr(splitter, "aria-valuemin", Math.round(from.min.width));
  setAttr(splitter, "aria-valuemax", Math.round(from.max.width));
  setAttr(splitter, "aria-valuenow", Math.round(from.width));
}

/* Ручка боковой панели — разделитель окна (APG Window Splitter): стрелки к
   середине окна растят панель шагом, Home и End — минимум и максимум. */
const KEY_GROWTH = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };

export function resizeByKey(event, session) {
  const sign = KEY_GROWTH[event.key];
  if (sign === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const from = frame(session, session.splitter.dataset.grip);
  const step = readPx(session.host, "--ui-modal-resize-step", 16);
  /* Стрелка тянет край в свою сторону; Home/End — к пределам при любой стороне. */
  const growth = Number.isFinite(sign) ? sign * step * from.ex : sign;
  resizeTo(session, from, growth * from.ex, 0);
}
