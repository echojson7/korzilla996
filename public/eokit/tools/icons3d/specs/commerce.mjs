/* Покупки и деньги: сумка, коробка, грузовик, ценник, магазин, карта, купюры, чек, тележка, подарок, банк, калькулятор, портфель, кубок. Стиль — parts.mjs. */
import { ramp, stripes, L, icon, PAPER, WHITE, CREAM, BEIGE, STEEL, GRAPHITE, LINE, INK, KRAFT, WOOD, BLUE, BLUE_DEEP, NAVY, SKY, YELLOW, GOLD, ORANGE, CORAL, RED, PINK, GREEN, TEAL, VIOLET, GLASS } from "../parts.mjs";

const STRIPES = stripes(5, "#e8493d", "#ededf0");

export default {
  /* Магазин: объёмный домик, крыша, маркиза с фестонами над витриной и дверью. */
  store: { look: "studio", layers: [
    L({ rbox: [15, 12.4, 12], r: 1.0, pos: [12, 15.2, -6], grad: BEIGE }),
    L({ rbox: [16.6, 2.4, 13.6], r: 0.9, pos: [12, 8.4, -6.8], grad: RED }),
    L({ rrect: [16.6, 4.6], r: 1.2, depth: 1.4, bevel: 0.6, pos: [12, 10.6, 6.6], rot: [-0.75, 0, 0], grad: STRIPES, gradAngle: 0 }),
    ...Array.from({ length: 5 }, (_, i) => L({ cyl: true, x: 5.4 + i * 3.3, y: 12.2, r: 1.65, h: 1.2, z: 7.4, grad: i % 2 ? ramp("#ededf0", "#d6d6db") : RED })),
    L({ rrect: [6.4, 4.2], r: 0.9, depth: 0.8, bevel: 0.3, pos: [8.6, 17.6, 5.7], grad: ramp("#9ccaf4", "#5d9be0") }),
    L({ rrect: [3.8, 6], r: 0.9, depth: 0.8, bevel: 0.3, pos: [15.8, 18.3, 5.7], grad: ramp("#a5754f", "#7f5438") }),
    L({ sphere: true, x: 16.9, y: 18.5, r: 0.38, flat: 0.6, z: 6.4, grad: STEEL, mat: "silver" }),
  ] },

  /* Коробка: настоящий куб из крафта, крышка, скотч через верх и перед, наклейка. */
  package: { look: "studio", layers: [
    L({ rbox: [15, 11.6, 14], r: 0.9, pos: [12, 15, -7], grad: KRAFT }),
    L({ rbox: [15.8, 2.8, 14.6], r: 0.9, pos: [12, 8.4, -7.3], grad: ramp("#efc58e", "#dba86a") }),
    L({ rbox: [3.4, 0.5, 14.8], r: 0.2, pos: [12, 7.05, -7.4], grad: ramp("#f6dcb2", "#ecca98") }),
    L({ rbox: [3.4, 14.2, 0.5], r: 0.2, pos: [12, 14.1, 7.05], grad: ramp("#f6dcb2", "#e9c58f") }),
    L({ rrect: [5, 3.6], r: 0.7, depth: 0.5, bevel: 0.2, pos: [6.9, 16.2, 6.95], grad: PAPER }),
    ...[15.5, 17].map((y, i) => L({ rrect: [[3.2, 2.2][i], 0.6], r: 0.3, depth: 0.3, bevel: 0.12, pos: [5.1 + [3.2, 2.2][i] / 2, y, 7.35], color: "#8a8f99" })),
  ] },

  /* Пакет: объёмный бумажный пакет, светлый отворот сверху, ручки спереди и сзади. */
  "shopping-bag": icon([
    L({ tube: "M8.4 8.4V6.6a3.6 3.6 0 0 1 7.2 0v1.8", r: 0.65, z: -5, grad: ramp("#6e4fbf", "#5a3fa6") }),
    L({ rbox: [14, 14, 9], r: 1.0, pos: [12, 15, -4.5], grad: VIOLET }),
    L({ rbox: [14.3, 2.2, 9.3], r: 0.8, pos: [12, 9.1, -4.65], grad: ramp("#c4b8f6", "#a99af0") }),
    L({ tube: "M8.4 9.2V6.6a3.6 3.6 0 0 1 7.2 0v2.6", r: 0.65, z: 3.8, grad: ramp("#7a5cd0", "#6146b4") }),
  ]),

  /* Грузовик: синяя кабина слева с лобовым стеклом, светлый фургон, рама, колёса. */
  truck: icon([
    L({ rbox: [20.4, 2.2, 8], r: 0.8, pos: [11.6, 17.4, -4], grad: GRAPHITE }),
    L({ rbox: [12.6, 10.4, 9], r: 1.3, pos: [15.4, 11.4, -4.5], grad: WHITE }),
    L({ rrect: [10.4, 1.6], r: 0.8, depth: 0.4, bevel: 0.15, pos: [15.4, 13.6, 4.45], grad: ORANGE }),
    L({ rbox: [7, 8.2, 9], r: 1.6, pos: [5.4, 13.4, -4.5], grad: BLUE }),
    L({ rrect: [3.6, 3.2], r: 0.9, depth: 0.5, bevel: 0.2, pos: [5, 11.6, 4.3], grad: SKY }),
    L({ rrect: [6.2, 3.4], r: 1.0, depth: 0.5, bevel: 0.2, pos: [2.0, 11.8, 0], rot: [0, -Math.PI / 2, 0], grad: SKY }),
    ...[6.2, 16.8].flatMap((x) => [
      L({ cyl: true, x, y: 18.8, r: 2.5, h: 2, z: 2.4, grad: GRAPHITE, fillet: 0.6 }),
      L({ cyl: true, x, y: 18.8, r: 1.1, h: 0.6, z: 4.1, grad: STEEL, mat: "silver" }),
      L({ cyl: true, x, y: 18.8, r: 2.5, h: 2, z: -4.4, grad: GRAPHITE, fillet: 0.6 }),
    ]),
  ]),

  /* Ценник: толстая бирка с отверстием и стальной люверс. */
  tag: icon([
    L({ d: "M12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l8.6 8.6a2.6 2.6 0 0 0 3.6 0l6.2-6.2a2.6 2.6 0 0 0 0-3.6z M9.1 7.5a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 1 0 3.2 0z", rule: "evenodd", depth: 3, bevel: 1, bevelSize: 0.8, z: -1.5, grad: ORANGE, gradAngle: 60 }),
    L({ torus: true, x: 7.5, y: 7.5, R: 1.75, r: 0.55, z: 2.3, grad: STEEL, mat: "silver" }),
  ]),

  /* Карта: две толстые карты стопкой, чип, строка номера. */
  "credit-card": icon([
    L({ rrect: [19, 12.2], r: 1.8, depth: 1.5, bevel: 0.6, pos: [13.4, 10.4, -2.8], rot: [0, 0, 0.1], grad: GRAPHITE }),
    L({ rrect: [19, 12.2], r: 1.8, depth: 1.6, bevel: 0.6, pos: [11.4, 13.2, -0.8], grad: BLUE_DEEP }),
    L({ rrect: [3.6, 2.8], r: 0.7, depth: 0.4, bevel: 0.15, pos: [6.6, 12, 0.7], grad: GOLD }),
    ...[5.4, 9.6, 13.8].map((x) => L({ tube: `M${x} 16.4h2.6`, r: 0.42, z: 0.55, grad: ramp("#e3eefa", "#c9dbf0") })),
  ]),

  /* Купюры: пачка из четырёх банкнот, бумажная лента посередине, медальоны. */
  banknote: icon([
    ...[-1.6, -0.8, 0, 0.8].map((z, i) => L({ rrect: [20, 11], r: 1.1, depth: 0.8, bevel: 0.32, pos: [12 + (i % 2 ? 0.35 : -0.35), 12, z], grad: i === 3 ? GREEN : ramp("#5fc07e", "#38a05a") })),
    L({ cyl: true, x: 6.4, y: 12, r: 2.1, h: 0.3, z: 1.5, grad: ramp("#a8e3b8", "#86d29c") }),
    L({ cyl: true, x: 17.6, y: 12, r: 2.1, h: 0.3, z: 1.5, grad: ramp("#a8e3b8", "#86d29c") }),
    L({ rbox: [3.6, 11.8, 3.8], r: 0.45, pos: [12, 12, -1.9], grad: PAPER }),
  ]),

  /* Чек: толстая лента с зубчатым краем, строки и итог. */
  receipt: icon([
    L({ d: "M5 3.4A1.4 1.4 0 0 1 6.4 2h11.2A1.4 1.4 0 0 1 19 3.4v17.4a.6.6 0 0 1-.9.5L16.5 20.4l-2.2 1.3-2.3-1.3-2.3 1.3-2.2-1.3-1.6.9a.6.6 0 0 1-.9-.5z", depth: 2.4, bevel: 0.8, bevelSize: 0.7, z: -1.2, grad: WHITE }),
    L({ tube: "M8.4 6.8h7.2", r: 0.48, z: 1.75, grad: LINE }),
    L({ tube: "M8.4 9.6h4.6", r: 0.48, z: 1.75, grad: LINE }),
    L({ tube: "M8.4 12.4h6", r: 0.48, z: 1.75, grad: LINE }),
    L({ rrect: [7.8, 2.4], r: 1.1, depth: 0.6, bevel: 0.25, pos: [12, 16, 1.75], grad: ORANGE }),
  ]),

  /* Тележка: объёмная корзина, стальная рама и ручка, четыре колеса. */
  "shopping-cart": icon([
    ...[-3.6, 3.6].map((z) => L({ tube: "M1.8 3.6h2.4l2.6 12.6h11.4", r: 0.55, z: z - 0.55, grad: STEEL, mat: "silver" })),
    L({ cyl: true, x: 1.8, y: 3.6, r: 0.75, h: 8.4, z: -4.2, grad: RED }),
    L({ d: "M5.2 6.2h15.8a.9.9 0 0 1 .88 1.1l-1.5 6.9a2.4 2.4 0 0 1-2.35 1.9H8.6a2.4 2.4 0 0 1-2.34-1.86z", depth: 6.6, bevel: 0.9, bevelSize: 0.8, z: -3.3, grad: RED }),
    L({ tube: "M7.4 9.6h12.4 M8.2 12.6h10.8", r: 0.32, z: 3.75, color: "#b8352b" }),
    ...[[8.6, 2.6], [18, 2.6], [8.6, -4], [18, -4]].map(([x, z]) => L({ cyl: true, x, y: 19.4, r: 1.6, h: 1.4, z, grad: GRAPHITE, fillet: 0.5 })),
  ]),

  /* Подарок: красная коробка, крышка, золотая лента крестом и бант. */
  gift: icon([
    L({ rbox: [14, 10, 13], r: 1.0, pos: [12, 16.6, -6.5], grad: RED }),
    L({ rbox: [15.6, 3.4, 14.6], r: 1.0, pos: [12, 10.2, -7.3], grad: ramp("#f6786c", "#e5544a") }),
    L({ rbox: [3, 10, 0.5], r: 0.2, pos: [12, 16.6, 6.45], grad: GOLD }),
    L({ rbox: [3.1, 3.5, 0.5], r: 0.2, pos: [12, 10.2, 7.25], grad: GOLD }),
    L({ rbox: [3.1, 0.5, 14.8], r: 0.2, pos: [12, 8.45, -7.4], grad: GOLD }),
    L({ rbox: [15.8, 0.5, 3.1], r: 0.2, pos: [12, 8.45, -1.55], grad: GOLD }),
    { group: [L({ torus: true, x: 12, y: 12, R: 2.1, r: 0.8, z: 0, grad: YELLOW })], rot: [0, 0.35, 0.7], pos: [-2.3, 5.6, 0] },
    { group: [L({ torus: true, x: 12, y: 12, R: 2.1, r: 0.8, z: 0, grad: YELLOW })], rot: [0, -0.35, -0.7], pos: [2.3, 5.6, 0] },
    L({ sphere: true, x: 12, y: 7.4, r: 1.25, z: -1.25, grad: YELLOW }),
  ]),

  /* Банк: ступени, четыре колонны, стена за ними, синий фронтон. */
  landmark: icon([
    L({ rbox: [20.4, 2, 12.4], r: 0.6, pos: [12, 20.6, -6.2], grad: PAPER }),
    L({ rbox: [18.4, 1.6, 11], r: 0.5, pos: [12, 18.8, -5.5], grad: WHITE }),
    L({ rbox: [16, 9.4, 5], r: 0.6, pos: [12, 13.4, -4.6], grad: ramp("#cfd1d7", "#b9bcc4") }),
    ...[5.6, 9.9, 14.1, 18.4].map((x) => L({ cyl: true, axis: "y", x, y: 13.2, r: 1.15, h: 9.4, z: 3, grad: WHITE, fillet: 0.3 })),
    L({ rbox: [19.4, 1.8, 11.4], r: 0.5, pos: [12, 7.8, -5.7], grad: WHITE }),
    L({ d: "M12 1.8l9.4 4.4a.6.6 0 0 1-.25 1.15H2.85a.6.6 0 0 1-.25-1.15z", depth: 9.4, bevel: 0.7, bevelSize: 0.6, z: -4.7, grad: NAVY }),
  ]),

  /* Калькулятор: толстый корпус, светлый экран, клавиши, оранжевая «равно». */
  calculator: icon([
    L({ rrect: [15.4, 20.4], r: 2.4, depth: 3.6, bevel: 1.1, pos: [12, 12, -1.8], grad: GRAPHITE }),
    L({ rrect: [11.6, 4.4], r: 1.0, depth: 0.5, bevel: 0.2, pos: [12, 6.3, 1.45], grad: ramp("#d6e8d6", "#b4cdb6") }),
    ...[0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((col) => L({ rrect: [2.5, 2.2], r: 0.75, depth: 0.9, bevel: 0.38, pos: [7.35 + col * 3.1, 11.2 + row * 2.9, 1.3], grad: col === 3 ? (row === 3 ? ORANGE : ramp("#8b909b", "#6f7480")) : WHITE }))),
  ]),

  /* Портфель: кожаный корпус, ремни с золотыми замками, ручка сверху. */
  briefcase: icon([
    L({ torus: true, x: 12, y: 8.6, R: 2.8, r: 0.75, z: 0, arc: Math.PI, grad: GRAPHITE }),
    L({ rbox: [20, 13, 7.4], r: 2.0, pos: [12, 14.8, -3.7], grad: ramp("#b98058", "#97613c", "#78492b") }),
    ...[7.4, 16.6].flatMap((x) => [
      L({ rrect: [1.9, 13], r: 0.6, depth: 0.4, bevel: 0.15, pos: [x, 14.8, 3.55], color: "#7a4a2c" }),
      L({ rrect: [2.6, 2.4], r: 0.6, depth: 0.6, bevel: 0.22, pos: [x, 12.2, 3.8], grad: GOLD }),
    ]),
  ]),

  /* Кубок: золотая чаша на ножке, ручки, тёмная подставка с табличкой. */
  trophy: icon([
    ...[[6.2, 7.8], [17.8, 7.8]].map(([x, y]) => L({ torus: true, x, y, R: 2.3, r: 0.62, z: 0, grad: YELLOW })),
    L({ lathe: [[0, 17.4], [3, 17.4], [2.6, 16.9], [1, 16], [1, 14.4], [1.6, 13.2], [3.4, 12], [5, 9.8], [5.8, 7], [6.05, 4.2], [6.1, 3.6], [5.5, 3.4], [4.6, 4.2], [0, 5]], x: 12, z: 0, grad: GOLD }),
    L({ rbox: [10.4, 3.6, 7], r: 1.0, pos: [12, 19.25, -3.5], grad: GRAPHITE }),
    L({ rrect: [5, 1.5], r: 0.5, depth: 0.4, bevel: 0.15, pos: [12, 19.25, 3.45], grad: GOLD }),
  ]),
};
