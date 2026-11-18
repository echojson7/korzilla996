/* Источники содержимого модалки и сборка хоста.

   data-modal="#id" указывает на авторскую модалку ([data-ui-modal]) — открывается
   она сама; на <form> — она сама становится окном (её дети без неё остались бы
   без отправки и проверки полей); на <template> — клон его содержимого, каждый
   раз свежий; на любой другой элемент — одалживается его содержимое: дети
   переходят в модалку и на закрытии возвращаются, поэтому поля и слушатели живут,
   а id не двоятся. Значение без «#» и <a href data-modal> — адрес на том же
   домене (загрузка — modal-remote.js).

   Содержимое, уже размеченное анатомией (__header / __body / __footer), встаёт
   как есть и заменяет те же части; иначе оборачивается в __body. */

import { el } from "../../core/dom.js";
import { messages } from "../../core/locale.js";

export const HOST_SELECTOR = "[data-ui-modal]";
const PARTS = [".ui-modal__header", ".ui-modal__body", ".ui-modal__footer"];
export const ANATOMY_SELECTOR = `:is(${PARTS.join(", ")})`;
const STATUS_CLASS = "ui-modal__status";
export const RETRY_ATTR = "data-modal-retry";

export const t = messages("modal", {
  ru: { close: "Закрыть", width: "Ширина панели", loading: "Загрузка", failed: "Не удалось загрузить содержимое", retry: "Повторить" },
  en: { close: "Close", width: "Panel width", loading: "Loading", failed: "Couldn't load the content", retry: "Retry" },
});

function kindOf(node) {
  if (node.matches(HOST_SELECTOR)) return { kind: "host", node };
  if (node instanceof HTMLFormElement) return { kind: "host", node, adopted: true };
  if (node instanceof HTMLTemplateElement) return { kind: "template", node };
  return { kind: "element", node };
}

/* Значение data-modal или первый аргумент open(): узел, «#id» или адрес.
   Фрагмент и текстовый узел встают как есть. */
export function sourceOf(value) {
  if (value instanceof Element) return kindOf(value);
  if (value instanceof Node) return { kind: "fragment", node: value };
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("#")) return { kind: "url", url: raw };
  const node = document.getElementById(raw.slice(1));
  if (!node) console.warn(`[modal] нет элемента ${raw}.`);
  return node ? kindOf(node) : null;
}

/* Авторская модалка уходит в слой: метка в DOM держит место для возврата, hidden
   (закрытая модалка спрятана на странице) снимается на время показа. */
function borrow(node) {
  const marker = document.createComment("ui-modal");
  node.before(marker);
  const hidden = node.hidden;
  node.hidden = false;
  return () => {
    node.hidden = hidden;
    if (marker.isConnected) marker.replaceWith(node);
    else node.remove();
  };
}

/* Форма — окно на время показа: класс окна, шапка из настроек и тело вокруг
   неразмеченного содержимого — модуля, на закрытии снимаются. */
function adopt(form, options) {
  const home = borrow(form);
  const added = !form.classList.contains("ui-modal");
  form.classList.add("ui-modal");
  let body = null;
  if (![...form.children].some((child) => child.matches(ANATOMY_SELECTOR))) {
    body = el("div", { class: "ui-modal__body" });
    body.append(...form.childNodes);
    form.append(body);
  }
  setHeader(form, options);
  return () => {
    form.querySelector(":scope > .ui-modal__header[data-modal-generated]")?.remove();
    body?.replaceWith(...body.childNodes);
    if (added) form.classList.remove("ui-modal");
    home();
  };
}

/* У прочего элемента одалживаются дети: сам он стоит на месте, спрятанный, и
   держит настройки (data-modal-*), а на закрытии получает детей обратно. Дети —
   а не обёртка — решают, размечено ли содержимое анатомией. */
function lend(node) {
  const children = [...node.childNodes];
  const content = document.createDocumentFragment();
  content.append(...children);
  return { content, giveBack: () => node.append(...children) };
}

function fragmentOf(source) {
  if (source.kind === "template") return source.node.content.cloneNode(true);
  if (source.kind !== "html") return source.node;
  const template = document.createElement("template");
  template.innerHTML = source.html;
  return template.content;
}

/* Шапка собранной модалки — из настроек title и description, статус badge —
   строкой с заголовком. Без заголовка и описания шапки нет; своя шапка
   содержимого сильнее настроек. */
export function setHeader(host, options) {
  host.querySelector(":scope > .ui-modal__header[data-modal-generated]")?.remove();
  if (!options.title && !options.description) return;
  if (host.querySelector(":scope > .ui-modal__header")) return;
  const title = options.title && el("h2", { class: "ui-modal__title", text: options.title });
  const badge = options.badge && el("span", { class: "ui-badge ui-badge--xs ui-badge--soft", data: options.badgeTone ? { tone: options.badgeTone } : null }, el("span", { class: "ui-badge__label", text: options.badge }));
  host.prepend(
    el(
      "header",
      { class: "ui-modal__header", data: { modalGenerated: "" } },
      badge ? el("div", { class: "ui-modal__heading" }, title, badge) : title,
      options.description && el("p", { class: "ui-modal__description", text: options.description }),
    ),
  );
}

/* Содержимое в хост. Размеченное анатомией заменяет те же части: принесло
   только __body — шапка из настроек остаётся. Неразмеченное — в новое __body. */
export function fill(host, content) {
  host.removeAttribute("aria-busy");
  const nodes = content instanceof DocumentFragment ? [...content.children] : [content];
  const brought = PARTS.filter((part) => nodes.some((node) => node.matches?.(part)));
  const replaced = brought.length ? brought : [".ui-modal__body"];
  for (const part of host.querySelectorAll(`:scope > ${ANATOMY_SELECTOR}`)) {
    if (replaced.some((selector) => part.matches(selector))) part.remove();
  }
  if (!brought.length) content = el("div", { class: "ui-modal__body" }, content);
  const header = host.querySelector(":scope > .ui-modal__header");
  if (header) header.after(content);
  else host.prepend(content);
}

/* Содержимое источника — в собранный хост; адрес сначала ставит ожидание.
   Одолженное возвращает отданная функция. */
export function put(host, source) {
  if (source.kind === "url") {
    status(host, "loading");
    return null;
  }
  if (source.kind !== "element") {
    fill(host, fragmentOf(source));
    return null;
  }
  const { content, giveBack } = lend(source.node);
  fill(host, content);
  return giveBack;
}

/* Хост для источника. release() возвращает всё на места: авторскую модалку и
   одолженное содержимое — домой. Собранный хост убирает тот, кто его держит:
   окно — вместе со слоем, после события закрытия. */
export function attach(source, options) {
  if (source.kind === "host") {
    const release = source.adopted ? adopt(source.node, options) : borrow(source.node);
    return { host: source.node, generated: false, release };
  }
  const host = el("div", { class: "ui-modal" });
  setHeader(host, options);
  const giveBack = put(host, source);
  return { host, generated: true, release: () => giveBack?.() };
}

/* Ожидание и ошибка — в теле, на месте содержимого. Спиннер показывается с
   задержкой (CSS): быстрый ответ так и не мигнёт им. */
export function status(host, kind) {
  const box =
    kind === "loading"
      ? el("div", { class: STATUS_CLASS }, el("span", { class: "ui-spinner ui-spinner--slice", role: "img", "aria-label": t("loading") }))
      : el(
          "div",
          { class: STATUS_CLASS, role: "alert" },
          el("p", { class: `${STATUS_CLASS}-text`, text: t("failed") }),
          el("button", { class: "ui-btn ui-btn--sm", type: "button", [RETRY_ATTR]: true }, el("span", { class: "ui-btn__label", text: t("retry") })),
        );
  fill(host, box);
  if (kind === "loading") host.setAttribute("aria-busy", "true");
}
