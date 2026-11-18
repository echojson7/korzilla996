/* Страница-список: один каркас и один пульт на все списки админки (заказы,
   клиенты, товары, записи, заявки).

   Каркас — разметка: шапка (pageHead), полоса инструментов (toolbar: поиск,
   вкладки, фильтры, выбор строк), строки пагинации над и под карточкой, карточка
   с таблицей кита и пустым состоянием. Пульт (listControl) — всё, что в списке
   живёт на месте: поиск с задержкой, номер и размер страницы, порядок столбца,
   вкладки и фильтры в адресе, «Сбросить». Страница пишет только своё: столбцы,
   строку, отбор и действия.

   Списки бывают двух видов, и пульту всё равно какой: paint(state) красит строки
   и отвечает, что показать в пагинации.
     по данным — отбор и страница считаются по массиву, в таблице только видимые
                 строки (pageOf): заказов и покупателей тысячи;
     по строкам — все строки в таблице, порядок держит кит, поиск и страница
                 прячут лишние (showRows): товары и записи. */

import { html, raw, on } from "../ui/html.js";
import { icon } from "../ui/icons.js";
import { item, mount, unmount } from "../ui/kit.js";
import { searchInput, check, pager, paintPager, perPage, onPageSize } from "../ui/blocks.js";
import { number } from "../ui/format.js";
import { t, locale } from "../core/i18n.js";

export { perPage };

/* ---- Каркас ------------------------------------------------------------------- */

/* Страница списка целиком: пагинация над карточкой видна, только когда листать есть что. */
export const listFrame = ({ head, toolbar = "", size, card, cls = "" }) => html`<div class="page${cls ? ` ${cls}` : ""}">
      ${head}
      ${toolbar}
      ${pager({ head: true, size })}
      ${card}
      ${pager({ size })}
    </div>`;

/* Полоса инструментов: поиск, вкладки, место для массовых действий (selection —
   id полосы выбора), конец строки (фильтры, меню). */
export const toolbar = ({ search = null, tabs = "", selection = "", end = "", cls = "" }) => html`<div class="toolbar${cls ? ` ${cls}` : ""}">
        ${search ? searchInput({ secondary: true, data: "data-search", ...search }) : ""}
        ${tabs}
        ${selection ? html`<span class="selection" id="${selection}"></span>` : ""}
        ${end ? html`<div class="toolbar__end">${end}</div>` : ""}
      </div>`;

/* Вкладки над списком. Вкладка — { key, label, count, shown }: счёт рядом
   с подписью, если он есть; shown: false прячет его до поиска. */
export const segments = (name, aria, tabs, current) => html`<div class="ui-tabs" data-ui-tabs data-segments="${name}">
          <div class="ui-tabs__list" role="tablist" aria-label="${aria}">${tabs.map(({ key, label, count = null, shown = true }) => html`<button class="ui-tabs__trigger" type="button" role="tab" data-value="${key}" aria-selected="${key === current}">${label}${count == null ? "" : html` <span class="faint num" data-count="${key}" ${shown ? "" : "hidden"}>${count}</span>`}</button>`)}</div>
        </div>`;

/* Фильтр — выпадашка кита: без значения «Оплата ˅», с ним «Оплата Оплачен ˅».
   Выбор пишется в адрес (listControl, filters) и перерисовывает страницу. */
const CHEVRON = raw('<span class="ui-icon ui-dropdown__chevron" data-ui-icon="chevron-down" aria-hidden="true"></span>');
export function filterMenu(name, prefix, value, options) {
  const label = value ? options.find(([key]) => key === value)?.[1] : "";
  return html`<div class="ui-popover" data-ui-popover data-ui-dropdown data-align="end" data-filter="${name}">
    <button class="ui-btn ui-btn--secondary" type="button" data-popover-trigger>${label ? html`<span class="ui-dropdown__prefix">${prefix}</span><span class="ui-btn__label">${label}</span>` : html`<span class="ui-btn__label">${prefix}</span>`}${CHEVRON}</button>
    <div data-popover-panel hidden><div class="ui-popover__menu" role="menu">${options.map(([key, text]) => item(key, "", text, { radio: key === value }))}</div></div>
  </div>`;
}

/* Карточка списка: таблица и пустое состояние, видно одно из двух. */
export const listCard = ({ table, some, empty }) => html`<div class="card">
        <div class="sheet-table" ${some ? "" : "hidden"}>${table}</div>
        <div class="list-empty" ${some ? "hidden" : ""}>${empty}</div>
      </div>`;

/* Таблица кита со шапкой из описания столбцов. Столбец — { label, icon, sort,
   num, width (px) | style, cls }; { check: true } — флажок «выбрать все»;
   { actions: true } — узкий столбец меню строки. */
const colOf = (column) => {
  if (column.check) return raw('<col style="width: var(--ui-table-check-w)">');
  const style = column.width ? `width: ${column.width}px` : column.style ?? "";
  return html`<col${column.cls ? html` class="${column.cls}"` : ""}${style ? html` style="${style}"` : ""}>`;
};
const thOf = (column) => {
  if (column.check) return html`<th class="ui-table__check">${check({ label: t("Select all"), data: 'data-sel="all"' })}</th>`;
  if (column.actions) return html`<th scope="col" data-sort="none"><span class="ui-sr-only">${t("Actions")}</span></th>`;
  const cls = [column.num ? "ui-table__num" : "", column.cls ?? ""].filter(Boolean).join(" ");
  return html`<th scope="col"${cls ? html` class="${cls}"` : ""}${column.sort ? html` data-sort="${column.sort}"` : ""}>${column.icon ?? ""}${column.label}</th>`;
};
export const ACTIONS = { actions: true, width: 48 };
export const CHECK = { check: true };

export const listTable = ({ id = "", cls, label, columns, rows, resize = true, stack = true }) => html`<div class="ui-table-wrap ${cls}"${id ? html` id="${id}"` : ""} data-ui-table-sort${resize ? raw(" data-ui-table-resize") : ""}${stack ? raw(" data-ui-table-stack") : ""}>
    <table class="ui-table" aria-label="${label}">
      <colgroup>${columns.map(colOf)}</colgroup>
      <thead><tr>${columns.map(thOf)}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

/* ---- Отбор и страницы ----------------------------------------------------------- */

/* «21–40 из 230». */
export const range = (page, per, total) => t("{from}–{to} of {n}", { from: number((page - 1) * per + 1), to: number(Math.min(page * per, total)), n: number(total) });

/* Порядок по ключу столбца; без ключа или направления — порядок данных. */
const collator = new Intl.Collator(locale);
export function sorted(list, key, dir) {
  if (!key || !dir) return list;
  const sign = dir === "asc" ? 1 : -1;
  const keys = new Map(list.map((one) => [one, key(one)]));
  return [...list].sort((a, b) => {
    const x = keys.get(a);
    const y = keys.get(b);
    return sign * (typeof x === "number" ? x - y : collator.compare(x, y));
  });
}

/* Счёт вкладок по одному отбору: у «Все» — весь отбор. */
export const countTabs = (tabs, base, all = "all") =>
  Object.fromEntries(Object.entries(tabs).map(([key, tab]) => [key, key === all ? base.length : base.filter(tab.test).length]));

/* Страница списка по данным: номер в пределах, строки этой страницы. */
export function pageOf(list, page, per) {
  const pages = Math.max(1, Math.ceil(list.length / per));
  const at = Math.min(Math.max(page, 1), pages);
  return { page: at, pages, rows: list.slice((at - 1) * per, at * per) };
}

/* Страница списка по строкам: прошедшие test режутся на страницы в нынешнем
   порядке строк, остальные прячутся. */
export function showRows(rows, test, { page, per }) {
  const all = [...rows.rows];
  const hits = all.filter(test);
  const pages = Math.max(1, Math.ceil(hits.length / per));
  const at = Math.min(Math.max(page, 1), pages);
  const shown = new Set(hits.slice((at - 1) * per, at * per));
  for (const row of all) row.hidden = !shown.has(row);
  return { page: at, pages, total: hits.length, count: hits.length ? range(at, per, hits.length) : "" };
}

/* ---- Пульт ---------------------------------------------------------------------- */

/* route и params — адрес списка: поиск и страница пишутся в него без перерисовки.
   size — ключ размера страницы, per — нынешний размер. paint(state) красит строки
   по state.text, state.page, state.per и отвечает { page, pages, total, count,
   nav?, per? } — номер в пределах и что показать в пагинации. segment —
   { name, all, reset }: вкладки в адресе (all — вкладка без параметра). filters —
   выпадашки [data-filter] пишут себя в адрес. table — селектор таблицы: смена
   порядка (onSort) ведёт на первую страницу. clear — что делает «Сбросить» после
   очистки поиска (по умолчанию — перекраска). sync(query) — свои параметры
   адреса рядом с поиском и страницей. */
export function listControl(host, ctx, { route, params, size, per, delay = 150, paint, segment = null, filters = false, table = "", onSort = null, scroll = "", clear = null, sync = null }) {
  const state = { text: ctx.query.get("q") ?? "", page: Number(ctx.query.get("page")) || 1, per };

  const run = () => {
    const bar = paint(state);
    state.page = bar.page;
    paintPager(host, { per: state.per, shown: bar.total > 0, ...bar });
    const query = new URLSearchParams(location.hash.split("?")[1] ?? "");
    state.text ? query.set("q", state.text) : query.delete("q");
    state.page > 1 ? query.set("page", state.page) : query.delete("page");
    sync?.(query);
    history.replaceState(null, "", ctx.index.href(route, { params, query }));
  };

  let timer = 0;
  const offs = [
    onPageSize(host, { page: () => state.page, per: () => state.per, apply: (next, at) => { state.per = next; state.page = at; run(); } }),
    on(host, "input", "[data-search]", (event, input) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.text = input.value.trim(); state.page = 1; run(); }, delay);
    }),
    on(host, "pagination:change", "[data-ui-pagination]", (event) => {
      state.page = event.detail.page;
      run();
      const wrap = scroll && host.querySelector(scroll);
      if (wrap && wrap.getBoundingClientRect().top < 0) wrap.scrollIntoView({ block: "start" });
    }),
    on(host, "click", "[data-clear]", () => {
      state.text = "";
      const input = host.querySelector("[data-search]");
      if (input) input.value = "";
      if (clear) return clear();
      state.page = 1;
      run();
    }),
  ];
  if (table) offs.push(on(host, "table-sort:change", table, (event) => { onSort?.(event.detail); state.page = 1; run(); }));
  if (segment) offs.push(on(host, "tabs:change", `[data-segments="${segment.name}"]`, (event) => {
    const value = event.detail.trigger.dataset.value;
    ctx.setQuery({ [segment.name]: value === segment.all ? null : value, page: null, ...(typeof segment.reset === "function" ? segment.reset() : segment.reset) });
  }));
  if (filters) offs.push(on(host, "dropdown:change", "[data-filter]", (event, dropdown) => {
    ctx.setQuery({ [dropdown.dataset.filter]: event.detail.value || null, page: null });
  }));

  return {
    state,
    run,
    off() {
      clearTimeout(timer);
      offs.forEach((off) => off());
    },
  };
}

/* Строка открывает свою запись: щелчок мимо ссылок, кнопок, флажков и меню. */
export const openRows = (host, rows, open, skip = "a, button, label, input, .ui-popover") =>
  on(host, "click", rows, (event, row) => {
    if (!event.target.closest(skip)) open(row);
  });

/* Выбор строк: флажки в строках и «выбрать все» (видимые), полоса массовых
   действий вместо инструментов. render(ids) — её разметка; onBulk(value) —
   действие кнопки [data-bulk], «clear» снимает выбор само. */
export function selectable(host, { wrap, bar, selected, render, onBulk }) {
  const rows = wrap?.querySelector("tbody");
  const toolbar = bar.closest(".toolbar");
  const paint = () => {
    unmount(bar);
    bar.innerHTML = String(render(selected));
    mount(bar);
    toolbar.classList.toggle("has-selection", selected.size > 0);
    if (!rows) return;
    const visible = [...rows.rows].filter((row) => !row.hidden);
    for (const row of rows.rows) {
      const picked = selected.has(row.dataset.entry);
      row.classList.toggle("is-selected", picked);
      row.querySelector("[data-sel]").checked = picked;
    }
    const all = wrap.querySelector('[data-sel="all"]');
    const count = visible.filter((row) => selected.has(row.dataset.entry)).length;
    all.checked = Boolean(visible.length) && count === visible.length;
    all.indeterminate = count > 0 && count < visible.length;
  };
  const offs = [
    on(host, "change", "[data-sel]", (event, input) => {
      const id = input.dataset.sel;
      if (id === "all") [...rows.rows].filter((row) => !row.hidden).forEach((row) => (input.checked ? selected.add(row.dataset.entry) : selected.delete(row.dataset.entry)));
      else if (input.checked) selected.add(id);
      else selected.delete(id);
      paint();
    }),
    on(host, "click", "[data-bulk]", (event, button) => {
      if (button.dataset.bulk !== "clear") return onBulk(button.dataset.bulk);
      selected.clear();
      paint();
    }),
  ];
  return { paint, off: () => offs.forEach((off) => off()) };
}

/* Полоса выбора: «N выбрано», кнопки действий и крестик «снять выбор»
   (glyph — набор иконок страницы). */
export const selectionBar = (count, buttons, glyph = icon) => html`<span class="ui-badge ui-badge--sm" data-tone="blue">${count}</span>
    ${buttons}
    <button class="ui-close ui-close--sm" type="button" data-bulk="clear" aria-label="${t("Clear selection")}" data-ui-tooltip="${t("Clear selection")}">${glyph("x")}</button>`;
