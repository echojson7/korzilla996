/* DOM-помощники кита: поиск хостов, свои части хоста, снимок атрибутов автора,
   фабрика элементов, id и запись только изменившегося. Каждая лишняя запись
   атрибута или свойства — лишний пересчёт стилей, поэтому set* сравнивают. */

/* Хосты модуля под корнем: сам корень, если подходит, и потомки. Корень — любой
   узел с querySelectorAll: документ, элемент, фрагмент, теневой корень. */
export function hostsOf(root, selector) {
  if (!root?.querySelectorAll) return [];
  const own = root.nodeType === 1 && root.matches(selector) ? [root] : [];
  return own.concat([...root.querySelectorAll(selector)]);
}

/* Части хоста без частей вложенного хоста того же компонента. */
export function ownParts(host, part, hostSelector) {
  return [...host.querySelectorAll(part)].filter((node) => node.closest(hostSelector) === host);
}

export function ownPart(host, part, hostSelector) {
  for (const node of host.querySelectorAll(part)) if (node.closest(hostSelector) === host) return node;
  return null;
}

/* Атрибуты автора до модуля: на снятии разметка возвращается как была. */
export function snapshot(element, names) {
  return new Map(names.map((name) => [name, element.getAttribute(name)]));
}

/* Снять — только если атрибут есть. Чтение заодно сводит инлайн-стиль, менявшийся
   через CSSOM, в атрибут: без него Chrome после removeAttribute оставил бы style="". */
export function restore(element, saved) {
  for (const [name, value] of saved) {
    const current = element.getAttribute(name);
    if (value === null) {
      if (current !== null) element.removeAttribute(name);
    } else if (current !== value) element.setAttribute(name, value);
  }
}

/* Один счётчик на кит: id разных модулей не совпадут. */
let counter = 0;
export const uid = (prefix = "ui") => `${prefix}-${(counter += 1)}`;

export function ensureId(element, prefix = "ui") {
  if (!element.id) element.id = uid(prefix);
  return element.id;
}

/* el("button", { class: "ui-btn", type: "button", "aria-label": "Закрыть",
   data: { pick: "" }, text: "…" }, ...дети). false и null пропускаются. */
export function el(tag, props = null, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "data") Object.assign(node.dataset, value);
      else if (key === "style") for (const [name, v] of Object.entries(value)) node.style.setProperty(name, v);
      else node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of children) if (child != null && child !== false) node.append(child);
  return node;
}

/* value: строка, true (пустой атрибут), null/false/undefined (снять). */
export function setAttr(element, name, value) {
  const next = value == null || value === false ? null : value === true ? "" : String(value);
  if (element.getAttribute(name) === next) return;
  if (next === null) element.removeAttribute(name);
  else element.setAttribute(name, next);
}

export function setData(element, key, value) {
  const next = value == null || value === false ? undefined : value === true ? "" : String(value);
  if (element.dataset[key] === next) return;
  if (next === undefined) delete element.dataset[key];
  else element.dataset[key] = next;
}

/* Своё свойство (--ui-…) в инлайн-стиле; null — снять. */
export function setVar(element, name, value) {
  if (value == null || value === "") {
    if (element.style.getPropertyValue(name)) element.style.removeProperty(name);
  } else if (element.style.getPropertyValue(name) !== value) {
    element.style.setProperty(name, value);
  }
}

export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/* Событие кита: всплывает; true — если его не отменили. */
export function emit(target, type, detail, { cancelable = false } = {}) {
  return target.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable, detail }));
}

/* Направление письма по CSS (dir у предка или direction в стилях). */
export const isRtl = (element) => getComputedStyle(element).direction === "rtl";

/* Пустые атрибуты, которые оставил модуль (class="" после classList.remove,
   style="" после снятия переменных), — не разметка автора. Читается атрибут, а не
   style.length: Chromium сериализует CSSOM при чтении. */
export function dropEmpty(element, ...names) {
  for (const name of names) if (element.getAttribute(name) === "") element.removeAttribute(name);
}

/* Сброс формы: reset приходит до того, как форма вернёт значения, — fn после. */
export function afterReset(ctx, control, fn) {
  if (control.form) ctx.on(control.form, "reset", () => setTimeout(() => ctx.signal.aborted || fn()));
}

/* Нажатие кнопки, сделанной не <button>: мышь и палец — pointerdown основной
   кнопкой, клавиатура — Enter/пробел, программный .click() — click с detail 0. */
export function isPress(event) {
  if (event.type === "pointerdown") return event.button === 0;
  if (event.type === "keydown") return event.key === "Enter" || event.key === " ";
  return event.type === "click" && event.detail === 0;
}

/* Текст подписи без контролов внутри неё: <label>, обнимающий <select>, иначе
   отдал бы и подписи всех его пунктов. */
const LABELABLE = "button, input, meter, output, progress, select, textarea";

function labelText(label) {
  let text = "";
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT : node.matches(LABELABLE) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP),
  });
  while (walker.nextNode()) text += walker.currentNode.data;
  return text.replace(/\s+/g, " ").trim();
}

/* Подпись контрола для aria-label: <label>, aria-*, подпись поля .ui-field. */
export function labelOf(control) {
  const own = control.getAttribute("aria-label")?.trim() || (control.labels?.[0] ? labelText(control.labels[0]) : "");
  if (own) return own;
  const by = control.getAttribute("aria-labelledby");
  if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent.trim() ?? "").join(" ").trim();
  return control.closest(".ui-field")?.querySelector(".ui-field__label")?.textContent.trim() ?? "";
}
