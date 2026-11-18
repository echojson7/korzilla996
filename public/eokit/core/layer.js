/* Стек слоёв: один на кит для всего, что открывается поверх страницы, — поповер и
   меню, селект, календарь, подсказка, окно, палитра, просмотр карусели.

     const layer = openLayer({
       elements: () => [host, panel],     // что считается «внутри» слоя
       parent,                            // по умолчанию — слой, внутри которого trigger
       trigger,                           // откуда открыли: по нему ищется родитель
       exclusive: true,                   // открытие закрывает соседнюю ветку
       escape: true, outside: true, focus: true,
       modal: false,                      // модальный слой закрывает собой всё ниже
       onDismiss(reason, event) { close(); },   // reason: escape | outside | focus | parent | sibling
     });
     layer.close();                       // слой и его дети уходят из стека

   Слушатели (pointerdown, pointercancel, click, keydown, focusin — в фазе захвата)
   висят, только пока стек не пуст. Esc закрывает верхний слой, который его
   принимает, и гасит событие: окно под меню его уже не увидит. Нажатие и фокус
   снаружи закрывают слои сверху вниз до первого, внутри которого они случились;
   модальный слой дальше вниз не пускает. Палец и перо закрывают на click, а не на
   pointerdown: касание снаружи может оказаться прокруткой страницы, и панель тогда
   остаётся у якоря. Слой-ребёнок всегда выше родителя и уходит вместе с ним. */

const stack = [];
let listening = false;
/* Касание снаружи, ждущее своего click: { layers, event }. */
let touched = null;

/* keydown — на document, а не на window: захват окна раньше, и жест (track) успевает
   забрать Esc себе — Esc посреди перетаскивания отменяет перетаскивание, а не
   закрывает меню вокруг него. Цель — именем: на импорте модуль не трогает DOM. */
const LISTENERS = [
  ["window", "pointerdown", onPointerDown],
  ["window", "pointercancel", onPointerCancel],
  ["window", "click", onClick],
  ["document", "keydown", onKeyDown],
  ["window", "focusin", onFocusIn],
];

function listen(on) {
  if (on === listening) return;
  listening = on;
  touched = null;
  for (const [name, type, handler] of LISTENERS) {
    const target = name === "document" ? document : window;
    if (on) target.addEventListener(type, handler, true);
    else target.removeEventListener(type, handler, true);
  }
}

function ownsNode(layer, node) {
  return layer.elements().some((element) => element?.contains(node));
}

function descendants(layer) {
  return stack.filter((other) => {
    for (let up = other.parent; up; up = up.parent) if (up === layer) return true;
    return false;
  });
}

/* Слой, которому принадлежит узел своими элементами, — верхний из таких. */
export function layerOf(node) {
  if (!node) return null;
  for (let at = stack.length - 1; at >= 0; at -= 1) if (ownsNode(stack[at], node)) return stack[at];
  return null;
}

export const topLayer = () => stack[stack.length - 1] ?? null;

/* Решает компонент: onDismiss закрывает поверхность и зовёт layer.close(). Ушёл
   родитель или открылась соседняя ветка — слой уходит из стека в любом случае. */
function dismiss(layer, reason, event) {
  if (!stack.includes(layer)) return;
  layer.options.onDismiss?.(reason, event);
  if ((reason === "parent" || reason === "sibling") && stack.includes(layer)) layer.close();
}

/* Снаружи — сверху вниз, пока не встретится слой, внутри которого узел. */
function dismissFrom(node, reason, event, flag) {
  for (const layer of [...stack].reverse()) {
    if (!stack.includes(layer)) continue;
    if (layer.contains(node)) return;
    if (layer.options[flag]) dismiss(layer, reason, event);
    if (layer.options.modal) return;
  }
}

/* Касание снаружи: какие слои оно закроет, решается на pointerdown (потом стек
   может пополниться тем, что откроет само касание), закрываются они на click.
   pointercancel — браузер забрал касание под прокрутку: слои остаются. */
function outsideLayers(node) {
  const found = [];
  for (let at = stack.length - 1; at >= 0; at -= 1) {
    const layer = stack[at];
    if (layer.contains(node)) break;
    if (layer.options.outside) found.push(layer);
    if (layer.options.modal) break;
  }
  return found;
}

function onPointerDown(event) {
  touched = null;
  if (event.button > 0) return;
  const node = event.composedPath()[0] ?? event.target;
  if (event.pointerType === "touch" || event.pointerType === "pen") touched = { layers: outsideLayers(node), event };
  else dismissFrom(node, "outside", event, "outside");
}

function onPointerCancel() {
  touched = null;
}

function onClick() {
  if (!touched) return;
  const { layers, event } = touched;
  touched = null;
  for (const layer of layers) dismiss(layer, "outside", event);
}

function onFocusIn(event) {
  dismissFrom(event.composedPath()[0] ?? event.target, "focus", event, "focus");
}

function onKeyDown(event) {
  if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
  for (let at = stack.length - 1; at >= 0; at -= 1) {
    const layer = stack[at];
    if (!layer.options.escape) {
      if (layer.options.modal) return;
      continue;
    }
    event.preventDefault();
    event.stopPropagation();
    dismiss(layer, "escape", event);
    return;
  }
}

export function openLayer(options) {
  const elements = typeof options.elements === "function" ? options.elements : () => options.elements ?? [];
  const parent = options.parent !== undefined ? options.parent : layerOf(options.trigger);
  const layer = {
    options: { escape: true, outside: true, focus: true, ...options },
    parent: parent && stack.includes(parent) ? parent : null,
    elements,
    get open() {
      return stack.includes(layer);
    },
    contains(node) {
      return ownsNode(layer, node) || descendants(layer).some((child) => ownsNode(child, node));
    },
    close() {
      const at = stack.indexOf(layer);
      if (at === -1) return;
      for (const child of descendants(layer).reverse()) dismiss(child, "parent");
      /* onDismiss ребёнка мог закрыть и этот слой: splice(-1) снял бы чужой верхний. */
      const still = stack.indexOf(layer);
      if (still !== -1) stack.splice(still, 1);
      if (!stack.length) listen(false);
    },
  };
  /* Соседняя ветка уходит: остаются только предки. Модальный слой — граница. */
  if (layer.options.exclusive) {
    for (const other of [...stack].reverse()) {
      if (other === layer.parent || other.options.modal) break;
      if (stack.includes(other)) dismiss(other, "sibling");
    }
  }
  stack.push(layer);
  listen(true);
  return layer;
}

/* Портал: узел уходит в ближайший [data-ui-layer] якоря (слой окна) или в body и
   возвращается на своё место по метке — соседи могли смениться.

   Направление текста узел наследовал от места: из контейнера с dir="rtl" в body
   он стал бы ltr — разметка панели и стрелки пошли бы не в ту сторону. Если
   направления места и цели разные, узел на время портала несёт своё dir.
   Направление — посчитанное, как его читают компоненты (getComputedStyle).

   Унесённые узлы помнятся по меткам: снятие поддерева (component.js) находит хосты
   в открытой панели, хотя она стоит не под корнем. */
const portals = new Map();

export function portal(node, anchor = null) {
  const marker = document.createComment("ui-portal");
  const home = node.parentNode;
  home?.insertBefore(marker, node);
  const target = anchor?.closest?.("[data-ui-layer]") ?? document.body;
  const source = home instanceof Element ? home : anchor;
  const from = source instanceof Element && !node.hasAttribute("dir") ? getComputedStyle(source).direction : "";
  const dir = !!from && from !== getComputedStyle(target).direction;
  if (dir) node.dir = from;
  target.append(node);
  if (home) portals.set(node, marker);
  return () => {
    if (portals.get(node) === marker) portals.delete(node);
    if (dir) node.removeAttribute("dir");
    if (marker.parentNode) marker.replaceWith(node);
    else node.remove();
  };
}

/* Узлы, унесённые из-под root (и из-под унесённых из-под него), которых в root
   сейчас нет. */
export function portaledFrom(root) {
  if (!portals.size || !root?.contains) return [];
  const scopes = [root];
  for (let at = 0; at < scopes.length; at += 1) {
    for (const [node, marker] of portals) if (!scopes.includes(node) && scopes[at].contains(marker)) scopes.push(node);
  }
  return scopes.slice(1).filter((node) => !root.contains(node));
}
