/* Шкала: нативный <input type="range"> поверх нарисованной дорожки. Модуль пишет
   на хост одну долю --ui-ss-ratio (0…1) — заливку, риски и подсказку по ней
   рисует CSS; перетаскивание, щелчок, клавиатура (стрелки — шаг, Home и End — к
   краям) и доступность остаются у платформы.

     <div class="ui-field">
       <span class="ui-field__label">Скидка</span>
       <div data-ui-scale-slider data-min="0" data-max="30" data-step="5" data-value="10" data-unit=" %"></div>
     </div>

   data-name/min/max/step/value переходят на инпут (value — последним: браузер
   прижимает его к уже записанным границам). data-size="sm" — малая,
   data-disabled — недоступна, data-label — имя, если у поля нет подписи,
   data-unit — к значению в aria-valuetext и подсказке, data-tooltip — значение
   над ползунком, data-ticks — число рисок (без него — риска на каждом шаге, если
   шагов не больше двадцати). Свой инпут (.ui-scale-slider__input) берётся как есть.

   data-variant="input" — шкала в виде поля: рамка, высота и скругление как у
   .ui-input, заливка — тон акцента, ползунок — полоска внутри, значение — текстом
   у правого края (риски в этом виде не рисуются). Серый вид — класс
   ui-scale-slider--secondary на хосте, как у полей. Когда полоска доходит до
   значения (data-covered), значение уходит влево от неё и едет следом; отошла —
   значение возвращается к правому краю.

   Потянули за край шкалы (любого вида) — она резиново растягивается за пальцем
   (--ui-ss-sx/--ui-ss-sy и data-stretch на хосте) и пружинит назад при
   отпускании; при reduced motion — нет.

   Пока ползунок тянут, на хосте data-dragging: CSS снимает переход доли, иначе
   заливка отставала бы от пальца; щелчок и клавиатура переход сохраняют. Значение
   или границы, записанные из кода без события input, покажет
   kit("scaleSlider").refresh(host). */

import { defineComponent } from "../../core/component.js";
import { afterReset, dropEmpty, el, labelOf, restore, setAttr, setData, setText, setVar, snapshot } from "../../core/dom.js";
import { numberFormat } from "../../core/locale.js";
import { clamp } from "../../core/math.js";
import { RUBBER, rubber } from "../../core/motion.js";
import { observeSize } from "../../core/observe.js";
import { frame } from "../../core/schedule.js";
import { readNumber, readPx, reducedMotion } from "../../core/tokens.js";

const SELECTOR = "[data-ui-scale-slider]";
const INPUT_CLASS = "ui-scale-slider__input";
/* Риски по шагам — пока шагов не больше: чаще они сливаются в пунктир. */
const STEP_TICKS = 20;
/* Зазор между полоской и значением в поле, px: ближе — значение уходит влево от
   полоски. Назад — только когда полоска отошла ещё на VALUE_HOLD: на границе
   значение не дёргается туда-сюда. */
const VALUE_GAP = 6;
const VALUE_HOLD = 8;
/* Резиновый край шкалы (core/motion.js rubber): растяжение стремится к STRETCH px
   и не доходит до него; сужение по высоте на пределе — SQUEEZE. */
const STRETCH = 16;
const SQUEEZE = 0.08;

const INPUT_ATTRS = ["class", "aria-label", "aria-valuetext", "name", "min", "max", "step", "disabled"];

function create(host, ctx) {
  const found = host.querySelector(`.${INPUT_CLASS}`) ?? host.querySelector("input");
  if (found && found.type !== "range") return null;
  const saved = found && snapshot(found, INPUT_ATTRS);
  const input = found ?? host.appendChild(el("input", { type: "range" }));
  const { dataset } = host;
  const field = dataset.variant === "input";
  const classes = ["ui-scale-slider", dataset.size === "sm" && "ui-scale-slider--sm", field && "ui-scale-slider--input"].filter((name) => name && !host.classList.contains(name));
  host.classList.add(...classes);
  input.classList.add(INPUT_CLASS);
  for (const key of ["name", "min", "max", "step", "value"]) {
    if (!dataset[key]) continue;
    /* Значение своего инпута — его исходное (сброс формы вернёт его), чужого — текущее. */
    if (key === "value" && found) input.value = dataset.value;
    else input.setAttribute(key, dataset[key]);
  }
  if ("disabled" in dataset) input.disabled = true;
  if (!input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby") && !input.labels.length) {
    const name = dataset.label?.trim() || labelOf(input);
    if (name) input.setAttribute("aria-label", name);
  }

  const min = () => readNumber(input.min, 0);
  const max = () => readNumber(input.max, 100);
  const unit = dataset.unit ?? "";

  const track = el("div", { class: "ui-scale-slider__track", "aria-hidden": "true" }, el("span", { class: "ui-scale-slider__fill" }));
  host.prepend(track);
  /* Подсказка — после инпута: CSS показывает её по фокусу инпута через «~». */
  const tooltip = "tooltip" in dataset ? host.appendChild(el("span", { class: "ui-scale-slider__tooltip", "aria-hidden": "true" })) : null;
  /* Значение в поле — перед инпутом: инпут выше по слою и ловит щелчки. */
  const value = field ? host.insertBefore(el("span", { class: "ui-scale-slider__value", "aria-hidden": "true" }), input) : null;

  /* Риски на равных долях, концы не занимают; положение из --ui-ss-ratio риски
     считает CSS той же формулой, что заливку. Без data-ticks число рисок — от
     границ и шага: refresh после их смены собирает ряд заново. */
  const authoredTicks = Math.round(readNumber(dataset.ticks, Number.NaN));
  let row = null;
  let count = -1;
  function buildTicks() {
    let ticks = authoredTicks;
    if (!(ticks >= 0)) {
      /* 0.3 / 0.1 = 2.9999999999999996: целое число шагов — с допуском. */
      const steps = (max() - min()) / readNumber(input.step, 1);
      const whole = Math.round(steps);
      ticks = Math.abs(steps - whole) < 1e-9 && whole <= STEP_TICKS ? whole - 1 : 0;
    }
    if (ticks === count) return;
    count = ticks;
    row?.remove();
    row = null;
    if (ticks <= 0 || field) return;
    const list = Array.from({ length: ticks }, (_, at) => el("span", { class: "ui-scale-slider__tick", style: { "--ui-ss-ratio": String((at + 1) / (ticks + 1)) } }));
    row = el("div", { class: "ui-scale-slider__ticks" }, ...list);
    /* Место ряда — за инпутом и перед подсказкой, как до сборки заново. */
    host.insertBefore(row, tooltip);
  }
  buildTicks();

  /* Уходит ли значение влево: правый край полоски (по целевой доле, не по
     переходу) у значения ближе зазора. offsetLeft — место значения у правого
     края: translate его не меняет. Ширина ползунка — из CSS, читается при смене
     размера. Меряется раз в кадр, перед его раскладкой, а не на каждое событие
     input. data-moved — после первой смены стороны: анимация появления только на
     перемене, не при отрисовке. */
  let ratio = 0;
  let thumb = 0;
  let placed = false;
  const cover = frame(() => {
    if (!value || !input.offsetWidth) return;
    if (!placed) queueMicrotask(() => (placed = true));
    const edge = input.offsetLeft + thumb + ratio * (input.offsetWidth - thumb);
    const was = "covered" in host.dataset;
    const now = edge > value.offsetLeft - VALUE_GAP - (was ? VALUE_HOLD : 0);
    if (now === was) return;
    if (placed) setData(host, "moved", true);
    setData(host, "covered", now);
  });
  if (value) {
    ctx.cleanup(observeSize(host, {
      read: () => readPx(host, "--ui-ss-thumb"),
      write(px) {
        thumb = px;
        cover();
      },
    }));
  }

  function sync() {
    const low = min();
    const span = max() - low;
    const current = readNumber(input.value, low);
    ratio = clamp(span > 0 ? (current - low) / span : 0, 0, 1);
    setVar(host, "--ui-ss-ratio", String(ratio));
    if (!unit && !tooltip && !value) return;
    const text = `${numberFormat().format(current)}${unit}`;
    if (unit) setAttr(input, "aria-valuetext", text);
    if (tooltip) setText(tooltip, text);
    if (value) {
      setText(value, text);
      cover();
    }
  }

  /* Перетаскивание начинается с первым движением: щелчок по дорожке остаётся
     щелчком, с переходом. Ползунок тянет сам браузер — до отпускания, и отменить
     это нельзя; поэтому не track() (его Esc отменил бы жест, а ползунок поехал
     бы дальше без data-dragging) и без захвата: захват посреди нажатия отнимает
     у браузера перетаскивание (Chromium). Слушатели окна — только на время. */
  let drag = null;
  const stretch = (sx, sy) => {
    setVar(host, "--ui-ss-sx", sx);
    setVar(host, "--ui-ss-sy", sy);
  };
  const endDrag = () => {
    drag?.abort();
    drag = null;
    setData(host, "dragging", null);
    stretch(null, null);
  };
  /* Насколько палец ушёл за край, где значение упёрлось: края ползунка — по
     рамке инпута, снятой при нажатии (растяжение двигает рамку, а не края). */
  function overdrag(x, edges) {
    const [start, end, width] = edges;
    const over = x < start ? start - x : x > end ? x - end : 0;
    if (!over) return stretch(null, null);
    const pull = rubber(over, STRETCH, RUBBER);
    setData(host, "stretch", x < start ? "start" : "end");
    stretch((1 + pull / width).toFixed(4), (1 - (pull / STRETCH) * SQUEEZE).toFixed(4));
  }
  ctx.on(input, "pointerdown", (event) => {
    if (event.button !== 0 || input.disabled) return;
    endDrag();
    drag = new AbortController();
    const { pointerId: id } = event;
    const options = { signal: drag.signal };
    let edges = null;
    if (!reducedMotion()) {
      const box = input.getBoundingClientRect();
      const half = readPx(host, "--ui-ss-thumb") / 2;
      edges = [box.left + half, box.right - half, host.offsetWidth];
    }
    window.addEventListener("pointermove", (move) => {
      if (move.pointerId !== id) return;
      setData(host, "dragging", true);
      if (edges) overdrag(move.clientX, edges);
    }, options);
    for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, (end) => end.pointerId === id && endDrag(), options);
  });
  ctx.on(input, "input", sync);
  afterReset(ctx, input, sync);
  sync();

  return {
    host,
    input,
    refresh() {
      buildTicks();
      sync();
    },
    destroy() {
      endDrag();
      cover.cancel();
      for (const part of [track, row, tooltip, value]) part?.remove();
      for (const key of ["covered", "moved", "stretch"]) setData(host, key, null);
      if (saved) restore(input, saved);
      else input.remove();
      setVar(host, "--ui-ss-ratio", null);
      host.classList.remove(...classes);
      dropEmpty(host, "class", "style");
    },
  };
}

export default defineComponent({
  name: "scaleSlider",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (host) => void get(host)?.refresh(),
  }),
});
