/* Общее для таблиц кита — не модуль каталога. Его берут tableSort, tableResize,
   tableColumns (таблица из разметки) и tableView (таблица с рендером строк):
   подписи, меню сортировки в шапке, ручка ширины и её жест, сдвиги закреплённых
   столбцов и ширины, закреплённые за <col>.

   Меню шапки и меню столбцов — обычный поповер кита, своего вида у них нет. Пункты
   без data-pick: menu:pick всплыл бы до приложения, а его слушатели (тосты
   витрины, меню страниц админки) ждут только свои меню. Выбор слушает модуль и
   закрывает меню через API поповера. */

import { el, isRtl, restore, setAttr, setVar, snapshot } from "../../core/dom.js";
import { track } from "../../core/gesture.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";
import { readPx } from "../../core/tokens.js";
import popover from "../popover/popover.js";

export const TABLE = "table.ui-table";
export const CHECK = "ui-table__check";
export const NUM = "ui-table__num";
export const STICKY = "ui-table__sticky";
export const EDGE = "ui-table__sticky-edge";
export const STICKY_LEFT = "--ui-table-sticky-left";
export const RESIZE = "ui-table__resize";
const RESIZING = "is-resizing";
const SORT_LABEL = "ui-table-view__sort-label";
/* Шаг стрелки на ручке ширины. */
const RESIZE_STEP = 16;

export const t = messages("table", {
  ru: {
    sortBy: "Сортировка: {label}",
    asc: "А → Я",
    desc: "Я → А",
    ascNumber: "1 → 9",
    descNumber: "9 → 1",
    ascDate: "Сначала старые",
    descDate: "Сначала новые",
    reset: "Сбросить сортировку",
    width: "Ширина колонки «{label}»",
    column: "Колонка {n}",
    columns: "Столбцы",
    shown: "Показано {n}",
    empty: "Нет данных",
    loading: "Загрузка…",
    sorting: "Сортировка…",
    selectAll: "Выбрать все",
    selectRow: "Выбрать строку {n}",
  },
  en: {
    sortBy: "Sort by {label}",
    asc: "A → Z",
    desc: "Z → A",
    ascNumber: "1 → 9",
    descNumber: "9 → 1",
    ascDate: "Oldest first",
    descDate: "Newest first",
    reset: "Clear sort",
    width: "Width of “{label}” column",
    column: "Column {n}",
    columns: "Columns",
    shown: "Showing {n}",
    empty: "No data",
    loading: "Loading…",
    sorting: "Sorting…",
    selectAll: "Select all",
    selectRow: "Select row {n}",
  },
});

/* Поповер — тот же экземпляр модуля, что у каталога: один стек слоёв и id. */
let overlay = null;
export const menus = () => (overlay ??= popover.setup());

/* ---- Шапка таблицы из разметки -------------------------------------------- */

/* Столбцы — ячейки первой строки шапки, кроме колонки-чекбокса. Ячейка
   адресуется своим cellIndex: без colspan и rowspan. */
export const headColumns = (table) => [...(table.tHead?.rows[0]?.cells ?? [])].filter((cell) => !cell.classList.contains(CHECK));

/* Подпись столбца: data-label, иначе текст — у ячейки с меню сортировки только
   его подпись (в ячейке ещё и пункты меню). */
export function headerLabel(cell) {
  const text = (cell.dataset.label ?? cell.querySelector(`.${SORT_LABEL}`)?.textContent ?? cell.textContent).trim();
  return text || t("column", { n: cell.cellIndex + 1 });
}

/* ---- Меню сортировки ------------------------------------------------------- */

/* Кнопка шапки с меню «по возрастанию, по убыванию, сбросить». content — узлы
   подписи (переезжают внутрь кнопки; иконка в начале встаёт перед подписью
   отдельно, многоточие режет только текст), end — числовой столбец: стрелки и
   панель у правого края. kind (text | number | date) называет направления
   словами столбца: «А → Я», «1 → 9», «Сначала новые». Панель стоит от ячейки
   шапки, а не от кнопки: край — на черте столбца, ширина — по столбцу (table/table.css),
   как список селекта у своего поля. «Сбросить» виден, только пока столбец
   отсортирован. */
const SORT_WORDS = { text: ["asc", "desc"], number: ["ascNumber", "descNumber"], date: ["ascDate", "descDate"] };
export function sortHeader(content, { label, end = false, kind = "text" }) {
  const name = t("sortBy", { label });
  const [asc, desc] = SORT_WORDS[kind] ?? SORT_WORDS.text;
  const item = (dir, text, glyph, radio = true) =>
    el(
      "button",
      { class: "ui-btn", type: "button", role: radio ? "menuitemradio" : "menuitem", "aria-checked": radio && "false", data: { dir } },
      icon(glyph),
      el("span", { class: "ui-btn__label", text }),
      radio && icon("check", { className: "ui-icon ui-popover__check" }),
    );
  const items = [item("asc", t(asc), "arrow-up-narrow-wide"), item("desc", t(desc), "arrow-down-wide-narrow")];
  const nodes = content.filter((node) => node.nodeType !== 3 || node.textContent.trim());
  const lead = nodes[0]?.classList?.contains("ui-icon") ? nodes[0] : null;
  const trigger = el(
    "button",
    { class: "ui-table-view__sort", type: "button", "data-popover-trigger": true, "aria-haspopup": "menu", "aria-label": name },
    lead,
    el("span", { class: SORT_LABEL }, ...content.filter((node) => node !== lead)),
    el("span", { class: "ui-table-view__sort-icon", "aria-hidden": "true" }, icon("chevrons-up-down"), icon("chevron-up"), icon("chevron-down")),
  );
  const panel = el(
    "div",
    { class: "ui-table-view__sort-panel", "data-popover-panel": true, hidden: true },
    el("div", { class: "ui-popover__menu", role: "menu", "aria-label": name }, ...items, el("div", { class: "ui-popover__menu-sep", hidden: true }), item("reset", t("reset"), "x", false)),
  );
  const host = el(
    "div",
    { class: "ui-popover ui-table-view__sort-host", "data-ui-popover": true, "data-anchor": "th", "data-side": "bottom", "data-align": end ? "end" : "start" },
    trigger,
    panel,
  );
  return { host, trigger, panel, items };
}

/* Выбор в меню шапки: меню закрывается, фокус — на кнопку шапки. Панель открытого
   меню живёт в body, поэтому слушаем её саму. */
export function onSortPick(ctx, menu, pick) {
  ctx.on(menu.panel, "click", (event) => {
    const item = event.target.closest?.("[data-dir]");
    if (!item) return;
    menus().close(menu.host);
    menu.trigger.focus({ preventScroll: true });
    pick(item.dataset.dir === "reset" ? null : item.dataset.dir);
  });
}

/* Стрелку шапки выбирает CSS по aria-sort, галочку в меню — aria-checked;
   «Сбросить» с чертой над ним — только у отсортированного столбца. */
export function paintSort(cell, items, dir) {
  setAttr(cell, "aria-sort", dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none");
  for (const item of items) setAttr(item, "aria-checked", String(item.dataset.dir === dir));
  for (const node of items[0]?.parentElement.querySelectorAll(":scope > [data-dir='reset'], :scope > .ui-popover__menu-sep") ?? []) node.hidden = !dir;
}

/* ---- Ширина столбца -------------------------------------------------------- */

export const resizeHandle = (label) =>
  el("span", { class: RESIZE, role: "separator", "aria-orientation": "vertical", tabindex: "0", "aria-label": t("width", { label }) });

/* Фокусируемый separator обязан нести значение: ширина в px, верх — не меньше
   окна (ARIA по умолчанию считает 0…100). */
export function paintHandle(handle, width, frame) {
  const now = Math.round(width);
  setAttr(handle, "aria-valuenow", String(now));
  setAttr(handle, "aria-valuemax", String(Math.max(now, Math.round(frame))));
}

/* Ручки под root: тянуть указателем (жест ядра — окно слушается только на время
   жеста, Esc возвращает ширину) и стрелками. begin(cell) готовит модель и отдаёт
   ширину столбца, resize(cell, px) её применяет и отдаёт нарисованную ширину
   (для aria-valuenow), frame() — ширина окна. marker — на чём висит курсор
   col-resize, пока жест идёт. Ручка стоит у конца строки: в RTL кромка едет
   влево, и сдвиг указателя и стрелки зеркалятся. */
export function columnResize(ctx, root, marker, { begin, resize, frame }) {
  let gesture = null;
  const handleOf = (event) => {
    const handle = event.target.closest?.(`.${RESIZE}`);
    return handle && root.contains(handle) ? handle : null;
  };
  const sign = (handle) => (isRtl(handle) ? -1 : 1);
  const apply = (handle, cell, width) => {
    const drawn = resize(cell, width);
    if (drawn != null) paintHandle(handle, drawn, frame());
  };
  ctx.on(root, "pointerdown", (event) => {
    const handle = event.button === 0 ? handleOf(event) : null;
    if (!handle) return;
    const cell = handle.closest("th");
    const start = begin(cell);
    if (start == null) return;
    const dir = sign(handle);
    /* Ни выделения текста, ни фокуса, ни чужих жестов под ручкой. */
    event.preventDefault();
    event.stopPropagation();
    gesture = track(event, {
      capture: handle,
      onStart() {
        handle.classList.add(RESIZING);
        marker.classList.add(RESIZING);
      },
      onMove({ dx }) {
        apply(handle, cell, start + dir * dx);
      },
      onEnd({ completed }) {
        gesture = null;
        handle.classList.remove(RESIZING);
        marker.classList.remove(RESIZING);
        if (!completed) apply(handle, cell, start);
      },
    });
  });
  ctx.on(root, "keydown", (event) => {
    const delta = event.key === "ArrowRight" ? RESIZE_STEP : event.key === "ArrowLeft" ? -RESIZE_STEP : 0;
    const handle = delta ? handleOf(event) : null;
    if (!handle) return;
    const cell = handle.closest("th");
    const start = begin(cell);
    if (start == null) return;
    /* Стрелка на ручке двигает кромку, а не прокрутку и не обход таблицы. */
    event.preventDefault();
    event.stopPropagation();
    apply(handle, cell, start + sign(handle) * delta);
  });
  /* Значение ручки — свежее к моменту, когда его прочтёт экранный диктор: ширины
     меняют и окно, и скрытие соседей. Один замер на фокус. */
  ctx.on(root, "focusin", (event) => {
    const handle = handleOf(event);
    if (handle) paintHandle(handle, handle.closest("th").getBoundingClientRect().width, frame());
  });
  ctx.cleanup(() => gesture?.cancel());
}

/* ---- Закреплённые столбцы таблицы из разметки ------------------------------ */

/* Сдвиг закреплённой ячейки — сумма ширин показанных закреплённых левее; край —
   у последней. widths — ширины по cellIndex из модели (после первого жеста
   ширины известны без замера), иначе — один замер шапки до всех записей. */
export function restick(table, widths = null) {
  const head = table.tHead?.rows[0];
  if (!head) return;
  const sticky = [...head.cells].filter((cell) => cell.classList.contains(STICKY) && !cell.hidden);
  const sizes = sticky.map((cell) => (widths ? widths[cell.cellIndex] : cell.offsetWidth));
  const edge = sticky.at(-1)?.cellIndex ?? -1;
  const offsets = new Map();
  let left = 0;
  sticky.forEach((cell, at) => {
    offsets.set(cell.cellIndex, `${left}px`);
    left += sizes[at];
  });
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (!cell.classList.contains(STICKY)) continue;
      const offset = offsets.get(cell.cellIndex);
      if (offset) setVar(cell, STICKY_LEFT, offset);
      cell.classList.toggle(EDGE, cell.cellIndex === edge);
    }
  }
}

/* ---- Ширины таблицы из разметки -------------------------------------------- */

/* Разметку ширин — <col>, ширину таблицы, сдвиги закреплённых — трогают и
   tableResize, и tableColumns. Снимок автора берёт первый, возвращает последний:
   порядок монтирования и снятия модулей любой. Модель ширин (pin) держит тот, кто
   следит за окном, — tableResize (claim(table, true)). */
const claims = new WeakMap();
/* Таблицы, чьи ширины уже в <col> в px (после первого жеста ширины). */
const pinned = new WeakMap();

const colsOf = (table) => [...table.querySelectorAll(":scope > colgroup > col")];
const pxOf = (col) => Number.parseFloat(col?.style.width) || 0;

export function claim(table, model = false) {
  let record = claims.get(table);
  if (!record) {
    /* Атрибут style целиком: свойство, вписанное обратно, сериализуется иначе
       («width: 132px;»), и разметка после снятия не совпала бы с авторской. */
    const style = (node) => [node, snapshot(node, ["style"])];
    const sticky = [...table.querySelectorAll(`.${STICKY}`)].map((cell) => [...style(cell), cell.classList.contains(EDGE)]);
    record = { count: 0, models: 0, styles: [style(table), ...colsOf(table).map(style)], sticky, added: [] };
    claims.set(table, record);
  }
  record.count += 1;
  if (model) record.models += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    record.count -= 1;
    if (model) record.models -= 1;
    if (record.count) {
      /* Ушёл последний, кто следил за окном: замороженная модель держала бы
         таблицу на старой ширине. Ширины — авторские, скрытое остаётся скрытым. */
      if (model && !record.models && pinned.has(table)) {
        unpin(table, record);
        const cols = colsOf(table);
        for (const cell of headColumns(table)) if (cell.hidden && cols[cell.cellIndex]) cols[cell.cellIndex].style.width = "0";
        restick(table);
      }
      return;
    }
    claims.delete(table);
    unpin(table, record);
    for (const [cell, saved, edge] of record.sticky) {
      restore(cell, saved);
      cell.classList.toggle(EDGE, edge);
    }
  };
}

function unpin(table, record) {
  pinned.delete(table);
  for (const [node, saved] of record.styles) restore(node, saved);
  for (const node of record.added) node.remove();
  record.added = [];
}

export const isPinned = (table) => pinned.has(table);

/* Хвост — последний показанный столбец: он несёт остаток окна. */
function tailOf(table) {
  const cells = headColumns(table);
  for (let at = cells.length - 1; at >= 0; at -= 1) if (!cells[at].hidden) return cells[at].cellIndex;
  return -1;
}

/* Перед первым жестом нарисованные ширины переносятся в <col> (сначала все
   замеры, потом записи): раскладка не меняется, а кромка дальше едет за курсором
   один в один. Нет <col> — модуль их добавляет и на снятии убирает. Следующие
   жесты только перечитывают окно. */
export function pin(table, wrap) {
  let state = pinned.get(table);
  if (state) {
    state.frame = wrap.clientWidth;
    return state;
  }
  const record = claims.get(table);
  const cells = [...table.tHead.rows[0].cells];
  const widths = cells.map((cell) => Math.round(cell.getBoundingClientRect().width));
  const frame = wrap.clientWidth;
  const min = readPx(table, "--ui-table-col-min", 64);
  let group = table.querySelector(":scope > colgroup");
  if (!group) {
    group = el("colgroup");
    table.prepend(group);
    record.added.push(group);
  }
  for (let count = group.children.length; count < cells.length; count += 1) {
    const col = el("col");
    group.append(col);
    record.added.push(col);
  }
  colsOf(table).forEach((col, at) => {
    if (at < widths.length) col.style.width = `${widths[at]}px`;
  });
  state = { frame, min, tailFixed: false, tail: null };
  pinned.set(table, state);
  return state;
}

/* Тянут хвост — он перестаёт нести остаток, и таблица равна сумме столбцов.
   Его протянутая ширина запоминается: тянут другой столбец — хвост снова
   добирает остаток окна, но не уже того, что ему дали (как у tableView). */
export function holdTail(table, cell) {
  const state = pinned.get(table);
  if (state) state.tailFixed = cell.cellIndex === tailOf(table);
}

export const columnWidth = (table, cell) => pxOf(colsOf(table)[cell.cellIndex]);

/* Ширины по <col>, хвост — остаток окна (не уже минимума); ширину таблицы пишем
   явно, иначе браузер разлил бы остаток по всем столбцам. Отдаёт ширины по
   cellIndex — для сдвигов закреплённых без замера; не закреплено — null. */
export function refit(table) {
  const state = pinned.get(table);
  if (!state) return null;
  const cols = colsOf(table);
  const widths = cols.map(pxOf);
  const sum = widths.reduce((total, width) => total + width, 0);
  const tail = tailOf(table);
  let width = sum;
  if (state.tailFixed) {
    if (tail >= 0) state.tail = { index: tail, width: widths[tail] };
  } else if (tail >= 0 && cols[tail]) {
    const others = sum - widths[tail];
    const base = state.tail?.index === tail ? state.tail.width : state.min;
    widths[tail] = Math.max(base, state.frame - others);
    cols[tail].style.width = `${widths[tail]}px`;
    width = Math.max(others + widths[tail], state.frame);
  }
  table.style.width = `${width}px`;
  return widths;
}

/* Отдаёт нарисованную ширину столбца — хвост мог взять больше просимого. */
export function setColumnWidth(table, cell, width) {
  const state = pinned.get(table);
  const col = colsOf(table)[cell.cellIndex];
  if (!state || !col) return null;
  const next = Math.max(state.min, Math.round(width));
  if (next !== pxOf(col)) {
    col.style.width = `${next}px`;
    restick(table, refit(table));
  }
  return pxOf(col);
}

/* Окно таблицы поменяло ширину: хвост забирает новый остаток. */
export function reframe(table, frame) {
  const state = pinned.get(table);
  if (!state || state.frame === frame) return;
  state.frame = frame;
  restick(table, refit(table));
}

/* Ширина <col> столбца, который прячут и показывают (tableColumns). */
export function colOf(table, cell) {
  return colsOf(table)[cell.cellIndex] ?? null;
}
