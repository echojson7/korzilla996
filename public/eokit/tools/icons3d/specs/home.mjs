/* Дом и быт: дом, картинка, самолётик, ракета, огонь, лампа, диван, суп, приборы, стакан, кастрюля, кофе, росток, ванна, душ. Стиль — parts.mjs. */
import { ramp, L, icon, PAPER, WHITE, CREAM, BEIGE, STEEL, GRAPHITE, WOOD, BLUE, NAVY, SKY, YELLOW, GOLD, ORANGE, CORAL, RED, GREEN, TEAL, GLASS } from "../parts.mjs";

const PI = Math.PI;
/* Деталь, собранная вокруг центра сетки (12, 12), переносится в точку (x, y, z) и
   поворачивается на угол rot в плоскости картинки; tilt — наклон к зрителю. */
const at = (x, y, z, rot, layers, tilt = 0) => ({ group: [{ group: layers, rot: [tilt, 0, 0] }], rot: [0, 0, rot], pos: [x - 12, 12 - y, z] });
const drop = (r = 1) => L({ lathe: [[0, 12 - 1.3 * r], [0.25 * r, 12 - 0.75 * r], [0.55 * r, 12 + 0.05 * r], [0.62 * r, 12 + 0.45 * r], [0.45 * r, 12 + 0.85 * r], [0, 12 + r]], x: 12, grad: SKY });

/* Профиль тела вращения должен идти снизу вверх (в сетке lucide — от большего y к меньшему),
   иначе грани смотрят внутрь и деталь выходит чёрной. Переворачиваем, где задано сверху вниз. */
const upright = (layer) => {
  if (layer.group) return { ...layer, group: layer.group.map(upright) };
  if (layer.lathe && layer.lathe[0][1] < layer.lathe.at(-1)[1]) return { ...layer, lathe: [...layer.lathe].reverse() };
  return layer;
};

const icons = {
  /* Дом: объёмные стены, двускатная крыша, труба, дверь и окно. */
  house: icon([
    L({ rbox: [14, 10, 12], r: 1, pos: [12, 16.4, -6], grad: CREAM }),
    L({ d: "M12 3.2l10 8.2a1.3 1.3 0 0 1-.8 2.3H2.8a1.3 1.3 0 0 1-.8-2.3z", depth: 12.4, bevel: 0.9, bevelSize: 0.8, z: -6.2, grad: CORAL }),
    L({ rbox: [2.4, 4.4, 2.4], r: 0.6, pos: [16.6, 6.6, -2], grad: ramp("#c98a62", "#a96d48") }),
    L({ rrect: [3.6, 5.8], r: 0.9, depth: 0.8, bevel: 0.3, pos: [9.2, 18.4, 5.7], grad: WOOD }),
    L({ sphere: true, x: 10.3, y: 18.6, r: 0.3, flat: 0.6, z: 6.4, grad: STEEL, mat: "silver" }),
    L({ rrect: [4.4, 4.2], r: 0.8, depth: 0.7, bevel: 0.3, pos: [15.4, 17.2, 5.7], grad: WHITE }),
    L({ rrect: [3.2, 3], r: 0.5, depth: 0.5, bevel: 0.2, pos: [15.4, 17.2, 6.1], grad: SKY }),
  ]),

  /* Картинка: толстая рамка, небо, две горы и солнце рельефом. */
  image: icon([
    L({ rrect: [20, 16.4], r: 2.4, depth: 3.2, bevel: 1.1, pos: [12, 12, -1.6], grad: WHITE }),
    L({ rrect: [16, 12.4], r: 1.4, depth: 0.8, bevel: 0.3, pos: [12, 12, 1.1], grad: SKY }),
    L({ d: "M4.2 17.6l4.6-5.6a1.2 1.2 0 0 1 1.8 0l3.6 4.4v1.8z", depth: 1, bevel: 0.5, bevelSize: 0.6, z: 1.6, grad: TEAL }),
    L({ d: "M9 18.2l5.4-6.8a1.2 1.2 0 0 1 1.9 0l3.5 4.4v1.4a1 1 0 0 1-1 1H9z", depth: 1.4, bevel: 0.6, bevelSize: 0.6, z: 1.8, grad: GREEN }),
    L({ sphere: true, x: 8.2, y: 8.4, r: 1.7, flat: 0.55, z: 1.6, grad: YELLOW }),
  ]),

  /* Бумажный самолётик: толстые крылья, светлое сверху, тёмное снизу. */
  send: icon([
    L({ d: "M21.4 2.6 10.9 13.1l3.9 8.3q.6 1 1-.1z", depth: 1.4, bevel: 0.7, bevelSize: 0.7, z: -1.6, grad: ramp("#4f8fd8", "#2f6fb8") }),
    L({ d: "M21.4 2.6 3 8.5q-1 .4 0 .9l7.9 3.7z", depth: 1.4, bevel: 0.7, bevelSize: 0.7, z: 0.4, grad: BLUE, gradAngle: 80 }),
    L({ d: "M21.4 2.6 10.9 13.1l.9 3.6z", depth: 0.8, bevel: 0.4, bevelSize: 0.5, z: -0.4, grad: ramp("#9cc8f2", "#6aa6e4") }),
  ]),

  /* Ракета: светлый корпус, коралловые нос и крылья, иллюминатор, пламя. */
  rocket: icon([
    at(12.4, 11.6, 0, -PI / 4, [
      L({ lathe: [[0, 19.4], [2, 19.5], [2.6, 20.6], [2.3, 22.2], [1.3, 23.5], [0, 24]], x: 12, grad: ramp("#ffd166", "#ff9a3c", "#f2643a"), emissive: "#ff9a50", emissiveIntensity: 0.3 }),
      L({ lathe: [[0, 17], [2.4, 17], [2.9, 19.3], [2.3, 19.6], [0, 19.6]], x: 12, grad: GRAPHITE }),
      L({ lathe: [[0, 6.2], [3.35, 6.2], [3.7, 8], [3.85, 10.5], [3.7, 13.5], [3.3, 16], [2.8, 17.2], [0, 17.2]], x: 12, grad: WHITE }),
      L({ lathe: [[0, 2], [1, 2.4], [2.1, 3.6], [3, 5.1], [3.4, 6.3], [0, 6.3]], x: 12, grad: CORAL }),
      L({ d: "M8.8 12.2 5.2 16q-.8.9-.6 2l.4 2.4 4.4-3.3z", depth: 1.8, bevel: 0.8, bevelSize: 0.8, z: -0.9, grad: CORAL }),
      L({ d: "M15.2 12.2l3.6 3.8q.8.9.6 2l-.4 2.4-4.4-3.3z", depth: 1.8, bevel: 0.8, bevelSize: 0.8, z: -0.9, grad: CORAL }),
      L({ cyl: true, x: 12, y: 10.2, r: 2.1, h: 1, z: 3, grad: STEEL, mat: "silver" }),
      L({ sphere: true, x: 12, y: 10.2, r: 1.55, flat: 0.4, z: 3.5, grad: GLASS, gradAngle: 120, props: { roughness: 0.25 } }),
    ]),
  ]),

  /* Огонь: пухлое пламя слоями — красно-оранжевое снаружи, жёлтое внутри. */
  flame: icon([
    L({ d: "M12 22a7 7 0 0 1-7-7c0-2.6 1-4.5 2.1-6.1a1 1 0 0 1 1.7.3c.3.9.6 1.6 1.2 2-.1-3.1 1.1-6 3.5-8.4a1 1 0 0 1 1.7.6c.5 2.4 1.9 4.2 3.5 6C19 11 19 13 19 15a7 7 0 0 1-7 7z",
      depth: 3, bevel: 1.8, bevelSize: 0.5, z: -2.5, grad: ramp("#ffa04a", "#f5732f", "#e2483a") }),
    L({ d: "M12 21.2a4.8 4.8 0 0 1-4.8-4.8c0-2.4 1.6-3.8 2.9-5.6a1 1 0 0 1 1.6.1c.5 1.2 1.3 2 2.2 2.7 1.3 1 2 2.1 2 3.6A4.6 4.6 0 0 1 12 21.2z", depth: 1.4, bevel: 1, bevelSize: 0.5, z: 1.2, grad: ramp("#ffc04e", "#ff9a38") }),
    L({ d: "M12 20.6a2.6 2.6 0 0 1-2.6-2.6c0-1.4.9-2.2 1.7-3.2a.6.6 0 0 1 1 .1c.3.7.8 1.2 1.3 1.6.8.6 1.2 1.2 1.2 2.1A2.5 2.5 0 0 1 12 20.6z", depth: 0.8, bevel: 0.6, bevelSize: 0.4, z: 2.8, grad: ramp("#fff0a8", "#ffd45a"), emissive: "#ffd36a", emissiveIntensity: 0.2 }),
  ]),

  /* Настольная лампа: тяжёлое основание, стальной рычаг, жёлтый плафон. */
  "lamp-desk": icon([
    L({ lathe: [[0, 18.6], [1.5, 18.7], [3.4, 19.4], [4.6, 20.4], [4.9, 21.3], [4.6, 21.8], [0, 21.8]], x: 7.4, z: 0, grad: GRAPHITE }),
    L({ tube: "M7.4 19 5.2 12.4 11.4 8", r: 0.75, z: -0.75, grad: STEEL, mat: "silver" }),
    ...[[5.2, 12.4], [11.4, 8]].map(([x, y]) => L({ cyl: true, x, y, r: 1.05, h: 1.9, z: -0.95, grad: GRAPHITE })),
    at(13.8, 10.2, 0, PI / 4, [
      L({ lathe: [[0, 8.4], [1.3, 8.4], [1.5, 9.6], [2, 10.4], [3.5, 11.8], [4.8, 13.8], [5.2, 14.9], [5, 15.2], [0, 15.2]], x: 12, grad: YELLOW }),
      L({ cyl: true, axis: "y", x: 12, y: 15.3, r: 4.5, h: 0.2, z: 0, color: "#fff6e0", emissive: "#ffe6a8", emissiveIntensity: 0.8 }),
    ], -0.6),
  ]),

  /* Диван: объёмные спинка, сиденье и подлокотники, деревянные ножки. */
  sofa: icon([
    ...[5, 19].map((x) => L({ cyl: true, axis: "y", x, y: 19.8, r: 0.75, r2: 0.55, h: 1.8, z: 2.6, grad: WOOD })),
    L({ rbox: [16, 8.6, 4], r: 1.8, pos: [12, 9.6, -4], grad: TEAL }),
    L({ rbox: [7.6, 5, 7.4], r: 1.8, pos: [8.2, 15.4, -3.6], grad: ramp("#6fdccd", "#3cbfae", "#2a9e90") }),
    L({ rbox: [7.6, 5, 7.4], r: 1.8, pos: [15.8, 15.4, -3.6], grad: ramp("#6fdccd", "#3cbfae", "#2a9e90") }),
    L({ rbox: [16.4, 2.4, 7.8], r: 1, pos: [12, 18.2, -4], grad: TEAL }),
    ...[3.4, 20.6].map((x) => L({ rbox: [3.8, 9.6, 8.6], r: 1.8, pos: [x, 14.2, -4.4], grad: TEAL })),
  ]),

  /* Суп: светлая миска, тыквенный суп, ложка. */
  soup: icon([
    L({ lathe: [[0, 20.2], [3.6, 20.2], [3.9, 19.4], [6, 18.7], [8.2, 16.8], [9.6, 14], [10.1, 11.4], [10.2, 10.8], [9.9, 10.6]], x: 12, grad: WHITE }),
    L({ torus: true, axis: "y", x: 12, y: 10.75, R: 9.9, r: 0.55, z: 0, grad: ramp("#5f9ee0", "#3f7fc8") }),
    L({ cyl: true, axis: "y", x: 12, y: 11.5, r: 9.6, h: 0.6, z: 0, grad: ramp("#ffae5c", "#f2803f"), gradAngle: 60, fillet: 0.05 }),
    ...[[9, 11.3, -2.6], [13.4, 11.3, 3], [15.4, 11.3, -1.4]].map(([x, y, z]) => L({ sphere: true, x, y, r: 0.7, flat: 0.5, z, color: "#7cc35a" })),
    at(15, 7.6, 2.2, -0.55, [
      L({ rbox: [1.3, 9.6, 0.9], r: 0.45, pos: [12, 10, -0.45], grad: STEEL, mat: "silver" }),
      L({ sphere: true, x: 12, y: 16, r: 1.9, flat: 0.45, z: -0.8, grad: STEEL, mat: "silver" }),
    ], -0.9),
  ], { tiltX: 0.4 }),

  /* Вилка и нож: толстая сталь, деревянные ручки. */
  utensils: icon([
    L({ d: "M3 2.9a.9.9 0 0 1 1.8 0V7h1V2.9a.9.9 0 0 1 1.8 0V7h1V2.9a.9.9 0 0 1 1.8 0V9a2.7 2.7 0 0 1-2.4 2.7V14H6.6v-2.3A2.7 2.7 0 0 1 3 9z", depth: 1.2, bevel: 0.5, bevelSize: 0.6, z: -0.6, grad: STEEL, mat: "silver" }),
    L({ rbox: [3, 9, 2.6], r: 1.3, pos: [6.7, 17.6, -1.3], grad: WOOD }),
    L({ d: "M21 3v10.6h-3.2a1.9 1.9 0 0 1-1.9-1.9V8a5 5 0 0 1 4.3-4.95A.6.6 0 0 1 21 3z", depth: 1, bevel: 0.5, bevelSize: 0.6, z: -0.5, grad: STEEL, mat: "silver" }),
    L({ rbox: [3, 8.8, 2.6], r: 1.3, pos: [19.6, 17.7, -1.3], grad: WOOD }),
    ...[[6.7, 16], [6.7, 19.2], [19.6, 16.2], [19.6, 19.4]].map(([x, y]) => L({ sphere: true, x, y, r: 0.42, flat: 0.5, z: 1.15, grad: STEEL, mat: "silver" })),
  ]),

  /* Стакан воды: голубая вода в полупрозрачном стекле, ободок. */
  "glass-water": icon([
    L({ lathe: [[0, 19.4], [4.7, 19.4], [5.6, 10.6], [0, 10.6]], x: 12, grad: ramp("#9ad6ff", "#4fa6ee"), emissive: "#3f8fdc", emissiveIntensity: 0.15 }),
    L({ cyl: true, axis: "y", x: 12, y: 10.6, r: 5.55, h: 0.15, z: 0, color: "#a9d4f8", fillet: 0.02 }),
    L({ lathe: [[0, 21.8], [4.8, 21.8], [5.3, 21.3], [7, 3.3], [6.6, 3], [4.8, 19.4], [0, 19.4]], x: 12, grad: ramp("#eef4fb", "#cbdcf0"), props: { transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.25 } }),
    L({ torus: true, axis: "y", x: 12, y: 3.15, R: 6.8, r: 0.3, z: 0, grad: ramp("#f2f6fc", "#d6e2f2"), props: { transparent: true, opacity: 0.85 } }),
  ], { tiltX: 0.36 }),

  /* Кастрюля: красная эмаль, стальная крышка, ручки. */
  "cooking-pot": icon([
    ...[2.4, 21.6].map((x) => L({ rbox: [3.6, 1.8, 3], r: 0.9, pos: [x, 14, -1.5], grad: GRAPHITE })),
    L({ lathe: [[0, 21.4], [6.4, 21.4], [7.4, 20.8], [7.8, 19.4], [7.8, 12.4], [0, 12.4]], x: 12, grad: RED }),
    L({ torus: true, axis: "y", x: 12, y: 12.4, R: 7.8, r: 0.35, z: 0, grad: ramp("#e8574b", "#c93a30") }),
    L({ lathe: [[8.3, 12.3], [8.3, 11.6], [7.4, 10.6], [5.2, 9.4], [2.6, 8.9], [0, 8.8]], x: 12, grad: STEEL, mat: "silver" }),
    L({ lathe: [[0, 9], [1.7, 9], [1.9, 7.8], [1.6, 6.6], [1, 6.3], [0, 6.3]], x: 12, grad: GRAPHITE }),
  ]),

  /* Кружка кофе: синяя кружка с ручкой, кофе, блюдце. */
  coffee: icon([
    L({ lathe: [[0, 22.2], [7.6, 22.2], [8.6, 21.6], [8.6, 21.2], [7.4, 21], [0, 21]], x: 11, grad: ramp("#e4e4e8", "#c4c4ca") }),
    L({ torus: true, x: 16.8, y: 14.4, R: 2.9, r: 1.1, z: 0, grad: NAVY }),
    L({ lathe: [[0, 21.4], [5.2, 21.4], [6.1, 20.8], [6.6, 19.4], [6.7, 9], [6.6, 8.1], [6.1, 8.1], [6, 9.6], [0, 9.6]], x: 10, grad: NAVY }),
    L({ cyl: true, axis: "y", x: 10, y: 9.4, r: 6.05, h: 0.3, z: 0, grad: ramp("#8a6a52", "#5e4433"), gradAngle: 120, fillet: 0.05 }),
  ], { tiltX: 0.4 }),

  /* Росток: терракотовый горшок, земля, стебель и два листа. */
  sprout: icon([
    L({ lathe: [[0, 21.6], [3.6, 21.6], [4.1, 21], [5.4, 15.4], [5.9, 14.8], [5.9, 14.3], [5.3, 14.3], [5.2, 14.8], [0, 14.8]], x: 12, grad: ramp("#e88a5e", "#d06c40", "#b85a32") }),
    L({ torus: true, axis: "y", x: 12, y: 14.4, R: 5.6, r: 0.6, z: 0, grad: ramp("#ee9a6e", "#d4703f") }),
    L({ cyl: true, axis: "y", x: 12, y: 14.9, r: 5.25, h: 0.3, z: 0, grad: ramp("#6b4f3c", "#4e3829"), fillet: 0.05 }),
    L({ tube: "M12 14.8C12 13 11.9 11.6 12.2 9.8", r: 0.6, z: -0.6, grad: GREEN }),
    L({ d: "M11.8 12.6c-.4-2.4-1.6-4.2-3.6-5.2-1.5-.7-3-.8-4.5-.5.3 2.2 1.3 3.9 3 4.8 1.4.8 3.1 1 5.1.9z", depth: 1, bevel: 0.6, bevelSize: 0.6, z: -0.8, grad: GREEN, gradAngle: 150 }),
    L({ d: "M12.2 10.5c.1-3.4 1.2-6 3.4-7.6 1.6-1.1 3.4-1.5 5.2-1.4-.1 2.8-1 5-2.9 6.6-1.6 1.4-3.5 2.2-5.7 2.4z", depth: 1, bevel: 0.6, bevelSize: 0.6, z: -0.2, grad: ramp("#7fdc96", "#3fb262"), gradAngle: 60 }),
  ]),

  /* Ванна: глубокая чаша на ножках, бортик, кран, пена. */
  bath: icon([
    L({ tube: "M5 11V5.4a2.2 2.2 0 0 1 3.8-1.5l.9.9", r: 0.8, z: -3.8, grad: STEEL, mat: "silver" }),
    ...[[11, 9.2, 2], [14.4, 8.6, 2.4], [17.6, 9.4, 1.9], [8.6, 9.8, 1.5]].map(([x, y, r]) => L({ sphere: true, x, y, r, z: -1.6, grad: WHITE })),
    L({ d: "M2.5 10.6h19a.5.5 0 0 1 .5.5V14a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5v-2.9a.5.5 0 0 1 .5-.5z", depth: 7, bevel: 1.2, bevelSize: 0.8, z: -3.5, grad: BLUE }),
    L({ rbox: [21, 1.8, 9.6], r: 0.9, pos: [12, 10.8, -4.8], grad: WHITE }),
    ...[6.4, 17.6].flatMap((x) => [-2.6, 2.6].map((z) => L({ cyl: true, axis: "y", x, y: 19.8, r: 0.9, r2: 0.6, h: 2.2, z, grad: GRAPHITE }))),
  ]),

  /* Лейка душа: стальная труба и лейка, тёмная сетка, голубые капли. */
  "shower-head": icon([
    L({ tube: "M2.2 2.2 6.4 6.4", r: 1, z: -2.8, grad: STEEL, mat: "silver" }),
    at(9.6, 9.6, 0, PI / 4, [
      L({ lathe: [[0.01, 3.8], [1.2, 3.8], [1.3, 5.4], [2.8, 7], [5.2, 8.8], [6.4, 10.2], [6.7, 11.1], [6.5, 11.5], [0.01, 11.5]], x: 12, grad: STEEL, mat: "silver" }),
      L({ cyl: true, axis: "y", x: 12, y: 11.6, r: 5.7, h: 0.3, z: 0, grad: GRAPHITE, fillet: 0.05 }),
    ], -0.75),
    ...[[14.6, 14.6, 1.7], [17.8, 12.4, 1.5], [12.4, 17.8, 1.5], [17.4, 17.4, 1.4]].map(([x, y, r]) => at(x, y, 2, PI / 4, [drop(r)])),
  ]),
};

export default Object.fromEntries(Object.entries(icons).map(([name, spec]) => [name, { ...spec, layers: spec.layers.map(upright) }]));
