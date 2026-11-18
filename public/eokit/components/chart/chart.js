/* График: линия по точкам оси X — дням периода или любым подписям. Основной ряд —
   цвет акцента с заливкой под линией, ряд сравнения (прошлый период) — пунктир.
   Деления оси Y — круглые числа от нуля, подписи — формат значений, компактно.
   Наведение, касание и стрелки ведут вертикаль по точкам, подсказка — все ряды в
   этой точке. Рядом лежит таблица тех же чисел для экранного диктора: подсказка
   ничего не прячет.

     <figure class="ui-chart" data-ui-chart aria-label="Заказы по дням">
       <script type="application/json">{
         "x": ["2026-10-06", "2026-10-07", …],
         "series": [
           { "name": "6–12 октября", "values": [12, 9, …] },
           { "name": "29 сентября – 5 октября", "values": [10, 11, …], "x": ["2026-09-29", …], "compare": true }
         ],
         "format": { "style": "currency", "currency": "RUB", "maximumFractionDigits": 0 },
         "unit": "заказ|заказа|заказов"
       }</script>
     </figure>

   x — даты ISO (подписи по языку страницы: «6 окт.», в подсказке «пн, 6 октября»)
   или готовые подписи. Ряд: name, values (null — разрыв линии); x — свои даты
   ряда, их пишет подсказка; compare — пунктир сравнения; tone — тон кита вместо
   акцента. format — параметры Intl.NumberFormat, unit — слово при числе (формы
   через «|»), legend: false — без легенды, zero: false — ось по размаху значений,
   а не от нуля (средний чек, доля), тогда и без заливки. Высота поля —
   --ui-chart-h.

   kit("chart").update(host, data) — новые данные на том же месте (смена периода). */

import { defineComponent } from "../../core/component.js";
import { el, setAttr, setVar } from "../../core/dom.js";
import { dateFormat, messages, numberFormat, plural } from "../../core/locale.js";
import { clamp } from "../../core/math.js";
import { observeSize } from "../../core/observe.js";
import { frame } from "../../core/schedule.js";

const SELECTOR = "[data-ui-chart]";
const NS = "http://www.w3.org/2000/svg";
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/* Место под подпись оси X: уже — деления прореживаются. */
const X_GAP = 72;
const Y_STEPS = 4;
const SHORT = { day: "numeric", month: "short" };
const LONG = { weekday: "short", day: "numeric", month: "long" };

const t = messages("chart", {
  ru: { empty: "Нет данных за период" },
  en: { empty: "No data for this period" },
});

let gradients = 0;
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
};
const round = (value) => Math.round(value * 10) / 10;

function dateOf(value) {
  const match = typeof value === "string" ? ISO.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
const tickLabel = (value) => {
  const date = dateOf(value);
  return date ? dateFormat(SHORT).format(date) : String(value ?? "");
};
const pointLabel = (value) => {
  const date = dateOf(value);
  return date ? dateFormat(LONG).format(date) : String(value ?? "");
};

function read(script) {
  if (!script) return null;
  try {
    return JSON.parse(script.textContent);
  } catch (error) {
    console.error("[EOKIT] chart: данные не разобраны", script, error);
    return null;
  }
}

/* Ряды — как пришли, числа — числами, пустое и нечисло — разрыв. */
function normalize(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const number = (value) => (value === null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
  const series = (Array.isArray(data.series) ? data.series : []).map((item) => ({
    name: String(item?.name ?? ""),
    values: Array.isArray(item?.values) ? item.values.map(number) : [],
    x: Array.isArray(item?.x) ? item.x : null,
    compare: Boolean(item?.compare),
    tone: typeof item?.tone === "string" ? item.tone : null,
  }));
  const x = Array.isArray(data.x) ? data.x : [];
  const count = series.some((item) => item.values.some((value) => value !== null)) ? Math.max(x.length, ...series.map((item) => item.values.length)) : 0;
  const format = data.format && typeof data.format === "object" ? data.format : undefined;
  return { x, series, count, format, unit: typeof data.unit === "string" ? data.unit : "", legend: data.legend !== false, zero: data.zero !== false };
}

/* Шаг делений — 1, 2, 2,5 или 5 на степень десяти; у целых рядов — не дробный.
   От нуля — по умолчанию; zero: false — только размах значений. */
function nice(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}
function scale(series, zero) {
  let lo = zero ? 0 : Infinity;
  let hi = zero ? 0 : -Infinity;
  let whole = true;
  for (const item of series) {
    for (const value of item.values) {
      if (value === null) continue;
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
      whole &&= Number.isInteger(value);
    }
  }
  if (hi === lo) [lo, hi] = zero || lo === 0 ? [Math.min(lo, 0), Math.max(hi, 0) || 1] : [lo - Math.abs(lo) / 2, hi + Math.abs(hi) / 2];
  let step = nice((hi - lo) / Y_STEPS);
  if (whole && step < 1) step = 1;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let at = 0; min + at * step <= max + step / 2; at++) ticks.push(Math.round((min + at * step) / step) * step);
  return { min, max, ticks };
}

/* Деления оси X: все точки, если влезают, иначе через равный шаг; последняя —
   всегда. Её подпись прижата к правому краю, поэтому предпоследняя уступает ей
   место, если стоит ближе X_GAP пикселей. */
function xTicks(count, width) {
  if (count <= 1) return count ? [0] : [];
  const fit = Math.max(2, Math.floor(width / X_GAP) + 1);
  if (count <= fit) return Array.from({ length: count }, (_, at) => at);
  const step = Math.ceil((count - 1) / (fit - 1));
  const list = [];
  for (let at = 0; at < count - 1; at += step) list.push(at);
  if (((count - 1 - list.at(-1)) * width) / (count - 1) < X_GAP) list.pop();
  list.push(count - 1);
  return list;
}

/* Монотонная кривая (Фриц — Карлсон): гладкая, но не выходит за значения
   соседних точек — у дневного ряда нет ложных пиков и провалов ниже нуля. */
function curve(points) {
  const count = points.length;
  const [x0, y0] = points[0];
  let d = `M${round(x0)},${round(y0)}`;
  if (count === 1) return `${d}h0`;
  const slopes = [];
  for (let at = 0; at < count - 1; at++) slopes.push((points[at + 1][1] - points[at][1]) / (points[at + 1][0] - points[at][0] || 1));
  const tangents = [slopes[0]];
  for (let at = 1; at < count - 1; at++) {
    const [before, after] = [slopes[at - 1], slopes[at]];
    if (before * after <= 0) tangents.push(0);
    else {
      const left = points[at][0] - points[at - 1][0];
      const right = points[at + 1][0] - points[at][0];
      const one = 2 * right + left;
      const two = right + 2 * left;
      tangents.push((one + two) / (one / before + two / after));
    }
  }
  tangents.push(slopes.at(-1));
  for (let at = 0; at < count - 1; at++) {
    const [xa, ya] = points[at];
    const [xb, yb] = points[at + 1];
    const third = (xb - xa) / 3;
    d += `C${round(xa + third)},${round(ya + tangents[at] * third)},${round(xb - third)},${round(yb - tangents[at + 1] * third)},${round(xb)},${round(yb)}`;
  }
  return d;
}

/* Куски ряда без разрывов: [[x, y], …] на каждый. */
function runs(values, xOf, yOf) {
  const list = [];
  let run = [];
  values.forEach((value, at) => {
    if (value === null) {
      if (run.length) list.push(run);
      run = [];
    } else run.push([xOf(at), yOf(value)]);
  });
  if (run.length) list.push(run);
  return list;
}

/* Цвет ряда — атрибутами: пунктир сравнения, тон кита; без них — акцент. */
function paint(node, item) {
  setAttr(node, "data-compare", item.compare);
  setAttr(node, "data-tone", item.tone);
  return node;
}
const key = (item) => paint(el("i", { class: "ui-chart__key" }), item);

function create(host, ctx) {
  let data = normalize(read(host.querySelector(":scope > script[type='application/json']")));
  let box = { w: 0, h: 0 };
  let range = null;
  let active = -1;
  let parts = [];
  let ticksKey = "";

  const legend = el("div", { class: "ui-chart__legend", "aria-hidden": "true" });
  const yAxis = el("div", { class: "ui-chart__y", "aria-hidden": "true" });
  const grid = svg("path", { class: "ui-chart__grid" });
  const canvas = svg("svg", { class: "ui-chart__svg", "aria-hidden": "true", focusable: "false" });
  canvas.append(grid);
  const cursor = el("span", { class: "ui-chart__cursor" });
  const tipHead = el("span", { class: "ui-chart__tip-head" });
  const tip = el("div", { class: "ui-chart__tip", "aria-hidden": "true" }, tipHead);
  const empty = el("span", { class: "ui-chart__empty" });
  const plot = el("div", { class: "ui-chart__plot", tabindex: "0", role: "img" }, canvas, cursor, tip);
  const xAxis = el("div", { class: "ui-chart__x", "aria-hidden": "true" });
  const live = el("div", { class: "ui-sr-only", "aria-live": "polite" });
  /* Таблица не бывает уже своих ячеек и с width: 1px — прячет её обёртка, иначе
     она растягивает прокрутку страницы на узком экране. */
  const table = el("table");
  const tableBox = el("div", { class: "ui-sr-only" }, table);
  host.append(legend, yAxis, plot, xAxis, live, tableBox);

  let formats = null;
  const valueText = (value) => {
    if (value === null || value === undefined) return "—";
    const text = formats.value.format(value);
    return data.unit ? `${text} ${plural(value, data.unit)}` : text;
  };
  const xOf = (at) => (data.count > 1 ? (at / (data.count - 1)) * box.w : box.w / 2);
  const yOf = (value) => box.h - ((value - range.min) / (range.max - range.min)) * box.h;
  /* Подпись строки подсказки: у ряда со своими датами — его дата, у второго ряда
     на общих датах — имя; у основного — ничего, его дата в заголовке. */
  const shared = () => data.series.filter((item) => !item.x).length;
  const rowLabel = (item, at) => (item.x ? pointLabel(item.x[at]) : shared() > 1 ? item.name : "");

  /* --- сборка по данным ----------------------------------------------------- */

  function build() {
    formats = {
      value: numberFormat(data.format),
      axis: numberFormat({ ...data.format, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }),
    };
    const name = host.getAttribute("aria-label") ?? "";
    setAttr(plot, "aria-label", name || null);

    legend.replaceChildren(...data.series.map((item) => el("span", { class: "ui-chart__legend-item" }, key(item), item.name)));
    if (data.legend && data.series.length > 1) host.prepend(legend);
    else legend.remove();

    for (const part of parts) part.group.remove(), part.dot.remove(), part.row.remove();
    /* Сравнение — под основными рядами, заливка — только у первого основного. */
    const main = data.series.find((item) => !item.compare) ?? data.series[0];
    const order = [...data.series.filter((item) => item.compare), ...data.series.filter((item) => !item.compare)];
    parts = order.map((item) => {
      const group = paint(svg("g", { class: "ui-chart__series" }), item);
      let area = null;
      if (item === main && !item.compare && data.zero) {
        const id = `ui-chart-fill-${(gradients += 1)}`;
        const fill = svg("linearGradient", { id, class: "ui-chart__fill", x1: "0", x2: "0", y1: "0", y2: "1" });
        fill.append(svg("stop", { offset: "0" }), svg("stop", { offset: "1" }));
        area = svg("path", { class: "ui-chart__area", fill: `url(#${id})` });
        group.append(fill, area);
      }
      const line = svg("path", { class: "ui-chart__line" });
      group.append(line);
      canvas.append(group);
      const dot = paint(el("span", { class: "ui-chart__dot" }), item);
      plot.insertBefore(dot, tip);
      const value = el("b");
      const label = el("span");
      const row = el("span", { class: "ui-chart__tip-row" }, key(item), value, label);
      return { item, group, area, line, dot, row, value, label };
    });
    /* В подсказке основные ряды — первыми, как в легенде. */
    tip.append(...data.series.map((item) => parts.find((part) => part.item === item).row));

    range = data.count ? scale(data.series, data.zero) : null;
    yAxis.replaceChildren(...(range ? range.ticks.map((value) => el("span", { style: { "--ui-chart-p": String((value - range.min) / (range.max - range.min)) }, text: formats.axis.format(value) })) : []));
    empty.textContent = t("empty");
    if (data.count) empty.remove();
    else plot.append(empty);

    const head = el("tr", null, el("th", { scope: "col" }), ...data.series.map((item) => el("th", { scope: "col", text: item.name })));
    const rows = Array.from({ length: data.count }, (_, at) => el("tr", null, el("th", { scope: "row", text: pointLabel(data.x[at] ?? at + 1) }), ...data.series.map((item) => el("td", { text: valueText(item.values[at] ?? null) }))));
    table.replaceChildren(...(name ? [el("caption", { text: name })] : []), el("thead", null, head), el("tbody", null, ...rows));
    ticksKey = "";
  }

  /* --- рисование по размеру ------------------------------------------------- */

  function draw() {
    const { w, h } = box;
    if (!w || !h || !range) {
      grid.removeAttribute("d");
      for (const part of parts) part.line.removeAttribute("d"), part.area?.removeAttribute("d");
      xAxis.replaceChildren();
      ticksKey = "";
      return;
    }
    /* Волосяные линии — по середине пикселя, нижняя — внутри поля. */
    setAttr(grid, "d", range.ticks.map((value) => `M0,${Math.min(Math.round(yOf(value)) + 0.5, h - 0.5)}H${round(w)}`).join(""));
    const base = yOf(clamp(0, range.min, range.max));
    for (const part of parts) {
      const pieces = runs(part.item.values, xOf, yOf);
      setAttr(part.line, "d", pieces.map(curve).join("") || null);
      if (part.area) setAttr(part.area, "d", pieces.map((run) => `${curve(run)}L${round(run.at(-1)[0])},${round(base)}L${round(run[0][0])},${round(base)}Z`).join("") || null);
    }
    const ticks = xTicks(data.count, w);
    const next = ticks.map((at) => `${at}:${round(xOf(at))}`).join(" ");
    if (next !== ticksKey) {
      ticksKey = next;
      xAxis.replaceChildren(...ticks.map((at) => el("span", { style: { "--ui-chart-x": `${round(xOf(at))}px` }, text: tickLabel(data.x[at] ?? at + 1) })));
    }
    if (active >= 0) show(active);
  }

  /* --- точка под курсором --------------------------------------------------- */

  function show(at) {
    if (!range || !box.w) return;
    active = clamp(at, 0, data.count - 1);
    const x = xOf(active);
    setVar(plot, "--ui-chart-x", `${round(x)}px`);
    for (const part of parts) {
      const value = part.item.values[active] ?? null;
      setAttr(part.dot, "data-off", value === null);
      if (value !== null) setVar(part.dot, "--ui-chart-y", `${round(yOf(value))}px`);
      part.value.textContent = valueText(value);
      part.label.textContent = rowLabel(part.item, active);
    }
    tipHead.textContent = pointLabel(data.x[active] ?? active + 1);
    /* Подсказка — сбоку от вертикали, во второй половине поля — слева от неё. */
    setAttr(tip, "data-side", x > box.w / 2 ? "left" : "right");
    plot.classList.add("is-active");
  }

  function hide() {
    active = -1;
    plot.classList.remove("is-active");
  }

  function announce() {
    live.textContent = [tipHead.textContent, ...parts.map((part) => [part.value.textContent, part.label.textContent].filter(Boolean).join(" "))].join(", ");
  }

  let pointerX = 0;
  const track = frame(() => {
    const rect = plot.getBoundingClientRect();
    if (!rect.width || !data.count) return;
    show(Math.round(clamp((pointerX - rect.left) / rect.width, 0, 1) * (data.count - 1)));
  });
  const follow = (event) => {
    pointerX = event.clientX;
    track();
  };
  ctx.on(plot, "pointermove", follow);
  ctx.on(plot, "pointerdown", follow);
  ctx.on(plot, "pointerleave", () => {
    track.cancel();
    hide();
  });
  ctx.on(plot, "focus", () => {
    if (data.count && plot.matches(":focus-visible")) show(active >= 0 ? active : data.count - 1);
  });
  ctx.on(plot, "blur", hide);
  ctx.on(plot, "keydown", (event) => {
    if (!data.count) return;
    const from = active >= 0 ? active : data.count - 1;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    let next;
    if (step) next = active >= 0 ? from + step : from;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = data.count - 1;
    else if (event.key === "Escape" && active >= 0) {
      event.preventDefault();
      hide();
      return;
    } else return;
    event.preventDefault();
    show(next);
    announce();
  });

  ctx.cleanup(observeSize(plot, {
    read: (entry) => ({ w: entry.contentRect.width, h: entry.contentRect.height }),
    write(next) {
      if (next.w === box.w && next.h === box.h) return;
      box = next;
      draw();
    },
  }));

  build();

  return {
    host,
    update(next) {
      data = normalize(next);
      hide();
      build();
      draw();
    },
    destroy() {
      track.cancel();
      for (const node of [legend, yAxis, plot, xAxis, live, tableBox]) node.remove();
    },
  };
}

export default defineComponent({
  name: "chart",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    update: (host, data) => void get(host)?.update(data),
  }),
});
