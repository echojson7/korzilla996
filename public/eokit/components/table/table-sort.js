/* Сортировка таблицы, написанной автором в разметке.

     <div class="ui-table-wrap" data-ui-table-sort>
       <table class="ui-table">
         <thead><tr><th data-sort="number">№</th><th>Покупатель</th><th data-sort="none">…</th></tr></thead>
         <tbody><tr><td>1042</td><td data-sort-value="Кузнецова">…</td>…</tr></tbody>
       </table>
     </div>

   Ячейка первой строки шапки (кроме колонки-чекбокса, data-sort="none" и ячеек со
   своими кнопками и ссылками — их не завернуть в кнопку) получает то же меню, что
   шапка таблицы с рендером строк: по возрастанию, по убыванию, сбросить.
   data-sort="number" сравнивает числа, иначе строки по локали; data-sort="date" —
   тоже строки (ключ год-месяц-день), меню называет направления «Сначала старые» и
   «Сначала новые». Ключ ячейки —
   data-sort-value, иначе её текст. Строки tbody переставляются в DOM; «Сбросить»
   возвращает исходный порядок — и строк, добавленных позже, тоже.

   kit("tableSort").get(host).setSort(index, dir) / getSort(); на хосте —
   table-sort:change (detail: index, dir). Снятие возвращает шапку и порядок строк. */

import { defineComponent } from "../../core/component.js";
import { restore, snapshot } from "../../core/dom.js";
import { collator } from "../../core/locale.js";
import { CHECK, NUM, RESIZE, TABLE, headerLabel, menus, onSortPick, paintSort, sortHeader } from "./table-shared.js";
import { keysOf, orderOf } from "./table-order.js";

const DIRS = new Set(["asc", "desc"]);
/* Своё управление в ячейке шапки: кнопку в кнопку не вложить. */
const INTERACTIVE = `:is(a[href], button, input, select, textarea, [tabindex]):not(.${RESIZE})`;

function keyOf(cell, numeric) {
  const raw = (cell?.dataset.sortValue ?? cell?.textContent ?? "").trim();
  if (!numeric) return raw;
  /* Типографский минус (U+2212) — тоже минус: «−300 ₽» не должно стать 300. */
  const value = Number.parseFloat(raw.replace(/\s/g, "").replace(",", ".").replace(/\u2212/g, "-").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(value) ? value : Number.NaN;
}

function create(host, ctx) {
  const table = host.querySelector(TABLE);
  const body = table?.tBodies[0];
  const head = table?.tHead?.rows[0];
  if (!body || !head) return null;

  /* Исходный порядок — номер строки, а не снимок списка: строки, которые
     приложение добавит или уберёт потом, не воскресают и не теряются. Пока
     таблица не отсортирована, порядок DOM и есть исходный: перед сортировкой
     номера берутся заново, и строка, вставленная приложением сверху, после
     «Сбросить» вернётся наверх. Добавленная во время сортировки — в конец. */
  const ranks = new WeakMap();
  let next = 0;
  const rankOf = (row) => {
    let rank = ranks.get(row);
    if (rank === undefined) ranks.set(row, (rank = next++));
    return rank;
  };
  const rerank = () => {
    next = 0;
    for (const row of body.rows) ranks.set(row, next++);
  };
  rerank();

  const columns = [...head.cells]
    .filter((cell) => !cell.classList.contains(CHECK) && cell.dataset.sort !== "none" && !cell.querySelector(INTERACTIVE))
    .map((cell) => {
      const label = headerLabel(cell);
      const content = [...cell.childNodes].filter((node) => !node.classList?.contains(RESIZE));
      const kind = cell.dataset.sort === "number" || cell.dataset.sort === "date" ? cell.dataset.sort : "text";
      const menu = sortHeader(content, { label, end: cell.classList.contains(NUM), kind });
      cell.prepend(menu.host);
      return { cell, index: cell.cellIndex, numeric: cell.dataset.sort === "number", menu, content, saved: snapshot(cell, ["aria-sort"]) };
    });
  if (!columns.length) return null;

  let sort = { index: null, dir: null };
  const paint = () => {
    for (const column of columns) paintSort(column.cell, column.menu.items, sort.index === column.index ? sort.dir : null);
  };

  /* Строки — в исходном порядке, потом порядок по ключам (оба направления
     сразу, пустые в конце, равные — как в исходном). Двигаются только строки не
     на своём месте. */
  function arrange(column, dir) {
    const rows = [...body.rows].sort((a, b) => rankOf(a) - rankOf(b));
    let order = rows;
    if (column) {
      const job = keysOf(rows.length, column.numeric);
      rows.forEach((row, at) => {
        const key = keyOf(row.cells[column.index], column.numeric);
        if (column.numeric) job.keys[at] = key;
        else job.put(at, key);
      });
      const sorted = orderOf(job, collator())[dir];
      order = Array.from(sorted, (at) => rows[at]);
    }
    /* Курсором, а не body.rows[at]: живой список после каждой вставки
       пересчитывается с начала. */
    let cursor = body.rows[0] ?? null;
    for (const row of order) {
      if (row === cursor) cursor = cursor.nextElementSibling;
      else body.insertBefore(row, cursor);
    }
  }

  function setSort(index, dir) {
    const column = dir == null ? null : columns.find((item) => item.index === index);
    if (dir != null && (!column || !DIRS.has(dir))) return false;
    if (sort.index === null) rerank();
    sort = column ? { index, dir } : { index: null, dir: null };
    arrange(column, dir);
    paint();
    ctx.emit("table-sort:change", { ...sort });
    return true;
  }

  for (const column of columns) onSortPick(ctx, column.menu, (dir) => setSort(column.index, dir));

  paint();
  for (const column of columns) menus().mount(column.menu.host);

  return {
    setSort,
    getSort: () => ({ ...sort }),
    destroy() {
      /* Не отсортирована — порядок DOM и так исходный, в том числе для новых строк. */
      if (sort.index !== null) arrange(null);
      for (const column of columns) {
        menus().unmount(column.menu.host);
        column.menu.host.replaceWith(...column.content);
        restore(column.cell, column.saved);
      }
    },
  };
}

export default defineComponent({ name: "tableSort", selector: "[data-ui-table-sort]", create });
