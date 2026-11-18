/* Дерево разделов: раскрывающиеся группы и ссылки-листья. Роли и признак
   раскрытия ставит модуль (промежуточный <li> — role="none", группа подчинена
   своей строке через aria-owns, дерево названо как хост); без модуля дерево
   читается обычным списком ссылок.

     <nav class="ui-tree-menu" data-ui-tree-menu aria-label="Разделы">
       <ul class="ui-tree-menu__list">
         <li class="ui-tree-menu__node">
           <a class="ui-tree-menu__item" href="/dashboard" aria-current="page">
             <span class="ui-icon ui-tree-menu__icon" data-ui-icon="house"></span>
             <span class="ui-tree-menu__label">Дашборд</span>
           </a>
         </li>
         <li class="ui-tree-menu__node">
           <button type="button" class="ui-tree-menu__item" aria-expanded="false">
             <span class="ui-icon ui-tree-menu__icon" data-ui-icon="folder"></span>
             <span class="ui-tree-menu__label">Каталог</span>
             <span class="ui-icon ui-tree-menu__chevron" data-ui-icon="chevron-right"></span>
           </button>
           <ul class="ui-tree-menu__list" hidden>…</ul>
         </li>
       </ul>
     </nav>

   Сворачивается только строка-<button>: ссылка уходит по адресу, а список под
   ней всегда открыт. Раскрытие анимирует CSS (строка сетки 0fr → 1fr), модуль
   только переключает aria-expanded; свёрнутая группа получает inert.

   Дерево — одна остановка табуляции (roving tabindex): она там, где фокус, а со
   свёрнутой группы переезжает на её строку. ↑ ↓ Home End ходят по видимым
   строкам, → раскрывает или входит, ← сворачивает или выходит к родителю (в RTL
   наоборот), буквы ищут строку по подписи. Строка с disabled не раскрывается и
   не берёт ни фокус, ни остановку — клавиши её пропускают.

   Мышь раскрывает на нажатии — в тот же кадр; палец и перо — на click: касание
   для прокрутки группу не переключает. Клавиатура — click с detail 0.

   Своя прокрутка (max-height): края гаснут маской, модуль пишет
   --ui-tree-fade-top / -bottom, когда за краем ещё есть строки, и
   --ui-tree-overscroll: contain — только пока листать есть куда. */

import { defineComponent } from "../../core/component.js";
import { dropEmpty, ensureId, isRtl, ownParts, restore, setAttr, setVar, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { moveIndex, typeahead } from "../../core/keys.js";
import { observeSize } from "../../core/observe.js";
import { frame } from "../../core/schedule.js";

const SELECTOR = "[data-ui-tree-menu]";
const LIST = ".ui-tree-menu__list";
const NODE = ".ui-tree-menu__node";
const ITEM = ".ui-tree-menu__item";
const LABEL = ".ui-tree-menu__label";
/* Размер среза живёт в CSS; модуль решает только, нужен ли он у кромки. */
const FADE_ON = "var(--ui-tree-fade)";
/* Ниже пикселя разница — округление дробного масштаба, а не место для прокрутки. */
const EDGE = 1;
const ITEM_ATTRS = ["role", "tabindex", "aria-expanded", "aria-owns"];
const NODE_ATTRS = ["role"];
const LIST_ATTRS = ["id", "role", "hidden", "inert", "aria-label", "aria-labelledby"];

function create(host, ctx) {
  const items = ownParts(host, ITEM, SELECTOR);
  const lists = ownParts(host, LIST, SELECTOR);
  const root = lists[0];
  if (!items.length || !root) return null;
  const nodes = ownParts(host, NODE, SELECTOR);
  const known = new Set(items);
  const saved = [[items, ITEM_ATTRS], [nodes, NODE_ATTRS], [lists, LIST_ATTRS]].flatMap(([group, names]) => group.map((node) => [node, snapshot(node, names)]));

  /* Структура читается один раз: строка → её список и строка-родитель. Строки
     вложенного дерева в known не входят. */
  const nested = new Map();
  const parent = new Map();
  for (const list of lists) {
    const owner = list === root ? null : [...list.parentElement.children].find((child) => known.has(child));
    for (const node of list.children) {
      if (!node.matches(NODE)) continue;
      const item = [...node.children].find((child) => known.has(child));
      if (!item) continue;
      if (owner) parent.set(item, owner);
      const sub = [...node.children].find((child) => child.matches(LIST));
      if (sub) nested.set(item, sub);
    }
  }
  const isGroup = (item) => item.tagName === "BUTTON" && nested.has(item);
  const isOpen = (item) => !isGroup(item) || item.getAttribute("aria-expanded") === "true";
  /* Отключённая кнопка фокус не берёт: остановка или переход на неё оставили бы
     дерево без остановки и клавиши — на месте. */
  const usable = (item) => !item.matches(":disabled");
  const itemOf = (target) => {
    const item = target.closest?.(ITEM);
    return known.has(item) ? item : null;
  };

  /* Видимые строки — обход сверху вниз: под свёрнутой группой строк нет.
     Порядок пересобирается, только когда его меняет раскрытие. */
  let visible = null;
  function rows() {
    if (visible) return visible;
    visible = [];
    const walk = (list) => {
      for (const node of list.children) {
        if (!node.matches(NODE)) continue;
        for (const child of node.children) {
          if (!known.has(child)) continue;
          visible.push(child);
          if (nested.has(child) && isOpen(child)) walk(nested.get(child));
        }
      }
    };
    walk(root);
    return visible;
  }

  /* Остановка табуляции у дерева одна и переезжает вместе с фокусом. */
  let stop = null;
  function setStop(item) {
    if (stop === item) return;
    if (stop) setAttr(stop, "tabindex", "-1");
    stop = item;
    if (item) setAttr(item, "tabindex", "0");
  }

  function setOpen(item, open) {
    const group = nested.get(item);
    setAttr(item, "aria-expanded", String(open));
    /* Свёрнутая группа не держит ни фокус, ни остановку: обе — на её строку,
       пока inert не сбросил фокус в body. */
    if (!open && group.contains(stop)) setStop(item);
    if (!open && group.contains(document.activeElement)) focus(item);
    /* Высотой владеет сетка, авторский hidden её обнулил бы. Из табуляции и
       дерева доступности группу убирает inert — обрезка этого не делает. */
    setAttr(group, "hidden", null);
    setAttr(group, "inert", !open);
    visible = null;
  }

  /* Роли описывают структуру, а не состояние: ставятся один раз. Все строки вне
     табуляции, иначе дерево из тридцати строк — тридцать остановок. */
  for (const list of lists) setAttr(list, "role", list === root ? "tree" : "group");
  for (const node of nodes) setAttr(node, "role", "none");
  for (const item of items) {
    setAttr(item, "role", "treeitem");
    setAttr(item, "tabindex", "-1");
  }
  /* Имя дерева — имя навигации, как в примере APG; группа в дереве доступности —
     ребёнок своей строки, а не сосед. */
  if (!root.hasAttribute("aria-label") && !root.hasAttribute("aria-labelledby")) {
    setAttr(root, "aria-label", host.getAttribute("aria-label"));
    setAttr(root, "aria-labelledby", host.getAttribute("aria-labelledby"));
  }
  for (const [item, list] of nested) setAttr(item, "aria-owns", ensureId(list, "ui-tree-group"));
  /* Начальное раскрытие: aria-expanded из разметки или открытая группа. */
  for (const item of nested.keys()) {
    if (!isGroup(item)) continue;
    const authored = item.getAttribute("aria-expanded");
    setOpen(item, authored === null ? !nested.get(item).hidden : authored === "true");
  }
  /* Остановка — текущий раздел, иначе первая видимая строка. Фокус не забираем. */
  setStop(rows().find((item) => item.getAttribute("aria-current") === "page" && usable(item)) ?? rows().find(usable));

  /* --- нажатия и клавиши -------------------------------------------------- */

  function toggle(target) {
    const item = itemOf(target);
    /* pointerdown приходит и на отключённую кнопку — её не раскрываем. */
    if (item && isGroup(item) && usable(item)) setOpen(item, !isOpen(item));
  }

  let pointer = "";
  ctx.on(host, "pointerdown", (event) => {
    pointer = event.pointerType;
    if (pointer === "mouse" && event.button === 0) toggle(event.target);
  });
  ctx.on(host, "click", (event) => {
    if (event.detail !== 0 && pointer === "mouse") return;
    toggle(event.target);
  });
  ctx.on(host, "focusin", (event) => {
    const item = itemOf(event.target);
    if (item) setStop(item);
  });

  /* У отключённой строки подписи для поиска нет — пустая ни с чем не совпадёт. */
  const find = typeahead(() => rows().map((item) => (usable(item) ? (item.querySelector(LABEL) ?? item).textContent : "")));
  const MIRROR = { ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };

  ctx.on(host, "keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const item = itemOf(event.target);
    const list = rows();
    const at = list.indexOf(item);
    if (at < 0) return;
    let key = event.key;
    if (key in MIRROR && isRtl(host)) key = MIRROR[key];
    let target = null;
    if (key === "ArrowRight") {
      if (!nested.has(item)) return;
      if (isOpen(item)) target = list.find((row) => nested.get(item).contains(row) && usable(row)) ?? item;
      else {
        setOpen(item, true);
        target = item;
      }
    } else if (key === "ArrowLeft") {
      if (isGroup(item) && isOpen(item)) {
        setOpen(item, false);
        target = item;
      } else {
        const up = parent.get(item);
        target = up && usable(up) ? up : item;
      }
    } else {
      const next = moveIndex(event, at, list.length, { skip: (index) => !usable(list[index]) });
      if (next !== null) target = list[next];
      else if (key.length === 1) target = list[find(key, at)] ?? null;
    }
    if (!target) return;
    event.preventDefault();
    setStop(target);
    /* Строку за краем дерева или окна — подвести к ней. */
    focus(target, { reveal: true });
  });

  /* --- маска прокрутки ---------------------------------------------------- */

  /* Место для прокрутки меряется в колбэке наблюдателя, после раскладки: хост
     (высота колонки) и корневой список (раскрытие меняет его на каждом кадре).
     Прокрутка его не меняет — ей хватает scrollTop раз в кадр. */
  let room = 0;
  function paintFade(top) {
    const scrollable = room > EDGE;
    setVar(host, "--ui-tree-overscroll", scrollable ? "contain" : null);
    setVar(host, "--ui-tree-fade-top", scrollable && top > EDGE ? FADE_ON : null);
    setVar(host, "--ui-tree-fade-bottom", scrollable && top < room - EDGE ? FADE_ON : null);
  }
  const watcher = {
    read() {
      room = host.scrollHeight - host.clientHeight;
      return host.scrollTop;
    },
    write: paintFade,
  };
  ctx.cleanup(observeSize(host, watcher));
  ctx.cleanup(observeSize(root, watcher));
  const onScroll = frame(() => paintFade(host.scrollTop));
  ctx.on(host, "scroll", onScroll, { passive: true });

  return {
    host,
    destroy() {
      onScroll.cancel();
      setVar(host, "--ui-tree-overscroll", null);
      setVar(host, "--ui-tree-fade-top", null);
      setVar(host, "--ui-tree-fade-bottom", null);
      dropEmpty(host, "style");
      for (const [node, attrs] of saved) restore(node, attrs);
    },
  };
}

export default defineComponent({
  name: "treeMenu",
  selector: SELECTOR,
  create,
});
