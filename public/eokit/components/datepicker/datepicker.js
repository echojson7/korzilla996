/* Календарь: нативное текстовое поле и панель с сеткой дней.

   Поле — хост и источник значения: name, value, min/max, required, disabled,
   aria-* и отправка формы — его собственные, без JS это обычное поле. Модуль
   добавляет только кнопку календаря и панель.

     <div class="ui-field">
       <span class="ui-field__label">Дата</span>
       <input class="ui-input" data-ui-datepicker name="date" data-placeholder="дд.мм.гггг">
     </div>

   data-size="sm" — компактное поле. Значение — «14.08.2026»; ISO принимается и
   показывается тем же письмом. Поле — <div class="ui-field">, а не <label>: в панели
   кнопки, и метка повторяла бы нажатие на своём контроле.

   Панель строится при первом открытии: закрытый контрол — только поле и кнопка.
   Открытая уходит в body (в окне — в его слой [data-ui-layer]), закрытая
   возвращается в хост. Два вида — сетка дней и сетка годов; подпись в шапке
   переключает их. Выбор года меняет вид, а не значение: дата — это день. Названия
   месяцев и дней недели — из Intl по языку страницы. */

import { defineComponent } from "../../core/component.js";
import { el, isRtl, labelOf, restore, setAttr, setText, setVar, snapshot, uid } from "../../core/dom.js";
import { autoUpdate, place } from "../../core/floating.js";
import { focus, tabbables } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { moveIndex } from "../../core/keys.js";
import { openLayer, portal } from "../../core/layer.js";
import { dateFormat, lang, messages } from "../../core/locale.js";
import { presence } from "../../core/presence.js";

const SELECTOR = "[data-ui-datepicker]";
const DAY_CLASS = "ui-datepicker__day";
const YEAR_CLASS = "ui-datepicker__year";
const COMPACT_CLASS = "ui-input--sm";
const INPUT_ATTRS = ["placeholder", "aria-label"];

const t = messages("datepicker", {
  ru: {
    dialog: "Выбор даты",
    pick: "Выбрать дату",
    change: "Изменить дату, {date}",
    caption: "{title}. {action}",
    toYears: "Выбрать год",
    toDays: "Вернуться к дням",
    prevMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    prevYears: "Предыдущие годы",
    nextYears: "Следующие годы",
    today: "Сегодня",
    clear: "Очистить",
  },
  en: {
    dialog: "Choose date",
    pick: "Choose date",
    change: "Change date, {date}",
    caption: "{title}. {action}",
    toYears: "Choose year",
    toDays: "Back to days",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    prevYears: "Previous years",
    nextYears: "Next years",
    today: "Today",
    clear: "Clear",
  },
});

/* Шесть недель: высота панели одна в любом месяце, сторона решается на открытии. */
const CELLS = 42;
const WEEK = 7;
const DAY_MS = 86400000;
/* Лента годов конечна и считается от показанного года, три колонки; стрелки шапки
   листают её целиком. */
const YEAR_COLUMNS = 3;
const YEARS_AROUND = 6;
const YEARS = YEARS_AROUND * 2 + 1;

/* Нативные типы со своим календарём не трогаем: второй спорил бы с первым. */
const NATIVE_TYPES = new Set(["date", "datetime-local", "month", "week", "time"]);

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_RE = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/;

/* --- даты ------------------------------------------------------------------- */

const pad2 = (value) => String(value).padStart(2, "0");
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const today = () => startOfDay(new Date());
const shiftDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/* Неделя с понедельника: день недели — (getDay() + 6) % 7. */
const weekDayIndex = (date) => (date.getDay() + 6) % 7;

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/* 31 февраля JavaScript переносит на март: такая запись неверна, а не «почти». */
function fromParts(year, month, day) {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

function parseDate(text) {
  const value = String(text ?? "").trim();
  const iso = ISO_RE.exec(value);
  if (iso) return fromParts(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const local = LOCAL_RE.exec(value);
  if (local) return fromParts(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
  return null;
}

/* День сохраняем, если он есть в целевом месяце: 31 марта минус месяц — 28 февраля. */
function shiftMonths(date, months) {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  return new Date(year, month, Math.min(date.getDate(), new Date(year, month + 1, 0).getDate()));
}

/* Ячейка 0 — понедельник недели первого числа. */
function gridStart(year, month) {
  return new Date(year, month, 1 - weekDayIndex(new Date(year, month, 1)));
}

function dateAt(index, year, month) {
  const start = gridStart(year, month);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
}

function inBounds(date, bounds) {
  if (!date) return false;
  if (bounds.min && date < bounds.min) return false;
  return !(bounds.max && date > bounds.max);
}

/* Год доступен, если с границами пересекается хотя бы один его день. */
function yearInBounds(year, bounds) {
  if (bounds.min && new Date(year, 11, 31) < bounds.min) return false;
  return !(bounds.max && new Date(year, 0, 1) > bounds.max);
}

/* --- имена из Intl ---------------------------------------------------------- */

const capital = (text) => text.charAt(0).toLocaleUpperCase(lang()) + text.slice(1);

/* «Октябрь 2026»: месяц — именительный падеж (LLLL), год — без «г.». */
const monthTitle = (year, month) => `${capital(dateFormat({ month: "long" }).format(new Date(year, month, 1)))} ${year}`;

/* Доступное имя дня — «20 августа 2026» / «August 20, 2026»: хвостовое «г.» —
   литерал формата, он отбрасывается. */
function dayName(format, date) {
  const parts = format.formatToParts(date);
  while (parts.at(-1)?.type === "literal") parts.pop();
  return parts.map((part) => part.value).join("");
}

/* --- компонент -------------------------------------------------------------- */

function create(input, ctx) {
  if (!(input instanceof HTMLInputElement) || NATIVE_TYPES.has(input.type) || !input.parentNode) return null;

  const saved = snapshot(input, INPUT_ATTRS);
  const trigger = el("button", { class: "ui-input__action ui-datepicker__trigger", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" }, icon("calendar"));
  const wrap = el("div", { class: "ui-input__wrap" });
  const host = el("div", { class: "ui-datepicker" }, wrap);
  input.before(host);
  wrap.append(input, trigger);

  const compact = input.dataset.size === "sm" && !input.classList.contains(COMPACT_CLASS);
  if (compact) input.classList.add(COMPACT_CLASS);
  /* У <div class="ui-field"> подпись не связана с полем: имя — из .ui-field__label. */
  if (!input.labels?.length && !input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby")) setAttr(input, "aria-label", labelOf(input) || null);
  /* Плейсхолдер — data-placeholder; нативный уважается первым. */
  if (!input.hasAttribute("placeholder") && input.dataset.placeholder) input.placeholder = input.dataset.placeholder;

  const state = {
    view: "days",
    year: 0,
    month: 0,
    yearFirst: 0,
    focus: today(),
    active: -1,
    yearIndex: -1,
    /* Последнее принятое значение: к нему возвращает разбор ввода. */
    value: input.value,
  };
  let bounds = { min: null, max: null };
  /* Части панели появляются на первом открытии. */
  let parts = null;
  let life = null;
  let layer = null;
  let home = null;
  let stopAuto = null;
  let rtl = false;
  let pointer = "";

  /* Границы и доступность читаются с поля: их могут сменить после монтирования. */
  function sync() {
    bounds = { min: parseDate(input.min), max: parseDate(input.max) };
    trigger.disabled = input.disabled || input.readOnly;
    if (trigger.disabled) close();
    labelTrigger();
    if (layer) paint();
  }
  const watcher = new MutationObserver(sync);
  watcher.observe(input, { attributes: true, attributeFilter: ["disabled", "readonly", "min", "max"] });
  ctx.cleanup(() => watcher.disconnect());

  function labelTrigger() {
    const selected = parseDate(input.value);
    setAttr(trigger, "aria-label", selected && inBounds(selected, bounds) ? t("change", { date: dayName(dateFormat({ day: "numeric", month: "long", year: "numeric" }), selected) }) : t("pick"));
  }

  function build() {
    const id = uid("ui-datepicker-panel");
    /* Подпись — кнопка (переключает вид) и стоит первой в разметке, хотя листание
       справа: табуляция идёт как чтение — «что показано», потом «куда листать». */
    /* Смена месяца объявляется: с клавиатуры это единственный признак, что вид уехал. */
    const captionText = el("span", { class: "ui-btn__label", id: `${id}-caption`, "aria-live": "polite" });
    const caption = el("button", { class: "ui-btn ui-btn--ghost ui-btn--sm ui-datepicker__caption", type: "button", "aria-expanded": "false" }, captionText, icon("chevron-down"));
    const nav = (glyph) => el("button", { class: "ui-btn ui-btn--ghost ui-btn--icon-sm ui-datepicker__nav", type: "button" }, icon(glyph));
    const previous = nav("chevron-left");
    const next = nav("chevron-right");

    /* Роли вместо таблицы APG: сетку раскладывает CSS grid. Две буквы дня недели
       не читаются: полное имя — доступным именем колонки, как abbr в APG. */
    const weekdays = Array.from({ length: WEEK }, () => el("div", { class: "ui-datepicker__weekday", role: "columnheader" }));
    /* Roving tabindex: в сетке одна ячейка в порядке табуляции, как в APG. */
    const days = Array.from({ length: CELLS }, () => el("div", { class: DAY_CLASS, role: "gridcell", tabindex: "-1" }));
    const row = (cells) => el("div", { class: "ui-datepicker__row", role: "row" }, ...cells);
    const grid = el("div", { class: "ui-datepicker__grid", role: "grid", "aria-labelledby": captionText.id }, row(weekdays));
    for (let at = 0; at < CELLS; at += WEEK) grid.append(row(days.slice(at, at + WEEK)));

    /* Ребёнок listbox — option; у button эта роль допустима. */
    const yearCells = Array.from({ length: YEARS }, () => el("button", { class: YEAR_CLASS, type: "button", role: "option", tabindex: "-1" }));
    const years = el("div", { class: "ui-datepicker__years", role: "listbox", "aria-labelledby": captionText.id, hidden: true }, ...yearCells);

    const action = (className) => el("button", { class: `ui-btn ui-btn--ghost ui-btn--sm ${className}`, type: "button" }, el("span", { class: "ui-btn__label" }));
    const todayButton = action("ui-datepicker__today");
    const clearButton = action("ui-datepicker__clear");

    const panel = el(
      "div",
      { class: "ui-datepicker__panel", id, role: "dialog", hidden: true, data: { state: "closed" } },
      el("div", { class: "ui-datepicker__header" }, caption, previous, next),
      grid,
      years,
      el("div", { class: "ui-datepicker__footer" }, todayButton, clearButton),
    );
    host.append(panel);
    trigger.setAttribute("aria-controls", id);
    life = presence(panel, { closed: "closed" });
    parts = { panel, caption, captionText, previous, next, weekdays, grid, days, years, yearCells, todayButton, clearButton };

    ctx.on(caption, "click", () => setView(state.view === "years" ? "days" : "years", true));
    ctx.on(previous, "click", () => page(-1));
    ctx.on(next, "click", () => page(1));
    ctx.on(grid, "click", (event) => {
      const index = days.indexOf(event.target.closest(`.${DAY_CLASS}`));
      if (index !== -1) commit(dateAt(index, state.year, state.month));
    });
    ctx.on(grid, "keydown", onGridKeyDown);
    ctx.on(years, "click", (event) => chooseYear(yearCells.indexOf(event.target.closest(`.${YEAR_CLASS}`))));
    ctx.on(years, "keydown", onYearsKeyDown);
    ctx.on(todayButton, "click", () => commit(today()));
    ctx.on(clearButton, "click", () => {
      setValue("", true);
      close({ focus: true });
    });
    ctx.on(panel, "keydown", onPanelKeyDown);
  }

  /* Строки по языку страницы — на каждом открытии: язык могли переключить. */
  function paintStatic() {
    const { panel, weekdays, todayButton, clearButton } = parts;
    setAttr(panel, "aria-label", t("dialog"));
    /* 1 января 2024 — понедельник. */
    const dates = Array.from({ length: WEEK }, (_, index) => new Date(2024, 0, 1 + index));
    const names = (weekday, length = Infinity) => {
      const format = dateFormat({ weekday });
      return dates.map((date) => capital(format.format(date)).slice(0, length));
    };
    const distinct = (list) => new Set(list).size === WEEK && list;
    /* Две буквы дня («Пн», «Mo»), если они различают все семь дней. В арабском и
       иврите сокращение начинается с общего «день»: там узкое имя из Intl, а если
       повторяется и оно (португальский) — сокращение целиком. */
    const short = distinct(names("short", 2)) || distinct(names("narrow")) || names("short");
    const long = dateFormat({ weekday: "long" });
    weekdays.forEach((cell, index) => {
      setText(cell, short[index]);
      setAttr(cell, "aria-label", long.format(dates[index]));
    });
    setText(todayButton.firstChild, t("today"));
    setText(clearButton.firstChild, t("clear"));
  }

  function paintCaption() {
    const years = state.view === "years";
    const title = monthTitle(state.year, state.month);
    setText(parts.captionText, title);
    setAttr(parts.caption, "aria-label", t("caption", { title, action: t(years ? "toDays" : "toYears") }));
    setAttr(parts.previous, "aria-label", t(years ? "prevYears" : "prevMonth"));
    setAttr(parts.next, "aria-label", t(years ? "nextYears" : "nextMonth"));
  }

  function paintDays() {
    const selected = parseDate(input.value);
    const now = today();
    const format = dateFormat({ day: "numeric", month: "long", year: "numeric" });
    const start = gridStart(state.year, state.month);
    parts.days.forEach((cell, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      setText(cell, String(date.getDate()));
      setAttr(cell, "aria-label", dayName(format, date));
      setAttr(cell, "aria-selected", !!selected && sameDay(date, selected) && "true");
      setAttr(cell, "aria-current", sameDay(date, now) && "date");
      /* Недоступные дни остаются фокусируемыми: выключенная ячейка выпала бы из
         roving tabindex, и стрелка перепрыгивала бы через день. */
      setAttr(cell, "aria-disabled", !inBounds(date, bounds) && "true");
      cell.classList.toggle("ui-datepicker__day--outside", date.getMonth() !== state.month);
    });
    parts.todayButton.disabled = !inBounds(now, bounds);
  }

  function paintYears() {
    const selected = parseDate(input.value);
    const shown = selected ? selected.getFullYear() : state.year;
    const todayYear = today().getFullYear();
    state.yearFirst = state.year - YEARS_AROUND;
    parts.yearCells.forEach((cell, index) => {
      const year = state.yearFirst + index;
      setText(cell, String(year));
      setAttr(cell, "aria-selected", year === shown && "true");
      setAttr(cell, "aria-current", year === todayYear && "date");
      setAttr(cell, "aria-disabled", !yearInBounds(year, bounds) && "true");
    });
    /* Фокус в ленту мог прийти не стрелкой (указателем, скриптом): табуляция
       следует за тем, что на самом деле под фокусом. */
    const focused = parts.yearCells.indexOf(document.activeElement);
    tabYear(focused >= 0 ? focused : state.yearIndex < 0 ? YEARS_AROUND : state.yearIndex);
  }

  function paint() {
    paintCaption();
    if (state.view === "years") paintYears();
    else paintDays();
  }

  /* В ленте годов ровно одна ячейка в порядке табуляции. */
  function tabYear(index) {
    state.yearIndex = Math.min(Math.max(index, 0), YEARS - 1);
    parts.yearCells.forEach((cell, at) => {
      cell.tabIndex = at === state.yearIndex ? 0 : -1;
    });
  }

  function setView(view, moveFocus) {
    const years = view === "years";
    state.view = view;
    parts.grid.hidden = years;
    parts.years.hidden = !years;
    setAttr(parts.caption, "aria-expanded", String(years));
    if (years && state.yearIndex < 0) state.yearIndex = YEARS_AROUND;
    paint();
    if (!moveFocus) return;
    if (years) focus(parts.yearCells[state.yearIndex]);
    else setFocus(state.focus, true);
  }

  /* Единственный путь смены активной даты: сетка перерисовывается только при смене
     месяца, и ровно одна ячейка остаётся в порядке табуляции. state.active никто
     не сбрасывает: ячейка прошлого открытия или прошлого месяца — тот же узел, и
     её tabindex снимается здесь же. */
  function setFocus(date, move) {
    state.focus = date;
    if (date.getFullYear() !== state.year || date.getMonth() !== state.month) {
      state.year = date.getFullYear();
      state.month = date.getMonth();
      state.yearIndex = -1;
      paint();
    }
    const { days } = parts;
    const index = Math.round((date - gridStart(state.year, state.month)) / DAY_MS);
    if (state.active !== index) {
      if (days[state.active]) days[state.active].tabIndex = -1;
      state.active = index;
    }
    const cell = days[index];
    if (!cell) return;
    cell.tabIndex = 0;
    if (move) focus(cell);
  }

  /* Стрелки шапки: в днях — месяц, в годах — вся лента. */
  function page(direction) {
    if (state.view === "days") {
      setFocus(shiftMonths(state.focus, direction), false);
      return;
    }
    state.year += direction * YEARS;
    state.focus = new Date(state.year, state.month, 1);
    paint();
  }

  /* Панель — у поля, а не у кнопки: левый край календаря по левому краю поля. */
  const position = () => place(parts.panel, wrap, { prefix: "--ui-datepicker", side: "bottom", align: "start", flip: "opposite", rtl });

  /* Фокус в сетку — только при открытии с клавиатуры: мышью кнопку фокусирует сам
     браузер после pointerdown. */
  function open(moveFocus) {
    if (layer || input.disabled || input.readOnly) return;
    rtl = isRtl(wrap);
    if (!parts) build();
    sync();
    state.value = input.value;
    const selected = parseDate(input.value);
    /* Пустое поле — сегодня, как в APG; сегодня вне границ — ближайшая граница. */
    let date = inBounds(selected, bounds) ? selected : today();
    if (!inBounds(date, bounds)) date = bounds.min && date < bounds.min ? bounds.min : bounds.max ?? date;
    state.year = date.getFullYear();
    state.month = date.getMonth();
    state.yearIndex = -1;
    paintStatic();
    /* Панель всегда открывается днями: год — шаг выбора, а не сохранённое состояние. */
    setView("days", false);
    setFocus(date, false);
    const { panel } = parts;
    /* Уход ещё играет — панель так и стоит в body: отменяем уход без переноса. */
    home ??= portal(panel, trigger);
    layer = openLayer({
      elements: () => [host, panel],
      trigger,
      exclusive: true,
      onDismiss(reason) {
        /* Esc из годов возвращает дни: не терять место, куда пользователь дошёл. */
        if (reason === "escape" && state.view === "years") setView("days", true);
        else close({ focus: reason === "escape" });
      },
    });
    /* Высота — своя, без потолка прошлого открытия: по ней выбирается сторона. */
    setVar(panel, "--ui-datepicker-space", null);
    panel.hidden = false;
    position();
    life.show();
    stopAuto = autoUpdate(wrap, panel, position, { onDetach: () => close() });
    setAttr(trigger, "aria-expanded", "true");
    if (moveFocus) focus(parts.days[state.active]);
  }

  function close({ focus: refocus = false } = {}) {
    if (!layer) return;
    const inside = parts.panel.contains(document.activeElement);
    const current = layer;
    layer = null;
    current.close();
    stopAuto();
    stopAuto = null;
    setAttr(trigger, "aria-expanded", "false");
    life.hide().then((done) => done && goHome());
    if (refocus && inside) focus(trigger);
  }

  function goHome() {
    home?.();
    home = null;
  }

  const toggle = (moveFocus) => (layer ? close() : open(moveFocus));

  /* Запись из календаря объявляется input/change, как у нативного контрола. Ввод
     руками приводится к письму молча: его change уже идёт, второй был бы лишним. */
  function setValue(text, announce) {
    if (input.value !== text) {
      input.value = text;
      if (announce) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    state.value = text;
    labelTrigger();
    if (layer) paint();
  }

  function commit(date) {
    if (!inBounds(date, bounds)) return;
    setValue(formatDate(date), true);
    /* Выбор закрывает панель и возвращает фокус кнопке, как в APG. */
    close({ focus: true });
  }

  /* Ввод руками приводится к «14.08.2026»; неверная запись возвращает последнее
     принятое значение, пустое поле — «не выбрано». */
  function onInputChange() {
    if (!input.value.trim()) {
      setValue("", false);
      return;
    }
    bounds = { min: parseDate(input.min), max: parseDate(input.max) };
    const parsed = parseDate(input.value);
    setValue(parsed && inBounds(parsed, bounds) ? formatDate(parsed) : state.value, false);
  }

  function onGridKeyDown(event) {
    const index = parts.days.indexOf(event.target);
    if (index === -1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const date = dateAt(index, state.year, state.month);
    const shift = event.shiftKey ? 12 : 1;
    let next = null;
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        commit(date);
        return;
      /* Home и End — края недели, как в APG. */
      case "Home": next = shiftDays(date, -weekDayIndex(date)); break;
      case "End": next = shiftDays(date, WEEK - 1 - weekDayIndex(date)); break;
      /* PageUp/PageDown — месяц, со Shift — год. */
      case "PageUp": next = shiftMonths(date, -shift); break;
      case "PageDown": next = shiftMonths(date, shift); break;
      default: {
        /* Стрелки — шаг по сетке из ядра (столбцы, RTL). Счёт — от середины трёх
           недель: шаг за край сетки уходит в соседний месяц, а не упирается. */
        const step = moveIndex(event, WEEK, WEEK * 3, { columns: WEEK, rtl });
        if (step !== null) next = shiftDays(date, step - WEEK);
      }
    }
    if (!next) return;
    event.preventDefault();
    setFocus(next, true);
  }

  /* Лента в три колонки: стрелки — по сетке, Home/End — края строки, PageUp и
     PageDown — соседняя лента. */
  function onYearsKeyDown(event) {
    const index = parts.yearCells.indexOf(event.target);
    if (index === -1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const rowStart = index - (index % YEAR_COLUMNS);
    let next;
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        chooseYear(index);
        return;
      case "Home": next = rowStart; break;
      case "End": next = Math.min(rowStart + YEAR_COLUMNS, YEARS) - 1; break;
      case "PageUp":
      case "PageDown":
        event.preventDefault();
        page(event.key === "PageUp" ? -1 : 1);
        focus(parts.yearCells[state.yearIndex]);
        return;
      default:
        next = moveIndex(event, index, YEARS, { columns: YEAR_COLUMNS, rtl });
    }
    if (next === null) return;
    event.preventDefault();
    tabYear(next);
    focus(parts.yearCells[state.yearIndex]);
  }

  /* Год ячейки — по её месту в ленте, не по подписи. Выбор возвращает дни того же
     месяца выбранного года; год вне границ не выбирается ни мышью, ни клавишей. */
  function chooseYear(index) {
    const cell = parts.yearCells[index];
    if (!cell || cell.getAttribute("aria-disabled") === "true") return;
    state.year = state.yearFirst + index;
    state.yearIndex = -1;
    state.focus = new Date(state.year, state.month, 1);
    setView("days", true);
  }

  /* Панель — в конце body, а читается как продолжение поля: Tab с кнопки ведёт в
     неё, Shift+Tab с первой кнопки панели — обратно на кнопку, Tab с последней
     закрывает панель и идёт дальше от кнопки. */
  function onPanelKeyDown(event) {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = tabbables(parts.panel);
    if (event.shiftKey && event.target === list[0]) {
      event.preventDefault();
      focus(trigger);
    } else if (!event.shiftKey && event.target === list.at(-1)) {
      close();
      focus(trigger);
    }
  }

  /* Мышь открывает на нажатии, как поповер и селект; палец и перо — на click (иначе
     касание, с которого начали прокрутку формы, открыло бы календарь); клавиатура —
     click с detail 0, с фокусом в сетку. */
  ctx.on(trigger, "pointerdown", (event) => {
    pointer = event.pointerType;
    if (pointer === "mouse" && event.button === 0) toggle(false);
  });
  ctx.on(trigger, "click", (event) => {
    if (event.detail === 0 || pointer !== "mouse") toggle(event.detail === 0);
  });
  ctx.on(trigger, "keydown", (event) => {
    if (event.key !== "Tab" || event.shiftKey || !layer) return;
    event.preventDefault();
    focus(tabbables(parts.panel)[0]);
  });
  ctx.on(input, "focus", () => {
    state.value = input.value;
  });
  ctx.on(input, "change", onInputChange);
  sync();

  return {
    destroy() {
      close();
      life?.settle();
      goHome();
      if (compact) input.classList.remove(COMPACT_CLASS);
      restore(input, saved);
      /* Поле возвращается на место автора; отсоединённое поддерево не трогаем. */
      if (host.parentNode) host.replaceWith(input);
    },
  };
}

export default defineComponent({ name: "datepicker", selector: SELECTOR, create });
