/* Таблица с рендером строк: сотни тысяч записей листаются окном строк вокруг
   прокрутки. Вид — обычная .ui-table: шапка — липкий первый ряд кадра (вбок её
   везёт та же прокрутка, что и строки), полотно держит высоту списка, таблица
   строк стоит в нём на своём Y. Пока окно покрывает кадр, прокрутку ведёт
   браузер; буфер строк перекрывает кадр, который скрипт ещё не догнал.

   Полотно не выше предела прокрутки браузера (--ui-table-track-max), логическая
   позиция масштабируется; при масштабе > 1 колесо и клавиши прокрутки
   пересчитываются в свой шаг (касание листает полотно как есть).

     <div id="receipts" data-height="28rem" data-label="Чеки"></div>

     const view = kit("tableView").create(host, {
       dataSource: { rowCount, getRow },   // или rows: [...]
       columns: [{ id, header, icon, type: "number" | "date" | "checkbox", width, fit, sticky, sortable, format }],
                                           // icon: имя глифа кита — линейная иконка перед подписью шапки
                                           // date: Date, метка времени (мс) или строка для Date.parse (ISO)
                                           // width: число (px), «120px», «9.5rem»; иначе --ui-table-col-w
       getRowId: (row) => row.id,          // по умолчанию row.id, иначе номер строки
       loading: true,                      // скелетон, пока данных нет
     });
     view.setLoading(false);   // данные пришли
     view.refresh();           // догрузились строки, которые getRow отдавал как null
     view.setSort("sum", "desc"); view.getSort();   // { id, dir }; dir null — исходный порядок

   На хосте — table-view:sort (detail: id, dir) после выбора в меню шапки или
   setSort и table-view:select (detail: selection — как getSelection()) после
   отметки строки или «всех».

   Скелетон в трёх местах. До монтирования пустой хост рисует его чистым CSS. Под
   окном строк полотно несёт узор из строк-заглушек по настоящим столбцам: его
   видно там, куда прокрутка доехала раньше скрипта. Строка, которую getRow вернул
   как null, ещё не загружена и рисуется заглушкой.

   Сортировка — меню в шапке: ключи собираются кусками по времени, большой набор
   сортирует воркер, порядок кэшируется на оба направления. Ширину тянут за край
   шапки. Длины берутся из токенов --ui-table-* хоста при первом замере. */

import { defineComponent } from "../../core/component.js";
import { el, restore, setAttr, setText, setVar, snapshot } from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { collator, lang, numberFormat } from "../../core/locale.js";
import { clamp } from "../../core/math.js";
import { observeSize } from "../../core/observe.js";
import { frame, slice, yieldToMain } from "../../core/schedule.js";
import { readPx } from "../../core/tokens.js";
import { keysOf, orderOf } from "./table-order.js";
import { CHECK, EDGE, NUM, STICKY, STICKY_LEFT, columnResize, menus, onSortPick, paintHandle, paintSort, resizeHandle, sortHeader, t } from "./table-shared.js";

/* Окно строк: экран плюс запас с обеих сторон, но не больше потолка. */
const OVERSCAN = 8;
const MAX_VISIBLE = 96;
/* Сортировка: ключи — кусками по времени (не по числу строк); набор больше
   порога уходит в воркер; скелетон — только если ждать дольше порога, иначе он
   мигал бы на каждом быстром выборе. Кэш — порядок двух последних столбцов. */
const SORT_SLICE_MS = 8;
const SORT_LOCAL = 8000;
const SORT_SKELETON_DELAY = 120;
const SORT_CACHE = 2;
/* «Полёт»: прыжок дальше двух экранов за кадр (ползунок). Строки, которые никто
   не успеет прочесть, не рисуем — видно узор полотна — и дорисовываем, когда
   прокрутка встала или после паузы. */
const FLY_SCREENS = 2;
const FLY_SETTLE = 90;
/* Конец прокрутки там, где нет события scrollend. */
const SCROLL_IDLE = 120;
/* Доли ширины плашек-заглушек: детерминированно, чтобы скелетон не мигал. */
const BONE_SHARES = [0.62, 0.45, 0.78, 0.54, 0.7];
const HOST_ATTRS = ["class", "style", "role", "aria-label", "aria-rowcount", "aria-busy"];


/* Окно строк и масштаб по позиции прокрутки — без DOM. */
function computeView({ scrollTop, viewportH, count, rowH, maxScroll }) {
  const total = count * rowH;
  const maxLogical = Math.max(0, total - viewportH);
  const physicalHeight = Math.min(total, maxScroll);
  const maxPhysical = Math.max(0, physicalHeight - viewportH);
  const scale = maxPhysical > 0 ? Math.max(1, maxLogical / maxPhysical) : 1;
  const top = clamp(scrollTop, 0, maxPhysical);
  const logicalTop = clamp(top * scale, 0, maxLogical);
  const firstVisible = Math.floor(logicalTop / rowH);
  const screen = Math.max(1, Math.ceil(viewportH / rowH));
  const size = Math.min(MAX_VISIBLE, screen + OVERSCAN * 2);
  const first = count === 0 ? 0 : Math.max(0, firstVisible - OVERSCAN);
  const last = count === 0 ? 0 : Math.min(count, first + size);
  return {
    first,
    last,
    scrollTop: top,
    /* physicalTop − (logicalTop − first·row). При масштабе 1 это просто first·row:
       строки стоят на своём месте, и прокрутка сама наезжает на них. */
    anchorY: top - (logicalTop - first * rowH),
    scale,
    physicalHeight,
    logicalTop,
  };
}

function columnsOf(input) {
  if (!Array.isArray(input) || !input.length) throw new TypeError("[EOKIT] tableView: columns — непустой массив");
  const seen = new Set();
  const columns = input.map((source, index) => {
    const column = source ?? {};
    const id = column.id == null || column.id === "" ? `column-${index}` : String(column.id);
    if (seen.has(id)) throw new TypeError(`[EOKIT] tableView: повторяющийся column.id: ${id}`);
    seen.add(id);
    const selection = column.type === "checkbox";
    return {
      id,
      header: column.header == null ? "" : String(column.header),
      icon: !selection && typeof column.icon === "string" && column.icon ? column.icon : null,
      selection,
      sticky: selection || column.sticky === true,
      edge: false,
      sortable: !selection && column.sortable !== false,
      numeric: column.type === "number" || column.type === "date",
      num: column.type === "number",
      date: column.type === "date",
      fit: !selection && column.fit === true,
      width: column.width,
      format: typeof column.format === "function" ? column.format : null,
      /* Ширина по описанию, нарисованная (хвост добирает остаток) и сдвиг закреплённой. */
      base: 0,
      px: 0,
      left: 0,
      head: null,
      handle: null,
      menu: null,
      items: [],
    };
  });
  const sticky = columns.filter((column) => column.sticky);
  if (sticky.length) sticky.at(-1).edge = true;
  return columns;
}

function sourceOf({ dataSource, rows }) {
  if (dataSource) {
    if (typeof dataSource.getRow !== "function") throw new TypeError("[EOKIT] tableView: dataSource требует getRow(index)");
    return dataSource;
  }
  const list = Array.isArray(rows) ? rows : [];
  return { rowCount: list.length, getRow: (index) => list[index] };
}

/* rowCount перечитывается на refresh(): источник мог догрузить строки. */
function countOf(source) {
  const count = Number(source.rowCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

const classOf = (column) => [column.selection && CHECK, column.num && NUM, column.sticky && STICKY, column.edge && EDGE].filter(Boolean).join(" ") || null;

function textOf(column, row) {
  const raw = row[column.id];
  const value = column.format ? column.format(raw, row) : raw;
  return value == null ? "" : String(value);
}

function checkbox(label) {
  const input = el("input", { type: "checkbox", "aria-label": label || null });
  const node = el("label", { class: "ui-check" }, input, el("span", { class: "ui-check__box", "aria-hidden": "true" }, icon("checkbox-check", { className: "ui-icon ui-check__mark" })));
  return { node, input };
}

/* Ширина столбца из описания: число или «120px» — px, «12rem» — от корня, иначе
   токен. Проценты, em, ch от ячейки не посчитать до раскладки — они тоже токен. */
let rootPx = 0;
function lengthPx(value, fallback) {
  if (typeof value === "number") return value > 0 ? value : fallback;
  const match = /^(\d*\.?\d+)(px|rem)?$/.exec(String(value ?? "").trim());
  const number = match ? Number(match[1]) : 0;
  if (!(number > 0)) return fallback;
  if (match[2] !== "rem") return number;
  rootPx ||= Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return number * rootPx;
}

/* Ключ даты: Date, метка времени или строка (ISO из JSON) — Number() дал бы
   строке NaN, и столбец не сортировался бы вовсе. */
function dateKey(raw) {
  if (raw instanceof Date) return raw.getTime();
  return typeof raw === "string" ? Date.parse(raw) : Number(raw);
}

let canvas = null;
function textWidth(text, font) {
  canvas ??= document.createElement("canvas").getContext("2d");
  canvas.font = font;
  return canvas.measureText(text).width;
}

function create(host, ctx, options = {}) {
  let source = sourceOf(options);
  let count = countOf(source);
  const columns = columnsOf(options.columns);
  const idOf = typeof options.getRowId === "function" ? options.getRowId : (row, index) => row.id ?? index + 1;
  const saved = snapshot(host, HOST_ATTRS);
  const children = [...host.childNodes];

  /* ---- Каркас: строится сразу, без замеров -------------------------------- */

  const headCols = columns.map(() => el("col"));
  const rowCols = columns.map(() => el("col"));
  const headRow = el("tr", { role: "row", "aria-rowindex": "1" });
  const sortHosts = [];
  let headCheck = null;
  for (const column of columns) {
    const cell = el("th", { scope: "col", role: "columnheader", class: classOf(column), data: { column: column.id } });
    const label = column.header || column.id;
    const content = column.icon ? [icon(column.icon), column.header] : [column.header];
    if (column.selection) {
      headCheck = checkbox(t("selectAll"));
      cell.append(headCheck.node);
    } else {
      if (column.sortable) {
        const menu = sortHeader(content, { label, end: column.num, kind: column.date ? "date" : column.num ? "number" : "text" });
        column.items = menu.items;
        column.menu = menu;
        sortHosts.push(menu.host);
        cell.append(menu.host);
      } else {
        cell.append(...content);
      }
      column.handle = cell.appendChild(resizeHandle(label));
    }
    column.head = cell;
    headRow.append(cell);
  }
  /* Внутренние таблицы — только вид: строки и ячейки называют себя сами, и для
     чтения экраном они — строки одной таблицы-хоста с её aria-rowcount. */
  const body = el("tbody", { role: "rowgroup" });
  const rowsTable = el("table", { class: "ui-table ui-table-view__rows", role: "presentation" }, el("colgroup", null, ...rowCols), body);
  const headTable = el("table", { class: "ui-table", role: "presentation" }, el("colgroup", null, ...headCols), el("thead", { class: "ui-table-view__head", role: "rowgroup" }, headRow));
  const rail = el("div", { class: "ui-table-view__head-rail" }, headTable);
  const sizer = el("div", { class: "ui-table-view__sizer" }, rowsTable);
  const emptyEl = el("div", { class: "ui-table-view__empty", hidden: true, text: t("empty") });
  const frameEl = el("div", { class: "ui-table-view__frame" }, rail, sizer, emptyEl);
  const skeleton = el("div", { class: "ui-table-view__skeleton", "aria-hidden": "true" });
  const port = el(
    "div",
    { class: "ui-table-view__port" },
    skeleton,
    frameEl,
  );
  const statusEl = el("span", { class: "ui-table-view__status", hidden: true });
  const countEl = el("span", { class: "ui-table-view__count" });

  host.classList.add("ui-table-view");
  host.setAttribute("role", "table");
  setAttr(host, "aria-label", host.dataset.label ?? host.getAttribute("aria-label"));
  if (host.dataset.height) host.style.setProperty("--ui-table-height", host.dataset.height);
  host.replaceChildren(port, el("div", { class: "ui-table-view__foot" }, statusEl, countEl));

  /* ---- Состояние ---------------------------------------------------------- */

  let metrics = null;
  let destroyed = false;
  let loading = options.loading === true;
  let busy = false;
  /* Кадр: ширина без полосы, высота окна строк без шапки, толщина полосы. */
  let viewportW = 0;
  let viewportH = 0;
  let frameH = 0;
  let headH = 0;
  /* Толщина полосы вбок: известна, только когда полоса есть, — замеряем один раз. */
  let hbar = null;
  let trackW = 0;
  let tailFixed = false;
  let lastTop = 0;
  let lastLeft = 0;
  let range = computeView({ scrollTop: 0, viewportH: 0, count: 0, rowH: 1, maxScroll: 1 });
  let painted = null;
  let lastFirst = 0;
  let anchorPaint = null;
  let skeletonShift = "";
  let skeletonHeight = "";
  let sizerHeight = "";
  let pendingScroll = null;
  /* Прокрутка и наведение. */
  let scrolling = false;
  let settleTimer = 0;
  let idleTimer = 0;
  let frameTop = 0;
  let frameLeft = 0;
  let pointerX = null;
  let pointerY = null;
  let hoverSlot = null;
  /* Выбор: ключи строк; «все» — с исключениями. */
  const selected = new Set();
  const except = new Set();
  let all = false;
  /* Сортировка. */
  let order = null;
  let sort = { id: null, dir: null };
  let sortToken = 0;
  let skeletonTimer = 0;
  let sorter = null;
  let sorterBusy = false;
  let workerBroken = false;
  const cache = new Map();
  /* Пул строк: tr переиспользуются, окно лишь переписывает их содержимое. */
  const slots = [];
  const slotOf = new WeakMap();
  let reported = false;

  const tail = columns.filter((column) => !column.selection).at(-1) ?? null;
  const byHead = (cell) => columns.find((column) => column.head === cell) ?? null;

  function rowAt(index) {
    try {
      return source.getRow(index);
    } catch (error) {
      /* Строка рисуется заглушкой; ошибку источника — в консоль, один раз. */
      if (!reported) console.error("[EOKIT] tableView: getRow упал", error);
      reported = true;
      return null;
    }
  }

  const isSelected = (key) => (all ? !except.has(key) : selected.has(key));

  function setSelected(key, on) {
    const set = all ? except : selected;
    if (on !== all) set.add(key);
    else set.delete(key);
  }

  function paintHeadCheck() {
    if (!headCheck) return;
    const full = all && except.size === 0;
    headCheck.input.checked = full;
    headCheck.input.indeterminate = !full && (all ? except.size > 0 : selected.size > 0);
  }

  function paintSortState() {
    for (const column of columns) if (column.sortable) paintSort(column.head, column.items, sort.id === column.id ? sort.dir : null);
  }

  function refreshMeta() {
    setAttr(host, "aria-rowcount", String(count + 1));
    setText(countEl, t("shown", { n: numberFormat().format(count) }));
    setAttr(countEl, "hidden", loading);
    setAttr(emptyEl, "hidden", count !== 0 || loading);
    setAttr(statusEl, "hidden", !busy && !loading);
    setText(statusEl, loading ? t("loading") : t("sorting"));
    host.classList.toggle("is-busy", busy);
    host.classList.toggle("is-loading", loading);
    setAttr(host, "aria-busy", loading ? "true" : null);
  }

  /* ---- Ширины ------------------------------------------------------------- */

  /* Одна проба canvas на самую длинную строку. Полный проход — только на
     коротком наборе; на длинном — края и редкая выборка. Запас pad·2 + 2: canvas
     и раскладка округляют ширину текста по-разному. */
  function fitWidth(column) {
    let sample = "";
    const take = (index) => {
      const row = rowAt(index);
      if (row == null) return;
      const text = textOf(column, row);
      if (text.length > sample.length) sample = text;
    };
    if (count <= 2000) {
      for (let index = 0; index < count; index += 1) take(index);
    } else {
      take(0);
      take(count - 1);
      const step = Math.ceil(count / 32);
      for (let index = 0; index < count; index += step) take(index);
    }
    /* Иконка шапки — своя ширина и зазор 6 px до подписи. */
    const head = textWidth(column.header, metrics.font) + (column.icon ? metrics.icon + 6 : 0);
    return Math.ceil(Math.max(head, textWidth(sample, metrics.font)) + metrics.pad * 2 + 2);
  }

  function fitColumns() {
    for (const column of columns) {
      if (column.selection) column.base = metrics.check;
      else if (!column.base || column.fit) column.base = lengthPx(column.width, metrics.colW);
      if (column.fit) column.base = Math.max(column.base, fitWidth(column));
    }
  }

  /* Свободное место забирает последний столбец, как у обычной таблицы. Остальные
     держат свою ширину, поэтому номер не сжимается, а полотно может стать шире
     кадра. Тянули сам хвост — таблица равна сумме столбцов. */
  function layout() {
    const sum = columns.reduce((total, column) => total + column.base, 0);
    const slack = tailFixed ? 0 : Math.max(0, viewportW - sum);
    let left = 0;
    let track = 0;
    for (const column of columns) {
      column.px = column.base + (column === tail ? slack : 0);
      column.left = left;
      if (column.sticky) left += column.px;
      track += column.px;
    }
    trackW = tailFixed ? track : Math.max(track, viewportW);
  }

  /* Ширины пишутся прямо в <col>, таблицы и полотно, а не переменной на хосте: она
     наследуется, и каждый шаг ширины пересчитывал бы стиль всех ячеек окна. */
  const widthed = [sizer, headTable, rowsTable];
  let trackPx = "";
  function applyTrack() {
    layout();
    let moved = false;
    const track = `${trackW}px`;
    if (trackPx !== track) {
      trackPx = track;
      moved = true;
      for (const node of widthed) node.style.width = track;
    }
    columns.forEach((column, at) => {
      const width = `${column.px}px`;
      if (headCols[at].style.width !== width) {
        moved = true;
        headCols[at].style.width = width;
        rowCols[at].style.width = width;
      }
      if (column.handle) paintHandle(column.handle, column.px, viewportW);
      if (column.sticky) {
        const left = `${column.left}px`;
        setVar(column.head, STICKY_LEFT, left);
        for (const slot of slots) setVar(slot.cells[at].td, STICKY_LEFT, left);
      }
    });
    if (moved) paintBones();
    /* Полоса вбок есть, когда полотно шире кадра. Её толщину замеряем в следующем
       кадре, когда раскладка уже чистая, — не сразу после записи ширин. */
    const overflow = trackW > viewportW + 0.5;
    if (overflow && hbar === null) measureBar();
    const block = overflow ? (hbar ?? 0) : 0;
    const height = Math.max(0, frameH - block - headH);
    if (height === viewportH) return false;
    viewportH = height;
    return true;
  }

  const measureBar = frame(() => {
    if (destroyed || frameEl.scrollWidth <= frameEl.clientWidth) return;
    hbar = frameEl.offsetHeight - frameEl.clientHeight;
    if (applyTrack()) sync(false);
  });

  /* Узор скелетона: линия строки и по плашке на столбец — фоном слоя под кадром,
     без узлов. Слой не прокручивается: растр один, при прокрутке только сдвиг
     (placeSkeleton). Скруглённая плашка — прямоугольник и круги в углах. В RTL
     столбцы идут справа: отступ плашки — от правого края. */
  function paintBones() {
    const { rowH: row, pad, boneH, boneBox, boxRadius, rtl } = metrics;
    const images = [];
    const sizes = [];
    const positions = [];
    const at = (x) => (rtl ? `right ${x}px top 0` : `${x}px 0`);
    const rect = (x, width, height) => {
      images.push(`linear-gradient(transparent calc(50% - ${height / 2}px), var(--ui-line) 0 calc(50% + ${height / 2}px), transparent 0)`);
      sizes.push(`${width}px ${row}px`);
      positions.push(at(x));
    };
    const dot = (cx, dy, r) => {
      images.push(`radial-gradient(circle ${r}px at 50% calc(50% + ${dy}px), var(--ui-line) ${r - 0.5}px, transparent ${r}px)`);
      sizes.push(`${r * 2}px ${row}px`);
      positions.push(at(cx - r));
    };
    const rounded = (x, width, height, radius) => {
      const r = Math.min(radius, height / 2, width / 2);
      const dy = height / 2 - r;
      rect(x + r, width - r * 2, height);
      if (dy > 0) rect(x, width, height - r * 2);
      for (const cx of [x + r, x + width - r]) {
        dot(cx, -dy, r);
        if (dy > 0) dot(cx, dy, r);
      }
    };
    let x = 0;
    columns.forEach((column, index) => {
      const inner = column.px - pad * 2;
      if (column.selection) {
        /* У столбца выбора полей нет: квадрат по центру, как чекбокс. */
        const box = Math.min(column.px, boneBox);
        rounded(x + (column.px - box) / 2, box, box, boxRadius);
      } else if (inner > boneH) {
        const width = Math.round(inner * BONE_SHARES[index % BONE_SHARES.length]);
        rounded(column.num ? x + column.px - pad - width : x + pad, width, boneH, boneH / 2);
      }
      /* Черта между столбцами — та же, что у настоящих строк; у последнего её
         закрывает край карточки. */
      if (index < columns.length - 1) {
        images.push("linear-gradient(var(--ui-line) 0 0)");
        sizes.push(`1px ${row}px`);
        positions.push(at(x + column.px - 1));
      }
      x += column.px;
    });
    images.push("linear-gradient(to top, var(--ui-line) 1px, transparent 0)");
    sizes.push(`100% ${row}px`);
    positions.push("0 0");
    const { style } = skeleton;
    style.inlineSize = `${trackW}px`;
    style.backgroundImage = images.join(", ");
    style.backgroundSize = sizes.join(", ");
    style.backgroundPosition = positions.join(", ");
  }

  /* ---- Окно строк --------------------------------------------------------- */

  function makeSlot() {
    const tr = el("tr", { role: "row" });
    const cells = columns.map((column) => {
      const td = el("td", { role: "cell", class: classOf(column), data: { column: column.id } });
      if (column.sticky) setVar(td, STICKY_LEFT, `${column.left}px`);
      tr.append(td);
      if (!column.selection) return { td, bone: null };
      const box = checkbox("");
      td.append(box.node);
      return { td, box: box.node, input: box.input, bone: null };
    });
    const slot = { tr, cells, key: null };
    slotOf.set(tr, slot);
    return slot;
  }

  /* Строки, которой ещё нет (getRow вернул null): плашки вместо текста, без
     чекбокса — выбирать нечего. */
  function paintPlaceholder(slot, at) {
    slot.key = null;
    slot.tr.classList.remove("is-selected");
    setAttr(slot.tr, "aria-selected", null);
    setAttr(slot.tr, "aria-busy", "true");
    slot.cells.forEach((cell, col) => {
      const column = columns[col];
      cell.bone ??= el("span", { class: column.selection ? "ui-table-view__bone ui-table-view__bone--box" : "ui-table-view__bone", "aria-hidden": "true" });
      if (!column.selection) setVar(cell.bone, "--ui-tv-bone-w", `${BONE_SHARES[(at + col) % BONE_SHARES.length] * 100}%`);
      if (cell.td.firstChild !== cell.bone || cell.td.childNodes.length > 1) cell.td.replaceChildren(cell.bone);
    });
  }

  /* at — место в текущем порядке; ключ выбора — от строки источника, поэтому
     выбор переживает сортировку. */
  function paintRow(slot, at) {
    const index = order ? order[at] : at;
    const row = rowAt(index);
    setAttr(slot.tr, "aria-rowindex", String(at + 2));
    if (row == null) {
      paintPlaceholder(slot, at);
      return;
    }
    const key = String(idOf(row, index));
    const on = isSelected(key);
    slot.key = key;
    slot.tr.classList.toggle("is-selected", on);
    setAttr(slot.tr, "aria-selected", String(on));
    setAttr(slot.tr, "aria-busy", null);
    slot.cells.forEach((cell, col) => {
      const column = columns[col];
      if (column.selection) {
        if (cell.td.firstChild !== cell.box) cell.td.replaceChildren(cell.box);
        cell.input.checked = on;
        setAttr(cell.input, "aria-label", t("selectRow", { n: at + 1 }));
        return;
      }
      const text = textOf(column, row);
      const node = cell.td.firstChild;
      if (node?.nodeType === Node.TEXT_NODE && !node.nextSibling) {
        if (node.data !== text) node.data = text;
      } else {
        cell.td.textContent = text;
      }
    });
  }

  function paintRows() {
    const size = range.last - range.first;
    while (slots.length < size) slots.push(makeSlot());
    slots.forEach((slot, at) => {
      if (at < size) {
        paintRow(slot, range.first + at);
        if (!slot.tr.parentNode) body.append(slot.tr);
      } else if (slot.tr.parentNode) {
        slot.tr.remove();
      }
    });
    anchorPaint = null;
    placeRows();
  }

  /* Слой скелетона под кадром: вбок — как полотно, по вертикали — фаза строки,
     чтобы заглушки совпали со строками. Высота — не больше содержимого. */
  function placeSkeleton() {
    const row = metrics.rowH;
    const shift = `translate3d(${-lastLeft}px,${-(range.logicalTop % row)}px,0)`;
    if (skeletonShift !== shift) {
      skeletonShift = shift;
      skeleton.style.transform = shift;
    }
    const height = `${Math.min(range.physicalHeight - range.scrollTop, viewportH) + row}px`;
    if (skeletonHeight !== height) {
      skeletonHeight = height;
      skeleton.style.blockSize = height;
    }
  }

  function placeRows() {
    placeSkeleton();
    const height = `${range.physicalHeight}px`;
    if (sizerHeight !== height) {
      sizerHeight = height;
      sizer.style.height = height;
    }
    const y = Math.round(range.anchorY);
    if (y === anchorPaint) return;
    anchorPaint = y;
    rowsTable.style.transform = `translate3d(0,${y}px,0)`;
  }

  /* Пока видимые строки внутри уже собранного окна, прокрутку ведёт браузер.
     Тексты переписываются, только когда кадр дошёл до края буфера. top — уже
     прочитанная позиция: после записей её чтение заставило бы раскладку. */
  function sync(force, top = lastTop) {
    if (!metrics) return;
    lastTop = top;
    const row = metrics.rowH;
    const next = computeView({ scrollTop: top, viewportH, count, rowH: row, maxScroll: metrics.maxScroll });
    const firstVisible = Math.floor(next.logicalTop / row);
    const screen = Math.max(1, Math.ceil((viewportH || row) / row));
    const viewEnd = Math.min(count, firstVisible + screen);
    const covered = !force && painted && firstVisible >= painted.first && viewEnd <= painted.last;
    const jump = Math.abs(firstVisible - lastFirst);
    lastFirst = firstVisible;
    clearTimeout(settleTimer);
    settleTimer = 0;
    if (!force && !covered && scrolling && jump > screen * FLY_SCREENS) {
      settleTimer = setTimeout(() => sync(false, frameEl.scrollTop), FLY_SETTLE);
      return;
    }
    if (covered) {
      range = { ...next, first: painted.first, last: painted.last, anchorY: next.scrollTop - (next.logicalTop - painted.first * row) };
      placeRows();
    } else {
      range = next;
      painted = { first: next.first, last: next.last };
      paintRows();
    }
    watchWheel();
  }

  /* ---- Наведение ---------------------------------------------------------- */

  /* Строка под неподвижным курсором — по геометрии: при прокрутке браузер
     наведение не обновляет, а строки под курсором едут. Позиция кадра
     замеряется в покое и один раз на жест прокрутки. */
  function placeHover() {
    let slot = null;
    if (pointerY !== null && painted && metrics) {
      const local = pointerY - frameTop - headH;
      const inside = local >= 0 && local < viewportH && pointerX >= frameLeft && pointerX < frameLeft + viewportW;
      const index = inside ? Math.floor((range.logicalTop + local) / metrics.rowH) : -1;
      if (index >= painted.first && index < painted.last) slot = slots[index - painted.first];
    }
    if (slot === hoverSlot) return;
    hoverSlot?.tr.classList.remove("is-hover");
    slot?.tr.classList.add("is-hover");
    hoverSlot = slot;
  }

  function readFrame() {
    const rect = frameEl.getBoundingClientRect();
    frameTop = rect.top;
    frameLeft = rect.left;
  }

  ctx.on(frameEl, "pointermove", (event) => {
    if (event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!scrolling) readFrame();
    placeHover();
  }, { passive: true });
  ctx.on(frameEl, "pointerleave", () => {
    pointerX = null;
    pointerY = null;
    placeHover();
  });

  /* ---- Прокрутка ---------------------------------------------------------- */

  function scrollEnded() {
    clearTimeout(idleTimer);
    idleTimer = 0;
    /* Мгновенная прокрутка (scrollToIndex, scrollTop, шаг колеса без анимации):
       scrollend приходит раньше кадра, который её обработал бы. Кадр — сейчас,
       иначе он поднял бы is-scrolling уже после конца, и снять его было бы некому. */
    onScroll.flush();
    if (!scrolling) return;
    scrolling = false;
    host.classList.remove("is-scrolling");
    if (settleTimer) sync(false, frameEl.scrollTop);
  }

  /* Работа прокрутки — один раз в кадр: сначала чтения, потом записи. */
  const onScroll = frame(() => {
    const top = frameEl.scrollTop;
    lastLeft = frameEl.scrollLeft;
    if (!scrolling) {
      readFrame();
      scrolling = true;
      host.classList.add("is-scrolling");
    }
    sync(false, top);
    placeHover();
  });
  const hasScrollEnd = "onscrollend" in window;
  ctx.on(frameEl, "scroll", () => {
    onScroll();
    if (hasScrollEnd) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(scrollEnded, SCROLL_IDLE);
  }, { passive: true });
  if (hasScrollEnd) ctx.on(frameEl, "scrollend", scrollEnded);

  /* Полотно сжато (масштаб > 1): шаг колеса — в строках логического списка, иначе
     одно деление уносило бы десятки строк. */
  function onWheel(event) {
    if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? metrics.rowH : event.deltaMode === 2 ? viewportH : 1;
    const maxTop = Math.max(0, range.physicalHeight - viewportH);
    const current = frameEl.scrollTop;
    const next = clamp(current + (event.deltaY * unit) / range.scale, 0, maxTop);
    if (next === current) return;
    event.preventDefault();
    frameEl.scrollTop = next;
  }
  /* Клавиши прокрутки — так же: стрелка — строка, страница — экран без строки.
     Браузер шагнул бы физически, на 40 px полотна, — это десяток строк, и часть
     списка не показалась бы ни разу. Home и End браузер и так ведёт до края.
     Пробел — только на самом кадре: на кнопке и флажке он их нажимает. */
  function onKey(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    let dir = key === "ArrowDown" || key === "PageDown" ? 1 : key === "ArrowUp" || key === "PageUp" ? -1 : 0;
    if (key === " " && event.target === frameEl) dir = event.shiftKey ? -1 : 1;
    if (!dir) return;
    const row = metrics.rowH;
    const step = key.startsWith("Arrow") ? row : Math.max(row, viewportH - row);
    const current = frameEl.scrollTop;
    const logical = clamp(current * range.scale + dir * step, 0, Math.max(0, count * row - viewportH));
    event.preventDefault();
    frameEl.scrollTop = clamp(logical / range.scale, 0, Math.max(0, range.physicalHeight - viewportH));
  }
  /* Слушатели — только пока масштаб нужен: в остальное время колесо браузера не
     ждёт скрипта. Кадр на это время фокусируемый (tabindex=-1): щелчок по строкам
     ставит фокус на него, и клавиши приходят сюда, а не в body. */
  let wheeling = false;
  function watchWheel() {
    const need = range.scale > 1;
    if (need === wheeling) return;
    wheeling = need;
    setAttr(frameEl, "tabindex", need ? "-1" : null);
    if (need) {
      frameEl.addEventListener("wheel", onWheel, { passive: false });
      frameEl.addEventListener("keydown", onKey);
    } else {
      frameEl.removeEventListener("wheel", onWheel);
      frameEl.removeEventListener("keydown", onKey);
    }
  }
  ctx.cleanup(() => {
    frameEl.removeEventListener("wheel", onWheel);
    frameEl.removeEventListener("keydown", onKey);
  });

  /* ---- Размер: первый замер — из первого колбэка наблюдателя -------------- */

  function readMetrics() {
    const styles = getComputedStyle(host);
    return {
      rowH: readPx(styles, "--ui-table-row-h", 36),
      pad: readPx(styles, "--ui-table-pad", 12),
      check: readPx(styles, "--ui-table-check-w", 36),
      colW: readPx(styles, "--ui-table-col-w", 160),
      minCol: readPx(styles, "--ui-table-col-min", 64),
      maxScroll: readPx(styles, "--ui-table-track-max", 2_000_000),
      boneH: readPx(styles, "--ui-table-bone-h", 8),
      boneBox: readPx(styles, "--ui-icon", 16),
      icon: readPx(styles, "--ui-icon", 16),
      boxRadius: readPx(styles, "--ui-r-xs", 4),
      font: `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`,
      rtl: styles.direction === "rtl",
    };
  }

  /* Наблюдаем порт, а не кадр: полоса прокрутки кадра от наших ширин меняет его
     коробку, и наблюдатель зациклился бы. */
  ctx.cleanup(
    observeSize(port, {
      /* Токены — здесь, в фазе чтений: в write() их чтение после чужих записей того
         же колбэка заставило бы пересчёт стиля. */
      read() {
        return {
          metrics: metrics ? null : readMetrics(),
          width: frameEl.clientWidth,
          height: frameEl.offsetHeight,
          head: rail.offsetHeight,
          top: frameEl.scrollTop,
          left: frameEl.scrollLeft,
        };
      },
      write(box) {
        if (destroyed) return;
        if (!metrics) {
          metrics = box.metrics;
          fitColumns();
        }
        viewportW = box.width;
        frameH = box.height;
        headH = box.head;
        lastLeft = box.left;
        applyTrack();
        sync(true, box.top);
        /* Хост в скрытой вкладке меряется нулём, а scrollTop скрытого кадра браузер
           не примет: позиция ждёт настоящего замера. */
        if (pendingScroll && frameH > 0) {
          const [index, align] = pendingScroll;
          pendingScroll = null;
          api.scrollToIndex(index, align);
        }
      },
    }),
  );

  /* ---- Выбор -------------------------------------------------------------- */

  ctx.on(host, "change", (event) => {
    const input = event.target;
    if (headCheck && input === headCheck.input) {
      all = input.checked;
      selected.clear();
      except.clear();
      for (const slot of slots) {
        if (!slot.key) continue;
        slot.cells.forEach((cell) => {
          if (cell.input) cell.input.checked = all;
        });
        slot.tr.classList.toggle("is-selected", all);
        setAttr(slot.tr, "aria-selected", String(all));
      }
      paintHeadCheck();
      ctx.emit("table-view:select", { selection: api.getSelection() });
      return;
    }
    const slot = slotOf.get(input.closest?.("tr"));
    if (!slot?.key || input.type !== "checkbox") return;
    setSelected(slot.key, input.checked);
    slot.tr.classList.toggle("is-selected", input.checked);
    setAttr(slot.tr, "aria-selected", String(input.checked));
    paintHeadCheck();
    ctx.emit("table-view:select", { selection: api.getSelection() });
  });

  /* ---- Ширина столбцов ---------------------------------------------------- */

  columnResize(ctx, rail, host, {
    begin(cell) {
      const column = byHead(cell);
      if (!column || column.selection || !metrics) return null;
      /* Хвост рисуется шире своей ширины: тянуть его — от нарисованного. */
      tailFixed = column === tail;
      if (tailFixed) column.base = column.px;
      return column.base;
    },
    resize(cell, width) {
      const column = byHead(cell);
      if (destroyed || !column) return;
      const next = Math.max(metrics.minCol, Math.round(width));
      if (next === column.base) return column.px;
      column.base = next;
      if (applyTrack()) sync(false);
      return column.px;
    },
    frame: () => viewportW,
  });

  /* ---- Сортировка --------------------------------------------------------- */

  /* Отмена — номер задания: ответ на чужой номер выбрасывается, занятый воркер
     пересоздаётся (ждать его долгую чужую задачу незачем). */
  function cancelSort() {
    sortToken += 1;
    clearTimeout(skeletonTimer);
    skeletonTimer = 0;
    if (sorterBusy) {
      sorter?.terminate();
      sorter = null;
      sorterBusy = false;
    }
  }

  function remember(id, result) {
    cache.delete(id);
    cache.set(id, result);
    while (cache.size > SORT_CACHE) cache.delete(cache.keys().next().value);
  }

  /* Порядок готов: данные встают в текущем положении прокрутки — полотно той же
     высоты, поэтому на том же месте просто другие строки. */
  function applyOrder(next) {
    clearTimeout(skeletonTimer);
    skeletonTimer = 0;
    order = next;
    busy = false;
    host.classList.remove("is-sorting");
    refreshMeta();
    sync(true);
  }

  /* Ключи столбца — кусками по времени, строки — словарём: в воркер уходят номера
     без копирования и короткий список уникальных. */
  async function collectKeys(column, token) {
    const job = keysOf(count, column.numeric);
    const spent = slice(SORT_SLICE_MS);
    for (let index = 0; index < count; index += 1) {
      const raw = rowAt(index)?.[column.id];
      if (column.numeric) job.keys[index] = raw == null || raw === "" ? Number.NaN : column.date ? dateKey(raw) : Number(raw);
      else job.put(index, raw == null ? "" : String(raw));
      if ((index & 255) === 255 && spent()) {
        await yieldToMain();
        if (token !== sortToken) return null;
      }
    }
    return token === sortToken ? job : null;
  }

  /* Воркер не поднялся или упал — сортируем здесь: ключи ушли в воркер без
     копии, поэтому собираются заново. */
  function sortInWorker(job, token, done, retry) {
    if (!sorter) {
      try {
        sorter = new Worker(new URL("./table-view.worker.js", import.meta.url), { type: "module" });
      } catch {
        workerBroken = true;
        done(orderOf(job, collator()));
        return;
      }
    }
    const fail = (event) => {
      event.preventDefault?.();
      sorter?.terminate();
      sorter = null;
      sorterBusy = false;
      workerBroken = true;
      if (token === sortToken) retry();
    };
    sorter.onmessage = ({ data }) => {
      sorterBusy = false;
      if (data.token === token) done(data);
    };
    sorter.onerror = fail;
    sorter.onmessageerror = fail;
    sorterBusy = true;
    const plain = job.numeric ? { numeric: true, keys: job.keys } : { numeric: false, ids: job.ids, uniques: job.uniques };
    sorter.postMessage({ token, lang: lang(), job: plain }, [job.numeric ? job.keys.buffer : job.ids.buffer]);
  }

  async function sortBy(column, dir) {
    cancelSort();
    const token = sortToken;
    sort = dir ? { id: column.id, dir } : { id: null, dir: null };
    paintSortState();
    if (!dir) {
      applyOrder(null);
      return;
    }
    const cached = cache.get(column.id);
    if (cached) {
      remember(column.id, cached);
      applyOrder(cached[dir]);
      return;
    }
    busy = true;
    refreshMeta();
    skeletonTimer = setTimeout(() => host.classList.add("is-sorting"), SORT_SKELETON_DELAY);
    const job = await collectKeys(column, token);
    if (!job) return;
    const done = (result) => {
      if (token !== sortToken) return;
      remember(column.id, result);
      applyOrder(result[dir]);
    };
    if (job.count <= SORT_LOCAL || workerBroken) done(orderOf(job, collator()));
    else sortInWorker(job, token, done, () => sortBy(column, dir));
  }

  /* Сортировка из меню и setSort — с событием; пересортировка после refresh — без. */
  function setSort(id, dir) {
    const column = dir == null ? null : columns.find((item) => item.id === id && item.sortable);
    if (dir != null && (!column || (dir !== "asc" && dir !== "desc"))) return false;
    sortBy(column, dir ?? null);
    ctx.emit("table-view:sort", { ...sort });
    return true;
  }

  for (const column of columns) if (column.menu) onSortPick(ctx, column.menu, (dir) => setSort(column.id, dir));

  /* ---- Данные ------------------------------------------------------------- */

  function replaceSource(next) {
    cancelSort();
    cache.clear();
    host.classList.remove("is-sorting");
    source = next;
    count = countOf(source);
    reported = false;
    selected.clear();
    except.clear();
    all = false;
    paintHeadCheck();
    order = null;
    sort = { id: null, dir: null };
    paintSortState();
    busy = false;
    refreshMeta();
    if (!metrics) return;
    fitColumns();
    applyTrack();
    frameEl.scrollTop = 0;
    sync(true, 0);
  }

  paintSortState();
  paintHeadCheck();
  refreshMeta();
  for (const menu of sortHosts) menus().mount(menu);

  const api = {
    getView: () => ({ first: range.first, last: range.last, total: count, scrollTop: lastTop }),
    scrollToIndex(index, align = "start") {
      if (!metrics || !frameH) {
        pendingScroll = [index, align];
        return api;
      }
      if (!count) return api;
      const row = metrics.rowH;
      const at = clamp(Math.floor(Number(index) || 0), 0, count - 1);
      let logical = at * row;
      if (align === "center") logical -= (viewportH - row) / 2;
      else if (align === "end") logical -= viewportH - row;
      const top = clamp(logical, 0, Math.max(0, count * row - viewportH)) / range.scale;
      frameEl.scrollTop = top;
      sync(false, top);
      return api;
    },
    setRows(rows) {
      replaceSource(sourceOf({ rows }));
      return api;
    },
    setDataSource(dataSource) {
      replaceSource(sourceOf({ dataSource }));
      return api;
    },
    /* Скелетон на всю таблицу: строки прячутся, полотно с узором тянется на кадр. */
    setLoading(on = true) {
      loading = Boolean(on);
      refreshMeta();
      return api;
    },
    /* Источник догрузил строки: число строк перечитывается, порядок активной
       сортировки строится заново — ключи у строк, что были null, теперь есть. */
    refresh() {
      const before = count;
      count = countOf(source);
      cache.clear();
      /* Порядок другой длины уже не годится: пока строится новый — исходный. */
      if (count !== before) order = null;
      refreshMeta();
      sync(true);
      const column = sort.dir ? columns.find((item) => item.id === sort.id) : null;
      if (column) sortBy(column, sort.dir);
      return api;
    },
    getSelection: () => (all ? { all: true, except: [...except] } : [...selected]),
    getSort: () => ({ ...sort }),
    setSort,
    destroy() {
      destroyed = true;
      cancelSort();
      sorter?.terminate();
      clearTimeout(settleTimer);
      clearTimeout(idleTimer);
      onScroll.cancel();
      measureBar.cancel();
      for (const menu of sortHosts) menus().unmount(menu);
      host.replaceChildren(...children);
      restore(host, saved);
    },
  };
  return api;
}

export default defineComponent({ name: "tableView", create });
