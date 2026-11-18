/* Содержимое модалки по адресу (data-modal="/orders/42", <a href data-modal>,
   open({ url })). Отдельный модуль: модалка грузит его только на первом таком
   открытии, страницам без загрузки он не нужен.

   Только тот же домен — содержимое доверенное, но его код не запускается:
   <script> вынимается, обработчики on* снимаются. Селектор берёт сам элемент
   (форму — с её тегом), без селектора — содержимое body. */

const URL_ATTRS = ["href", "src", "action", "formaction", "poster"];

/* Узлы ответа вместе с корнем — селектор мог взять сам элемент (форму). */
function within(root, selector) {
  return [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
}

/* Ответ встаёт в чужую страницу: относительные адреса считаются от адреса ответа,
   а не страницы; форма без action отправляется туда, откуда пришла. Якоря «#…»
   остаются на месте. */
function rebase(root, base) {
  for (const node of within(root, URL_ATTRS.map((name) => `[${name}]`).join(", "))) {
    for (const name of URL_ATTRS) {
      const value = node.getAttribute(name);
      if (value !== null && !value.startsWith("#")) node.setAttribute(name, new URL(value, base).href);
    }
  }
  for (const node of within(root, "[srcset]")) {
    const sources = node.getAttribute("srcset").split(",").map((item) => item.trim().split(/\s+/));
    node.setAttribute("srcset", sources.map(([address, ...size]) => [new URL(address, base).href, ...size].join(" ")).join(", "));
  }
  for (const form of within(root, "form:not([action])")) {
    if (form.getAttribute("method")?.toLowerCase() !== "dialog") form.setAttribute("action", base);
  }
}

export async function fetchContent(url, select, signal) {
  const address = new URL(url, document.baseURI);
  if (address.origin !== location.origin) throw new Error(`адрес ${address.href} не на этом домене`);
  const response = await fetch(address, { signal, credentials: "same-origin", headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  const root = select ? doc.querySelector(select) : doc.body;
  if (!root) throw new Error(`в ответе нет «${select}»`);
  for (const script of within(root, "script")) script.remove();
  for (const node of within(root, "*")) {
    for (const { name } of [...node.attributes]) if (name.startsWith("on")) node.removeAttribute(name);
  }
  rebase(root, response.url || address.href);
  const fragment = document.createDocumentFragment();
  fragment.append(...(select ? [root] : [...root.childNodes]));
  return fragment;
}
