/* Уведомления: одно сообщение на три поверхности — тост, статус-бар и закрываемый
   alert в разметке. Тосты и бар модуль строит сам; разметку только оживляет.

     const alert = kit("alert");
     const toast = alert.show({ title: "Сохранено", type: "success" });
     alert.show({ text: "Не удалось", type: "error", id: "save" });   // ошибка висит
     alert.update("save", { title: "Повторяем…", type: "info" });     // id или сам тост
     alert.dismiss(toast); alert.clear();
     alert.status({ label: "Загружаем смету", progress: 42 });          // висит, пока идёт
     alert.status({ label: "Готово", type: "success", duration: 2500 });
     alert.progress(80); alert.statusDismiss();

     <div class="ui-alert ui-alert--warning" data-ui-alert>…</div>      // крестик модуля

   Опции тоста: type (info | success | warning | error | neutral | progress), title,
   text, icon, spinner, duration (мс; 0 — пока не закроют), dismissible, id,
   onDismiss(id), action { label, onClick(id), close }.

   Тосты — стопка у нижней кромки, новый встаёт у края и поднимает остальных; в
   стопке не больше трёх. Движение стопки — FLIP с аддитивными сдвигами: прерванное
   движение (новый тост посреди входа, закрытие посреди сдвига) продолжается из
   текущей точки. Уходящий сразу выходит из потока — соседи едут на его место, пока
   он гаснет. Наведение, фокус, жест и скрытая вкладка останавливают отсчёт у всей
   стопки; без тостов ничего не тикает и окно не слушается. Тост смахивается вбок.

   Регион и бар — корни поверх страницы ([data-ui-layer]): фокус в них окно не
   отбирает. Закрытый тост, на котором стоял фокус, отдаёт его соседу или туда,
   откуда фокус пришёл в стопку. */

import { defineComponent } from "../../core/component.js";
import { el, isPress, restore, setAttr, setText, setVar, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { SWIPE, isFling, track } from "../../core/gesture.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";
import { clamp } from "../../core/math.js";
import { flip } from "../../core/motion.js";
import { presence } from "../../core/presence.js";
import { readMs, readVar, reducedMotion } from "../../core/tokens.js";

const SELECTOR = "[data-ui-alert]";
const CLOSE_ATTR = "data-alert-close";
const LEAVING_CLASS = "is-leaving";
const SWIPING_CLASS = "is-swiping";

const TYPES = ["info", "success", "warning", "error", "neutral", "progress"];
const TYPE_ICON = {
  info: "info",
  success: "circle-check",
  warning: "triangle-alert",
  error: "circle-x",
  neutral: "info",
  /* Запасной глиф, если спиннер прогресса выключат явно (spinner: false). */
  progress: "refresh-cw",
};
const TYPE_ACTION = { success: "ui-btn--primary", warning: "ui-btn--primary", error: "ui-btn--destructive" };
/* Срочное читается сразу (role=alert); остальное — вежливо, голосом региона. */
const URGENT = new Set(["error", "warning"]);

/* Время на чтение по типу, ошибку молча не закрываем. */
const DURATION = { success: 4000, info: 5000, warning: 7000, error: 0, progress: 0 };
const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 3;

const t = messages("alert", {
  ru: { close: "Закрыть", hide: "Скрыть", ok: "Ок" },
  en: { close: "Close", hide: "Hide", ok: "OK" },
});

const text = (value) => (value == null ? "" : String(value));
const typeOf = (options) => (TYPES.includes(options.type) ? options.type : "info");

function durationOf(options, type) {
  const value = Number(options.duration);
  if (options.duration != null && Number.isFinite(value) && value >= 0) return value;
  return DURATION[type] ?? DEFAULT_DURATION;
}

const closeButton = (label) =>
  el("button", { class: "ui-close ui-close--sm ui-alert__close", type: "button", [CLOSE_ATTR]: true, "aria-label": label }, icon("x"));

const spinner = () => el("span", { class: "ui-spinner ui-spinner--slice ui-alert__spinner", "aria-hidden": "true" });

/* Иконка и спиннер — один узел в начале сообщения: строка либо ждёт, либо
   сообщает. Узел меняется, только когда меняется то, что он показывает. */
function setLead(owner, options, type, className) {
  const spin = options.spinner ?? type === "progress";
  const glyph = spin ? "" : text(options.icon ?? TYPE_ICON[type]);
  const key = spin ? "spinner" : glyph;
  if (owner.leadKey === key) return;
  const next = spin ? spinner() : glyph ? icon(glyph, { className }) : null;
  if (owner.lead) {
    if (next) owner.lead.replaceWith(next);
    else owner.lead.remove();
  } else if (next) owner.element.prepend(next);
  owner.lead = next;
  owner.leadKey = key;
}

/* Тип — классы акцента и роль, общий у тоста и бара. */
function setType(element, type, quiet) {
  for (const name of TYPES) element.classList.toggle(`ui-alert--${name}`, name === type);
  setAttr(element, "role", URGENT.has(type) ? "alert" : quiet);
}

function setLine(node, value) {
  setText(node, value);
  setAttr(node, "hidden", !value);
}

const actionButton = () => el("button", { type: "button", class: "ui-btn" }, el("span", { class: "ui-btn__label" }));

/* Кнопка ответа живёт, только пока есть обработчик: ответ без обработчика —
   обманка. Контейнер уходит вместе с ней — и у тоста, и у бара: с одной
   спрятанной кнопкой он не пуст и держал бы отступ и зазор перед крестиком. */
function setAction(owner, action, type) {
  if (typeof action?.onClick !== "function") {
    owner.actions?.remove();
    owner.actions = owner.action = null;
    return;
  }
  if (!owner.actions) {
    owner.action = actionButton();
    owner.actions = el("div", { class: "ui-alert__actions" }, owner.action);
    owner.close.before(owner.actions);
  }
  owner.action.className = `ui-btn ${TYPE_ACTION[type] ?? ""}`.trim();
  setText(owner.action.firstChild, text(action.label) || t("ok"));
}

/* --- Тосты ------------------------------------------------------------------ */

const toasts = new WeakMap();
const byId = new Map();
/* Причины держать отсчёт: курсор, фокус, жест, скрытая вкладка. */
const holds = new Set();
let region = null;
/* Откуда фокус пришёл в стопку — туда он вернётся, когда тосты уйдут. */
let returnTo = null;
let watching = false;

function card(id) {
  const element = el("div", { class: "ui-alert" });
  const title = el("div", { class: "ui-alert__title" });
  const body = el("div", { class: "ui-alert__text" });
  const close = closeButton(t("close"));
  element.append(el("div", { class: "ui-alert__body" }, title, body), close);
  const toast = {
    element, id, options: {}, type: "info",
    title, text: body, close, lead: null, leadKey: null, actions: null, action: null,
    timer: 0, remaining: 0, since: 0, leaving: false, exit: null, gesture: null,
  };
  toasts.set(element, toast);
  return toast;
}

function render(toast, options) {
  const type = typeOf(options);
  setType(toast.element, type, null);
  setLead(toast, options, type, "ui-alert__icon ui-icon");
  setLine(toast.title, text(options.title));
  setLine(toast.text, text(options.text));
  setAction(toast, options.action, type);
  setAttr(toast.close, "hidden", options.dismissible === false);
  toast.options = options;
  toast.type = type;
}

const flow = () => (region ? [...region.children].filter((item) => !item.classList.contains(LEAVING_CLASS)) : []);
const toastOf = (key) => (typeof key === "string" ? toasts.get(byId.get(key)) : toasts.get(key)) ?? null;

/* Темп — из CSS, одно чтение на перекладку: JS не держит длительностей. */
function paceOf(styles) {
  return {
    move: readMs(styles, "--ui-alert-move", 300),
    moveEase: readVar(styles, "--ui-alert-move-ease", "ease-out"),
    exit: readMs(styles, "--ui-alert-exit", 120),
    exitEase: readVar(styles, "--ui-alert-exit-ease", "ease-out"),
    gap: Number.parseFloat(styles.rowGap) || 0,
  };
}

/* Низ тоста относительно нижней кромки региона, по раскладке без трансформов:
   регион прижат к низу, поэтому величина меняется, только когда стопка
   действительно переложилась. */
const bottomOf = (element) => region.clientHeight - element.offsetTop - element.offsetHeight;

/* Правка стопки с FLIP. Возвращает темп, если движение есть (не reduced motion). */
function relayout(mutate) {
  if (reducedMotion()) {
    mutate();
    return null;
  }
  const pace = paceOf(getComputedStyle(region));
  flip(flow, mutate, { measure: (element) => -bottomOf(element), duration: pace.move, easing: pace.moveEase });
  return pace;
}

/* Вход: снизу на свою высоту плюс зазор — ровно на столько же поднимаются
   соседи, и стопка едет одним куском. */
function enter(element, pace) {
  if (!pace) return;
  const from = element.offsetHeight + pace.gap;
  element.animate(
    [
      { opacity: 0, transform: `translate3d(0, ${from}px, 0)` },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ],
    { duration: pace.move, easing: pace.moveEase },
  );
}

/* Выход из потока: тост остаётся на своём месте абсолютом (от нижней кромки —
   регион при этом укорачивается сверху), место отдаётся соседям сразу. Сначала
   все замеры, потом все записи. Ширина и отступ — дробные: округлённый
   offsetWidth переносит строку, и карточка вырастает вверх. */
function detach(list) {
  if (!list.length) return;
  const left = region.getBoundingClientRect().left;
  const boxes = list.map((toast) => ({
    bottom: bottomOf(toast.element),
    left: toast.element.getBoundingClientRect().left - left,
    width: getComputedStyle(toast.element).width,
  }));
  list.forEach((toast, at) => {
    const { element } = toast;
    toast.leaving = true;
    toast.remaining = 0;
    clearTimeout(toast.timer);
    toast.timer = 0;
    toast.gesture?.cancel();
    if (toast.id && byId.get(toast.id) === element) byId.delete(toast.id);
    element.classList.add(LEAVING_CLASS);
    element.inert = true;
    element.style.bottom = `${boxes[at].bottom}px`;
    element.style.left = `${boxes[at].left}px`;
    element.style.width = boxes[at].width;
  });
}

function drop(toast) {
  toasts.delete(toast.element);
  toast.element.remove();
  if (region.children.length) return;
  /* Стопка пуста: держать нечего, слушать вкладку незачем. */
  holds.clear();
  returnTo = null;
  watch(false);
}

/* Уход: гаснет и чуть сжимается; смахнутый продолжает лететь в сторону жеста.
   Трансформ уходящего аддитивный — недоигранный сдвиг стопки не обрывается. */
function exit(toast, pace, swipe) {
  const { element } = toast;
  if (!pace) {
    drop(toast);
    return;
  }
  const timing = { duration: pace.exit, easing: pace.exitEase, fill: "forwards" };
  if (swipe) {
    const to = Math.sign(swipe.dx || 1) * element.offsetWidth;
    element.style.translate = "";
    element.style.opacity = "";
    toast.exit = [element.animate([{ translate: `${swipe.dx}px 0`, opacity: swipe.opacity }, { translate: `${to}px 0`, opacity: 0 }], timing)];
  } else {
    toast.exit = [
      element.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      /* Своё свойство scale, не transform: transform ведёт FLIP стопки, а
         аддитивная анимация шла бы без композитора. */
      element.animate([{ scale: 1 }, { scale: 0.94 }], timing),
    ];
  }
  Promise.allSettled(toast.exit.map((animation) => animation.finished)).then(() => drop(toast));
}

/* Фокус с уходящих тостов — на ближайший остающийся (тот, что встаёт на место, или
   предыдущий), иначе туда, откуда пришёл: инертный тост иначе уронил бы его в body. */
function handOff(leaving) {
  const from = leaving.find((toast) => toast.element.contains(document.activeElement));
  if (!from) return;
  const all = flow();
  const at = all.indexOf(from.element);
  const stays = (item) => !leaving.some((toast) => toast.element === item);
  const next = all.slice(at + 1).find(stays) ?? all.slice(0, at).findLast(stays);
  const target = next ? toasts.get(next)?.close : null;
  if (!(target && !target.hidden && focus(target))) focus(returnTo?.isConnected ? returnTo : null);
}

function leave(toast, swipe = null) {
  if (toast.leaving) return;
  handOff([toast]);
  exit(toast, relayout(() => detach([toast])), swipe);
}

/* --- Отсчёт ----------------------------------------------------------------- */

function start(toast) {
  toast.since = performance.now();
  toast.timer = setTimeout(() => {
    toast.timer = 0;
    leave(toast);
  }, toast.remaining);
}

function schedule(toast, ms) {
  clearTimeout(toast.timer);
  toast.timer = 0;
  toast.remaining = ms > 0 ? ms : 0;
  if (toast.remaining && !holds.size) start(toast);
}

function pause(toast) {
  if (!toast.timer) return;
  clearTimeout(toast.timer);
  toast.timer = 0;
  toast.remaining = Math.max(toast.remaining - (performance.now() - toast.since), 0);
}

/* Отсчёт стоит у всей стопки: пока читают один тост, соседи не исчезают. */
function hold(reason, on) {
  const was = holds.size > 0;
  if (on) holds.add(reason);
  else holds.delete(reason);
  if (was === holds.size > 0) return;
  for (const item of flow()) {
    const toast = toasts.get(item);
    if (holds.size) pause(toast);
    else if (!toast.timer && toast.remaining > 0) start(toast);
  }
}

const onVisibility = () => hold("hidden", document.hidden);

/* Пока есть тосты: скрытая вкладка держит отсчёт, Esc на тосте закрывает тост. */
function watch(on) {
  if (on === watching) return;
  watching = on;
  if (on) {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onEscape, true);
    onVisibility();
  } else {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("keydown", onEscape, true);
  }
}

/* --- Регион: делегированные события ----------------------------------------- */

function liveToast(target) {
  const node = target instanceof Element ? target.closest(".ui-alert") : null;
  const toast = node?.parentElement === region ? toasts.get(node) : null;
  return toast && !toast.leaving ? toast : null;
}

function dismissByUser(toast, swipe) {
  toast.options.onDismiss?.(toast.id);
  leave(toast, swipe);
}

const fade = (dx, width) => 1 - Math.min(Math.abs(dx) / width, 1) * 0.7;

/* Смахивание вбок: дотянул на долю ширины или бросил — тост улетает; иначе
   возвращается тем же темпом, что и стопка. */
function swipe(event, toast) {
  const { element } = toast;
  let width = 1;
  toast.gesture = track(event, {
    axis: "x",
    slop: SWIPE.slop,
    capture: element,
    onStart() {
      width = element.offsetWidth || 1;
      element.classList.add(SWIPING_CLASS);
      hold("swipe", true);
    },
    onMove({ dx }) {
      element.style.translate = `${dx}px 0`;
      element.style.opacity = String(fade(dx, width));
    },
    onEnd({ dx, vx, completed }) {
      toast.gesture = null;
      element.classList.remove(SWIPING_CLASS);
      hold("swipe", false);
      if (toast.leaving) return;
      if (completed && isFling(Math.abs(dx), width, vx * Math.sign(dx))) {
        dismissByUser(toast, { dx, opacity: fade(dx, width) });
        return;
      }
      element.style.translate = "";
      element.style.opacity = "";
      if (reducedMotion()) return;
      const pace = paceOf(getComputedStyle(element));
      element.animate([{ translate: `${dx}px 0`, opacity: fade(dx, width) }, { translate: "0px 0", opacity: 1 }], { duration: pace.move, easing: pace.moveEase });
    },
  });
}

/* Закрытие — на нажатие (pointerdown, Enter/пробел, программный click); нажатие
   мышью гасится, чтобы фокус остался, где был. Действие ждёт click. Esc — onEscape. */
function onPress(event) {
  const toast = liveToast(event.target);
  if (!toast) return;
  const hit = event.target.closest(`[${CLOSE_ATTR}], .ui-btn`);
  if (hit?.hasAttribute(CLOSE_ATTR)) {
    if (!isPress(event)) return;
    if (event.type !== "click") event.preventDefault();
    dismissByUser(toast);
    return;
  }
  if (hit && event.type === "click") {
    const { action } = toast.options;
    action?.onClick?.(toast.id);
    if (action?.close !== false) leave(toast);
    return;
  }
  if (event.type === "pointerdown" && !hit && event.button === 0 && event.isPrimary) swipe(event, toast);
}

/* Esc на тосте закрывает тост. Слушатель — на window в захвате, раньше стека слоёв
   (core/layer.js ловит Esc на document): иначе Esc с тоста закрыл бы окно или меню
   под стопкой, а тост остался бы. */
function onEscape(event) {
  if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
  const toast = liveToast(event.target);
  if (!toast) return;
  event.preventDefault();
  event.stopPropagation();
  dismissByUser(toast);
}

const REGION_EVENTS = [
  ["pointerdown", onPress],
  ["keydown", onPress],
  ["click", onPress],
  ["pointerover", () => hold("pointer", true)],
  ["pointerout", (event) => region.contains(event.relatedTarget) || hold("pointer", false)],
  ["focusin", (event) => {
    if (!region.contains(event.relatedTarget)) returnTo = event.relatedTarget;
    hold("focus", true);
  }],
  ["focusout", (event) => region.contains(event.relatedTarget) || hold("focus", false)],
];

function regionOf() {
  if (region) return region;
  /* Голос — у региона, а не у тоста: скринридер читает каждое пришедшее. */
  region = el("div", { class: "ui-alert-region", role: "status", "aria-live": "polite", "aria-relevant": "additions", "data-ui-layer": true });
  for (const [type, listener] of REGION_EVENTS) region.addEventListener(type, listener);
  document.body.append(region);
  return region;
}

function show(options = {}) {
  const id = text(options.id);
  if (id && byId.has(id)) return update(id, options);
  const host = regionOf();
  const toast = card(id);
  render(toast, options);
  if (id) byId.set(id, toast.element);
  watch(true);

  /* Новый — у кромки, остальные поднимаются; потолок вытесняет самого старого
     (верхнего) в том же движении, поэтому высота стопки не скачет. Фокус с
     вытесненного уходит, как с закрытого. */
  const rest = flow();
  const out = rest.slice(0, Math.max(rest.length - MAX_VISIBLE + 1, 0)).map((item) => toasts.get(item));
  handOff(out);
  const pace = relayout(() => {
    detach(out);
    host.append(toast.element);
  });
  for (const item of [...host.children]) {
    const old = toasts.get(item);
    if (old?.leaving && !old.exit) exit(old, pace, null);
  }
  enter(toast.element, pace);
  schedule(toast, durationOf(options, toast.type));
  return toast.element;
}

function update(key, options = {}) {
  const toast = toastOf(key);
  if (!toast || toast.leaving) return show(typeof key === "string" ? { ...options, id: key } : options);
  const merged = { ...toast.options, ...options };
  /* Высота могла измениться — соседи доезжают тем же FLIP. */
  relayout(() => render(toast, merged));
  schedule(toast, durationOf(merged, toast.type));
  return toast.element;
}

function dismiss(key) {
  const toast = toastOf(key);
  if (!toast || toast.leaving) return false;
  leave(toast);
  return true;
}

function clear() {
  const list = flow().map((item) => toasts.get(item));
  if (!list.length) return 0;
  const focused = list.find((toast) => toast.element.contains(document.activeElement));
  if (focused) focus(returnTo?.isConnected ? returnTo : null);
  const pace = relayout(() => detach(list));
  for (const toast of list) exit(toast, pace, null);
  return list.length;
}

/* --- Статус-бар ------------------------------------------------------------- */

let bar = null;

function barOf() {
  if (bar) return bar;
  const element = el("div", { class: "ui-alert-bar", role: "status", "data-ui-layer": true });
  bar = {
    element,
    life: presence(element, { hidden: false, open: "visible", closing: "leaving" }),
    title: el("div", { class: "ui-alert__title", hidden: true }),
    text: el("div", { class: "ui-alert__text" }),
    progress: el("div", { class: "ui-alert-bar__progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", hidden: true }),
    close: closeButton(t("hide")),
    lead: null, leadKey: null, actions: null, action: null, onAction: null, timer: 0,
  };
  element.append(el("div", { class: "ui-alert__body" }, bar.title, bar.text), bar.progress, bar.close);
  const press = (event) => {
    if (bar.action?.contains(event.target)) {
      if (event.type === "click") bar.onAction?.();
    } else if (bar.close.contains(event.target) && isPress(event)) {
      if (event.type !== "click") event.preventDefault();
      statusDismiss();
    }
  };
  for (const type of ["pointerdown", "keydown", "click"]) element.addEventListener(type, press);
  document.body.append(element);
  return bar;
}

const visible = () => bar?.life.state === "open";

function setProgress(value) {
  const number = clamp(Number(value) || 0, 0, 100);
  setAttr(bar.progress, "hidden", false);
  setVar(bar.progress, "--ui-alert-value", `${number}%`);
  setAttr(bar.progress, "aria-valuenow", Math.round(number));
}

/* Строка с progress — долгая операция: сама не уходит, пока не задан duration. */
function status(options = {}) {
  barOf();
  const type = typeOf(options);
  const hasProgress = options.progress != null && Number.isFinite(Number(options.progress));
  setType(bar.element, type, "status");
  setLead(bar, options, type, "ui-icon");
  setLine(bar.title, text(options.title));
  setLine(bar.text, text(options.label ?? options.text));
  if (hasProgress) setProgress(options.progress);
  else setAttr(bar.progress, "hidden", true);
  setAction(bar, options.action, type);
  bar.onAction = bar.action ? () => options.action.onClick(options.id) : null;
  setAttr(bar.close, "hidden", options.dismissible === false);

  bar.life.show();
  clearTimeout(bar.timer);
  const ms = options.duration == null && hasProgress ? 0 : durationOf(options, type);
  bar.timer = ms > 0 ? setTimeout(statusDismiss, ms) : 0;
  return bar.element;
}

function progress(value) {
  if (!visible()) return false;
  setProgress(value);
  return true;
}

/* Бар уходит CSS-анимацией; новый status посреди ухода его возвращает. */
function statusDismiss() {
  if (!visible()) return false;
  clearTimeout(bar.timer);
  bar.life.hide();
  return true;
}

/* --- Закрываемый alert в разметке ------------------------------------------- */

/* Закрытый гаснет и одновременно схлопывается по высоте, отступам и полям:
   содержимое ниже подъезжает, а не прыгает. Высоту анимируем осознанно — у alert
   в потоке нет соседей, которых можно сдвинуть трансформом. Прячется, а не
   удаляется: разметку поставил автор. */
function collapse(element) {
  const done = () => {
    element.hidden = true;
    element.dataset.state = "visible";
  };
  if (reducedMotion()) {
    done();
    return null;
  }
  const styles = getComputedStyle(element);
  const pace = paceOf(styles);
  const open = {
    height: `${element.offsetHeight}px`,
    paddingTop: styles.paddingTop,
    paddingBottom: styles.paddingBottom,
    marginTop: styles.marginTop,
    marginBottom: styles.marginBottom,
  };
  const shut = { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" };
  /* Зазор флекс-колонки пропал бы скачком в момент hidden: последний кадр
     забирает его отрицательным полем со стороны соседа. */
  const parent = element.parentElement && getComputedStyle(element.parentElement);
  if (parent?.display.includes("flex") && parent.flexDirection.startsWith("column")) {
    const gap = Number.parseFloat(parent.rowGap) || 0;
    if (element.nextElementSibling) shut.marginBottom = `${-gap}px`;
    else if (element.previousElementSibling) shut.marginTop = `${-gap}px`;
  }
  element.dataset.state = "leaving";
  element.style.overflow = "hidden";
  const animation = element.animate(
    [
      { offset: 0, opacity: 1, ...open },
      { offset: 0.5, opacity: 0 },
      { offset: 1, opacity: 0, ...shut },
    ],
    { duration: pace.move, easing: pace.moveEase, fill: "forwards" },
  );
  animation.finished.then(
    () => {
      done();
      element.style.overflow = "";
      animation.cancel();
    },
    () => {},
  );
  return animation;
}

const HOST_ATTRS = ["role", "data-state", "hidden", "style"];

function create(host, ctx) {
  const saved = snapshot(host, HOST_ATTRS);
  const own = host.querySelector(`[${CLOSE_ATTR}]`);
  const close = own ?? host.appendChild(closeButton(t("close")));
  if (!host.hasAttribute("role")) host.setAttribute("role", "status");
  let animation = null;

  const press = (event) => {
    if (!isPress(event) || !event.target.closest(`[${CLOSE_ATTR}]`)) return;
    if (host.hidden || host.dataset.state === "leaving") return;
    if (event.type !== "click") event.preventDefault();
    animation = collapse(host);
  };
  for (const type of ["pointerdown", "keydown", "click"]) ctx.on(host, type, press);

  return {
    destroy() {
      animation?.cancel();
      if (!own) close.remove();
      restore(host, saved);
    },
  };
}

export default defineComponent({
  name: "alert",
  selector: SELECTOR,
  create,
  api: () => ({
    show,
    update,
    dismiss,
    clear,
    count: () => flow().length,
    status,
    progress,
    statusDismiss,
  }),
});
