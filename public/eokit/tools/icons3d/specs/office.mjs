/* Офис и документы: лист, папка, планшет, книга, блокнот, конверт, лоток, календарь, часы, песочные часы, клавиатура, лупа, замок, корзина. Стиль — parts.mjs. */
import { ramp, stripes, L, icon, PAPER, WHITE, CREAM, BEIGE, STEEL, GRAPHITE, LINE, INK, KRAFT, WOOD, BLUE, BLUE_DEEP, NAVY, SKY, YELLOW, GOLD, ORANGE, CORAL, RED, PINK, GREEN, TEAL, VIOLET, GLASS } from "../parts.mjs";

const STRIPES = stripes(5, "#e8493d", "#ededf0");

export default {
  /* Планшет: толстая доска, лист, крупный зажим. */
  "clipboard-list": icon([
    L({ rrect: [16.6, 20.4], r: 2.4, depth: 2.4, bevel: 0.9, pos: [12, 13, -2.4], grad: BLUE_DEEP }),
    L({ rrect: [14.4, 17.6], r: 1.6, depth: 1.0, bevel: 0.4, pos: [12, 13.6, -0.3], grad: PAPER }),
    L({ torus: true, x: 12, y: 3.4, R: 2.2, r: 0.6, z: 0.4, arc: Math.PI, grad: STEEL, mat: "silver" }),
    L({ rrect: [8.6, 4], r: 1.6, depth: 3.4, bevel: 1.2, pos: [12, 4.4, -1.2], grad: YELLOW }),
    ...[9.6, 13.4, 17.2].flatMap((y, i) => [
      L({ rrect: [3, 3], r: 1.5, depth: 0.9, bevel: 0.4, pos: [7.6, y, 0.5], grad: GREEN }),
      L({ tube: `M6.6 ${y}l.75.75 1.5-1.5`, r: 0.28, z: 1.25, color: "#f4f6f4" }),
      L({ tube: `M10.6 ${y}h${[6.4, 4.4, 5.6][i]}`, r: 0.55, z: 0.25, grad: LINE }),
    ]),
  ]),

  /* Блокнот: толстая стопка листов, планка с пружиной, гранёный карандаш. */
  notebook: icon([
    L({ rrect: [15, 16.4], r: 1.2, depth: 3.6, bevel: 0.5, pos: [11.5, 14.6, -3.2], grad: ramp("#efe5d3", "#ddd0ba") }),
    L({ rrect: [15, 16.4], r: 1.2, depth: 0.8, bevel: 0.34, pos: [11.5, 14.6, 0.4], grad: ramp("#f7efe1", "#ebdfcc") }),
    L({ rrect: [15.7, 3.6], r: 1.3, depth: 5.4, bevel: 1.2, pos: [11.55, 4.6, -3.1], grad: ramp("#6593cb", "#4876ae") }),
    ...[6.4, 10.1, 13.5, 16.8].flatMap((x) => [
      L({ cyl: true, x, y: 4.1, r: 0.55, h: 0.3, z: 2.15, color: "#2c3542" }),
      L({ torus: true, axis: "x", x, y: 2.9, R: 1.9, r: 0.5, z: 0.4, grad: ramp("#b9c0c9", "#8e98a6") }),
    ]),
    ...[[8.3, 6.4, 11.6], [10.5, 6.4, 11.6], [12.5, 6.4, 7.9], [14.6, 6.4, 7.9], [18.1, 6.5, 5.9], [19.9, 7.2, 6.1]].map(([y, x, w]) => L({ tube: `M${x} ${y}h${w}`, r: 0.5, z: 0.9, color: "#4a4a4a" })),
    { group: [
      L({ cyl: true, axis: "y", x: 12, y: 5.08, r: 1.2, h: 1.65, z: 2.9, seg: 24, color: "#de6e6e" }),
      L({ cyl: true, axis: "y", x: 12, y: 6.5, r: 1.3, h: 1.2, z: 2.9, seg: 24, grad: ramp("#c9ced5", "#a3aab4") }),
      L({ cyl: true, axis: "y", x: 12, y: 11.75, r: 1.25, h: 9.3, z: 2.9, seg: 6, twist: 0.26, grad: ramp("#ffd457", "#f6be2a"), props: { flatShading: true } }),
      L({ cyl: true, axis: "y", x: 12, y: 17.75, r: 1.25, r2: 0.34, h: 2.7, z: 2.9, seg: 6, twist: 0.26, color: "#f6cb98", props: { flatShading: true } }),
      L({ cyl: true, axis: "y", x: 12, y: 19.42, r: 0.3, r2: 0.04, h: 0.65, z: 2.9, seg: 24, color: "#3d3d3d" }),
    ], rot: [0, 0, -0.56], pos: [6.6, -1.45, 0] },
  ]),

  /* Документ: толстый лист с загнутым углом поверх второго листа, строки текста. */
  "file-text": icon([
    { group: [L({ d: "M6.4 2.6h7.2l5 5v13a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 20.6V4a1.4 1.4 0 0 1 1.4-1.4z", depth: 1.2, bevel: 0.5, bevelSize: 0.8, z: -2.6, grad: ramp("#e0e0e4", "#c8c8cd") })], pos: [0.9, -0.7, 0] },
    L({ d: "M6.4 2.6h7.2l5 5v13a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 20.6V4a1.4 1.4 0 0 1 1.4-1.4z", depth: 1.4, bevel: 0.5, bevelSize: 0.8, z: -0.6, grad: PAPER }),
    L({ d: "M13.6 2.6v3.6a1.4 1.4 0 0 0 1.4 1.4h3.6z", depth: 0.5, bevel: 0.3, bevelSize: 0.8, z: 1.2, grad: ramp("#d8d8dd", "#c2c2c8") }),
    L({ tube: "M8.2 10.4h4", r: 0.55, z: 0.8, grad: BLUE }),
    ...[[13.4, 7.4], [16, 7.4], [18.6, 5]].map(([y, w]) => L({ tube: `M8.2 ${y}h${w}`, r: 0.5, z: 0.8, grad: LINE })),
  ]),

  /* Таблица: толстый лист с загнутым углом, сетка ячеек, зелёная строка шапки. */
  "file-spreadsheet": icon([
    L({ d: "M6.4 2.6h7.2l5 5v13a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 20.6V4a1.4 1.4 0 0 1 1.4-1.4z", depth: 2.4, bevel: 0.6, bevelSize: 0.8, z: -1.2, grad: PAPER }),
    L({ d: "M13.6 2.6v3.6a1.4 1.4 0 0 0 1.4 1.4h3.6z", depth: 0.5, bevel: 0.3, bevelSize: 0.8, z: 1.8, grad: ramp("#d8d8dd", "#c2c2c8") }),
    ...[0, 1, 2, 3].flatMap((row) => [0, 1].map((col) => L({ rrect: [col ? 4.6 : 3.2, 2], r: 0.6, depth: 0.6, bevel: 0.25, pos: [col ? 13.5 : 8.9, 10.6 + row * 2.6, 1.6], grad: row ? ramp("#cfe9d6", "#b2dbbe") : GREEN }))),
  ]),

  /* Пропуск сотрудника: толстая карточка, синее фото с силуэтом, строки, прорезь под ленту. */
  "id-card": icon([
    L({ rrect: [20.4, 15.2], r: 2.2, depth: 2.8, bevel: 1, pos: [12, 13, -1.4], grad: WHITE }),
    L({ rrect: [4.4, 1.3], r: 0.65, depth: 0.5, bevel: 0.2, pos: [12, 7.2, 1.25], color: "#9a9fab" }),
    L({ rrect: [7, 7.6], r: 1.4, depth: 0.8, bevel: 0.3, pos: [7.4, 14.2, 1.1], grad: BLUE }),
    L({ sphere: true, x: 7.4, y: 12.7, r: 1.6, flat: 0.6, z: 1.9, grad: ramp("#f1f1f3", "#d8d8dd") }),
    L({ rrect: [4.6, 2.4], r: 1.2, depth: 0.6, bevel: 0.25, pos: [7.4, 16.6, 1.7], grad: ramp("#f1f1f3", "#d8d8dd") }),
    ...[[11.6, 6], [14.4, 4.4], [17.2, 5.2]].map(([y, w]) => L({ tube: `M13.2 ${y}h${w}`, r: 0.55, z: 1.4, grad: LINE })),
  ]),

  /* Окно браузера: толстая светлая панель, синяя шапка с точками, блок и строки страницы. */
  "app-window": icon([
    L({ rrect: [20.4, 17], r: 2.4, depth: 3.2, bevel: 1.1, pos: [12, 12, -1.6], grad: WHITE }),
    L({ rrect: [17.2, 3], r: 1.2, depth: 0.7, bevel: 0.3, pos: [12, 6.3, 1.1], grad: BLUE }),
    ...[5.4, 7.6, 9.8].map((x) => L({ sphere: true, x, y: 6.3, r: 0.62, flat: 0.6, z: 1.7, grad: ramp("#f6f6f8", "#dcdce1") })),
    L({ rrect: [7, 6.8], r: 1.2, depth: 0.6, bevel: 0.25, pos: [7.9, 13.6, 1.05], grad: SKY }),
    ...[[10.8, 6], [13.6, 4.4], [16.4, 5.2]].map(([y, w]) => L({ tube: `M13.2 ${y}h${w}`, r: 0.55, z: 1.3, grad: LINE })),
  ]),

  /* Папка: задняя стенка с ярлыком, бумаги торчат сверху, передняя створка с наклоном. */
  folder: icon([
    L({ d: "M2.6 6a2 2 0 0 1 2-2h4.8l2.2 2.4h7.8a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H4.6a2 2 0 0 1-2-2z", depth: 1.4, bevel: 0.6, bevelSize: 0.8, z: -3.2, grad: ramp("#f4b43a", "#e09a1e") }),
    L({ rrect: [15, 12], r: 1, depth: 0.6, bevel: 0.25, pos: [12.4, 13.4, -1.5], grad: ramp("#e6e6ea", "#d0d0d5") }),
    L({ rrect: [15, 12], r: 1, depth: 0.6, bevel: 0.25, pos: [11.6, 14, -0.7], grad: PAPER }),
    L({ rrect: [18.8, 11.6], r: 1.8, depth: 1.6, bevel: 0.7, pos: [12, 15.2, 0.2], rot: [0.12, 0, 0], grad: YELLOW }),
  ]),

  /* Открытая книга: два блока страниц углом, синяя обложка, закладка. */
  "book-open": icon([
    { group: [
      L({ rbox: [10.4, 16.6, 1.2], r: 0.5, pos: [6.6, 12, -2.6], grad: NAVY }),
      L({ rbox: [9.8, 15.4, 2.4], r: 0.6, pos: [6.9, 12, -1.6], grad: CREAM }),
      ...[8.4, 10.8, 13.2, 15.6].map((y, i) => L({ tube: `M4 ${y}h${i === 3 ? 3.4 : 5.6}`, r: 0.38, z: 0.4, grad: LINE })),
    ], rot: [0, 0.32, 0] },
    { group: [
      L({ rbox: [10.4, 16.6, 1.2], r: 0.5, pos: [17.4, 12, -2.6], grad: NAVY }),
      L({ rbox: [9.8, 15.4, 2.4], r: 0.6, pos: [17.1, 12, -1.6], grad: CREAM }),
      ...[8.4, 10.8, 13.2, 15.6].map((y, i) => L({ tube: `M14.4 ${y}h${i === 1 ? 3.6 : 5.6}`, r: 0.38, z: 0.4, grad: LINE })),
    ], rot: [0, -0.32, 0] },
    L({ rbox: [1.4, 6, 0.4], r: 0.2, pos: [13.4, 20.4, 0.6], grad: RED }),
  ]),

  /* Конверт: пухлый корпус, клапан треугольником, красная печать. */
  mail: icon([
    L({ rbox: [19.6, 14, 4.4], r: 1.6, pos: [12, 12.5, -2.2], grad: WHITE }),
    L({ d: "M3.6 6.2h16.8l-7.4 6.6a1.6 1.6 0 0 1-2 0z", depth: 0.7, bevel: 0.5, bevelSize: 0.8, z: 1.7, grad: ramp("#dcdce1", "#c6c6cc") }),
    L({ cyl: true, x: 12, y: 12.4, r: 2.1, h: 1.1, z: 2.6, grad: RED, fillet: 0.45 }),
    L({ cyl: true, x: 12, y: 12.4, r: 1.1, h: 0.5, z: 3.5, grad: ramp("#e2463a", "#b8322a"), fillet: 0.2 }),
  ]),

  /* Лоток для входящих: невысокий синий ящик с бортами и стопкой писем внутри. */
  inbox: icon([
    L({ rbox: [19.6, 2.4, 15], r: 1, pos: [12, 17.8, -7.5], grad: BLUE_DEEP }),
    L({ rbox: [19.6, 6.4, 2], r: 1, pos: [12, 14.6, -7.5], grad: BLUE }),
    L({ rbox: [2, 6.4, 15], r: 1, pos: [3.2, 14.6, -7.5], grad: BLUE }),
    L({ rbox: [2, 6.4, 15], r: 1, pos: [20.8, 14.6, -7.5], grad: BLUE }),
    L({ rbox: [14.6, 1.2, 10.6], r: 0.4, pos: [12, 16.2, -5.6], grad: PAPER }),
    L({ rbox: [14.6, 1.2, 10.6], r: 0.4, pos: [12.3, 15, -5.3], grad: ramp("#f4f4f6", "#dcdce0") }),
    L({ rbox: [14.6, 1.2, 10.6], r: 0.4, pos: [11.8, 13.8, -5.1], grad: PAPER }),
    L({ rbox: [19.6, 4.8, 2], r: 1, pos: [12, 15.4, 5.5], grad: BLUE }),
  ], { tiltX: 0.5 }),

  /* Настольный календарь: блок, красная шапка с кольцами, сетка дней с отмеченным. */
  calendar: icon([
    L({ rbox: [18.6, 17, 5.4], r: 1.6, pos: [12, 13.4, -2.7], grad: WHITE }),
    L({ rbox: [19, 5.4, 5.8], r: 1.6, pos: [12, 6.6, -2.9], grad: RED }),
    ...[8, 16].flatMap((x) => [
      L({ cyl: true, x, y: 5, r: 0.55, h: 0.3, z: 2.7, color: "#7a2620" }),
      L({ torus: true, axis: "x", x, y: 3.9, R: 1.7, r: 0.55, z: 1, grad: STEEL, mat: "silver" }),
    ]),
    ...[11.6, 15, 18.4].flatMap((y, row) => [6.6, 10.2, 13.8, 17.4].map((x, col) => L({ rrect: [2.6, 2.4], r: 0.8, depth: 0.6, bevel: 0.25, pos: [x, y, 2.6], grad: row === 1 && col === 2 ? BLUE : LINE }))),
  ]),

  /* Часы: толстый круглый корпус, светлый циферблат, метки, две стрелки. */
  clock: icon([
    L({ cyl: true, x: 12, y: 12, r: 9.6, h: 4.6, z: -2.6, grad: CORAL, fillet: 1.6 }),
    L({ cyl: true, x: 12, y: 12, r: 7.8, h: 0.6, z: 1.6, grad: PAPER, fillet: 0.25 }),
    ...[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2; return L({ sphere: true, x: 12 + 6.2 * Math.sin(a), y: 12 - 6.2 * Math.cos(a), r: 0.6, flat: 0.6, z: 2.1, grad: LINE }); }),
    { group: [L({ rbox: [1.3, 5.6, 0.6], r: 0.5, pos: [12, 9.6, 2.2], grad: GRAPHITE })], rot: [0, 0, 0] },
    { group: [L({ rbox: [1.3, 4.2, 0.6], r: 0.5, pos: [12, 10.3, 2.8], grad: GRAPHITE })], rot: [0, 0, -2.1] },
    L({ cyl: true, x: 12, y: 12, r: 1.1, h: 0.8, z: 2.9, grad: CORAL, fillet: 0.3 }),
  ]),

  /* Песочные часы: деревянная рама на трёх стойках, прозрачные колбы, песок. */
  hourglass: icon([
    L({ cyl: true, axis: "y", x: 12, y: 3.4, r: 6.6, h: 1.8, z: 0, grad: WOOD, fillet: 0.6 }),
    L({ cyl: true, axis: "y", x: 12, y: 20.6, r: 6.6, h: 1.8, z: 0, grad: WOOD, fillet: 0.6 }),
    ...[[16.85, 2.8], [7.15, 2.8], [12, -5.6]].map(([x, z]) => L({ cyl: true, axis: "y", x, y: 12, r: 0.6, h: 16, z, grad: WOOD })),
    L({ lathe: [[0.01, 6.4], ...Array.from({ length: 17 }, (_, i) => { const u = i / 16; return [0.35 + 4.4 * (1 - u ** 1.8), 6.6 + 4.9 * u]; }), [0.01, 11.5]].reverse(), x: 12, z: 0, grad: ramp("#ffdb73", "#f4b630") }),
    L({ lathe: [[0.01, 19.6], ...Array.from({ length: 17 }, (_, i) => { const u = i / 16; return [0.05 + 4.85 * (1 - u ** 1.6), 19.5 - 4.6 * u]; }), [0.01, 14.9]], x: 12, z: 0, grad: ramp("#ffd45e", "#eba524") }),
    L({ cyl: true, axis: "y", x: 12, y: 13, r: 0.3, h: 3.4, z: 0, color: "#f4b630" }),
    L({ torus: true, axis: "y", x: 12, y: 4.7, R: 4.9, r: 0.35, z: 0, grad: ramp("#dfeefa", "#b9d6ee") }),
    L({ torus: true, axis: "y", x: 12, y: 19.3, R: 4.9, r: 0.35, z: 0, grad: ramp("#dfeefa", "#b9d6ee") }),
  ]),

  /* Клавиатура: светлая плита, белые клавиши, синяя клавиша ввода, длинный пробел. */
  keyboard: icon([
    L({ rbox: [21.4, 12.4, 2.6], r: 1.3, pos: [12, 12, -1.6], grad: ramp("#d9dbe1", "#b9bcc5") }),
    ...[7.9, 10.7].flatMap((y) => [3.8, 6.55, 9.3, 12.05, 14.8, 17.55, 20.3].map((x) => L({ rbox: [2.3, 2.3, 1.2], r: 0.55, pos: [x, y, 0.4], grad: WHITE }))),
    ...[3.8, 6.55, 9.3, 12.05, 14.8].map((x) => L({ rbox: [2.3, 2.3, 1.2], r: 0.55, pos: [x, 13.5, 0.4], grad: WHITE })),
    L({ rbox: [5.05, 2.3, 1.2], r: 0.55, pos: [18.9, 13.5, 0.4], grad: BLUE }),
    L({ rbox: [3.6, 2.3, 1.2], r: 0.55, pos: [4.45, 16.3, 0.4], grad: WHITE }),
    L({ rbox: [10.6, 2.3, 1.2], r: 0.55, pos: [12, 16.3, 0.4], grad: WHITE }),
    L({ rbox: [3.6, 2.3, 1.2], r: 0.55, pos: [19.55, 16.3, 0.4], grad: WHITE }),
  ], { tiltX: 0.45 }),

  /* Лупа: стальное кольцо, голубое стекло, оранжевая ручка с муфтой. */
  search: icon([
    L({ cyl: true, x: 10, y: 10, r: 5, h: 0.8, z: -0.4, color: "#cfe6f8", mat: "lens", props: { transparent: true, opacity: 0.55, depthWrite: false } }),
    L({ torus: true, x: 10, y: 10, R: 5.6, r: 1.35, z: 0, grad: STEEL, mat: "silver" }),
    { group: [
      L({ cyl: true, axis: "y", x: 12, y: 9.4, r: 1.6, h: 1.6, z: 0, grad: STEEL, mat: "silver" }),
      L({ cyl: true, axis: "y", x: 12, y: 13.6, r: 1.45, h: 7.2, z: 0, grad: ORANGE, fillet: 0.6 }),
    ], rot: [0, 0, 0.785], pos: [5.2, -5.2, 0] },
  ]),

  /* Замок: латунный корпус, стальная дужка, замочная скважина. */
  lock: icon([
    L({ torus: true, x: 12, y: 9.2, R: 4.4, r: 1.15, z: 0, arc: Math.PI, grad: STEEL, mat: "silver" }),
    ...[7.6, 16.4].map((x) => L({ cyl: true, axis: "y", x, y: 10.6, r: 1.15, h: 2.8, z: 0, grad: STEEL, mat: "silver" })),
    L({ rbox: [16, 12, 7.2], r: 2.2, pos: [12, 15.6, -3.6], grad: GOLD }),
    L({ cyl: true, x: 12, y: 14.4, r: 1.5, h: 0.6, z: 3.3, color: "#3a3127", fillet: 0.2 }),
    L({ rbox: [1.3, 3.4, 0.6], r: 0.5, pos: [12, 16.4, 3.3], color: "#3a3127" }),
  ]),

  /* Корзина: круглое светлое ведро на конус, красная крышка с ручкой. */
  trash: icon([
    L({ lathe: [[0.01, 21], [5.4, 21], [5.9, 20.6], [6.8, 8.4], [0.01, 8.4]], x: 12, z: 0, grad: ramp("#e4e5ea", "#c4c7cf") }),
    ...[11.6, 15.2, 18.6].map((y) => L({ torus: true, axis: "y", x: 12, y, R: 6.85 - (y - 8.4) * 0.111, r: 0.3, z: 0, grad: ramp("#c9ccd4", "#b0b4be") })),
    L({ cyl: true, axis: "y", x: 12, y: 7.4, r: 7.6, h: 2, z: 0, grad: RED, fillet: 0.8 }),
    L({ torus: true, x: 12, y: 6.6, R: 2.2, r: 0.6, z: 0, arc: Math.PI, grad: RED }),
  ]),
};
