/* Вкладки по APG с автоматической активацией: выбор идёт за фокусом, ← → (с учётом
   направления текста), Home и End; недоступные пропускаются. Роли и выбранную
   вкладку объявляет разметка; модуль ставит пары «вкладка ↔ панель», id, tabindex,
   hidden, подпись панели и пилюлю.

     <div class="ui-tabs" data-ui-tabs>
       <div class="ui-tabs__list" role="tablist" aria-label="Вид сделок">
         <button type="button" class="ui-tabs__trigger" role="tab" aria-selected="true">Список</button>
         <button type="button" class="ui-tabs__trigger" role="tab">Канбан</button>
       </div>
       <div class="ui-tabs__panel" role="tabpanel">Таблица сделок</div>
       <div class="ui-tabs__panel" role="tabpanel" hidden>Колонки этапов</div>
     </div>

   Панель ищется по aria-controls вкладки, иначе по порядку. Хост без панелей —
   сегментный переключатель (тема, вид списка): о выборе говорит только событие.

   Пилюля — одна коробка на трек: модуль пишет --ui-tabs-ind-x / --ui-tabs-ind-w,
   CSS двигает её трансформом и режет клипом. Без модуля подложку рисует сам таб.

   Лента, которой не хватает места, листается стрелками у краёв: стрелка видна,
   только пока в её сторону есть скрытые вкладки. Шаг — до вкладки, а не на
   сколько-то пикселей: первая скрытая встаёт целиком к противоположному краю,
   за ней — сколько поместится. Выбранная вкладка (щелчком, с клавиатуры, из
   API) подводится в кадр мимо стрелок. Стрелки — для мыши: клавиатура ходит по
   вкладкам ← →, поэтому в порядке Tab и в дереве доступности их нет.

   kit("tabs").select(host, index); на хосте — tabs:change (detail: index, trigger,
   panel). */

import { defineComponent } from "../../core/component.js";
import { dropEmpty, el, ensureId, isRtl, ownParts, restore, setAttr, setVar, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { moveIndex } from "../../core/keys.js";
import { clamp } from "../../core/math.js";
import { observeSize } from "../../core/observe.js";
import { frame } from "../../core/schedule.js";
import { readMs, reducedMotion } from "../../core/tokens.js";

const SELECTOR = "[data-ui-tabs]";
const LIST = ".ui-tabs__list";
const TRIGGER = ".ui-tabs__trigger";
const PANEL = ".ui-tabs__panel";
const READY = "is-indicator-ready";
const ANIMATED = "is-indicator-animated";
const MORE_START = "has-more-start";
const MORE_END = "has-more-end";
/* Если в панели нечего взять фокусом, остановкой Tab становится сама панель.
   Только селектор: проверка видимости стоила бы раскладки на каждый выбор. */
const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
const TRIGGER_ATTRS = ["id", "role", "tabindex", "aria-selected", "aria-controls"];
const PANEL_ATTRS = ["id", "role", "tabindex", "aria-labelledby", "hidden"];

const disabled = (trigger) => trigger.disabled || trigger.getAttribute("aria-disabled") === "true";

function create(host, ctx) {
  const triggers = ownParts(host, TRIGGER, SELECTOR);
  if (!triggers.length) return null;
  const panels = ownParts(host, PANEL, SELECTOR);
  const track = triggers[0].closest(LIST);
  /* Без своего трека — без пилюли. */
  const list = track?.closest(SELECTOR) === host ? track : null;

  /* Панель по id, при дубле — первая; без aria-controls — по порядку. */
  const byId = new Map();
  for (const panel of panels) if (panel.id && !byId.has(panel.id)) byId.set(panel.id, panel);
  const pairs = triggers.map((trigger, at) => ({ trigger, panel: byId.get(trigger.getAttribute("aria-controls")) ?? panels[at] ?? null }));
  const skip = (at) => disabled(pairs[at].trigger);

  const saved = [...triggers.map((node) => [node, snapshot(node, TRIGGER_ATTRS)]), ...panels.map((node) => [node, snapshot(node, PANEL_ATTRS)])];

  /* Помеченная недоступная вкладка выбранной быть не может: берём первую доступную. */
  const marked = triggers.findIndex((trigger) => trigger.getAttribute("aria-selected") === "true" && !disabled(trigger));
  let selected = marked >= 0 ? marked : Math.max(0, triggers.findIndex((trigger) => !disabled(trigger)));

  function sync() {
    pairs.forEach(({ trigger, panel }, at) => {
      const active = at === selected;
      ensureId(trigger, "ui-tabs-trigger");
      setAttr(trigger, "role", "tab");
      setAttr(trigger, "aria-selected", String(active));
      setAttr(trigger, "tabindex", active ? "0" : "-1");
      if (!panel) {
        setAttr(trigger, "aria-controls", null);
        return;
      }
      setAttr(trigger, "aria-controls", ensureId(panel, "ui-tabs-panel"));
      setAttr(panel, "role", "tabpanel");
      setAttr(panel, "aria-labelledby", trigger.id);
      setAttr(panel, "hidden", !active);
      /* Признак пересчитывается на каждом выборе: содержимое могло появиться позже. */
      setAttr(panel, "tabindex", active && !panel.querySelector(FOCUSABLE) ? "0" : null);
    });
  }

  /* --- пилюля --------------------------------------------------------------- */

  const indicator = list ? el("div", { class: "ui-tabs__indicator", "aria-hidden": "true" }) : null;
  let placed = null;
  let box = null;
  /* Переходы включаются кадром позже: первая постановка — не переезд из угла. */
  const animateNext = frame(() => list.classList.add(ANIMATED));

  /* Смещение и ширина вкладки в координатах содержимого трека: прокрутка трека
     сокращается, обе коробки — в одном чтении. */
  function measure() {
    const listRect = list.getBoundingClientRect();
    const rect = pairs[selected].trigger.getBoundingClientRect();
    return { x: Math.round((rect.left - listRect.left + list.scrollLeft) * 100) / 100, w: Math.round(rect.width * 100) / 100 };
  }

  /* animate = false — перекладка трека или первая постановка: новое место, а не движение. */
  function place(next, animate) {
    /* Невидимый хост (display: none) мерить нечего: подложку рисует сам таб. */
    if (!next.w || (placed && next.x === placed.x && next.w === placed.w)) return;
    list.classList.toggle(ANIMATED, animate);
    setVar(list, "--ui-tabs-ind-x", `${next.x}px`);
    setVar(list, "--ui-tabs-ind-w", `${next.w}px`);
    list.classList.add(READY);
    if (!animate) animateNext();
    placed = next;
  }

  /* --- прокрутка ленты ------------------------------------------------------ */

  /* Стрелки — липкие кнопки внутри самого трека: прокрутка, пилюля и разметка
     приложений (селекторы «> .ui-tabs__list») остаются как были. */
  const arrow = (side, glyph) => el("button", { type: "button", class: `ui-btn ui-btn--icon-sm ui-tabs__scroll ui-tabs__scroll--${side}`, tabindex: "-1", "aria-hidden": "true", "data-side": side }, icon(glyph));
  const arrows = list ? { start: arrow("start", "chevron-left"), end: arrow("end", "chevron-right") } : null;
  let rtl = false;
  let more = null;
  let tween = 0;

  /* Позиция прокрутки от начала строки: в RTL scrollLeft идёт от нуля в минус. */
  const position = () => (rtl ? -list.scrollLeft : list.scrollLeft);
  const limit = () => Math.max(0, list.scrollWidth - list.clientWidth);

  function edges() {
    const at = position();
    const max = limit();
    return { start: at > 1, end: at < max - 1 };
  }

  function mark(next) {
    if (more && next.start === more.start && next.end === more.end) return;
    list.classList.toggle(MORE_START, next.start);
    list.classList.toggle(MORE_END, next.end);
    more = next;
  }
  const remark = frame(() => mark(edges()));

  function stop() {
    if (tween) cancelAnimationFrame(tween);
    tween = 0;
  }

  /* Свой ход вместо behavior: "smooth": у браузера длительность растёт с
     расстоянием, у кита — токен. Кривая — ease-out, как у --ui-ease. */
  function scrollTo(target, animate) {
    stop();
    const from = position();
    const to = clamp(target, 0, limit());
    const set = (value) => (list.scrollLeft = rtl ? -value : value);
    const duration = animate && !reducedMotion() ? readMs(list, "--ui-duration-turn", 200) : 0;
    if (!duration || Math.abs(to - from) < 1) {
      set(to);
      return;
    }
    const begin = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - begin) / duration);
      set(from + (to - from) * (1 - (1 - t) ** 4));
      tween = t < 1 ? requestAnimationFrame(step) : 0;
    };
    tween = requestAnimationFrame(step);
  }

  /* Коробки вкладок от начала строки в координатах содержимого и зоны, которые
     закрывают стрелки (с зазором ленты). Одно чтение на действие. */
  function layout() {
    const listRect = list.getBoundingClientRect();
    const at = position();
    const from = (rect) => (rtl ? listRect.right - rect.right : rect.left - listRect.left);
    const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
    const startRect = arrows.start.getBoundingClientRect();
    const endRect = arrows.end.getBoundingClientRect();
    return {
      at,
      view: list.clientWidth,
      max: limit(),
      cover: {
        start: from(startRect) + startRect.width + gap,
        end: list.clientWidth - from(endRect) + gap,
      },
      tabs: triggers.map((trigger) => {
        const rect = trigger.getBoundingClientRect();
        const start = from(rect) + at;
        return { start, end: start + rect.width };
      }),
    };
  }

  /* Вкладка из-за края встаёт к противоположному краю, за ней — сколько влезет.
     Вкладка шире окна листается к своему краю. */
  function page(side) {
    const { at, view, cover, tabs, max } = layout();
    if (side === "end") {
      const edge = at + view - (at < max - 1 ? cover.end : 0);
      const next = tabs.find((tab) => tab.end > edge + 0.5);
      if (!next) return scrollTo(max, true);
      let target = next.start - cover.start;
      if (target <= at + 0.5) target = next.end - view + cover.end;
      return scrollTo(target, true);
    }
    const edge = at + (at > 1 ? cover.start : 0);
    const prev = tabs.findLast((tab) => tab.start < edge - 0.5);
    if (!prev) return scrollTo(0, true);
    let target = prev.end - view + cover.end;
    if (target >= at - 0.5) target = prev.start - cover.start;
    return scrollTo(target, true);
  }

  /* Вкладка целиком в кадре и не под стрелкой; уже видна — прокрутки нет. */
  function reveal(index, animate) {
    if (!list || limit() < 1) return;
    const { at, view, cover, tabs, max } = layout();
    const tab = tabs[index];
    if (tab.start < at + (at > 1 ? cover.start : 0) - 0.5) scrollTo(tab.start - cover.start, animate);
    else if (tab.end > at + view - (at < max - 1 ? cover.end : 0) + 0.5) scrollTo(tab.end - view + cover.end, animate);
  }

  if (list) {
    list.prepend(indicator);
    list.prepend(arrows.start);
    list.append(arrows.end);
    ctx.on(list, "scroll", remark, { passive: true });
    /* Колесо и палец перехватывают ход стрелки, а не борются с ним. */
    ctx.on(list, "wheel", stop, { passive: true });
    ctx.on(list, "touchstart", stop, { passive: true });
    for (const side of ["start", "end"]) {
      /* Щелчок по стрелке не уводит фокус с вкладки. */
      ctx.on(arrows[side], "mousedown", (event) => event.preventDefault());
      ctx.on(arrows[side], "click", () => page(side));
    }
    /* Трек и каждая вкладка: подросший шрифт, иконка или подпись сдвигают пилюлю.
       Первое измерение — первый колбэк наблюдателя, до первой отрисовки. Записи
       одной доставки приходят разом: меряем на первой, ставим на первой. */
    let first = true;
    const watcher = {
      read() {
        if (box) return;
        rtl = isRtl(list);
        box = measure();
        mark(edges());
      },
      write() {
        if (!box) return;
        place(box, false);
        box = null;
        /* Открыли на вкладке за краем (раздел из адреса) — сразу к ней. */
        if (first) reveal(selected, false);
        first = false;
      },
    };
    for (const target of [list, ...triggers]) ctx.cleanup(observeSize(target, watcher));
  }

  /* --- выбор ---------------------------------------------------------------- */

  /* Положение вкладки от выбора не зависит (выбор меняет только цвет): меряем до
     записей, без вынужденной раскладки. Вкладку в длинном треке подводим в кадр —
     фокус ставится без прокрутки. */
  function select(index) {
    if (index === selected || !pairs[index] || skip(index)) return;
    const { trigger } = pairs[index];
    selected = index;
    const next = list ? measure() : null;
    if (next) reveal(index, true);
    sync();
    if (next) place(next, true);
    ctx.emit("tabs:change", { index, trigger, panel: pairs[index].panel });
  }

  const indexOf = (target) => pairs.findIndex(({ trigger }) => trigger === target.closest?.(TRIGGER));

  /* Фокус — и на щелчок: Safari кнопку щелчком не фокусирует, а стрелки дальше
     должны работать от выбранной вкладки. */
  ctx.on(host, "click", (event) => {
    const at = indexOf(event.target);
    if (at < 0 || skip(at)) return;
    select(at);
    focus(pairs[at].trigger);
  });

  ctx.on(host, "keydown", (event) => {
    const at = indexOf(event.target);
    if (at < 0) return;
    const rtl = (event.key === "ArrowLeft" || event.key === "ArrowRight") && isRtl(list ?? host);
    const next = moveIndex(event, at, pairs.length, { orientation: "horizontal", loop: true, rtl, skip });
    if (next === null) return;
    event.preventDefault();
    select(next);
    focus(pairs[next].trigger);
  });

  sync();

  return {
    host,
    get selected() {
      return selected;
    },
    select,
    destroy() {
      animateNext.cancel();
      /* Пилюлю, стрелки, их классы и свойства ставил модуль: авторских значений у них нет. */
      if (list) {
        stop();
        remark.cancel();
        indicator.remove();
        arrows.start.remove();
        arrows.end.remove();
        list.classList.remove(READY, ANIMATED, MORE_START, MORE_END);
        setVar(list, "--ui-tabs-ind-x", null);
        setVar(list, "--ui-tabs-ind-w", null);
        dropEmpty(list, "style");
      }
      for (const [node, attrs] of saved) restore(node, attrs);
    },
  };
}

export default defineComponent({
  name: "tabs",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    select: (host, index) => void get(host)?.select(index),
  }),
});
