/* Выбор цвета: нативное текстовое поле с образцом и панель с палитрой.

   Поле — хост и источник значения: name, value, required, disabled, aria-* и
   отправка формы — его собственные, без JS это обычное поле с кодом цвета.
   Модуль добавляет образец слева (он же кнопка панели) и панель.

     <div class="ui-field">
       <label class="ui-field__label" for="bg">Фон</label>
       <input class="ui-input" id="bg" name="bg" data-ui-colorpicker value="#e8f1de"
              data-swatches="#ffffff #f4f4f5 #18181b #7bbd2e">
     </div>

   Значение — «#e8f1de», нижний регистр. data-alpha — ещё и непрозрачность:
   ползунок в панели и запись «#e8f1de80», пока цвет не непрозрачный.
   data-swatches — образцы под палитрой (hex через пробел или запятую). Пустое
   поле — «без цвета»: у необязательного поля это первый образец. data-size="sm" —
   компактное поле.

   В поле можно вписать hex с решёткой или без, rgb(), hsl() или имя цвета — на
   change запись приводится к hex; неверная возвращает последнее принятое
   значение. Палитра шлёт input, пока цвет тянут, и change, когда отпустили, —
   как нативный range.

   Панель строится при первом открытии и уходит в body (в окне — в его слой).
   Цвет внутри — HSV: поле насыщенности и яркости, ползунок тона, по data-alpha —
   ползунок непрозрачности; пипетка — там, где браузер даёт EyeDropper. */

import { defineComponent } from "../../core/component.js";
import { afterReset, el, isRtl, labelOf, restore, setAttr, setData, setVar, snapshot, uid } from "../../core/dom.js";
import { autoUpdate, place } from "../../core/floating.js";
import { focus, tabbables } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { moveIndex } from "../../core/keys.js";
import { openLayer, portal } from "../../core/layer.js";
import { messages } from "../../core/locale.js";
import { clamp } from "../../core/math.js";
import { presence } from "../../core/presence.js";
import { frame } from "../../core/schedule.js";
import { hsvToRgb, parse, rgbToHsv, swatchList, toHex } from "./colorpicker-color.js";

const SELECTOR = "[data-ui-colorpicker]";
const SWATCH_CLASS = "ui-colorpicker__swatch";
const COMPACT_CLASS = "ui-input--sm";
const INPUT_ATTRS = ["aria-label", "autocomplete", "spellcheck"];
/* Восемь образцов в строке: на этом стоят стрелки по сетке образцов. */
const SWATCH_COLUMNS = 8;
const TEXT_TYPES = new Set(["text", "search"]);

const t = messages("colorpicker", {
  ru: {
    dialog: "Выбор цвета",
    pick: "Выбрать цвет",
    change: "Изменить цвет, {color}",
    area: "Насыщенность и яркость",
    areaValue: "насыщенность {s} %, яркость {v} %",
    hue: "Оттенок",
    hueValue: "{h}°",
    alpha: "Непрозрачность",
    alphaValue: "{a} %",
    eyedropper: "Взять цвет с экрана",
    swatches: "Образцы",
    none: "Без цвета",
  },
  en: {
    dialog: "Choose colour",
    pick: "Choose colour",
    change: "Change colour, {color}",
    area: "Saturation and brightness",
    areaValue: "saturation {s}%, brightness {v}%",
    hue: "Hue",
    hueValue: "{h}°",
    alpha: "Opacity",
    alphaValue: "{a}%",
    eyedropper: "Pick colour from screen",
    swatches: "Swatches",
    none: "No colour",
  },
});

const percent = (value) => Math.round(value * 100);
const cssColor = ({ r, g, b }, a = 1) => (a < 1 ? `rgb(${r} ${g} ${b} / ${Math.round(a * 1000) / 1000})` : `rgb(${r} ${g} ${b})`);

function create(input, ctx) {
  if (!(input instanceof HTMLInputElement) || !TEXT_TYPES.has(input.type) || !input.parentNode) return null;

  const saved = snapshot(input, INPUT_ATTRS);
  const trigger = el("button", { class: "ui-colorpicker__trigger", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" });
  const wrap = el("div", { class: "ui-input__wrap" });
  const host = el("div", { class: "ui-colorpicker" }, wrap);
  input.before(host);
  wrap.append(trigger, input);

  const compact = input.dataset.size === "sm" && !input.classList.contains(COMPACT_CLASS);
  if (compact) input.classList.add(COMPACT_CLASS);
  if (!input.labels?.length && !input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby")) setAttr(input, "aria-label", labelOf(input) || null);
  /* Код цвета — не слово: без подсказок браузера и проверки орфографии. */
  if (!input.hasAttribute("autocomplete")) input.autocomplete = "off";
  if (!input.hasAttribute("spellcheck")) input.spellcheck = false;

  const alpha = () => input.hasAttribute("data-alpha");
  /* Цвет панели. Пустое поле его не сбрасывает: открыли «без цвета» — палитра
     стоит на последнем цвете; у поля, которое ни разу не заполняли, — на белом. */
  let hsv = { h: 0, s: 0, v: 1, a: 1 };
  /* Последнее принятое значение: к нему возвращает неверная запись. */
  let accepted = input.value;
  /* Своё событие input/change не разбирается заново как ввод руками. */
  let writing = false;
  /* Значение менялось с последнего change: тянут ли, листают ли стрелками. */
  let dirty = false;
  let parts = null;
  let life = null;
  let layer = null;
  let home = null;
  let stopAuto = null;
  let stopDrag = null;
  let swatchKey = null;
  let rtl = false;
  let pointer = "";

  const current = () => toHex({ ...hsvToRgb(hsv), a: hsv.a }, alpha());
  const empty = () => !input.value.trim();

  /* Цвет из записи. Тот же hex, что уже показан, панель не двигает: перевод в RGB
     и обратно сдвинул бы ручку на пиксель. У серого и чёрного тона нет — тон и
     насыщенность остаются прежними. */
  function adopt(color) {
    if (!color || toHex(color, alpha()) === current()) return;
    const next = rgbToHsv(color);
    if (next.v === 0) {
      next.h = hsv.h;
      next.s = hsv.s;
    } else if (next.s === 0) next.h = hsv.h;
    hsv = { ...next, a: alpha() ? color.a : 1 };
  }

  function sync() {
    trigger.disabled = input.disabled || input.readOnly;
    if (trigger.disabled) close();
    if (layer) paintSwatches();
  }
  const watcher = new MutationObserver(sync);
  watcher.observe(input, { attributes: true, attributeFilter: ["disabled", "readonly", "required", "data-swatches", "data-alpha"] });
  ctx.cleanup(() => watcher.disconnect());

  /* Образец в поле — то, что сейчас написано, даже недописанное: пока запись не
     читается, остаётся прошлый цвет. */
  function paintTrigger() {
    const color = parse(input.value);
    const none = empty();
    setData(trigger, "empty", none);
    if (color) setVar(trigger, "--ui-colorpicker-value", cssColor(color, alpha() ? color.a : 1));
    setAttr(trigger, "aria-label", none || !color ? t("pick") : t("change", { color: toHex(color, alpha()) }));
  }

  function build() {
    const id = uid("ui-colorpicker-panel");
    const knob = () => el("div", { class: "ui-colorpicker__pos" }, el("span", { class: "ui-colorpicker__knob" }));
    const area = el("div", { class: "ui-colorpicker__area", role: "slider", tabindex: "0", "aria-valuemin": "0", "aria-valuemax": "100" }, knob());
    /* Ползунок: дорожка во всю ширину, рельс внутри неё — путь центра ручки. */
    const slider = (kind, max) => el("div", { class: `ui-colorpicker__slider ui-colorpicker__slider--${kind}`, role: "slider", tabindex: "0", "aria-valuemin": "0", "aria-valuemax": String(max) }, el("div", { class: "ui-colorpicker__rail" }, knob()));
    const hue = slider("hue", 360);
    const opacity = slider("alpha", 100);
    const eyedropper = "EyeDropper" in window ? el("button", { class: "ui-btn ui-btn--ghost ui-btn--icon-sm ui-colorpicker__eyedropper", type: "button" }, icon("pipette")) : null;
    const swatches = el("div", { class: "ui-colorpicker__swatches", role: "listbox" });

    const panel = el(
      "div",
      { class: "ui-colorpicker__panel", id, role: "dialog", hidden: true, data: { state: "closed" } },
      area,
      el("div", { class: "ui-colorpicker__controls" }, eyedropper, el("div", { class: "ui-colorpicker__sliders" }, hue, opacity)),
      swatches,
    );
    host.append(panel);
    trigger.setAttribute("aria-controls", id);
    life = presence(panel, { closed: "closed" });
    parts = { panel, area, hue, opacity, eyedropper, swatches, items: [] };

    ctx.on(area, "pointerdown", (event) => drag(event, area, area, (x, y) => {
      hsv.s = x;
      hsv.v = 1 - y;
    }));
    ctx.on(hue, "pointerdown", (event) => drag(event, hue, hue.firstChild, (x) => {
      hsv.h = x * 360;
    }));
    ctx.on(opacity, "pointerdown", (event) => drag(event, opacity, opacity.firstChild, (x) => {
      hsv.a = x;
    }));
    ctx.on(area, "keydown", onAreaKeyDown);
    ctx.on(hue, "keydown", (event) => onSliderKeyDown(event, "h", 360, 1));
    ctx.on(opacity, "keydown", (event) => onSliderKeyDown(event, "a", 1, 0.01));
    if (eyedropper) ctx.on(eyedropper, "click", pickFromScreen);
    ctx.on(swatches, "click", (event) => {
      const item = event.target.closest(`.${SWATCH_CLASS}`);
      if (item) choose(item.dataset.value);
    });
    ctx.on(swatches, "keydown", onSwatchesKeyDown);
    ctx.on(panel, "keydown", onPanelKeyDown);
  }

  /* Строки — на каждом открытии: язык страницы могли переключить. */
  function paintStatic() {
    const { panel, area, hue, opacity, eyedropper, swatches } = parts;
    setAttr(panel, "aria-label", t("dialog"));
    setAttr(area, "aria-label", t("area"));
    setAttr(hue, "aria-label", t("hue"));
    setAttr(opacity, "aria-label", t("alpha"));
    opacity.hidden = !alpha();
    setAttr(swatches, "aria-label", t("swatches"));
    if (eyedropper) setAttr(eyedropper, "aria-label", t("eyedropper"));
  }

  /* Образцы пересобираются, только когда сменился их список. */
  function paintSwatches() {
    const list = swatchList(input.dataset.swatches, alpha());
    const none = !input.required;
    const key = `${none}|${list.join(" ")}`;
    if (key !== swatchKey) {
      swatchKey = key;
      const items = (none ? [""] : []).concat(list).map((value) => el("button", {
        class: value ? SWATCH_CLASS : `${SWATCH_CLASS} ${SWATCH_CLASS}--none`,
        type: "button",
        role: "option",
        tabindex: "-1",
        "aria-label": value || t("none"),
        data: { value },
        style: value ? { "--ui-colorpicker-value": value } : null,
      }));
      parts.swatches.replaceChildren(...items);
      parts.items = items;
      /* Один «без цвета» — не набор образцов: строка не показывается. */
      parts.swatches.hidden = !list.length;
    }
    paintSelection();
  }

  function paintSelection() {
    const value = empty() ? "" : current();
    let tab = 0;
    parts.items.forEach((item, at) => {
      const selected = item.dataset.value === value;
      setAttr(item, "aria-selected", String(selected));
      if (selected) tab = at;
    });
    const focused = parts.items.indexOf(document.activeElement);
    parts.items.forEach((item, at) => {
      item.tabIndex = at === (focused >= 0 ? focused : tab) ? 0 : -1;
    });
  }

  /* Положение ручек и цвета панели — переменными: перерисовка без раскладки. */
  function paintPanel() {
    const { panel, area, hue, opacity } = parts;
    const rgb = hsvToRgb(hsv);
    setVar(panel, "--ui-colorpicker-hue", `hsl(${Math.round(hsv.h)} 100% 50%)`);
    setVar(panel, "--ui-colorpicker-solid", cssColor(rgb));
    setVar(panel, "--ui-colorpicker-color", cssColor(rgb, hsv.a));
    setVar(area.firstChild, "--ui-colorpicker-x", String(hsv.s));
    setVar(area.firstChild, "--ui-colorpicker-y", String(1 - hsv.v));
    setVar(hue.firstChild.firstChild, "--ui-colorpicker-x", String(hsv.h / 360));
    setVar(opacity.firstChild.firstChild, "--ui-colorpicker-x", String(hsv.a));
    setAttr(area, "aria-valuenow", String(percent(hsv.s)));
    setAttr(area, "aria-valuetext", t("areaValue", { s: percent(hsv.s), v: percent(hsv.v) }));
    setAttr(hue, "aria-valuenow", String(Math.round(hsv.h)));
    setAttr(hue, "aria-valuetext", t("hueValue", { h: Math.round(hsv.h) }));
    setAttr(opacity, "aria-valuenow", String(percent(hsv.a)));
    setAttr(opacity, "aria-valuetext", t("alphaValue", { a: percent(hsv.a) }));
    paintSelection();
  }

  const paint = () => {
    paintTrigger();
    if (layer) paintPanel();
  };

  /* Запись в поле из палитры. input — на каждую правку, change — в conclude(). */
  function write(text) {
    if (input.value !== text) {
      input.value = text;
      dirty = true;
      writing = true;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      writing = false;
    }
    accepted = text;
    paint();
  }

  function conclude() {
    if (!dirty) return;
    dirty = false;
    writing = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    writing = false;
  }

  /* Тянут поле или ползунок: значение — от места указателя на рельсе, раз в кадр.
     Рамка рельса берётся один раз: панель под пальцем не двигается. */
  function drag(event, target, rail, apply) {
    if (event.button !== 0 || stopDrag) return;
    event.preventDefault();
    focus(target);
    const rect = rail.getBoundingClientRect();
    let point = event;
    const move = () => {
      apply(clamp((point.clientX - rect.left) / rect.width, 0, 1), clamp((point.clientY - rect.top) / rect.height, 0, 1));
      write(current());
    };
    const step = frame(move);
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const id = event.pointerId;
    stopDrag = () => {
      if (controller.signal.aborted) return;
      step.flush();
      controller.abort();
      stopDrag = null;
      setData(parts.panel, "dragging", false);
      conclude();
    };
    move();
    try {
      target.setPointerCapture(id);
    } catch {}
    setData(parts.panel, "dragging", true);
    target.addEventListener("pointermove", (next) => {
      if (next.pointerId !== id) return;
      point = next;
      step();
    }, options);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) target.addEventListener(type, (end) => end.pointerId === id && stopDrag?.(), options);
  }

  /* Поле: ← → — насыщенность, ↑ ↓ — яркость; шаг 1 %, с Shift — 10 %. */
  function onAreaKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 0.1 : 0.01;
    const keys = {
      ArrowLeft: ["s", -step],
      ArrowRight: ["s", step],
      ArrowUp: ["v", step],
      ArrowDown: ["v", -step],
      PageUp: ["v", 0.1],
      PageDown: ["v", -0.1],
    };
    if (event.key === "Enter") {
      event.preventDefault();
      close({ focus: true });
      return;
    }
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    hsv[move[0]] = clamp(hsv[move[0]] + move[1], 0, 1);
    write(current());
    conclude();
  }

  /* Ползунок: стрелки — шаг, с Shift и PageUp/PageDown — десять шагов, Home и End — края. */
  function onSliderKeyDown(event, key, max, unit) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const big = unit * 10;
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    let next = null;
    if (step) next = hsv[key] + step * (event.shiftKey ? big : unit);
    else if (event.key === "PageUp") next = hsv[key] + big;
    else if (event.key === "PageDown") next = hsv[key] - big;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    else if (event.key === "Enter") {
      event.preventDefault();
      close({ focus: true });
      return;
    }
    if (next === null) return;
    event.preventDefault();
    hsv[key] = clamp(next, 0, max);
    write(current());
    conclude();
  }

  /* Образцы — сетка по восемь: стрелки по строкам и столбцам, Home и End — края. */
  function onSwatchesKeyDown(event) {
    const index = parts.items.indexOf(event.target);
    if (index === -1) return;
    const next = moveIndex(event, index, parts.items.length, { columns: SWATCH_COLUMNS, rtl });
    if (next === null) return;
    event.preventDefault();
    parts.items.forEach((item, at) => {
      item.tabIndex = at === next ? 0 : -1;
    });
    focus(parts.items[next]);
  }

  function choose(value) {
    if (value) adopt(parse(value));
    write(value ? current() : "");
    conclude();
  }

  /* Пипетка браузера: отмена (Esc, клик мимо) — не ошибка. */
  async function pickFromScreen() {
    try {
      const { sRGBHex } = await new window.EyeDropper().open({ signal: ctx.signal });
      if (!layer) return;
      const color = parse(sRGBHex);
      if (color) choose(toHex({ ...color, a: hsv.a }, alpha()));
    } catch {}
  }

  const position = () => place(parts.panel, wrap, { prefix: "--ui-colorpicker", side: "bottom", align: "start", flip: "opposite", rtl });

  function open(moveFocus) {
    if (layer || input.disabled || input.readOnly) return;
    rtl = isRtl(wrap);
    if (!parts) build();
    adopt(parse(input.value));
    accepted = input.value;
    paintStatic();
    const { panel } = parts;
    home ??= portal(panel, trigger);
    layer = openLayer({
      elements: () => [host, panel],
      trigger,
      exclusive: true,
      onDismiss(reason) {
        close({ focus: reason === "escape" });
      },
    });
    setVar(panel, "--ui-colorpicker-space", null);
    panel.hidden = false;
    paintSwatches();
    paintPanel();
    position();
    life.show();
    stopAuto = autoUpdate(wrap, panel, position, { onDetach: () => close() });
    setAttr(trigger, "aria-expanded", "true");
    if (moveFocus) focus(parts.area);
  }

  function close({ focus: refocus = false } = {}) {
    if (!layer) return;
    stopDrag?.();
    const inside = parts.panel.contains(document.activeElement);
    const active = layer;
    layer = null;
    active.close();
    stopAuto();
    stopAuto = null;
    setAttr(trigger, "aria-expanded", "false");
    life.hide().then((done) => done && goHome());
    if (refocus && inside) focus(trigger);
  }

  function goHome() {
    home?.();
    home = null;
  }

  const toggle = (moveFocus) => (layer ? close() : open(moveFocus));

  /* Ввод руками: образец и палитра идут за записью, как только она читается. */
  function onInput() {
    if (writing) return;
    adopt(parse(input.value));
    paint();
  }

  /* На change запись приводится к hex; неверная — к последнему принятому значению,
     пустое поле — «без цвета». Свой change у ввода уже идёт: второго нет. */
  function onChange() {
    if (writing) return;
    const color = parse(input.value);
    if (empty()) input.value = "";
    else if (color) {
      adopt(color);
      input.value = toHex(color, alpha());
    } else input.value = accepted;
    accepted = input.value;
    dirty = false;
    paint();
  }

  /* Панель — в конце body, а читается как продолжение поля: Tab с образца ведёт
     в неё, Shift+Tab с первого её контрола — обратно на образец, Tab с последнего
     закрывает панель и идёт дальше. */
  function onPanelKeyDown(event) {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = tabbables(parts.panel);
    if (event.shiftKey && event.target === list[0]) {
      event.preventDefault();
      focus(trigger);
    } else if (!event.shiftKey && event.target === list.at(-1)) {
      event.preventDefault();
      close();
      focus(input);
    }
  }

  /* Мышь открывает на нажатии, палец и перо — на click (касание, с которого начали
     прокрутку формы, панель не открывает), клавиатура — click с detail 0. */
  ctx.on(trigger, "pointerdown", (event) => {
    pointer = event.pointerType;
    if (pointer === "mouse" && event.button === 0) toggle(false);
  });
  ctx.on(trigger, "click", (event) => {
    if (event.detail === 0 || pointer !== "mouse") toggle(event.detail === 0);
  });
  ctx.on(trigger, "keydown", (event) => {
    if (event.key !== "Tab" || event.shiftKey || !layer) return;
    event.preventDefault();
    focus(tabbables(parts.panel)[0]);
  });
  ctx.on(input, "focus", () => {
    accepted = input.value;
  });
  ctx.on(input, "input", onInput);
  ctx.on(input, "change", onChange);
  afterReset(ctx, input, () => {
    accepted = input.value;
    adopt(parse(input.value));
    paint();
  });
  adopt(parse(input.value));
  sync();
  paintTrigger();

  return {
    open: () => open(false),
    close: () => close(),
    /* Значение из кода — без событий, как запись в value. */
    set(value) {
      input.value = value ?? "";
      accepted = input.value;
      adopt(parse(input.value));
      paint();
    },
    destroy() {
      close();
      life?.settle();
      goHome();
      if (compact) input.classList.remove(COMPACT_CLASS);
      restore(input, saved);
      if (host.parentNode) host.replaceWith(input);
    },
  };
}

export default defineComponent({
  name: "colorpicker",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    open: (input) => get(input)?.open(),
    close: (input) => get(input)?.close(),
    set: (input, value) => get(input)?.set(value),
  }),
});
