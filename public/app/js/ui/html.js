/* Шаблоны html`` с экранированием и делегирование событий. */

class Raw { constructor(text) { this.text = text; } toString() { return this.text; } }
export const raw = (text) => new Raw(text);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const value = (item) =>
  item == null || item === false ? "" :
  Array.isArray(item) ? item.map(value).join("") :
  item instanceof Raw ? item.text :
  String(item).replace(/[&<>"']/g, (char) => ESC[char]);

export function html(strings, ...values) {
  let out = "";
  strings.forEach((part, at) => { out += part + (at < values.length ? value(values[at]) : ""); });
  return raw(out);
}

/* Разметка → узлы. */
export function fragment(markup) {
  const template = document.createElement("template");
  template.innerHTML = String(markup).trim();
  return template.content;
}

/* Один слушатель на корне. Панели поповеров кит уносит в body, поэтому клики в
   меню ловят на document (см. ui/kit.js: onPick). */
export function on(root, type, selector, handler) {
  const listener = (event) => {
    const target = event.target.closest?.(selector);
    if (target && (root === document || root.contains(target))) handler(event, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}
