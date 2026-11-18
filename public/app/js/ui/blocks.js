/* Общие блоки страниц: шапка, заголовок группы, карточка и плашка, показатель,
   чип состояния, пустое состояние, состояние ошибки. Как и когда их брать —
   «Вид страниц» в admin2/ARCHITECTURE.md. */

import { html, raw } from "./html.js";
import { e3d, icon, hicon } from "./icons.js";
import { kit } from "./kit.js";
import { percent } from "./format.js";
import { t } from "../core/i18n.js";
import { read, write } from "../core/store.js";

/* Шапка страницы: заголовок, строка под ним, действия справа. art — объёмная
   иконка 48 слева, ровно в два ряда текста (28 + 20); страница отдаёт сюда свой
   page.icon из манифеста — ту же, что у её пункта в панели сайта и во вкладке. Это акцент
   экрана, второй объёмной на нём нет. */
export const pageHead = (title, sub = "", actions = "", art = "") => html`
  <header class="page-head">
    ${art ? e3d(art, 48) : ""}<div class="page-head__text"><h1 class="page-title">${title}</h1>${sub ? html`<p class="page-sub ui-text-muted">${sub}</p>` : ""}</div>
    ${actions ? html`<div class="page-head__actions">${actions}</div>` : ""}
  </header>`;

/* Заголовок группы блоков на листе: 16/24, под ним подпись, справа ссылка или
   контрол. */
export const sectionHead = (title, { sub = "", end = "", id = "" } = {}) => html`
  <header class="section-head"><div class="section-head__text"><h2 class="ui-text-heading" ${id ? html`id="${id}"` : ""}>${title}</h2>${sub ? html`<p class="ui-text-caption ui-text-muted">${sub}</p>` : ""}</div>${end ? html`<div class="section-head__end">${end}</div>` : ""}</header>`;

/* Блок с заголовком, необязательной подписью и концом строки (ссылка, бейдж).
   По умолчанию — плашка: серая, без рамки, для сводок и виджетов. frame — белая
   карточка в рамке, для таблицы, формы, списка с действиями. */
export const card = ({ title, sub = "", end = "", body, cls = "", id = "", flush = false, foot = "", frame = false }) => html`
  <article class="card${frame ? "" : " card--soft"} ${cls}" ${id ? html`id="${id}"` : ""}>
    ${title ? html`<header class="card__head"><div class="card__title"><h2>${title}</h2>${sub ? html`<p class="ui-text-caption ui-text-muted">${sub}</p>` : ""}</div>${end ? html`<div class="card__end">${end}</div>` : ""}</header>` : ""}
    <div class="${flush ? "card__flush" : "card__body"}">${body}</div>
    ${foot ? html`<footer class="card__foot">${foot}</footer>` : ""}
  </article>`;

/* Показатель — плашка: подпись, число, строка пояснения (дельта, период, линия
   тренда). */
export const stat = ({ label, value, sub = "", cls = "", id = "" }) => html`
  <article class="card stat ${cls}" ${id ? html`id="${id}"` : ""}><div class="stat__top"><span>${label}</span></div><p class="stat__value">${value}</p>${sub ? html`<div class="stat__sub">${sub}</div>` : ""}</article>`;

/* Бейдж — по сетке кнопок кита (владелец, 20.10.2026): берёт размер кнопок рядом.
   sm 28 — в строках списков и шапках карточек, md 32 — в полосе инструментов,
   xs 24 — в таблицах, в строке ниже 40 и в строке пояснения. Флажок и радио —
   крупные, переключатель — средний 36 × 20. */
const sized = (cls, size) => (size === "md" ? cls : `${cls} ${cls}--${size}`);

/* Чип состояния — серый чип кита (.ui-badge--status): тон показывает значок
   у зелёного, жёлтого и красного, точка — у прочих. Тон — по смыслу: blue новое,
   amber в работе или внимание, green готово, red проблема, olive отложено, gray
   черновик и выключено, violet особая отметка. Своя иконка (glyph) встаёт вместо
   значка. */
export const status = (label, tone = "gray", { glyph = "", size = "xs" } = {}) => html`
  <span class="${sized("ui-badge", size)} ui-badge--status" data-tone="${tone}">${glyph ? icon(glyph) : ""}<span class="ui-badge__label">${label}</span></span>`;

/* Рост и падение в процентах: «+13,2%» зелёным, «−2,1%» красным. */
export const delta = (value, { size = "sm" } = {}) => html`
  <span class="${sized("ui-badge", size)} ui-badge--soft ui-badge--mono" data-tone="${value >= 0 ? "green" : "red"}">${percent(value)}</span>`;

/* Ссылка «Смотреть всё» в конце строки карточки. */
export const moreLink = (href, text) => html`<a class="ui-btn ui-btn--ghost ui-btn--sm" href="${href}"><span class="ui-btn__label">${text}</span>${icon("chevron-right", "xs")}</a>`;

export const empty = ({ art = "clipboard-list", title, text = "", action = "" }) => html`
  <div class="empty">${e3d(art, 64)}<h2 class="ui-text-heading empty__title">${title}</h2>${text ? html`<p class="ui-text-muted empty__text">${text}</p>` : ""}${action}</div>`;

/* Страница целиком: адрес не найден, модуль не подключён, ошибка загрузки. */
export const notFound = (hash, home) => html`<div class="page page--center">${empty({
  art: "circle-help", title: t("Nothing here"), text: t("The address {hash} does not match any page.", { hash }),
  action: html`<a class="ui-btn ui-btn--primary" href="${home}"><span class="ui-btn__label">${t("Back to overview")}</span></a>`,
})}</div>`;

export const placeholder = (title, description) => html`<div class="page page--center">${empty({
  art: "rocket", title, text: description || t("This page is declared in the manifest, its module is not connected yet."),
})}</div>`;

export const failure = (error) => html`<div class="page page--center">${empty({
  art: "triangle-alert", title: t("The page failed to load"), text: error?.message ?? String(error),
  action: html`<button class="ui-btn" type="button" data-action="retry">${icon("refresh-cw")}<span class="ui-btn__label">${t("Retry")}</span></button>`,
})}</div>`;

/* Полоса доли кита (0–100). aria-valuenow обязателен: без него кит рисует
   неизвестный срок — бегущий отрезок. */
export const meter = (value, tone = "blue", name = "", cls = "") => html`
  <span class="ui-progress ui-progress--sm ${cls}"><span class="ui-progress__bar" role="progressbar" aria-label="${name}" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="100" data-tone="${tone}" style="--ui-value: ${Math.round(value)}"></span></span>`;

/* Переключатель и флажок кита. */
export const toggle = ({ name = "", checked = false, label = "", data = "", size = "md" }) => html`
  <label class="${sized("ui-switch", size)}"><input type="checkbox" role="switch" ${checked ? "checked" : ""} ${name ? html`name="${name}"` : ""} ${data ? raw(data) : ""} ${label ? html`aria-label="${label}"` : ""}><span class="ui-switch__track" aria-hidden="true"><span class="ui-switch__glyph"></span></span></label>`;

export const check = ({ checked = false, label = "", data = "", size = "md" }) => html`
  <label class="${sized("ui-check", size)}"><input type="checkbox" ${checked ? "checked" : ""} ${data ? raw(data) : ""} aria-label="${label}"><span class="ui-check__box" aria-hidden="true"><span class="ui-icon ui-check__mark" data-ui-icon="checkbox-check" aria-hidden="true"></span></span></label>`;

/* Поле поиска: иконка в поле кита. secondary — серый вариант кита (поле на белом
   листе без своей рамки: поиск в панели инструментов, в колонке списка).
   line — лупа Phosphor (раздел «Товары»). */
export const searchInput = ({ placeholder, value = "", size = "", secondary = false, data = "", line = false }) => html`
  <div class="ui-input__wrap search-input">${(line ? hicon : icon)("search", "xs")}<input class="ui-input${size ? ` ui-input--${size}` : ""}${secondary ? " ui-input--secondary" : ""}" type="search" placeholder="${placeholder}" aria-label="${placeholder}" value="${value}" autocomplete="off" ${data ? raw(data) : ""}></div>`;

/* Строка пагинации списка: счёт («1–50 из 230»), размер страницы и номера
   страниц кита. Ставится над списком (pager({ head: true })) и под ним
   (pager({ size: "orders" })); красит все строки страницы разом paintPager —
   номера в них не расходятся. Верхняя видна, только когда листать есть что: над
   списком в одну страницу она повторяла бы нижнюю. Строки одинаковые: слева
   размер страницы, по центру номера, справа счёт.
   Слушать pagination:change на "[data-ui-pagination]" — событие придёт от любой;
   смену размера — onPageSize. */
const PAGE_SIZES = [10, 20, 50, 100];

/* Размер страницы списка key: выбор человека или умолчание экрана. */
export const perPage = (key, fallback) => {
  const value = read(`${key}.perPage`, fallback);
  return PAGE_SIZES.includes(value) ? value : fallback;
};

export const pager = ({ head = false, size = "" } = {}) => {
  const sizes = size
    ? html`<label class="list-foot__size" data-list-size-wrap>${t("Per page")}<select class="ui-select ui-select--inline" data-size="lg" data-list-size="${size}" aria-label="${t("Rows per page")}">${PAGE_SIZES.map((one) => html`<option value="${one}">${one}</option>`)}</select></label>`
    : "";
  const body = html`${sizes}
    <nav aria-label="${t("Pages")}"><ul class="ui-pagination ui-pagination--sm" data-ui-pagination data-pages="1" data-page="1">
      <li><button class="ui-btn ui-pagination__nav" type="button" data-ui-pagination-nav="prev" aria-label="${t("Previous page")}">${icon("chevron-left")}</button></li>
      <li><button class="ui-btn ui-pagination__nav" type="button" data-ui-pagination-nav="next" aria-label="${t("Next page")}">${icon("chevron-right")}</button></li>
    </ul></nav>
    <span class="num list-foot__count" data-list-count></span>`;
  return head
    ? html`<div class="list-foot list-foot--head" data-list-pager="head" hidden>${body}</div>`
    : html`<footer class="list-foot" data-list-pager hidden>${body}</footer>`;
};

/* shown — есть ли что показывать; nav — нужны ли номера (по умолчанию — когда
   страниц больше одной); per и total — размер страницы и длина списка: выбор
   размера виден, когда список длиннее самой короткой страницы. */
export function paintPager(host, { shown, count = "", page = 1, pages = 1, nav = pages > 1, per = 0, total = 0 }) {
  for (const bar of host.querySelectorAll("[data-list-pager]")) {
    bar.hidden = !shown || (bar.dataset.listPager === "head" && !nav);
    bar.querySelector("[data-list-count]").textContent = count;
    const list = bar.querySelector("[data-ui-pagination]");
    list.closest("nav").hidden = !nav;
    list.dataset.pages = pages;
    list.dataset.page = page;
    kit("pagination").refresh(list);
    const select = bar.querySelector("[data-list-size]");
    if (!select) continue;
    select.closest("[data-list-size-wrap]").hidden = !per || total <= PAGE_SIZES[0];
    if (per && select.value !== String(per)) {
      select.value = String(per);
      kit("select").refresh(select);
    }
  }
}

/* Смена размера: выбор запоминается за списком, а страница берётся та, где
   окажется первая строка прежней, — человек не теряет место. */
export function onPageSize(host, { page, per, apply }) {
  const listener = (event) => {
    const select = event.target.closest?.("[data-list-size]");
    if (!select || !host.contains(select)) return;
    const next = Number(select.value);
    const first = (page() - 1) * per();
    write(`${select.dataset.listSize}.perPage`, next);
    apply(next, Math.floor(first / next) + 1);
  };
  host.addEventListener("change", listener);
  return () => host.removeEventListener("change", listener);
}
