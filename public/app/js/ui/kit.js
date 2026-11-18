/* Связка с EOKIT. Только публичный контракт кита: классы .ui-*, атрибуты
   data-ui-*, kit.js (load / mount / unmount / kit / setTheme). Здесь — разметка
   меню и мелкие обёртки: тост, панель сбоку, выбор пункта меню.

   Правило перерисовки: unmount(узел) до замены разметки, mount(узел) после. */

import { load, mount, unmount, kit, setTheme, isDark, setDensity, getDensity, setMotion, pop, leave, flip } from "../../../eokit/kit.js";
import { html, raw, fragment, on } from "./html.js";
import { icon, hicon } from "./icons.js";
import { t } from "../core/i18n.js";

export { mount, unmount, kit, setTheme, isDark, setDensity, getDensity, setMotion, pop, leave, flip };

/* Модули, нужные оболочке и страницам. Остальные страница догружает сама: loadKit(["datepicker"]). */
const CORE_MODULES = ["popover", "select", "tooltip", "tabs", "alert", "modal", "command", "treeMenu", "spinner", "tour"];
export const loadKit = (names = CORE_MODULES) => load(names);

/* ---- Меню (поповер кита) ----------------------------------------------------
   trigger — кнопка с data-popover-trigger. Выбор пункта кит шлёт событием
   menu:pick на триггер (detail: value, item, checked); ловит его onPick. */
export const popover = (trigger, content, { align = "start", side = "", open = "", size = "", cls = "", anchor = "" } = {}) =>
  html`<div class="ui-popover ${cls}" data-ui-popover data-align="${align}" ${side ? raw(`data-side="${side}"`) : ""} ${open ? raw(`data-open="${open}"`) : ""} ${size ? raw(`data-size="${size}"`) : ""} ${anchor ? raw(`data-anchor="${anchor}"`) : ""}>${trigger}<div data-popover-panel hidden>${content}</div></div>`;

export const menu = (rows, cls = "") => html`<div class="ui-popover__menu${cls ? ` ${cls}` : ""}" role="menu">${rows}</div>`;

/* Пункт меню — кнопка кита. checked → флажок (меню не закрывается), radio → один
   из вариантов: у отмеченного галочка; end — клавиша или бейдж справа. */
export function item(value, lead, text, { end = "", danger = false, checked, radio, keep = false, href = "", disabled = false } = {}) {
  const role = checked != null ? "menuitemcheckbox" : radio != null ? "menuitemradio" : "menuitem";
  const marked = role !== "menuitem";
  const attrs = raw(`role="${role}" data-pick="${value}"${marked ? ` aria-checked="${Boolean(checked ?? radio)}"` : ""}${keep || checked != null ? " data-keep" : ""}`);
  const body = html`${lead}<span class="ui-btn__label">${text}</span>${end}${marked ? raw('<span class="ui-icon ui-popover__check" data-ui-icon="check" aria-hidden="true"></span>') : ""}`;
  const cls = `ui-btn${danger ? " ui-btn--destructive-ghost" : ""}`;
  return href ? html`<a class="${cls}" href="${href}" ${attrs}>${body}</a>` : html`<button class="${cls}" type="button" ${attrs}${disabled ? raw(" disabled") : ""}>${body}</button>`;
}
/* Пункт ветки, который сам не выбирается: нажатие раскрывает ветку. */
export const menuHead = (text) => html`<button class="ui-btn" type="button" role="menuitem"><span class="ui-btn__label">${text}</span></button>`;
/* Ветка меню: пункт head, стрелка и вложенные пункты rows, раскрытые при open. */
export const menuFold = (head, rows, { open = false } = {}) =>
  html`<div class="ui-popover__fold">${head}<button class="ui-popover__fold-toggle" type="button" aria-expanded="${String(open)}" aria-label="Подразделы">${hicon("chevron-down")}</button><div class="ui-popover__fold-list">${rows}</div></div>`;
export const menuSep = raw('<div class="ui-popover__menu-sep"></div>');
export const menuLabel = (text) => html`<div class="ui-popover__menu-label">${text}</div>`;
export const menuSearch = (placeholder) => html`<label class="ui-popover__search">${icon("search")}<input type="text" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off" data-menu-search></label>`;

export const kbd = (...keys) => html`<span class="ui-kbd-group">${keys.map((key) => html`<kbd class="ui-kbd">${key}</kbd>`)}</span>`;

/* Выбор пункта меню, триггер которого внутри root (панель уже в body). */
export const onPick = (root, handler) =>
  on(document, "menu:pick", "[data-popover-trigger]", (event, trigger) => {
    if (root.contains(trigger)) handler(event.detail, trigger, event);
  });

/* Поиск по пунктам меню: прячет строки, в которых нет запроса. */
document.addEventListener("input", (event) => {
  const input = event.target.closest?.("[data-menu-search]");
  if (!input) return;
  const query = input.value.trim().toLowerCase();
  const list = input.closest(".ui-popover__menu");
  list.querySelectorAll(":scope > .ui-btn, :scope > .ui-popover").forEach((row) => { row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query); });
  list.querySelectorAll(":scope > .ui-popover__menu-sep").forEach((sep) => { sep.hidden = Boolean(query); });
});

/* ---- Тост ------------------------------------------------------------------ */
export const toast = (title, options = {}) => kit("alert")?.show({ type: "success", title, ...options });

/* Тост о сделанной правке; undo — кнопка «Вернуть» (одна на все экраны). */
export const done = (title, undo = null, options = {}) => toast(title, undo ? { ...options, action: { label: t("Undo"), onClick: undo } } : options);

/* ---- Панель сбоку (окно кита, на телефоне — лист снизу) ----------------------
   content — разметка с анатомией окна (__header / __body / __footer). Кит ставит
   компоненты внутри после открытия; refresh(content) перерисовывает тело.
   type: "dialog" — окно по центру (size — sm | md | lg | xl кита). badge и
   badgeTone — статус рядом с заголовком. */
export function openPanel(content, { title = "", description = "", badge = "", badgeTone = "", width = "", size = "", type = "side", onClose } = {}) {
  const handle = kit("modal").open(fragment(content), { type, mobile: "sheet", title, description, badge: badge || undefined, badgeTone: badgeTone || undefined, width: width || undefined, size: size || undefined });
  const host = handle.element;
  mount(host);
  handle.closed.then((value) => onClose?.(value));
  return {
    host,
    close: (value) => handle.close(value),
    /* Перерисовать содержимое, не закрывая панель. */
    refresh(next) {
      unmount(host);
      host.querySelectorAll(":scope > :is(.ui-modal__body, .ui-modal__footer)").forEach((node) => node.remove());
      host.append(fragment(next));
      mount(host);
    },
    update: (options) => handle.update?.(options),
  };
}
