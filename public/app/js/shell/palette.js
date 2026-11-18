/* Палитра команд — палитра кита (data-ui-command). Строки: страницы манифеста,
   команды манифеста и строки модулей из данных (extensions.search).

   Кит запоминает строки на первом открытии, а у нас они зависят от сайта, языка и
   данных, поэтому хост собирается заново перед каждым открытием. Строки из данных
   на пустом запросе не показываются: палитра открывается коротким списком страниц
   и действий, заказы и товары появляются, когда что-то набрано.

   Скрытая кнопка data-command-trigger — потому что open() кита без триггера
   падает (setAttr(null) в command.js); открывают палитру ⌘K, «/» и поле поиска.

   Последняя строка — «Спросить помощника: «…»» (data-command-query кита): видна,
   когда что-то набрано, и получает Enter, если больше ничего не нашлось. */

import { html } from "../ui/html.js";
import { icon, e3d } from "../ui/icons.js";
import { kit, mount, unmount, kbd } from "../ui/kit.js";
import { search } from "../core/extensions.js";
import { t, label } from "../core/i18n.js";
import { isOn } from "../ai/assistant.js";
import { quotes } from "../ai/panel.js";

let host = null;
let input = null;
let rows = [];

/* Строка: { group, label, lead?, icon?, hint?, value?, href?, action?, lazy? } */
function collect(index) {
  const pages = [...index.pages.values()]
    .filter((page) => index.canAccess(page) && !page.path.includes(":") && !page.hidden)
    .map((page) => ({ group: t("Pages"), label: label(page.title), lead: e3d(page.icon ?? "file-text"), href: index.href(page.id) }));
  const commands = index.commands.map((command) => ({
    group: t("Actions"), label: label(command.label), icon: command.icon ?? "chevron-right",
    href: command.page ? index.href(command.page, { query: command.query }) : null, action: command.action ?? null,
  }));
  const data = search.flatMap((provider) => provider().map((row) => ({ ...row, lazy: true })));
  return [...pages, ...commands, ...data];
}

function askRow() {
  const [open, close] = quotes();
  return html`<div class="ui-command__group"><div class="ui-command__item" data-run="ask" data-command-query>${icon("ai")}<span class="ui-command__label">${t("Ask the assistant:")} ${open}<span class="ui-command__query"></span>${close}</span></div></div>`;
}

function markup(list) {
  const groups = new Map();
  list.forEach((row, at) => {
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push([row, at]);
  });
  const lead = (row) => row.lead ?? icon(row.icon ?? "chevron-right");
  return html`
    <div class="ui-command palette" data-ui-command>
      <button type="button" data-command-trigger hidden tabindex="-1">${t("Search")}</button>
      <div class="ui-command__layer" hidden>
        <div class="ui-command__backdrop"></div>
        <div class="ui-command__dialog">
          <h2 class="ui-command__title">${t("Command palette")}</h2>
          <div class="ui-command__search">${icon("search")}<input class="ui-command__input" type="text" placeholder="${t("Search pages, orders, products, customers…")}" aria-label="${t("Search")}" autocomplete="off" spellcheck="false"><kbd class="ui-kbd">Esc</kbd></div>
          <div class="ui-command__list">
            ${[...groups].map(([name, items]) => html`<div class="ui-command__group" ${items[0][0].lazy ? "data-lazy" : ""}><div class="ui-command__heading">${name}</div>${items.map(([row, at]) => html`
              <div class="ui-command__item" data-run="${at}" ${row.value ? html`data-command-value="${row.value}"` : ""}>${lead(row)}<span class="ui-command__label">${row.label}</span>${row.hint ? html`<span class="ui-command__meta">${row.hint}</span>` : ""}</div>`)}</div>`)}
            ${isOn() ? askRow() : ""}
          </div>
          <p class="ui-command__empty" hidden>${t("Nothing found. Try an order number or a SKU.")}</p>
          <div class="ui-command__foot"><span>${kbd("↑", "↓")}${t("to move")}</span><span>${kbd("↵")}${t("to open")}</span></div>
        </div>
      </div>
    </div>`;
}

/* На пустом запросе прячем группы из данных — после фильтра кита. */
function hideLazy() {
  if (!input || input.value.trim()) return;
  input.closest(".ui-command__dialog").querySelectorAll(".ui-command__group[data-lazy]").forEach((group) => { group.hidden = true; });
}

/* Открытый слой кит уносит из хоста в body; признак открытия — у поля. */
export const isOpen = () => input?.getAttribute("aria-expanded") === "true";

/* run(row) — оболочка решает, что делать со строкой (переход или действие). */
export function openPalette(index, run) {
  if (host) {
    if (isOpen()) return closePalette();
    unmount(host);
    host.remove();
  }
  rows = collect(index);
  const box = document.createElement("div");
  box.innerHTML = String(markup(rows));
  host = box.firstElementChild;
  document.body.append(host);
  mount(host);
  host.addEventListener("command:select", (event) => {
    const { item, query } = event.detail;
    const row = item.dataset.run === "ask" ? { ask: query } : rows[Number(item.dataset.run)];
    if (row) queueMicrotask(() => run(row));
  });
  /* Слушатель после слушателя кита: тот уже отфильтровал строки. */
  input = host.querySelector(".ui-command__input");
  input.addEventListener("input", hideLazy);
  kit("command").open(host);
  hideLazy();
}

export function closePalette() {
  if (host) kit("command").close(host);
}
