/* Корзина без перезагрузки. Разметку и все формы рисует сервер; модуль только
   отправляет их фоном и подменяет корзину ответом. Без модуля всё работает
   обычными формами — он ничего не добавляет, чего нельзя сделать без него.

     <div class="ui-cart" data-ui-cart data-currency="₽" data-items-total="1250.5">
       <form method="post" action="/cart/items/7" data-ui-cart-submit data-ui-cart-step="1">
         <input type="hidden" name="quantity" value="3"> …
       </form>
       <form method="post" action="/cart/items/7" data-ui-cart-submit data-ui-cart-remove> … </form>
       <input type="radio" name="delivery_key" data-ui-cart-cost="299"
              data-ui-cart-cost-label="299 ₽" data-ui-cart-free-from="3000">
       <dd data-ui-cart-delivery>299 ₽</dd>  <b data-ui-cart-total>1 549,50 ₽</b>
       <div class="ui-cart-summary__free" data-ui-cart-free>
         <span data-ui-cart-free-text>…</span><span class="ui-cart-summary__meter"></span>
       </div>
     </div>

   Формы с data-ui-cart-submit уходят fetch'ем, сервер отвечает как обычно
   (редирект на страницу корзины), и корзина берётся из ответа целиком: цены,
   скидки и итог считает только сервер. Ответ без корзины или ошибка сети —
   форма уходит обычным способом.

   Шаг счётчика (data-ui-cart-step="±1") считается от числа в поле количества
   (.ui-number-field__input), а не от значения в форме: быстрые нажатия подряд складываются, а не повторяют одно
   и то же «3». Число меняется сразу, итог — когда ответит сервер. Запросы идут
   по одному; подменяет корзину только ответ на последний.

   Вписанное в поле количество уходит по Enter и по уходу из поля.

   Удаление (data-ui-cart-remove, шаг или ввод до нуля) уводит строку за время ухода
   (--ui-duration-fast), и уже потом подменяет корзину.

   Выбор доставки (радио с data-ui-cart-cost) пересчитывает строку доставки,
   итог и порог бесплатной на месте, без запроса: стоимость каждого способа
   сервер уже вписал. В заказ она всё равно идёт с сервера.

   Элементы страницы вне корзины с data-ui-cart-sync (ссылка на корзину
   в шапке) подменяются из того же ответа по порядку.

   На хосте — cart:change (detail: { items }) после каждой подмены. */

import { defineComponent } from "../../core/component.js";
import { messages, numberFormat } from "../../core/locale.js";
import { readMs } from "../../core/tokens.js";

const t = messages("cart", {
  ru: { freeLeft: "До бесплатной доставки ещё {sum}" },
  en: { freeLeft: "{sum} more for free delivery" },
});

const SELECTOR = "[data-ui-cart]";
const ITEM = ".ui-cart-item";
const VALUE = ".ui-number-field__input";

/* «146.9» → «146,90 ₽», «1500» → «1 500,00 ₽»: с копейками всегда, как у
   магазинов у дома, — столбик сумм читается ровнее. */
function money(value, currency) {
  const text = numberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return currency ? `${text} ${currency}` : text;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function create(host, ctx) {
  let queue = Promise.resolve();
  let latest = 0;

  /* --- доставка ------------------------------------------------------------ */

  function recount() {
    const picked = host.querySelector("input[data-ui-cart-cost]:checked");
    if (!picked) return;
    const currency = host.dataset.currency ?? "";
    const items = Number.parseFloat(host.dataset.itemsTotal) || 0;
    const cost = Number.parseFloat(picked.dataset.uiCartCost) || 0;
    const freeFrom = Number.parseFloat(picked.dataset.uiCartFreeFrom) || 0;
    for (const node of host.querySelectorAll("[data-ui-cart-delivery]")) node.textContent = picked.dataset.uiCartCostLabel ?? money(cost, currency);
    for (const node of host.querySelectorAll("[data-ui-cart-total]")) node.textContent = money(items + cost, currency);
    const free = host.querySelector("[data-ui-cart-free]");
    if (!free) return;
    const left = freeFrom - items;
    free.hidden = !(freeFrom > 0 && left > 0 && cost > 0);
    if (free.hidden) return;
    const text = free.querySelector("[data-ui-cart-free-text]");
    if (text) text.innerHTML = t("freeLeft", { sum: `<b>${money(left, currency)}</b>` });
    free.style.setProperty("--ui-cart-free", String(Math.min(1, items / freeFrom)));
  }

  /* --- подмена ------------------------------------------------------------- */

  function swap(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const next = host.id ? doc.getElementById(host.id) : doc.querySelector(SELECTOR);
    if (!next) return false;
    for (const { name } of [...host.attributes]) if (name.startsWith("data-") && !next.hasAttribute(name)) host.removeAttribute(name);
    for (const { name, value } of [...next.attributes]) if (name.startsWith("data-")) host.setAttribute(name, value);
    host.replaceChildren(...document.adoptNode(next).childNodes);
    const fresh = doc.querySelectorAll("[data-ui-cart-sync]");
    document.querySelectorAll("[data-ui-cart-sync]").forEach((node, index) => {
      if (fresh[index]) node.replaceWith(document.adoptNode(fresh[index]));
    });
    ctx.emit("cart:change", { items: host.querySelectorAll(ITEM).length });
    return true;
  }

  function send(form) {
    const ticket = (latest += 1);
    const item = form.closest(ITEM);
    const step = Number.parseFloat(form.dataset.uiCartStep);
    const field = form.elements.namedItem("quantity");
    let leaving = form.hasAttribute("data-ui-cart-remove");

    if (Number.isFinite(step) && item && field) {
      const shown = item.querySelector(VALUE);
      const next = Math.max(0, (Number.parseFloat(shown?.value.replace(",", ".")) || 0) + step);
      field.value = String(next);
      if (shown) shown.value = String(next).replace(".", ",");
      leaving = next === 0;
    } else if (item && field && Number.parseFloat(String(field.value).replace(",", ".")) === 0) {
      leaving = true;
    }
    const body = new FormData(form);

    if (item) item.dataset.state = leaving ? "leaving" : "busy";
    const gone = leaving ? wait(readMs(host, "--ui-duration-fast", 100)) : null;

    queue = queue
      .then(() => fetch(form.action, { method: "POST", body, credentials: "same-origin", headers: { Accept: "text/html" } }))
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const html = await response.text();
        await gone;
        if (ticket !== latest) return;
        if (!swap(html)) window.location.assign(response.url);
      })
      .catch(() => {
        if (ticket === latest) HTMLFormElement.prototype.submit.call(form);
      });
  }

  ctx.on(host, "submit", (event) => {
    const form = event.target;
    if (event.defaultPrevented || !(form instanceof HTMLFormElement) || !form.hasAttribute("data-ui-cart-submit")) return;
    event.preventDefault();
    send(form);
  });
  ctx.on(host, "change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.hasAttribute("data-ui-cart-cost")) recount();
    /* Вписанное количество уходит, как только из поля вышли. */
    else if (input.matches(VALUE) && input.form?.hasAttribute("data-ui-cart-submit")) input.form.requestSubmit();
  });
  recount();

  return { recount, destroy() {} };
}

export default defineComponent({
  name: "cart",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({ recount: (host) => get(host)?.recount() }),
});
