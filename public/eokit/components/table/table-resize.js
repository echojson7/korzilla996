/* Ширина столбцов таблицы, написанной автором в разметке.

     <div class="ui-table-wrap" data-ui-table-resize>
       <table class="ui-table">…</table>
     </div>

   Ручки встают в ячейки первой строки шапки (кроме колонки-чекбокса) и тянутся
   указателем и стрелками. Перед первым жестом нарисованные ширины переносятся в
   <col> (нет <col> — модуль их добавит); дальше остаток окна несёт хвостовой
   столбец — кромка любого другого едет ровно за курсором; тянули сам хвост —
   таблица равна сумме столбцов. Сдвиги закреплённых столбцов считаются по модели
   ширин, без замеров на каждом шаге. Esc во время жеста возвращает ширину.

   kit("tableResize").get(host).refresh() — сдвиги закреплённых для строк,
   добавленных позже. Снятие возвращает ширины <col>, ширину таблицы и сдвиги
   закреплённых столбцов автора. */

import { defineComponent } from "../../core/component.js";
import { observeSize } from "../../core/observe.js";
import {
  TABLE,
  claim,
  columnResize,
  columnWidth,
  headColumns,
  headerLabel,
  holdTail,
  paintHandle,
  pin,
  refit,
  reframe,
  resizeHandle,
  restick,
  setColumnWidth,
} from "./table-shared.js";

function create(host, ctx) {
  const table = host.querySelector(TABLE);
  const cells = table ? headColumns(table) : [];
  if (!cells.length) return null;

  const release = claim(table, true);
  const handles = cells.map((cell) => cell.appendChild(resizeHandle(headerLabel(cell))));

  columnResize(ctx, table.tHead, table, {
    begin(cell) {
      pin(table, host);
      holdTail(table, cell);
      return columnWidth(table, cell);
    },
    resize: (cell, width) => setColumnWidth(table, cell, width),
    frame: () => host.clientWidth,
  });

  /* Окно поменяло ширину — хвост забирает новый остаток. До первого жеста
     таблица и так во всю ширину: модель ничего не пишет. Ширины шапки — в фазе
     чтений, для значений ручек. */
  ctx.cleanup(observeSize(host, {
    read: () => ({ frame: host.clientWidth, widths: cells.map((cell) => cell.getBoundingClientRect().width) }),
    write({ frame, widths }) {
      reframe(table, frame);
      handles.forEach((handle, at) => paintHandle(handle, widths[at], frame));
    },
  }));

  return {
    /* Строки, добавленные после жеста, ещё со сдвигами автора. */
    refresh: () => restick(table, refit(table)),
    destroy() {
      for (const handle of handles) handle.remove();
      release();
    },
  };
}

export default defineComponent({ name: "tableResize", selector: "[data-ui-table-resize]", create });
