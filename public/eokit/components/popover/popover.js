/* Поповер: панель у триггера — меню действий, подменю, небольшая форма.

     <div class="ui-popover" data-ui-popover data-side="bottom" data-align="start">
       <button type="button" class="ui-btn" data-popover-trigger>Открыть</button>
       <div data-popover-panel hidden>…</div>
     </div>

   data-side (top | bottom | left | right) и data-align (start | center | end) —
   желаемое место; не влезает — панель переворачивается. У подменю left и right —
   по ходу текста: в RTL right открывает его налево, туда же, куда ведёт стрелка.
   data-open="hover" — подменю по наведению. data-anchor="host" — панель встаёт от
   всего хоста, а не от кнопки; другое значение — селектор предка хоста (меню шапки
   таблицы встаёт от ячейки, data-anchor="th"). Ширину якоря панель получает в
   --ui-popover-anchor-w: по ней панель можно сделать не уже якоря. data-size="sm" — плотное меню, data-variant=
   "secondary" — серая панель; подменю наследуют и то и другое.

   Открытая панель уходит в body (в окне — в его слой [data-ui-layer]): её не режут
   overflow и content-visibility предков. Закрытая возвращается на место.

   Пункт с data-pick: нажатие шлёт menu:pick на триггер своего меню (detail: value,
   item, checked) и закрывает всю цепочку меню, если у пункта нет data-keep;
   menuitemcheckbox переключает aria-checked, menuitemradio отмечает себя и
   снимает отметку с соседей по группе.

   Ветка меню — пункт, стрелка и вложенный список (дерево разделов в выборе):

     <div class="ui-popover__fold">
       <button class="ui-btn" role="menuitemradio" data-pick="bikes">…</button>
       <button class="ui-popover__fold-toggle" type="button" aria-expanded="false" aria-label="Подразделы">
         <span class="ui-icon" data-ui-icon="chevron-down"></span>
       </button>
       <div class="ui-popover__fold-list">…пункты и ветки…</div>
     </div>

   Стрелка раскрывает список, не выбирая пункт и не закрывая меню; пункт ветки
   без data-pick раскрывает её и сам (выбор самого раздела — пунктом в списке); в обход
   стрелками её нет: → на пункте ветки раскрывает её, ← сворачивает или ведёт
   к пункту родителя. Свёрнутый список — inert, его пункты стрелки пропускают. Триггер подменю стоит в панели корня,
   а она унесена в body: выбор в подменю до хоста корня не всплывает — его слушают
   на document.

   Клавиатура: Enter, пробел или ↓ на триггере открывают меню с фокусом на первом
   пункте; ↑ ↓ Home End ходят по пунктам, → открывает подменю, ← и Esc закрывают
   его, Tab закрывает меню и идёт дальше от триггера. Панель без меню (карточка с
   полями) открывается с фокусом на первом поле и читается как продолжение
   триггера: Tab с триггера ведёт в неё, Shift+Tab с первого поля — обратно на
   триггер, Tab с последнего закрывает её и идёт дальше от триггера.

   kit("popover").open(host) / close(host) / toggle(host) / isOpen(host); на хосте —
   popover:open и popover:close. */

import { defineComponent } from "../../core/component.js";
import { emit, ensureId, isRtl, ownPart, restore, setAttr, setVar, snapshot } from "../../core/dom.js";
import { autoUpdate, alignOf, place, sideOf } from "../../core/floating.js";
import { focus, focusInitial, tabbables } from "../../core/focus.js";
import { moveIndex } from "../../core/keys.js";
import { openLayer, portal } from "../../core/layer.js";
import { presence } from "../../core/presence.js";

const SELECTOR = "[data-ui-popover]";
const TRIGGER = "[data-popover-trigger]";
const PANEL = "[data-popover-panel]";
const PANEL_CLASS = "ui-popover__panel";
/* Пункты меню, по которым ходят стрелки. */
const ITEM = ".ui-popover__menu :is(button, a[href], [role^='menuitem']):not(.ui-popover__fold-toggle)";
const FOLD = ".ui-popover__fold";
const FOLD_TOGGLE = ".ui-popover__fold-toggle";
const TEXT_INPUT = "input:not([type='checkbox'], [type='radio'], [type='button']), textarea";
/* Подменю по наведению открывается сразу (пауза читалась залипанием), а закрывается
   с форой: курсор успевает перейти с пункта на отдельно висящую панель. */
const HOVER_GRACE = 200;
/* Подменю в RTL открывается в зеркальную сторону. */
const MIRROR = { left: "right", right: "left" };

const TRIGGER_ATTRS = ["aria-controls", "aria-expanded", "aria-haspopup"];
/* id панели остаётся и после снятия: по нему панель находят aria-controls и тесты. */
const PANEL_ATTRS = ["class", "tabindex", "hidden", "data-size", "data-variant", "data-state", "data-side", "data-align", "data-nested", "style"];

function create(host, ctx) {
  const trigger = ownPart(host, TRIGGER, SELECTOR);
  const panel = ownPart(host, PANEL, SELECTOR);
  if (!trigger || !panel) return null;

  const saved = { host: host.classList.contains("ui-popover"), trigger: snapshot(trigger, TRIGGER_ATTRS), panel: snapshot(panel, PANEL_ATTRS) };
  const hover = host.dataset.open === "hover";
  const nested = !!host.parentElement?.closest(`${PANEL}, .${PANEL_CLASS}`);
  const life = presence(panel);
  let layer = null;
  let home = null;
  let stopAuto = null;
  let inset = 0;
  let rtl = false;
  let hoverTimer = 0;
  let pointer = "";

  host.classList.add("ui-popover");
  panel.classList.add(PANEL_CLASS);
  ensureId(panel, "ui-popover-panel");
  if (!panel.hasAttribute("tabindex")) panel.tabIndex = -1;
  /* Размер — на панель: в body правило «хост → панель» не дотянется. Свой data-size
     важнее родительского. */
  const size = host.closest(`${SELECTOR}[data-size]`)?.dataset.size ?? host.closest(`.${PANEL_CLASS}[data-size]`)?.dataset.size;
  if (size) panel.dataset.size = size;
  const variant = host.closest(`${SELECTOR}[data-variant]`)?.dataset.variant ?? host.closest(`.${PANEL_CLASS}[data-variant]`)?.dataset.variant;
  if (variant) panel.dataset.variant = variant;
  if (nested) panel.dataset.nested = "";
  panel.hidden = true;
  panel.dataset.state = "";
  trigger.setAttribute("aria-controls", panel.id);
  setAttr(trigger, "aria-expanded", "false");
  /* Кнопка меню объявляет, что откроет меню (APG Menu Button); значение автора
     важнее. Роль карточки (dialog) автор ставит сам — вместе с ролью панели. */
  if (!trigger.hasAttribute("aria-haspopup") && (panel.matches("[role='menu']") || panel.querySelector("[role='menu']")?.closest(PANEL) === panel)) {
    trigger.setAttribute("aria-haspopup", "menu");
  }

  const anchor = () => {
    const value = host.dataset.anchor;
    return value === "host" ? host : (value && host.parentElement?.closest(value)) || trigger;
  };
  /* width — ширина якоря, если её уже прочли до записей (открытие). */
  const position = (width) => {
    const side = sideOf(host.dataset.side);
    const target = anchor();
    setVar(panel, "--ui-popover-anchor-w", `${width ?? target.offsetWidth}px`);
    place(panel, target, { side: nested && rtl ? (MIRROR[side] ?? side) : side, align: alignOf(host.dataset.align), inset, rtl });
  };

  const items = () =>
    [...panel.querySelectorAll(ITEM)].filter(
      (item) => item.closest(PANEL) === panel && !item.matches(":disabled, [aria-disabled='true']") && !item.closest("[inert]") && item.checkVisibility(),
    );

  /* Ветки меню: список за стрелкой, свёрнутый — inert. Стрелка вне табуляции. */
  const folds = [...panel.querySelectorAll(FOLD_TOGGLE)].filter((toggle) => toggle.closest(PANEL) === panel);
  const listOf = (toggle) => toggle.parentElement.querySelector(":scope > .ui-popover__fold-list");
  const savedFolds = folds.map((toggle) => [toggle, listOf(toggle), snapshot(toggle, ["tabindex", "aria-controls", "aria-expanded"]), listOf(toggle) && snapshot(listOf(toggle), ["inert"])]);
  function setFold(toggle, open) {
    const list = listOf(toggle);
    if (!list) return;
    setAttr(toggle, "aria-expanded", String(open));
    if (!open && list.contains(document.activeElement)) focus(toggle.parentElement.querySelector(":scope > .ui-btn"));
    setAttr(list, "inert", !open);
  }
  for (const toggle of folds) {
    setAttr(toggle, "tabindex", "-1");
    const list = listOf(toggle);
    if (list) setAttr(toggle, "aria-controls", ensureId(list, "ui-popover-fold"));
    setFold(toggle, toggle.getAttribute("aria-expanded") === "true");
  }
  /* Ветка, головой которой служит пункт, и ветка, в списке которой он стоит. */
  const headOf = (item) => {
    const fold = item.parentElement;
    return fold?.matches(FOLD) && fold.querySelector(":scope > .ui-btn") === item ? fold.querySelector(`:scope > ${FOLD_TOGGLE}`) : null;
  };
  const upOf = (item) => item.parentElement?.closest(".ui-popover__fold-list")?.parentElement;

  function open({ focus: keyboard = false } = {}) {
    clearTimeout(hoverTimer);
    if (layer) return;
    /* Чтения — до первой записи: иначе каждое заставило бы пересчёт. */
    rtl = isRtl(trigger);
    const width = anchor().offsetWidth;
    /* Уход ещё играет — панель так и стоит в body: отменяем уход без переноса. */
    home ??= portal(panel, trigger);
    layer = openLayer({
      elements: () => [host, panel],
      trigger,
      exclusive: true,
      popover: instance,
      /* Esc и соседняя ветка (курсор перешёл на другое подменю) возвращают фокус
         на триггер, если он был в панели; нажатие и фокус снаружи уводят его сами. */
      onDismiss(reason) {
        close({ restoreFocus: reason === "escape" || reason === "sibling" });
      },
    });
    panel.hidden = false;
    /* Первый пункт подменю — вровень с триггером: минус рамка и отступ панели. */
    if (nested) inset = panel.clientTop + (parseFloat(getComputedStyle(panel).paddingTop) || 0);
    position(width);
    life.show();
    stopAuto = autoUpdate(anchor(), panel, position, { onDetach: () => close() });
    setAttr(trigger, "aria-expanded", "true");
    ctx.emit("popover:open");
    /* С клавиатуры фокус уходит в панель — она в конце документа, Tab туда не
       дойдёт: на первый пункт меню или первое поле карточки. Мышью фокус остаётся
       на кнопке. */
    if (keyboard) focus(items()[0]) || focusInitial(panel, { keyboard: true });
  }

  function close({ restoreFocus = false } = {}) {
    clearTimeout(hoverTimer);
    if (!layer) return;
    const current = layer;
    const inside = current.contains(document.activeElement);
    layer = null;
    current.close();
    stopAuto?.();
    stopAuto = null;
    setAttr(trigger, "aria-expanded", "false");
    life.hide().then((done) => {
      if (!done) return;
      home?.();
      home = null;
    });
    ctx.emit("popover:close");
    if (restoreFocus && inside) focus(trigger);
  }

  const toggle = (options) => (layer ? close({ restoreFocus: true }) : open(options));

  /* Корень цепочки меню: поповер, выше которого поповеров нет. */
  function closeChain() {
    let root = instance;
    for (let up = layer?.parent; up?.options.popover; up = up.parent) root = up.options.popover;
    root.close({ restoreFocus: true });
  }

  /* Карточка в конце body читается как продолжение триггера, как календарь:
     Shift+Tab с первого поля — на триггер (панель остаётся), Tab с последнего
     закрывает её, и браузер ведёт фокус дальше от триггера. Фокус встаёт на
     триггер до закрытия: его подсказка видит открытую панель и не мигает. */
  function tabOut(event) {
    const fields = tabbables(panel);
    const out = event.shiftKey ? event.target === panel || event.target === fields[0] : event.target === (fields.at(-1) ?? panel);
    if (!out) return;
    if (event.shiftKey) event.preventDefault();
    focus(trigger);
    if (!event.shiftKey) close();
  }

  /* Мышь открывает на нажатии, как нативное меню; палец и перо — на click (иначе
     касание для прокрутки открыло бы меню); клавиатура — click с detail 0. */
  ctx.on(trigger, "pointerdown", (event) => {
    pointer = event.pointerType;
    if (pointer !== "mouse" || event.button !== 0 || event.ctrlKey) return;
    if (hover) open();
    else toggle();
  });
  ctx.on(trigger, "click", (event) => {
    if (event.detail !== 0 && pointer === "mouse") return;
    const keyboard = event.detail === 0;
    if (!hover) toggle({ focus: keyboard });
    else if (!layer) open({ focus: keyboard });
    else if (keyboard) focus(items()[0]);
  });
  ctx.on(trigger, "keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    /* Tab с триггера открытой карточки — в неё: панель в конце body, браузер увёл
       бы фокус на следующий контрол страницы. Меню Tab закрывает (APG). */
    if (event.key === "Tab") {
      if (layer && !event.shiftKey && !items().length && focus(tabbables(panel)[0])) event.preventDefault();
      return;
    }
    const into = !nested ? "ArrowDown" : (layer ? rtl : isRtl(trigger)) ? "ArrowLeft" : "ArrowRight";
    if (event.key !== into) return;
    event.preventDefault();
    event.stopPropagation();
    if (layer) focus(items()[0]);
    else open({ focus: true });
  });

  ctx.on(panel, "keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = items();
    if (event.key === "Tab") {
      /* Меню — не форма: Tab закрывает его, и фокус идёт дальше от триггера. */
      if (list.length) closeChain();
      else tabOut(event);
      return;
    }
    /* Ветки: → раскрывает, ← сворачивает или ведёт к родителю (в RTL наоборот). */
    const item = event.target.closest?.(ITEM);
    if (item && folds.length && (event.key === "ArrowRight" || event.key === "ArrowLeft") && !event.target.matches(TEXT_INPUT)) {
      const forward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
      const head = headOf(item);
      const isOpen = head?.getAttribute("aria-expanded") === "true";
      const up = upOf(item);
      if (forward && head) {
        event.preventDefault();
        if (!isOpen) setFold(head, true);
        else focus(items().find((other) => listOf(head).contains(other)));
        return;
      }
      if (!forward && (isOpen || up)) {
        event.preventDefault();
        if (isOpen) setFold(head, false);
        else focus(up.querySelector(":scope > .ui-btn"));
        return;
      }
    }
    /* rtl прочитан при открытии. */
    if (nested && event.key === (rtl ? "ArrowRight" : "ArrowLeft") && !event.target.matches(TEXT_INPUT)) {
      event.preventDefault();
      close({ restoreFocus: true });
      return;
    }
    if (!list.length) return;
    const typing = event.target.matches(TEXT_INPUT);
    if (typing && (event.key === "Home" || event.key === "End")) return;
    const at = list.indexOf(document.activeElement);
    let next;
    if (at === -1 && (event.key === "ArrowDown" || event.key === "ArrowUp")) next = event.key === "ArrowDown" ? 0 : list.length - 1;
    else next = moveIndex(event, at, list.length, { loop: true });
    if (next === null) return;
    event.preventDefault();
    focus(list[next]);
  });

  ctx.on(panel, "click", (event) => {
    /* Стрелка ветки или пункт ветки без data-pick (сам не выбирается) — раскрыть. */
    const head = event.target.closest(".ui-popover__fold > .ui-btn:not([data-pick])");
    const toggle = event.target.closest(FOLD_TOGGLE) ?? (head && headOf(head));
    if (toggle && folds.includes(toggle)) {
      setFold(toggle, toggle.getAttribute("aria-expanded") !== "true");
      return;
    }
    const item = event.target.closest("[data-pick]");
    if (!item || item.closest(PANEL) !== panel || item.matches(TRIGGER)) return;
    const role = item.getAttribute("role");
    if (role === "menuitemcheckbox") item.setAttribute("aria-checked", String(item.getAttribute("aria-checked") !== "true"));
    /* Вариант отмечен один на группу ([role=group]) или, без групп, на меню. */
    if (role === "menuitemradio") {
      const group = item.closest("[role='group'], [role='menu'], .ui-popover__menu");
      for (const other of group.querySelectorAll("[role='menuitemradio']")) setAttr(other, "aria-checked", String(other === item));
    }
    if (!item.hasAttribute("data-keep")) closeChain();
    emit(trigger, "menu:pick", { value: item.dataset.pick, item, checked: item.getAttribute("aria-checked") === "true" });
  });

  if (hover) {
    /* Уход с хоста запускает закрытие с форой, вход в панель его отменяет. Касание
       не наводит: поднятый палец «уходит» с панели, и подменю закрылось бы само
       через миг после отметки пункта data-keep. Фокус из закрытого подменю — на
       его триггер, а не в body. */
    const leave = (event) => {
      if (event.pointerType === "touch") return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => close({ restoreFocus: true }), HOVER_GRACE);
    };
    ctx.on(host, "pointerenter", (event) => event.pointerType !== "touch" && open());
    ctx.on(host, "pointerleave", leave);
    ctx.on(panel, "pointerenter", () => clearTimeout(hoverTimer));
    ctx.on(panel, "pointerleave", leave);
  }

  const instance = {
    host,
    trigger,
    panel,
    get isOpen() {
      return !!layer;
    },
    open,
    close,
    toggle,
    destroy() {
      close();
      life.settle();
      home?.();
      home = null;
      if (!saved.host) host.classList.remove("ui-popover");
      restore(trigger, saved.trigger);
      restore(panel, saved.panel);
      for (const [toggle, list, attrs, listAttrs] of savedFolds) {
        restore(toggle, attrs);
        if (list) restore(list, listAttrs);
      }
    },
  };
  return instance;
}

export default defineComponent({
  name: "popover",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    open: (host, options) => void get(host)?.open(options),
    close: (host) => void get(host)?.close(),
    toggle: (host, options) => void get(host)?.toggle(options),
    isOpen: (host) => !!get(host)?.isOpen,
  }),
});
