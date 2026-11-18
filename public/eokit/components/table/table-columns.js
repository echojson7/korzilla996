/* Столбцы: видимость столбцов таблицы, написанной автором в разметке.

     <div class="ui-table-columns" data-ui-table-columns data-table="orders" data-label="Столбцы"></div>
     <div class="ui-table-wrap">
       <table class="ui-table" id="orders">…</table>
     </div>

   Таблица — по data-table (id или селектор; не нашлась — модуль не ставится),
   без него — следующая за блоком в том же родителе, иначе первая там же. Столбцы —
   первая строка шапки, кроме колонки-чекбокса; подпись — data-label или текст.

   Хост и есть поповер кита: кнопка «Столбцы» и меню с флажками (menuitemcheckbox),
   отметка меню не закрывает. Скрытие — hidden на ячейках всех строк плюс нулевая
   ширина <col>, иначе от столбца осталась бы пустая полоса; поэтому без colspan и
   rowspan. Показанный столбец возвращается к ширине, с которой его спрятали
   (после tableResize — к протянутой). Последний показанный не снимается.

   kit("tableColumns").get(host): getHidden(), setHidden(index, hidden), showAll(),
   refresh() — спрятать ячейки строк, добавленных позже, и дать им текущие сдвиги
   закреплённых. На хосте —
   table-columns:change (detail: table, hidden, visible). */

import { defineComponent } from "../../core/component.js";
import { el, restore, setAttr, snapshot } from "../../core/dom.js";
import { frame } from "../../core/schedule.js";
import { icon } from "../../core/icons.js";
import { readPx } from "../../core/tokens.js";
import { TABLE, claim, colOf, headColumns, headerLabel, isPinned, menus, refit, restick, t } from "./table-shared.js";

/* Таблица с рендером строк — со своей сеткой: её не трогаем. */
const usable = (table) => !!table?.tHead && !table.closest(".ui-table-view");

function tableOf(host) {
  const ref = host.dataset.table?.trim();
  if (ref) {
    let found = document.getElementById(ref);
    try {
      found ??= document.querySelector(ref);
    } catch {
      /* Невалидный селектор автора — та же ошибка разметки, что и пустой. */
    }
    const table = found?.matches(TABLE) ? found : found?.querySelector(TABLE);
    return usable(table) ? table : null;
  }
  const tables = [...(host.parentElement?.querySelectorAll(TABLE) ?? [])].filter(usable);
  return tables.find((table) => host.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) ?? tables[0] ?? null;
}

function writeWidth(col, width) {
  if (!col) return;
  if (width) col.style.width = width;
  else col.style.removeProperty("width");
}

function create(host, ctx) {
  const table = tableOf(host);
  const cells = table ? headColumns(table) : [];
  if (!cells.length) return null;

  const columns = cells.map((cell) => ({ cell, index: cell.cellIndex, label: headerLabel(cell), author: colOf(table, cell)?.style.width ?? "", authorHidden: cell.hidden }));
  const hidden = new Set(columns.filter((column) => column.authorHidden).map((column) => column.index));
  /* Ширина <col> в момент скрытия: показанный столбец встаёт на неё. И ширина,
     с которой столбец был нарисован: если, пока он скрыт, tableResize перенёс
     ширины в <col> (его — нулём), показанный встаёт на неё, а не на 0. */
  const memory = new Map();
  const drawn = new Map();
  const saved = { host: snapshot(host, ["class", "data-ui-popover"]), children: [...host.childNodes] };
  const release = claim(table);
  const label = host.dataset.label ?? t("columns");

  const trigger = el(
    "button",
    { class: "ui-btn ui-btn--sm ui-table-columns__trigger", type: "button", "data-popover-trigger": true, "aria-haspopup": "menu" },
    el("span", { class: "ui-btn__label", text: label }),
    icon("chevron-down"),
  );
  for (const column of columns) {
    column.item = el(
      "button",
      { class: "ui-btn ui-table-columns__item", type: "button", role: "menuitemcheckbox", "aria-checked": "true", data: { column: String(column.index) } },
      el("span", { class: "ui-btn__label", text: column.label }),
      icon("check", { className: "ui-icon ui-popover__check" }),
    );
  }
  const panel = el("div", { "data-popover-panel": true, hidden: true }, el("div", { class: "ui-popover__menu", role: "menu", "aria-label": label }, ...columns.map((column) => column.item)));

  host.classList.add("ui-table-columns", "ui-popover");
  host.dataset.uiPopover = "";
  host.replaceChildren(trigger, panel);

  /* Последний показанный снять нельзя: вернуть его было бы нечем. */
  function paint() {
    const alone = columns.length - hidden.size <= 1;
    for (const column of columns) {
      const shown = !hidden.has(column.index);
      setAttr(column.item, "aria-checked", String(shown));
      column.item.disabled = shown && alone;
    }
  }

  function cellsOf(index, run) {
    for (const row of table.rows) {
      const cell = row.cells[index];
      if (cell) run(cell);
    }
  }

  /* Столбец скрыт или показан в памяти и в ячейках; раскладку и событие даёт
     commit — один раз на любое число столбцов. */
  function apply(index, hide) {
    const column = columns.find((item) => item.index === Number(index));
    if (!column || hide === hidden.has(column.index)) return false;
    if (hide && columns.length - hidden.size <= 1) return false;
    /* <col> — каждый раз заново: tableResize добавляет их, если автор не дал. */
    const col = colOf(table, column.cell);
    if (hide) {
      memory.set(column.index, col?.style.width ?? "");
      if (!isPinned(table)) drawn.set(column.index, `${Math.round(column.cell.getBoundingClientRect().width)}px`);
      hidden.add(column.index);
    } else {
      hidden.delete(column.index);
    }
    cellsOf(column.index, (cell) => {
      cell.hidden = hide;
    });
    writeWidth(col, hide ? "0" : shownWidth(column));
    return true;
  }

  function commit() {
    /* Ширины после tableResize — из модели; без неё — один замер шапки. */
    restick(table, refit(table));
    paint();
    ctx.emit("table-columns:change", {
      table,
      hidden: [...hidden],
      visible: columns.filter((item) => !hidden.has(item.index)).map((item) => item.index),
    });
  }

  function setHidden(index, hide = true) {
    if (!apply(index, hide)) return false;
    commit();
    return true;
  }

  /* Нулевая ширина <col> скрытого столбца — не его ширина: её дал перенос ширин
     в <col>, пока столбец был скрыт. Скрытый автором — на токен ширины. */
  function shownWidth(column) {
    const width = memory.get(column.index) ?? column.author;
    if (Number.parseFloat(width) || !isPinned(table)) return width;
    return drawn.get(column.index) ?? `${readPx(table, "--ui-table-col-w", 160)}px`;
  }

  /* Отметка не закрывает меню. Пункты без data-pick: menu:pick ушёл бы слушателям
     приложения. Панель открытого меню живёт в body — слушаем её саму. */
  ctx.on(panel, "click", (event) => {
    const item = event.target.closest?.("[data-column]");
    if (item) setHidden(item.dataset.column, item.getAttribute("aria-checked") === "true");
  });

  /* Скрытое автором прячется во всех строках сразу, а сдвиги закреплённых — в
     ближайшем кадре: замер при монтировании заставил бы раскладку. */
  function hideRows() {
    for (const index of hidden) {
      cellsOf(index, (cell) => {
        cell.hidden = true;
      });
    }
  }
  const settle = frame(() => restick(table, refit(table)));
  if (hidden.size) {
    hideRows();
    for (const column of columns) if (hidden.has(column.index)) writeWidth(colOf(table, column.cell), "0");
    settle();
  }
  ctx.cleanup(settle.cancel);

  paint();
  menus().mount(host);

  return {
    getHidden: () => [...hidden],
    setHidden: (index, hide) => setHidden(index, hide !== false),
    showAll() {
      if ([...hidden].map((index) => apply(index, false)).some(Boolean)) commit();
      return [...hidden];
    },
    refresh() {
      hideRows();
      restick(table, refit(table));
    },
    destroy() {
      menus().unmount(host);
      /* Скрытое автором остаётся скрытым, показанное — показанным. */
      for (const column of columns) {
        if (hidden.has(column.index) === column.authorHidden) continue;
        cellsOf(column.index, (cell) => {
          cell.hidden = column.authorHidden;
        });
        writeWidth(colOf(table, column.cell), column.authorHidden ? "0" : shownWidth(column));
      }
      release();
      /* Остался tableResize с протянутыми ширинами — хвост и сдвиги по его модели;
         иначе разметку автора вернул снимок. */
      const widths = refit(table);
      if (widths) restick(table, widths);
      host.replaceChildren(...saved.children);
      restore(host, saved.host);
    },
  };
}

export default defineComponent({ name: "tableColumns", selector: "[data-ui-table-columns]", create });
