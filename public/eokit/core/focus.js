/* Фокус в слоях: что можно взять Tab, куда ставить фокус при открытии, Tab по кругу
   внутри модального слоя и возврат фокуса. */

import { layerOf } from "./layer.js";

const TABBABLE =
  "a[href], area[href], button, input, select, textarea, iframe, summary, audio[controls], video[controls], [contenteditable]:not([contenteditable='false']), [tabindex]";

function visible(node) {
  return node.checkVisibility?.({ checkVisibilityCSS: true }) ?? node.getClientRects().length > 0;
}

/* В порядок табуляции из группы радио попадает одна: отмеченная или первая. */
export function tabbables(root) {
  const radios = new Map();
  const list = [];
  for (const node of root.querySelectorAll(TABBABLE)) {
    if (node.tabIndex < 0 || node.matches(":disabled") || node.closest("[inert]") || !visible(node)) continue;
    if (node.type === "radio" && node.name) {
      const group = radios.get(node.name);
      if (!group) radios.set(node.name, { at: list.length, node });
      else if (node.checked && !group.node.checked) {
        list[group.at] = node;
        group.node = node;
      }
      if (group) continue;
    }
    list.push(node);
  }
  return list;
}

/* Фокус без прокрутки: панель, только что унесённая в body, ещё въезжает, и
   браузер дёрнул бы страницу к ней. reveal — для хода с клавиатуры по списку
   (стрелки в меню и дереве, Tab по кругу): пункт показывается ближайшим краем
   прокрутки, как при нативном Tab. */
export function focus(node, { reveal = false } = {}) {
  node?.focus?.({ preventScroll: true });
  const focused = !!node && document.activeElement === node;
  if (focused && reveal) node.scrollIntoView({ block: "nearest", inline: "nearest" });
  return focused;
}

/* С клавиатуры — на [autofocus] или первое поле; мышью и пальцем — на сам
   контейнер, без кольца (на телефоне не выскакивает клавиатура). */
export function focusInitial(container, { keyboard = false } = {}) {
  const target = container.querySelector("[autofocus]") ?? (keyboard ? tabbables(container)[0] : null) ?? container;
  focus(target);
  return target;
}

/* Фокус снаружи контейнера, который не наш: слой, открытый поверх (он позже по
   документу), или свой корень [data-ui-layer] вне стека слоёв — тосты и статус-бар
   стоят в body с первого показа и могут оказаться раньше окна. Окно ниже в стеке
   (тоже [data-ui-layer]) — наше: Tab из него возвращается в контейнер. */
function foreign(active, container) {
  if (container.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING) return true;
  const root = active.closest?.("[data-ui-layer]");
  return !!root && !root.contains(container) && !layerOf(active);
}

/* Tab по кругу внутри контейнера. Фокус в чужом слое пропускаем. */
export function trapTab(event, container, fallback = container) {
  if (event.key !== "Tab") return;
  const active = document.activeElement;
  const outside = !container.contains(active);
  if (outside && active && active !== document.body && foreign(active, container)) return;
  const list = tabbables(container);
  const first = list[0] ?? fallback;
  const last = list[list.length - 1] ?? fallback;
  if (outside) {
    event.preventDefault();
    focus(event.shiftKey ? last : first, { reveal: true });
  } else if (event.shiftKey && (active === first || active === fallback)) {
    event.preventDefault();
    focus(last, { reveal: true });
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    focus(first, { reveal: true });
  }
}

/* Вернуть фокус, если он был в уходящем контейнере (или потерян в body): тост или
   палитра поверх его не отдают. Цели — по порядку, первая, что взяла фокус. */
export function returnFocus(container, ...targets) {
  const active = document.activeElement;
  if (active && active !== document.body && !container.contains(active)) return false;
  for (const target of targets) if (target?.isConnected && focus(target)) return true;
  return false;
}
