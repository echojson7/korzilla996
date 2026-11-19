/* Сортируемый список и дерево. Автор пишет пункты; модуль ставит ручку, раскрытие
   ветки, меню «выше, ниже» и перенос указателем и клавиатурой. Без модуля разметка —
   обычный список.

     <ol class="ui-sortable" data-ui-sortable aria-label="Приоритет задач">
       <li data-ui-sortable-item data-value="checkout">
         <span data-ui-sortable-label>Оформление заказа</span>
         <span class="ui-sortable__meta">Высокий</span>
       </li>
     </ol>

     <nav class="ui-sortable ui-sortable--tree" data-ui-sortable data-mode="tree" data-max-depth="3">
       <ul data-ui-sortable-list>…</ul>
     </nav>

   data-group связывает списки одного вида: пункт переносят между ними.
   data-drag="item" на корне — пункт берут за всю строку, как карточку канбана
   (мышью и пером; касание по строке прокручивает, берут за ручку); ручка
   остаётся для клавиатуры и видна при фокусе.
   data-ui-sortable-disabled закрепляет пункт: его не берут, но вокруг и внутрь
   него переносить можно. data-collapsed — ветка свёрнута при старте. Своя ручка —
   [data-ui-sortable-handle] среди детей пункта.

   В дереве стрелка ветки стоит перед содержимым строки, сразу за ручкой, а щелчок
   по пустому месту строки ветки (не по ссылке, кнопке или полю) тоже раскрывает
   и сворачивает её.

   Подпись-кнопка (<button> или <a> с data-ui-sortable-label) ловит щелчок по всей
   строке: так выбирают пункт, чтобы открыть его свойства рядом. Ручка, раскрытие и
   другие кнопки строки остаются над ней. Выбранный пункт — aria-current="true"
   (ставит приложение). Подпись пункта для ручки и объявлений — data-label пункта,
   если подпись-кнопка несёт не только название (бейдж и счётчик).

   Указатель: исходный пункт прячется на месте (фокус и Esc остаются при ручке), по
   списку ходит пустой слот его высоты, за указателем — призрак строки. За край
   карточки (у группы — общей рамки её списков) призрак тянется с сопротивлением,
   не дальше --ui-sortable-overdrag; отпустили — пункт пружиной встаёт в слот. Слот
   открывается по переднему краю призрака и только по ходу движения; между списками
   встаёт в щель; глубину в дереве задаёт X с гистерезисом. Отпускание ставит пункт
   в слот, Esc и потеря указателя возвращают.

   Клавиатура: пробел или Enter на ручке берут пункт, стрелки, Home и End двигают,
   Enter ставит, Esc возвращает; Tab, уход фокуса и нажатие снаружи ставят. Щелчок
   по ручке открывает меню перемещения, ↓ уводит в него фокус.

   Перестановка — событие sortable:change на корне, куда пришёл пункт, и на корне,
   откуда ушёл (detail: root, item, value, input, from, to, order, sourceOrder):
   счётчик каждой колонки слушает свою. Раскрытие ветки — sortable:toggle (detail:
   root, item, value, open): приложение помнит свёрнутые ветки между отрисовками.
   kit("sortable").getOrder(host) — порядок, refresh(host) — подхватить добавленные
   пункты. */

import { defineComponent } from "../../core/component.js";
import { el, emit, isPress, isRtl, restore, setAttr, setText, snapshot } from "../../core/dom.js";
import { autoUpdate, place } from "../../core/floating.js";
import { focus } from "../../core/focus.js";
import { track } from "../../core/gesture.js";
import { icon } from "../../core/icons.js";
import { moveIndex } from "../../core/keys.js";
import { openLayer, portal } from "../../core/layer.js";
import { messages } from "../../core/locale.js";
import { flip, RUBBER, rubber, settled, slide } from "../../core/motion.js";
import { presence } from "../../core/presence.js";
import { frame } from "../../core/schedule.js";
import { readMs, readPx, readVar, reducedMotion } from "../../core/tokens.js";

const SELECTOR = "[data-ui-sortable]";
const ITEM = "[data-ui-sortable-item]";
const LIST = "[data-ui-sortable-list], ul, ol";
const HANDLE = "[data-ui-sortable-handle]";
const LABEL = "[data-ui-sortable-label]";
const TOGGLE = ".ui-sortable__toggle";
/* Порог жеста и смены направления, px. */
const SLOP = 5;
/* Запас в долях шага вложенности: новый уровень не дрожит на границе. */
const HYSTERESIS = 0.2;
/* Шаг автопрокрутки у кромки, px за кадр. */
const SCROLL_STEP = 18;
const ACTIONS = [["up", "arrow-up"], ["down", "arrow-down"], ["left", "arrow-left"], ["right", "arrow-right"]];
const LABELS = { list: { up: "up", down: "down", left: "prevList", right: "nextList" }, tree: { up: "up", down: "down", left: "outdent", right: "indent" } };
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Home: "home", End: "end" };

const t = messages("sortable", {
  ru: {
    list: "Сортируемый список",
    tree: "Сортируемое дерево",
    item: "элемент",
    handle: "Переместить: {label}",
    expand: "Раскрыть: {label}",
    collapse: "Скрыть: {label}",
    menu: "Изменить позицию: {label}",
    up: "Переместить выше",
    down: "Переместить ниже",
    prevList: "Переместить в предыдущий список",
    nextList: "Переместить в следующий список",
    outdent: "Уменьшить вложенность",
    indent: "Увеличить вложенность",
    position: "{label}: позиция {n}",
    picked: "{label} выбран. Стрелки перемещают, Enter подтверждает, Escape отменяет.",
    dragging: "{label} перемещается.",
    moved: "{label} перемещён.",
    cancelled: "Перемещение {label} отменено.",
  },
  en: {
    list: "Sortable list",
    tree: "Sortable tree",
    item: "item",
    handle: "Move: {label}",
    expand: "Expand: {label}",
    collapse: "Collapse: {label}",
    menu: "Change position: {label}",
    up: "Move up",
    down: "Move down",
    prevList: "Move to previous list",
    nextList: "Move to next list",
    outdent: "Decrease nesting",
    indent: "Increase nesting",
    position: "{label}: position {n}",
    picked: "{label} grabbed. Arrow keys move, Enter confirms, Escape cancels.",
    dragging: "Moving {label}.",
    moved: "{label} moved.",
    cancelled: "Move of {label} cancelled.",
  },
});

/* Корни, сессии и меню — одни на документ: перенос идёт между корнями группы. */
const records = new Set();
const byRoot = new WeakMap();
const itemMeta = new WeakMap();
const listMeta = new WeakMap();
const lives = new Map();
let drag = null;
let moving = null;
let menu = null;

/* --- разметка ---------------------------------------------------------------- */

const ownItems = (list) => (list ? [...list.children].filter((node) => node.matches(ITEM)) : []);
const childList = (item) => [...item.children].find((node) => node.matches(LIST) && !node.matches(SELECTOR)) ?? null;
const rootList = (root) => (root.matches(LIST) ? root : [...root.children].find((node) => node.matches(LIST)) ?? null);
const rootOf = (node) => node.closest(SELECTOR);
const recordOf = (node) => byRoot.get(rootOf(node)) ?? null;
const rowOf = (item) => itemMeta.get(item)?.row ?? item;
const handleOf = (item) => itemMeta.get(item)?.handle ?? null;
const valueOf = (item) => item.dataset.value || item.id || "";
const isDisabled = (item) => item.hasAttribute("data-ui-sortable-disabled");
const indexOf = (item) => ownItems(item.parentElement).indexOf(item);

/* Пункт, которому принадлежит список, — только в том же корне: вложенный
   сортируемый не видит пункты внешнего. */
function ownerOf(list) {
  const owner = list.parentElement?.closest(ITEM);
  return owner && rootOf(owner) === rootOf(list) ? owner : null;
}

function labelOf(item) {
  const label = [...rowOf(item).children].find((node) => node.matches(LABEL));
  return (item.dataset.label || label?.textContent || valueOf(item) || t("item")).trim();
}

function depthOf(list) {
  let depth = 1;
  for (let owner = ownerOf(list); owner; owner = ownerOf(owner.parentElement)) depth += 1;
  return depth;
}

function subtreeDepth(item) {
  const children = ownItems(childList(item));
  return children.length ? 1 + Math.max(...children.map(subtreeDepth)) : 1;
}

const order = (list, tree) => ownItems(list).map((item) => (tree ? { value: valueOf(item), children: order(childList(item), true) } : valueOf(item)));
const getOrder = (root) => order(rootList(root), byRoot.get(root)?.tree);

function position(item) {
  const list = item.parentElement;
  const owner = ownerOf(list);
  return { root: rootOf(item), list, next: item.nextSibling, index: indexOf(item), parent: owner ? valueOf(owner) : null };
}

/* Событие уходит обоим корням: счётчик каждой колонки слушает свою. */
function emitChange(item, from, input) {
  if (from.list === item.parentElement && from.index === indexOf(item)) return;
  const to = position(item);
  const detail = {
    root: to.root,
    item,
    value: valueOf(item),
    input,
    from: { root: from.root, parent: from.parent, index: from.index },
    to: { root: to.root, parent: to.parent, index: to.index },
    order: getOrder(to.root),
    sourceOrder: from.root !== to.root ? getOrder(from.root) : null,
  };
  emit(to.root, "sortable:change", detail);
  if (from.root !== to.root) emit(from.root, "sortable:change", detail);
}

/* Живая область — одна на слой (body или окно), а не на корень: внутри списка
   она была бы лишним пунктом. */
function liveFor(root) {
  const scope = root.closest("[data-ui-layer]") ?? document.body;
  let live = lives.get(scope);
  if (!live) {
    const node = el("div", { class: "ui-sortable__live ui-sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    scope.append(node);
    live = { node, scope, count: 0, text: "" };
    live.write = frame(() => setText(node, live.text));
    lives.set(scope, live);
  }
  live.count += 1;
  return live;
}

function releaseLive(live) {
  live.count -= 1;
  if (live.count) return;
  live.write.cancel();
  live.node.remove();
  lives.delete(live.scope);
}

/* Та же фраза подряд тоже должна прозвучать: сначала пусто, текст — кадром позже. */
function announce(root, text) {
  const live = byRoot.get(root)?.live;
  if (!live) return;
  live.node.textContent = "";
  live.text = text;
  live.write();
}

function prepareList(list) {
  if (!listMeta.has(list)) listMeta.set(list, { attrs: snapshot(list, ["class", "role", "inert"]), generated: false });
  list.classList.add("ui-sortable__list");
  setAttr(list, "role", "list");
}

/* Пункт со своим списком в дереве — is-branch: ветка раскрывается сеткой (CSS). */
function ensureChildList(item) {
  const list = el("ul", { data: { uiSortableList: "" } });
  item.append(list);
  prepareList(list);
  listMeta.get(list).generated = true;
  item.classList.add("is-branch");
  return list;
}

/* Строка: ручка первой, за ней раскрытие ветки, дальше содержимое автора. */
function prepareItem(item, record) {
  let meta = itemMeta.get(item);
  if (!meta) {
    const list = childList(item);
    const authored = [...item.children].find((node) => node.matches(HANDLE));
    const handle = authored ?? el("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--icon-xs", data: { uiSortableHandle: "" } }, icon("grip-vertical"));
    const content = [...item.childNodes].filter((node) => node !== list && node !== handle);
    const label = content.find((node) => node.nodeType === 1 && node.matches(LABEL));
    const row = el("div", { class: "ui-sortable__row" });
    meta = {
      attrs: snapshot(item, ["class", "role", "aria-disabled"]),
      row,
      handle,
      handleAttrs: authored ? snapshot(authored, ["class", "aria-label", "aria-haspopup", "aria-expanded", "disabled"]) : null,
      /* Ручка автора уходит в начало строки; при снятии — назад на своё место. */
      handleNext: authored?.nextSibling ?? null,
      label: label ?? null,
      labelAttrs: label ? snapshot(label, ["class"]) : null,
      toggle: record.tree ? el("button", { type: "button", class: "ui-sortable__toggle" }, icon("chevron-right")) : null,
    };
    itemMeta.set(item, meta);
    item.insertBefore(row, list);
    row.append(handle, ...(meta.toggle ? [meta.toggle] : []), ...content);
    handle.classList.add("ui-sortable__handle");
    label?.classList.add("ui-sortable__label");
    if (record.tree && ownItems(list).length && !item.hasAttribute("data-collapsed")) item.classList.add("is-open");
  }
  item.classList.add("ui-sortable__item");
  setAttr(item, "role", "listitem");
  setAttr(item, "aria-disabled", isDisabled(item) ? "true" : meta.attrs.get("aria-disabled"));
  setAttr(meta.handle, "aria-label", t("handle", { label: labelOf(item) }));
  setAttr(meta.handle, "aria-haspopup", "menu");
  setAttr(meta.handle, "aria-expanded", menu?.item === item ? "true" : "false");
  setAttr(meta.handle, "disabled", isDisabled(item));
}

function refresh(record) {
  const lists = [rootList(record.root)];
  prepareList(lists[0]);
  for (let at = 0; at < lists.length; at += 1) {
    for (const item of ownItems(lists[at])) {
      prepareItem(item, record);
      const list = record.tree && childList(item);
      item.classList.toggle("is-branch", !!list);
      if (!list) continue;
      prepareList(list);
      lists.push(list);
    }
  }
  normalize(record);
}

function paintToggle(item, branch, open) {
  const toggle = itemMeta.get(item)?.toggle;
  if (!toggle) return;
  if (toggle.hidden === branch) toggle.hidden = !branch;
  setAttr(toggle, "aria-expanded", branch ? String(open) : null);
  setAttr(toggle, "aria-label", t(open ? "collapse" : "expand", { label: labelOf(item) }));
}

/* Ветка открывается сеткой 0fr → 1fr (CSS); закрытый список недоступен целиком. */
function setBranch(item, open) {
  const list = childList(item);
  if (!list || (!ownItems(list).length && drag?.placeholder?.parentElement !== list)) return;
  item.classList.toggle("is-open", open);
  if (list.inert === open) list.inert = !open;
  paintToggle(item, true, open);
}

/* После перестановки: у листа нет стрелки, опустевший список, который модуль
   создал сам, уходит (кроме того, куда вернётся пункт при отмене с клавиатуры). */
function normalize(record) {
  if (!record?.tree) return;
  const lists = [rootList(record.root)];
  for (let at = 0; at < lists.length; at += 1) {
    for (const item of ownItems(lists[at])) {
      const list = childList(item);
      const branch = !!list && (ownItems(list).length > 0 || drag?.placeholder?.parentElement === list);
      const keep = moving?.from.list === list;
      if (list && !branch && !keep && listMeta.get(list)?.generated) {
        list.remove();
        item.classList.remove("is-open", "is-branch");
      } else if (list) {
        if (!branch && !keep) item.classList.remove("is-open");
        const shut = !(branch && item.classList.contains("is-open"));
        if (list.inert !== shut) list.inert = shut;
        if (branch) lists.push(list);
      }
      paintToggle(item, branch, branch && item.classList.contains("is-open"));
    }
  }
}

function cleanItem(item) {
  const meta = itemMeta.get(item);
  if (!meta) return;
  itemMeta.delete(item);
  if (meta.handleAttrs) restore(meta.handle, meta.handleAttrs);
  else meta.handle.remove();
  meta.toggle?.remove();
  if (meta.label) restore(meta.label, meta.labelAttrs);
  meta.row.replaceWith(...meta.row.childNodes);
  if (meta.handleAttrs) item.insertBefore(meta.handle, meta.handleNext?.parentNode === item ? meta.handleNext : null);
  restore(item, meta.attrs);
}

function cleanList(list) {
  const meta = listMeta.get(list);
  if (!meta) return;
  listMeta.delete(list);
  restore(list, meta.attrs);
  if (meta.generated) delete list.dataset.uiSortableList;
}

/* --- перестановка с анимацией ---------------------------------------------------- */

const motionOf = (styles) => ({ duration: readMs(styles, "--ui-sortable-dur", 200), easing: readVar(styles, "--ui-ease-out", "ease-out") });

/* Пункты корней, которые сдвигает перестановка; skip — переносимый с поддеревом. */
function itemsOf(roots, skip) {
  const out = [];
  for (const root of new Set(roots)) {
    for (const item of root.querySelectorAll(ITEM)) if (rootOf(item) === root && !skip?.contains(item)) out.push(item);
  }
  return out;
}

/* FLIP по offsetTop: раскладка без transform, поэтому прерванные сдвиги
   складываются (core/motion.js slide), а не прыгают. */
const shift = (roots, skip, mutate, motion) => flip(() => itemsOf(roots, skip), mutate, motion);

function groupOf(record) {
  if (!record.group) return [record];
  return [...records]
    .filter((other) => other.tree === record.tree && other.group === record.group && other.root.isConnected)
    .sort((a, b) => (a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

function canMove(item, action) {
  const record = recordOf(item);
  if (!record || isDisabled(item)) return false;
  const siblings = ownItems(item.parentElement);
  const index = siblings.indexOf(item);
  if (action === "up" || action === "home") return index > 0;
  if (action === "down" || action === "end") return index < siblings.length - 1;
  if (record.tree) {
    if (action === "left") return !!ownerOf(item.parentElement);
    return index > 0 && (!record.maxDepth || depthOf(item.parentElement) + subtreeDepth(item) <= record.maxDepth);
  }
  const group = groupOf(record);
  const at = group.indexOf(record);
  return action === "left" ? at > 0 : at < group.length - 1;
}

/* Шаг с клавиатуры или из меню. Соседи едут FLIP; пункт, сменивший список, —
   своим сдвигом по прямоугольникам до и после. */
function performAction(item, action) {
  if (!canMove(item, action)) return false;
  const record = recordOf(item);
  const list = item.parentElement;
  const siblings = ownItems(list);
  const index = siblings.indexOf(item);
  let target = list;
  let reference = null;
  if (action === "up") reference = siblings[index - 1];
  else if (action === "down") reference = siblings[index + 1].nextSibling;
  else if (action === "home") reference = siblings[0];
  else if (action === "end") reference = null;
  else if (record.tree && action === "right") target = childList(siblings[index - 1]) ?? ensureChildList(siblings[index - 1]);
  else if (record.tree) {
    const owner = ownerOf(list);
    target = owner.parentElement;
    reference = owner.nextSibling;
  } else {
    const group = groupOf(record);
    target = rootList(group[group.indexOf(record) + (action === "left" ? -1 : 1)].root);
  }
  const moved = target !== list;
  const roots = [record.root, rootOf(target)];
  const motion = motionOf(getComputedStyle(record.root));
  const before = moved && !reducedMotion() ? item.getBoundingClientRect() : null;
  shift(roots, moved ? item : null, () => {
    target.insertBefore(item, reference);
    if (record.tree && action === "right") siblings[index - 1].classList.add("is-open");
  }, motion);
  if (before) {
    const after = item.getBoundingClientRect();
    const keyframes = [{ transform: `translate3d(${before.left - after.left}px, ${before.top - after.top}px, 0)` }, { transform: "translate3d(0, 0, 0)" }];
    slide(item, keyframes, motion);
  }
  for (const root of new Set(roots)) normalize(byRoot.get(root));
  focus(handleOf(item));
  announce(rootOf(item), t("position", { label: labelOf(item), n: indexOf(item) + 1 }));
  return true;
}

/* --- клавиатура ------------------------------------------------------------------ */

function startSession(item) {
  if (moving) finish(true);
  const record = recordOf(item);
  moving = { item, from: position(item), rtl: record.tree && isRtl(record.root) };
  item.classList.add("is-keyboard-moving");
  openMenu(item);
  announce(record.root, t("picked", { label: labelOf(item) }));
}

/* Конец сессии: commit ставит пункт где он есть и шлёт событие, иначе — назад. */
function finish(commit, input = "keyboard") {
  const session = moving;
  if (!session) return;
  moving = null;
  const { item, from } = session;
  if (!commit && from.root.contains(from.list)) from.list.insertBefore(item, from.next?.parentNode === from.list ? from.next : null);
  else commit = true;
  for (const root of new Set([from.root, rootOf(item)])) normalize(byRoot.get(root));
  item.classList.remove("is-keyboard-moving");
  closeMenu();
  focus(handleOf(item));
  if (commit) {
    emitChange(item, from, input);
    announce(rootOf(item), t("moved", { label: labelOf(item) }));
  } else announce(from.root, t("cancelled", { label: labelOf(item) }));
}

/* --- меню перемещения: панель поповера у ручки, одна на документ ------------------ */

function syncMenu() {
  if (!menu) return;
  const { item, list, buttons } = menu;
  const record = recordOf(item);
  setAttr(list, "aria-label", t("menu", { label: labelOf(item) }));
  for (const button of buttons) {
    const action = button.dataset.uiSortableAction;
    const hide = (action === "left" || action === "right") && !record.tree && !record.group;
    setText(button.lastElementChild, t(LABELS[record.tree ? "tree" : "list"][action]));
    if (button.hidden !== hide) button.hidden = hide;
    setAttr(button, "disabled", !canMove(item, action));
  }
}

function openMenu(item) {
  if (menu?.item === item) return syncMenu();
  closeMenu();
  const handle = handleOf(item);
  const buttons = ACTIONS.map(([action, glyph]) => el("button", { type: "button", class: "ui-btn", role: "menuitem", data: { uiSortableAction: action } }, icon(glyph), el("span", { class: "ui-btn__label" })));
  const list = el("div", { class: "ui-popover__menu", role: "menu" }, ...buttons);
  const panel = el("div", { class: "ui-popover__panel ui-sortable-menu", tabindex: "-1" }, list);
  const session = {
    item,
    handle,
    panel,
    list,
    buttons,
    life: presence(panel),
    home: portal(panel, handle),
    position: () => place(panel, handle, { side: "bottom", align: "start" }),
  };
  menu = session;
  session.layer = openLayer({
    elements: () => [panel, handle],
    trigger: handle,
    exclusive: true,
    /* С клавиатуры Esc возвращает пункт, а нажатие и фокус снаружи ставят его. */
    onDismiss(reason) {
      if (moving?.item === item) finish(reason !== "escape");
      else closeMenu();
    },
  });
  syncMenu();
  session.position();
  session.life.show();
  session.stopAuto = autoUpdate(handle, panel, session.position, { onDetach: () => (moving?.item === item ? finish(true) : closeMenu()) });
  item.classList.add("is-actions-open");
  setAttr(handle, "aria-expanded", "true");
  panel.addEventListener("click", onMenuClick);
  panel.addEventListener("keydown", onMenuKey);
}

/* Фокус из уходящей панели — назад на ручку: дальше Tab идёт от неё. */
function closeMenu() {
  const session = menu;
  if (!session) return;
  menu = null;
  const inside = session.panel.contains(document.activeElement);
  session.layer.close();
  session.stopAuto();
  session.item.classList.remove("is-actions-open");
  setAttr(session.handle, "aria-expanded", "false");
  session.life.hide().then((done) => done && session.home());
  if (inside) focus(session.handle);
}

/* Снятие корня: меню уходит сразу, без анимации. Сессию снятие берёт до finish:
   та закрывает меню сама, уже с анимацией. */
function dropMenu(session = menu) {
  if (session && menu === session) closeMenu();
  session?.life.settle();
  session?.home();
}

/* Пункт стоит на месте, пока анимация не доиграла: меню догоняет его потом. */
function followItem(item) {
  syncMenu();
  settled(item).then(() => menu?.item === item && menu.position());
}

function onMenuClick(event) {
  const button = event.target.closest("[data-ui-sortable-action]");
  if (!button || button.disabled || !menu) return;
  const { item } = menu;
  const from = position(item);
  performAction(item, button.dataset.uiSortableAction);
  if (moving?.item === item) return finish(true, "controls");
  closeMenu();
  emitChange(item, from, "controls");
}

function onMenuKey(event) {
  if (!menu || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "Tab") return closeMenu();
  const items = menu.buttons.filter((button) => !button.hidden && !button.disabled);
  const at = items.indexOf(document.activeElement);
  const next = at === -1 && (event.key === "ArrowDown" || event.key === "ArrowUp") ? (event.key === "ArrowDown" ? 0 : items.length - 1) : moveIndex(event, at, items.length, { loop: true });
  if (next === null || !items[next]) return;
  event.preventDefault();
  focus(items[next]);
}

/* --- перенос указателем ------------------------------------------------------------ */

/* Глубина по X с гистерезисом: новый уровень берётся, когда указатель ушёл за
   середину шага с запасом, иначе остаётся текущий. */
function snapDepth(x, anchor, indent, current, rtl) {
  const offset = rtl ? anchor - x : x - anchor;
  const requested = Math.max(1, Math.round(offset / indent) + 1);
  const margin = indent * HYSTERESIS;
  if (requested > current) return offset > (current - 0.5) * indent + margin ? requested : current;
  if (requested < current) return offset < (current - 1.5) * indent - margin ? requested : current;
  return current;
}

/* Допустимые глубины слота: не мельче следующей строки, не глубже предыдущей +1,
   с поддеревом — в пределах data-max-depth. */
function depthRange(rows, index, maxDepth, size) {
  const previous = rows[index - 1];
  const next = rows[index];
  const min = next ? next.depth : 1;
  const max = Math.min(previous ? previous.depth + 1 : 1, maxDepth ? maxDepth - size + 1 : Infinity);
  return max >= min ? { min, max } : null;
}

function parentRow(rows, index, depth) {
  for (let at = index - 1; at >= 0; at -= 1) if (rows[at].depth === depth - 1) return at;
  return -1;
}

function ancestorAt(row, depth) {
  let item = row.item;
  for (let at = row.depth; item && at > depth; at -= 1) item = ownerOf(item.parentElement);
  return item;
}

/* Верх узла от края корня по цепочке offsetParent (корень и пункты — position:
   relative): раскладка без FLIP-сдвигов. */
function offsetIn(node, root) {
  let top = 0;
  for (let at = node; at && at !== root; at = at.offsetParent) top += at.offsetTop;
  return top;
}

/* Видимые строки корня без переносимого поддерева; кеш до следующей перестановки. */
function rowsOf(state, record) {
  if (state.rows?.record === record) return state.rows.list;
  const list = [];
  const visit = (parent, depth) => {
    for (const item of ownItems(parent)) {
      if (item === state.item) continue;
      const box = record.tree ? rowOf(item) : item;
      const top = offsetIn(box, record.root);
      list.push({ item, depth, top, bottom: top + box.offsetHeight });
      const sub = record.tree && item.classList.contains("is-open") && childList(item);
      if (sub) visit(sub, depth + 1);
    }
  };
  visit(rootList(record.root), 1);
  state.rows = { record, list };
  return list;
}

/* Направление — от точки разворота, а не от кадра: медленный ход вниз и медленный
   возврат тоже меняют слот. */
function noteTravel(state, y) {
  const delta = y - state.peak;
  if (delta * state.travel > 0) state.peak = y;
  else if (Math.abs(delta) >= SLOP) {
    state.travel = Math.sign(delta);
    state.peak = y;
  }
}

/* Слот в своём корне — шаг от текущего и только по ходу движения: нижний край
   призрака задел верх соседа — сосед поднимается, верхний задел низ — опускается.
   Вход в чужой корень — по перекрытию. */
function slotOf(state, record, rows, top) {
  const bottom = top + state.height;
  const { travel, placeholder } = state;
  if (rootOf(placeholder) === record.root) {
    const found = rows.findIndex((row) => placeholder.compareDocumentPosition(row.item) & Node.DOCUMENT_POSITION_FOLLOWING);
    let index = found === -1 ? rows.length : found;
    if (travel > 0) while (index < rows.length && bottom > rows[index].top + 1) index += 1;
    else if (travel < 0) while (index > 0 && top < rows[index - 1].bottom - 1) index -= 1;
    return index;
  }
  if (!travel) {
    const middle = (top + bottom) / 2;
    const at = rows.findIndex((row) => middle < row.bottom);
    return at === -1 ? rows.length : at;
  }
  if (travel < 0) {
    let index = rows.length;
    while (index > 0 && top < rows[index - 1].bottom - 1) index -= 1;
    return index;
  }
  let index = 0;
  while (index < rows.length && bottom > rows[index].top + 1) index += 1;
  return index;
}

/* Корень под указателем по прямоугольникам; вне всех — ближайший: пункт ходит за
   мышью по высоте, а не замирает. elementFromPoint — только когда корни перекрыты. */
function targetAt(boxes, x, y) {
  const under = boxes.filter(({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  if (under.length > 1) {
    const hit = document.elementFromPoint(x, y)?.closest(SELECTOR);
    return under.find(({ record }) => record.root === hit) ?? under[0];
  }
  if (under.length) return under[0];
  const gap = ({ rect }) => Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
  return boxes.reduce((best, box) => (!best || gap(box) < gap(best) ? box : best), null);
}

function nextItemOf(node, skip) {
  for (let at = node.nextElementSibling; at; at = at.nextElementSibling) if (at !== skip && at.matches(ITEM)) return at;
  return null;
}

/* Корень и ветка, в чьём списке стоит слот, — is-drop-target: в корне нет переходов
   (модуль меряет строки), ветка раскрыта, даже пустая и ещё без is-open (CSS). */
function markSlot(state) {
  const list = state.placeholder.isConnected ? state.placeholder.parentElement : null;
  const marks = list ? [rootOf(list), ownerOf(list)] : [null, null];
  state.marked.forEach((node, at) => {
    if (node === marks[at]) return;
    node?.classList.remove("is-drop-target");
    marks[at]?.classList.add("is-drop-target");
  });
  state.marked = marks;
}

function movePlaceholder(state, list, reference) {
  const { placeholder } = state;
  if (reference && reference.parentElement !== list) return;
  if (placeholder.parentElement === list && nextItemOf(placeholder, state.item) === reference) return;
  shift([rootOf(placeholder), rootOf(list)], state.item, () => {
    list.insertBefore(placeholder, reference);
    markSlot(state);
  }, state.motion);
  state.rows = null;
}

/* Ветки, раскрытые под слот: уходит слот — закрываются, кроме keep и его предков. */
function restoreOpened(state, keep) {
  for (const item of state.opened) {
    if (keep && item.contains(keep)) continue;
    state.opened.delete(item);
    setBranch(item, false);
    state.rows = null;
  }
}

function placeList(state, { record, rect }) {
  const rows = rowsOf(state, record);
  const top = state.y - state.grab.y - (rect.top + record.root.clientTop - record.root.scrollTop);
  const index = slotOf(state, record, rows, top);
  movePlaceholder(state, rootList(record.root), rows[index]?.item ?? null);
}

/* Недопустимое место (глубже data-max-depth) слот не двигает: отпускание ставит
   пункт в последний допустимый. */
function placeTree(state, { record, rect }, x) {
  const { root } = record;
  const rows = rowsOf(state, record);
  const top = state.y - state.grab.y - (rect.top + root.clientTop - root.scrollTop);
  const index = slotOf(state, record, rows, top);
  const box = rootList(root).getBoundingClientRect();
  const anchor = state.rtl ? box.right - state.grabX : box.left + state.grabX;
  const range = depthRange(rows, index, record.maxDepth, state.size);
  if (!range) return;
  const wanted = snapDepth(x, anchor, state.indent, state.depthRoot === root ? state.depth : 1, state.rtl);
  const depth = Math.max(range.min, Math.min(wanted, range.max));
  const parent = depth > 1 ? rows[parentRow(rows, index, depth)]?.item : null;
  if (depth > 1 && !parent) return;
  const next = rows[index];
  const reference = next && next.depth >= depth ? ancestorAt(next, depth) : null;
  restoreOpened(state, parent);
  if (parent && !parent.classList.contains("is-open")) {
    state.opened.add(parent);
    setBranch(parent, true);
    state.rows = null;
  }
  movePlaceholder(state, parent ? childList(parent) ?? ensureChildList(parent) : rootList(root), reference);
  state.parent = parent;
  state.depth = depth;
  state.depthRoot = root;
}

/* Ближе края прокрутки — шаг за кадр, тем больше, чем ближе. box — рамка
   прокрутки, прочитанная в начале кадра вместе с корнями. */
const edgeStep = (near, edge) => SCROLL_STEP * (1 - Math.max(0, near) / edge);
function autoScroll(state, box, scroller, axis) {
  const [at, from, to] = axis === "x" ? [state.x, box.left, box.right] : [state.y, box.top, box.bottom];
  const before = at - from;
  const after = to - at;
  const step = before < state.edge ? -edgeStep(before, state.edge) : after < state.edge ? edgeStep(after, state.edge) : 0;
  if (!step) return false;
  const target = scroller ?? document.scrollingElement;
  const key = axis === "x" ? "scrollLeft" : "scrollTop";
  const was = target[key];
  target.scrollBy({ [axis === "x" ? "left" : "top"]: step, behavior: "instant" });
  return target[key] !== was;
}

/* Ближайший прокручиваемый по оси узел: сам корень (колонка канбана со своей
   прокруткой) или предок. */
function scrollerOf(root, axis = "y") {
  for (let node = root; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    const fits = axis === "x" ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight;
    if (/(auto|scroll)/.test(axis === "x" ? style.overflowX : style.overflowY) && fits) return node;
  }
  return null;
}
/* Прокрутка по вертикали — у корня под указателем, кешируется на время переноса. */
function scrollerFor(state, record) {
  if (!state.scrollers.has(record)) state.scrollers.set(record, scrollerOf(record.root));
  return state.scrollers.get(record);
}

/* Призрак внутри рамки корней ходит за указателем, за ней — резиново (по каждой
   оси отдельно). Слот и глубина считаются по указателю, а не по призраку. */
function ghostAt(state, boxes) {
  let left = state.x - state.grab.x;
  let top = state.y - state.grab.y;
  if (!state.overdrag || !boxes.length) return [left, top];
  const edge = (at, from, to) => (to < from ? at : at < from ? from - rubber(from - at, state.overdrag, RUBBER) : at > to ? to + rubber(at - to, state.overdrag, RUBBER) : at);
  const rects = boxes.map(({ rect }) => rect);
  left = edge(left, Math.min(...rects.map((rect) => rect.left)), Math.max(...rects.map((rect) => rect.right)) - state.width);
  top = edge(top, Math.min(...rects.map((rect) => rect.top)), Math.max(...rects.map((rect) => rect.bottom)) - state.height);
  return [left, top];
}

/* Кадр переноса: сначала чтения (корни, строки), потом записи (слот, призрак). */
function step(state) {
  const { x, y } = state;
  noteTravel(state, y);
  const boxes = state.roots.filter((record) => record.root.isConnected).map((record) => ({ record, rect: record.root.getBoundingClientRect() }));
  const target = targetAt(boxes, x, y);
  const scroller = scrollerFor(state, target?.record ?? state.record);
  const edge = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: state.viewH };
  const sideEdge = state.sideScroller?.getBoundingClientRect();
  if (target) {
    /* Глубину задаёт x; за боковым краем — последний x внутри рамки, иначе пункт
       уходил бы на крайний уровень вложенности. */
    if (x >= target.rect.left && x <= target.rect.right) state.insideX = x;
    if (target.record.tree) placeTree(state, target, state.insideX ?? state.startX);
    else placeList(state, target);
  }
  const [left, top] = ghostAt(state, boxes);
  state.ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  const scrolledY = autoScroll(state, edge, scroller, "y");
  const scrolledX = sideEdge ? autoScroll(state, sideEdge, state.sideScroller, "x") : false;
  if (scrolledY || scrolledX) state.pump();
}

function ghostOf(item, width, count) {
  const ghost = rowOf(item).cloneNode(true);
  for (const node of [ghost, ...ghost.querySelectorAll("[id]")]) node.removeAttribute("id");
  ghost.querySelector(TOGGLE)?.remove();
  ghost.classList.add("ui-sortable__ghost");
  if (count) ghost.append(el("span", { class: "ui-sortable__ghost-count", "aria-hidden": "true", text: `+${count}` }));
  ghost.style.width = `${width}px`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  document.body.append(ghost);
  return ghost;
}

/* Жест начался: токены, корни группы и контейнер прокрутки читаются один раз. */
function begin(state) {
  const { record, item } = state;
  if (drag || byRoot.get(record.root) !== record || !item.isConnected) return state.track.cancel();
  drag = state;
  const box = rowOf(item).getBoundingClientRect();
  const styles = getComputedStyle(record.root);
  state.motion = motionOf(styles);
  state.edge = readPx(styles, "--ui-sortable-scroll-edge", 44);
  /* Резиновый край и пружина: при reduced motion призрак ходит свободно, пункт встаёт сразу. */
  const still = reducedMotion();
  state.overdrag = still ? 0 : readPx(styles, "--ui-sortable-overdrag", 32);
  state.spring = still ? null : { duration: readMs(styles, "--ui-sortable-spring", 200), easing: readVar(styles, "--ui-ease-spring", "ease-out") };
  state.indent = Math.max(1, readPx(styles, "--ui-sortable-indent", 24));
  state.rtl = styles.direction === "rtl";
  state.grab = { x: state.startX - box.left, y: state.startY - box.top };
  state.grabX = state.rtl ? box.right - state.startX : state.startX - box.left;
  state.height = box.height;
  state.width = box.width;
  state.size = record.tree ? subtreeDepth(item) : 1;
  state.depth = depthOf(item.parentElement);
  state.depthRoot = record.root;
  state.roots = [...records].filter((other) => other === record || (record.group && other.group === record.group && other.tree === record.tree));
  state.scrollers = new Map();
  /* По горизонтали — общий предок группы (доска канбана), если он прокручивается. */
  state.sideScroller = scrollerOf(record.root.parentElement, "x");
  state.viewH = document.documentElement.clientHeight;
  state.from = position(item);
  state.opened = new Set();
  state.parent = null;
  state.rows = null;
  state.marked = [null, null];
  state.placeholder = el(item.localName, { class: "ui-sortable__placeholder", "aria-hidden": "true", style: { height: `${item.offsetHeight}px` } });
  const count = record.tree ? [...item.querySelectorAll(ITEM)].filter((node) => rootOf(node) === record.root).length : 0;
  closeMenu();
  /* Слой на время переноса — верхний в стеке: Esc отменяет перенос, а не закрывает
     окно или поповер со списком. Ушёл родитель — перенос тоже отменён. */
  state.layer = openLayer({ elements: () => [state.ghost], trigger: handleOf(item), outside: false, focus: false, onDismiss: () => state.track.cancel() });
  item.before(state.placeholder);
  markSlot(state);
  item.classList.add("is-dragging-source");
  record.root.classList.add("is-dragging");
  state.ghost = ghostOf(item, box.width, count);
  state.ghost.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
  state.pump = frame(() => step(state));
  state.stop = new AbortController();
  window.addEventListener("scroll", () => state.pump(), { capture: true, passive: true, signal: state.stop.signal });
  announce(record.root, t("dragging", { label: labelOf(item) }));
}

function move(state, x, y) {
  if (drag !== state) return;
  state.x = x;
  state.y = y;
  state.pump.cancel();
  step(state);
}

/* Отпустили — пункт встаёт в слот одним переносом; отмена — слот уходит, пункт
   и не покидал своего места. */
function end(state, completed) {
  if (drag !== state) return;
  drag = null;
  state.layer.close();
  state.stop.abort();
  state.pump.cancel();
  const { item, placeholder, record } = state;
  const from = state.spring && state.ghost.getBoundingClientRect();
  const preview = rootOf(placeholder);
  const commit = completed && placeholder.isConnected;
  if (commit) placeholder.replaceWith(item);
  else placeholder.remove();
  markSlot(state);
  /* Отменённый Esc перенос: отпускание над ручкой — не щелчок, меню не открывается. */
  if (!completed) record.mute = item;
  restoreOpened(state, commit ? state.parent : null);
  if (commit && state.parent) setBranch(state.parent, true);
  item.classList.remove("is-dragging-source");
  record.root.classList.remove("is-dragging");
  for (const root of new Set([state.from.root, preview, rootOf(item)])) normalize(byRoot.get(root));
  if (from) settle(state, from);
  state.ghost.remove();
  focus(handleOf(item));
  if (commit) {
    emitChange(item, state.from, "pointer");
    announce(rootOf(item), t("moved", { label: labelOf(item) }));
  } else announce(state.from.root, t("cancelled", { label: labelOf(item) }));
}

/* Пункт прилетает с места призрака: сдвиг — пружиной, тень и подложка призрака
   гаснут по ease-out. is-settling поднимает пункт над соседями на время полёта. */
function settle(state, from) {
  const { item } = state;
  const row = rowOf(item);
  const to = row.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  const look = getComputedStyle(state.ghost);
  item.classList.add("is-settling");
  slide(item, [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], state.spring);
  row.animate([{ backgroundColor: look.backgroundColor, boxShadow: look.boxShadow }, { backgroundColor: "transparent", boxShadow: "none" }], { duration: state.spring.duration, easing: state.motion.easing });
  settled(item, row).then(() => item.classList.remove("is-settling"));
}

/* --- корень ---------------------------------------------------------------------- */

/* Раскрытие: мышь и палец — на нажатии, клавиатура — click с detail 0. */
function onToggle(event, root) {
  const toggle = event.target.closest?.(TOGGLE);
  const item = toggle?.closest(ITEM);
  if (!item || rootOf(item) !== root || !isPress(event)) return false;
  event.preventDefault();
  flipBranch(item, root);
  return true;
}

function flipBranch(item, root) {
  const open = !item.classList.contains("is-open");
  setBranch(item, open);
  if (item.classList.contains("is-open") === open) emit(root, "sortable:toggle", { root, item, value: valueOf(item), open });
}

/* Щелчок по пустому месту строки ветки. Каждый щелчок считается, в том числе
   быстрый второй (detail 2): иначе «открыл и сразу закрыл» терял щелчок. Клавиатура
   (detail 0) раскрывает стрелкой. */
const ACTIVE = "a, button, input, select, textarea, label, [contenteditable], .ui-popover";
function onRowToggle(event, root) {
  if (event.detail < 1 || event.button !== 0) return false;
  const row = event.target.closest?.(".ui-sortable__row");
  const item = row?.parentElement;
  if (!item?.classList.contains("is-branch") || rootOf(item) !== root || itemMeta.get(item)?.row !== row) return false;
  const hit = event.target.closest(ACTIVE);
  if (hit && row.contains(hit)) return false;
  flipBranch(item, root);
  return true;
}

/* Пункт под указателем у корня с data-drag="item": строка своего пункта, не
   ручка и не кнопка, поле или ссылка строки (подпись-кнопка — можно). */
function ownRow(event, root) {
  if (root.dataset.drag !== "item" || event.pointerType === "touch") return null;
  const item = event.target.closest?.(ITEM);
  if (!item || rootOf(item) !== root) return null;
  const row = rowOf(item);
  if (!row.contains(event.target)) return null;
  const hit = event.target.closest(ACTIVE);
  if (hit && row.contains(hit) && !hit.matches(LABEL)) return null;
  return item;
}

/* Ручка своего пункта (не вложенного сортируемого) под событием. */
function ownHandle(event, root) {
  const handle = event.target.closest?.(HANDLE);
  const item = handle?.closest(ITEM);
  return item && rootOf(item) === root && handleOf(item) === handle ? item : null;
}

function create(root, ctx) {
  const list = rootList(root);
  if (!list) return null;
  const tree = root.dataset.mode === "tree";
  const depth = Number(root.dataset.maxDepth);
  const record = {
    root,
    tree,
    group: (root.dataset.group ?? "").trim(),
    maxDepth: Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0,
    live: null,
    mute: null,
  };
  const saved = snapshot(root, ["class", "aria-label"]);

  root.classList.add("ui-sortable");
  root.classList.toggle("ui-sortable--tree", tree);
  setAttr(root, "aria-label", root.getAttribute("aria-label") || t(tree ? "tree" : "list"));
  records.add(record);
  byRoot.set(root, record);
  record.live = liveFor(root);
  refresh(record);

  ctx.on(root, "pointerdown", (event) => {
    record.mute = null;
    if (onToggle(event, root)) return;
    const item = ownHandle(event, root) ?? ownRow(event, root);
    if (!item || !event.isPrimary || event.button !== 0 || drag || isDisabled(item)) return;
    if (moving) finish(true);
    const state = { record, item, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, peak: event.clientY, travel: 0 };
    state.track = track(event, {
      slop: SLOP,
      capture: handleOf(item),
      onStart: () => begin(state),
      onMove: ({ x, y }) => move(state, x, y),
      onEnd: ({ completed }) => end(state, completed),
    });
  });

  ctx.on(root, "click", (event) => {
    if (onToggle(event, root)) return;
    if (tree && onRowToggle(event, root)) return;
    const item = ownHandle(event, root);
    if (!item) return;
    event.preventDefault();
    const muted = record.mute === item && event.detail > 0;
    record.mute = null;
    if (muted || moving?.item === item) return;
    if (menu?.item === item) closeMenu();
    else openMenu(item);
  });

  ctx.on(root, "keydown", (event) => {
    const item = ownHandle(event, root);
    if (!item || isDisabled(item) || event.altKey || event.ctrlKey || event.metaKey) return;
    const session = moving?.item === item ? moving : null;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (session) finish(true);
      else startSession(item);
      return;
    }
    if (!session) {
      /* Открытое щелчком меню: ↓ уводит фокус в него, как у кнопки меню. */
      const first = menu?.item === item && menu.buttons.find((button) => !button.hidden && !button.disabled);
      if (event.key === "ArrowDown" && first) {
        event.preventDefault();
        focus(first);
      }
      return;
    }
    if (event.key === "Tab") return finish(true);
    if (event.key === "Escape") {
      event.preventDefault();
      return finish(false);
    }
    let action = KEYS[event.key];
    if (!action) return;
    if (session.rtl && (action === "left" || action === "right")) action = action === "left" ? "right" : "left";
    event.preventDefault();
    if (performAction(item, action)) followItem(item);
  });

  return {
    getOrder: () => getOrder(root),
    refresh: () => refresh(record),
    destroy() {
      if (drag && (drag.record === record || rootOf(drag.placeholder) === root)) drag.track.cancel();
      const open = menu && rootOf(menu.item) === root ? menu : null;
      if (moving && (rootOf(moving.item) === root || moving.from.root === root)) finish(false);
      if (open) dropMenu(open);
      const own = (node) => rootOf(node) === root;
      for (const item of [...root.querySelectorAll(ITEM)].filter(own)) cleanItem(item);
      for (const node of [root, ...root.querySelectorAll(LIST)].filter(own)) cleanList(node);
      records.delete(record);
      byRoot.delete(root);
      releaseLive(record.live);
      restore(root, saved);
    },
  };
}

export default defineComponent({
  name: "sortable",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    getOrder: (host) => get(host)?.getOrder() ?? null,
    refresh: (host) => void get(host)?.refresh(),
  }),
});
