/* Подсказка на наведение и фокус. Поверхность одна на страницу, слушатели
   делегированы документу: полсотни подсказок — один элемент и один набор
   обработчиков. Текст, сторона и вариант читаются с триггера в момент показа.

     <button type="button" aria-label="Сохранить" data-ui-tooltip="Сохранить" data-side="bottom">…</button>
     <button type="button" data-ui-tooltip="Готово" data-type="success">…</button>

   data-side — top (по умолчанию) | bottom | left | right, не влезает — переворот.
   data-type — success | warn | error.
   data-variant — secondary (серый пузырь вместо тёмного) | surface (белый, как поповер) |
                  card (карточка с обложкой у значка справки, разметка — tooltip.css).
   data-delay — пауза перед первым показом, мс (у карточки по умолчанию CARD_DELAY).

   Богатое содержимое — шаблон: внутри триггера <template data-tooltip> или общий
   по id в data-ui-tooltip-content. data-ui-tooltip остаётся простым текстом —
   по нему решается, показывать ли подсказку, и он же имя для сравнения с
   aria-label. Части содержимого — классы ui-tooltip__* (tooltip.css).

     <button data-ui-tooltip="Удалить навсегда" aria-label="Удалить">…
       <template data-tooltip><span class="ui-icon" data-ui-icon="trash" data-tone="red"></span>Удалить навсегда</template>
     </button>

   Появление — два вида (data-motion на поверхности, правила — в tooltip.css, кадры — в styles/base.css):
     enter — первый показ после паузы SHOW_DELAY: пузырь проявляется и
             поднимается к якорю;
     swap  — курсор перешёл к соседу, пока подсказка открыта или закрылась
             меньше WARM_WINDOW назад: без паузы пузырь сразу стоит на новом
             месте, сплошной и неподвижный. Внутри него слайд: старый текст
             уезжает в сторону прежнего якоря, новый въезжает с другой стороны
             (ось — та, по которой якоря разошлись сильнее).

   Показанная подсказка — слой стека (core/layer.js): Esc её снимает, у триггера
   в открытом меню она — ребёнок меню и уходит вместе с ним, а нажатия снаружи не
   забирает. В окне поверхность живёт в его слое [data-ui-layer]. */

import { defineComponent } from "../../core/component.js";
import { setAttr, uid } from "../../core/dom.js";
import { autoUpdate, place, sideOf } from "../../core/floating.js";
import { openLayer, portal } from "../../core/layer.js";
import { hydrate } from "../../core/icons.js";
import { presence } from "../../core/presence.js";
import { reducedMotion } from "../../core/tokens.js";

const SELECTOR = "[data-ui-tooltip]";
const ATTR = "data-ui-tooltip";
const SURFACE_CLASS = "ui-tooltip";
const TYPES = new Set(["success", "warn", "error"]);
const VARIANTS = new Set(["secondary", "surface", "card"]);

/* Пауза перед первым показом: подсказка не выскакивает на каждом проходе
   курсора. Пока она открыта, сосед получает её сразу (swap). */
const SHOW_DELAY = 300;
/* Карточку у значка справки зовут нарочно — ей хватает короткой паузы. */
const CARD_DELAY = 120;
const delayOf = (trigger) => {
  const own = Number.parseInt(trigger.dataset.delay, 10);
  return Number.isFinite(own) && own >= 0 ? own : trigger.dataset.variant === "card" ? CARD_DELAY : SHOW_DELAY;
};
/* Фора на уход: курсор доходит до соседа, и подсказка не мигает. */
const HIDE_DELAY = 60;
/* Тёплое окно: курсор ушёл с подсказок, но ещё ведёт по ним — до соседа
   дальше, чем успевает фора. Следующий триггер в этот срок показывает
   подсказку сразу, как при пересадке (swap). */
const WARM_WINDOW = 400;

/* Смонтированные триггеры: отвечает только тот, кого поставил mount. */
const triggers = new WeakSet();
let mounted = 0;
let listening = false;
let engaged = false;

let surface = null;
/* Текст — отдельным узлом внутри пузыря: наводку получает он, а фон, рамка и
   скругление пузыря остаются сплошными. */
let label = null;
/* Уходящий текст слайда — один узел на всё время жизни поверхности. */
let ghost = null;
let slides = [];
let life = null;
let layer = null;
let home = null;
let stopAuto = null;

let anchor = null;
let text = "";
let hovered = null;
let focused = null;
/* Тип указателя последнего нажатия — до конца задачи нажатия. */
let pressed = null;
/* Триггер под пальцем: фокус от касания приходит позже задачи нажатия (с
   совместимым mousedown после отпускания), и подсказку показывает только он. */
let tapped = null;
/* aria-describedby триггера до показа: описание добавляется к чужому. */
let described = null;
let warmUntil = 0;
let showTimer = 0;
let hideTimer = 0;

const warm = () => performance.now() < warmUntil;

function triggerOf(node) {
  const trigger = node instanceof Element ? node.closest(SELECTOR) : null;
  return trigger && triggers.has(trigger) ? trigger : null;
}

function ensureSurface() {
  if (surface) return;
  label = document.createElement("span");
  label.className = "ui-tooltip__text";
  ghost = document.createElement("span");
  ghost.className = "ui-tooltip__ghost";
  ghost.setAttribute("aria-hidden", "true");
  const content = document.createElement("div");
  content.className = "ui-tooltip__content";
  content.append(label, ghost);
  const arrow = document.createElement("div");
  arrow.className = "ui-tooltip__arrow";
  arrow.setAttribute("aria-hidden", "true");
  surface = document.createElement("div");
  surface.className = SURFACE_CLASS;
  surface.setAttribute("role", "tooltip");
  surface.id = uid("ui-tooltip");
  surface.hidden = true;
  surface.append(content, arrow);
  life = presence(surface);
}

/* Шаблон богатого содержимого триггера или null. */
function templateOf(trigger) {
  const id = trigger.getAttribute("data-ui-tooltip-content");
  const node = id ? document.getElementById(id) : trigger.querySelector(":scope > template[data-tooltip]");
  return node instanceof HTMLTemplateElement ? node : null;
}

/* Содержимое пузыря: текст или копия шаблона с дорисованными иконками. Прежние
   узлы возвращаются — их уводит слайд. */
function fill(trigger, next) {
  const previous = [...label.childNodes];
  const template = templateOf(trigger);
  label.classList.toggle("ui-tooltip__text--rich", Boolean(template));
  if (template) {
    label.replaceChildren(template.content.cloneNode(true));
    hydrate(label);
  } else label.textContent = next;
  return previous;
}

const position = () =>
  place(surface, anchor, { prefix: "--ui-tooltip", side: sideOf(anchor.dataset.side, "top"), align: "center", flip: "all", arrow: true, rtl: false });


/* Описание — к чужому, и снимается обратно: hint поля не теряется. Если текст
   подсказки и есть имя кнопки, читалка его второй раз не слышит. */
function describe(trigger) {
  described = trigger.getAttribute("aria-describedby");
  if (trigger.getAttribute("aria-label")?.trim() === text) return;
  trigger.setAttribute("aria-describedby", described ? `${described} ${surface.id}` : surface.id);
}

function undescribe(trigger) {
  setAttr(trigger, "aria-describedby", described);
  described = null;
}

/* Слайд при пересадке: только transform и opacity через Web Animations —
   кадры на композиторе, без раскладки; быстрая пересадка обрывает прежний слайд.
   Старый и новый текст едут одной лентой с зазором GAP: шаг — ширина (высота)
   большего из двух, поэтому они не наезжают друг на друга. */
const SLIDE = { duration: 180, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };
const GAP = 8;

function slide(previous, from, to, size, rich) {
  for (const animation of slides) animation.cancel();
  slides = [];
  ghost.textContent = "";
  if (!previous?.length || !from || reducedMotion()) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!dx && !dy) return;
  /* Новый якорь правее — старое уходит влево, к прежнему, новое приходит справа. */
  const across = Math.abs(dx) >= Math.abs(dy);
  const step = across
    ? Math.sign(dx) * (Math.max(size.width, label.offsetWidth) + GAP)
    : Math.sign(dy) * (Math.max(size.height, label.offsetHeight) + GAP / 2);
  const shift = (value) => (across ? `${value}px 0` : `0 ${value}px`);
  ghost.replaceChildren(...previous);
  ghost.classList.toggle("ui-tooltip__text--rich", rich);
  /* Прежняя ширина: старый текст не переливается заново в новый пузырь. */
  ghost.style.width = `${size.width}px`;
  slides = [
    label.animate([{ translate: shift(step), opacity: 0.4 }, { translate: "0 0", opacity: 1 }], SLIDE),
    ghost.animate([{ translate: "0 0", opacity: 1 }, { translate: shift(-step), opacity: 0.4 }], { ...SLIDE, fill: "forwards" }),
  ];
  slides[1].onfinish = () => { ghost.textContent = ""; };
}

const centre = (node) => {
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

function show(trigger) {
  const next = trigger.getAttribute(ATTR)?.trim() ?? "";
  /* Открытая панель триггера уже ответила на вопрос подсказки и лежит на её
     месте: подсказка не накрывает меню. */
  if (!next || trigger.getAttribute("aria-expanded") === "true") {
    hide();
    return;
  }
  if (anchor === trigger) return;

  ensureSurface();
  const motion = anchor || warm() ? "swap" : "enter";
  /* Чтения — до первой записи: прежний якорь, новый и размер старого текста. */
  const from = anchor?.isConnected ? centre(anchor) : null;
  const to = from && centre(trigger);
  const size = from && { width: label.offsetWidth, height: label.offsetHeight };
  const rich = label.classList.contains("ui-tooltip__text--rich");
  if (anchor) undescribe(anchor);
  anchor = trigger;
  text = next;
  const type = trigger.dataset.type?.trim();
  const classes = [SURFACE_CLASS, TYPES.has(type) && `${SURFACE_CLASS}--${type}`, VARIANTS.has(trigger.dataset.variant) && `${SURFACE_CLASS}--${trigger.dataset.variant}`].filter(Boolean).join(" ");
  if (surface.className !== classes) surface.className = classes;
  describe(trigger);

  /* Поверхность — в слое окна триггера или в body; на переезде между ними —
     вынуть и поставить заново. */
  if (surface.parentNode !== (trigger.closest("[data-ui-layer]") ?? document.body)) {
    detach();
    home = portal(surface, trigger);
  }

  /* Слой — заново у каждого якоря: родитель — слой, в котором стоит триггер.
     Внутри слоя только сам пузырь: триггер остаётся своим для слоя под ним и
     для поповера, который он откроет. */
  const previousLayer = layer;
  layer = openLayer({
    elements: () => [surface],
    trigger,
    exclusive: false,
    escape: true,
    outside: false,
    focus: false,
    onDismiss: () => hide(),
  });
  previousLayer?.close();

  surface.dataset.motion = motion;
  surface.hidden = false;
  if (motion === "enter") {
    slide(null);
    fill(trigger, next);
    position();
  } else {
    /* Пузырь сразу на новом месте; если он ещё доигрывал уход, swap снимает
       его анимацию — снова сплошной, без вспышки. Текст меняется слайдом. */
    const previous = fill(trigger, next);
    position();
    slide(previous, from, to, size, rich);
  }
  /* Положение стоит до data-state=open: первый кадр входа уже у якоря. */
  life.show();
  stopAuto = autoUpdate(trigger, surface, position, { onDetach: () => hide(false) });
  engage();
}

function hide(animate = true) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hovered = null;
  focused = null;
  if (anchor) {
    const current = layer;
    layer = null;
    current.close();
    stopAuto();
    stopAuto = null;
    undescribe(anchor);
    anchor = null;
    /* Ушедший пузырь вынимается из документа: в покое его нет ни в стилях, ни
       в раскладке. */
    const leaving = life.hide();
    if (animate) leaving.then((done) => done && detach());
    else {
      life.settle();
      detach();
    }
  }
  engage();
}

function detach() {
  home?.();
  home = null;
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (hovered || focused) return;
    /* Тёплое окно открывает только уход с подсказки: после нажатия и Esc
       следующая снова ждёт паузу. */
    if (anchor) warmUntil = performance.now() + WARM_WINDOW;
    hide();
  }, HIDE_DELAY);
}

function onPointerOver(event) {
  /* На тач-экране наведения нет: там подсказку показывает фокус. */
  if (event.pointerType === "touch") return;
  const trigger = triggerOf(event.target);
  if (!trigger || trigger === hovered) return;
  clearTimeout(showTimer);
  hovered = trigger;
  engage();
  if (anchor || warm()) show(trigger);
  else showTimer = setTimeout(() => hovered === trigger && show(trigger), delayOf(trigger));
}

function onPointerOut(event) {
  const trigger = triggerOf(event.target);
  /* Переход на свой же значок или подпись — не уход: пауза не начинается заново. */
  if (!trigger || trigger !== hovered || trigger.contains(event.relatedTarget)) return;
  hovered = null;
  clearTimeout(showTimer);
  /* Ушли на другой триггер — им займётся pointerover. */
  if (!triggerOf(event.relatedTarget) && focused !== trigger) scheduleHide();
  engage();
}

/* Любое нажатие снимает подсказку: она подсказывала то, что ещё не нажали.
   Фокус, который браузер ставит тем же нажатием мыши или пера, её не
   возвращает; фокус от касания — возвращает: на тач-экране это единственный
   способ увидеть подсказку. Отметка живёт до конца задачи нажатия. Прочий фокус
   показывает подсказку, только если он клавиатурный (:focus-visible): меню или
   окно, закрытые мышью или пальцем, возвращают фокус кнопке из кода, и подсказка
   на ней — лишняя и держалась бы фокусом, пока курсор далеко. */
function onPointerDown(event) {
  pressed = event.pointerType;
  tapped = pressed === "touch" ? triggerOf(event.target) : null;
  setTimeout(() => (pressed = null));
  if (anchor || hovered) hide();
}

function onFocusIn(event) {
  const tap = tapped;
  tapped = null;
  const trigger = triggerOf(event.target);
  if (!trigger || trigger === focused) return;
  focused = trigger;
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  engage();
  /* Фокус — уже намерение: без паузы. */
  if (trigger === tap || (!pressed && event.target.matches(":focus-visible"))) show(trigger);
}

function onFocusOut(event) {
  const trigger = triggerOf(event.target);
  if (!trigger || trigger !== focused) return;
  focused = null;
  if (anchor === trigger) scheduleHide();
  engage();
}

function onVisibility() {
  if (document.hidden) hide(false);
}

/* В покое нужны три слушателя: наведение, нажатие, фокус. Уход курсора и фокуса
   и смена вкладки слушаются, только пока есть кого провожать. */
const IDLE = [["pointerover", onPointerOver], ["pointerdown", onPointerDown], ["focusin", onFocusIn]];
const BUSY = [["pointerout", onPointerOut], ["focusout", onFocusOut], ["visibilitychange", onVisibility]];

function bind(list, on) {
  for (const [type, handler] of list) {
    if (on) document.addEventListener(type, handler, true);
    else document.removeEventListener(type, handler, true);
  }
}

function engage() {
  const on = listening && Boolean(hovered || focused || anchor);
  if (on === engaged) return;
  engaged = on;
  bind(BUSY, on);
}

function listen(on) {
  if (on === listening) return;
  listening = on;
  bind(IDLE, on);
  engage();
}

/* Экземпляр — только отметка триггера: поведение делегировано, слушатели
   ставит первый смонтированный триггер и снимает последний. */
function create(trigger) {
  triggers.add(trigger);
  mounted += 1;
  listen(true);
  return {
    destroy() {
      triggers.delete(trigger);
      if (tapped === trigger) tapped = null;
      if (anchor === trigger || hovered === trigger || focused === trigger) hide(false);
      mounted -= 1;
      if (!mounted) listen(false);
    },
  };
}

export default defineComponent({ name: "tooltip", selector: SELECTOR, create });
