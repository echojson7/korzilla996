/* Знаки и связь: люди, график, шестерёнка, галочка, предупреждение, вопрос, сообщение, звезда, сердце, искры, глобус, плитки, метка, телефон, колокольчик, фотоаппарат, отзыв, рупор, медаль. Стиль — parts.mjs. */
import { ramp, stripes, L, icon, PAPER, WHITE, CREAM, BEIGE, STEEL, GRAPHITE, LINE, INK, KRAFT, WOOD, BLUE, BLUE_DEEP, NAVY, SKY, YELLOW, GOLD, ORANGE, CORAL, RED, PINK, GREEN, TEAL, VIOLET, GLASS } from "../parts.mjs";

const f = (n) => +n.toFixed(3);

/* Многоугольник со скруглёнными углами. Дуги разбиваются на частые точки, длинные
   стороны тоже: на стыке длинной стороны и короткой дуги фаска даёт залом. Радиус дуги
   должен быть больше отступа фаски, иначе на остром углу фаска выстреливает иглой.
   r — радиус для каждой вершины или один на все; вогнутые углы тоже скругляются. */
function filletPoints(points, r, step = 0.25) {
  const n = points.length, out = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i + n - 1) % n], [x, y] = points[i], [nx, ny] = points[(i + 1) % n];
    const rad = Array.isArray(r) ? r[i] : r;
    const l1 = Math.hypot(px - x, py - y), l2 = Math.hypot(nx - x, ny - y);
    const e1 = [(px - x) / l1, (py - y) / l1], e2 = [(nx - x) / l2, (ny - y) / l2];
    const theta = Math.acos(Math.max(-1, Math.min(1, e1[0] * e2[0] + e1[1] * e2[1])));
    if (!rad || theta > Math.PI - 1e-3) { out.push([x, y]); continue; }
    const bis = [e1[0] + e2[0], e1[1] + e2[1]], bl = Math.hypot(...bis);
    const dist = rad / Math.sin(theta / 2), c = [x + (bis[0] / bl) * dist, y + (bis[1] / bl) * dist];
    const t = rad / Math.tan(theta / 2);
    const a = [x + e1[0] * t - c[0], y + e1[1] * t - c[1]], b = [x + e2[0] * t - c[0], y + e2[1] * t - c[1]];
    let a0 = Math.atan2(a[1], a[0]), a1 = Math.atan2(b[1], b[0]);
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    while (a0 - a1 > Math.PI) a1 += Math.PI * 2;
    const steps = Math.max(4, Math.ceil((Math.abs(a1 - a0) * rad) / step));
    for (let k = 0; k <= steps; k++) { const ang = a0 + ((a1 - a0) * k) / steps; out.push([c[0] + rad * Math.cos(ang), c[1] + rad * Math.sin(ang)]); }
  }
  return resample(out, step);
}
const fillet = (points, r) => polyPath(filletPoints(points, r));

/* Замкнутый контур в точки с равным шагом. */
function resample(pts, step) {
  const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  const total = segs.reduce((sum, [p, q]) => sum + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
  const n = Math.round(total / step), out = [];
  let seg = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const want = (i * total) / n;
    for (;;) {
      const [p, q] = segs[seg], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (acc + len >= want || seg === segs.length - 1) { const k = len ? (want - acc) / len : 0; out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); break; }
      acc += len; seg += 1;
    }
  }
  return out;
}

/* Пятиконечная звезда: центр, внешний и внутренний радиусы. */
const starPoints = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
  return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
});
const star = (cx, cy, R, r, tip, inner) => fillet(starPoints(cx, cy, R, r), starPoints(0, 0, 1, 1).map((_, i) => (i % 2 ? inner : tip)));

/* Четырёхлучевая искра: острые лучи со скруглёнными концами и мягкими впадинами. */
function spark(cx, cy, R, waist = 0.24, tip = 0.5, inner = 0.9) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4, rr = i % 2 ? R * waist : R;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return fillet(pts, pts.map((_, i) => (i % 2 ? inner * R * 0.25 : tip)));
}

/* Сердце из двух дуг-долей и скруглённого низа: и контур, и точки для строчки. */
function heartAt(inset = 0) {
  const cy = 8.9, lobe = 5.35 - inset, cxs = [7.35, 16.65];
  const tipY = 21.2 - inset * 1.6, fil = Math.max(0.6, 2 - inset * 0.6);
  const P = [12, tipY];
  const tangent = (cx, side) => {
    const dx = P[0] - cx, dy = P[1] - cy, d = Math.hypot(dx, dy), base = Math.atan2(dy, dx), beta = Math.acos(lobe / d);
    const a = base + side * beta;
    return [a, [cx + lobe * Math.cos(a), cy + lobe * Math.sin(a)]];
  };
  const [aL, TL] = tangent(cxs[0], 1), [aR, TR] = tangent(cxs[1], -1);
  const kx = 12, ky = cy - Math.sqrt(Math.max(0, lobe * lobe - (12 - cxs[0]) ** 2));
  const kL = Math.atan2(ky - cy, kx - cxs[0]), kR = Math.atan2(ky - cy, kx - cxs[1]);
  const pts = [];
  const arc = (cx, a0, a1, steps) => { for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; pts.push([cx + lobe * Math.cos(a), cy + lobe * Math.sin(a)]); } };
  // левая доля: от выемки через верх влево и вниз до касательной (против часовой на экране)
  let endL = aL; while (endL > kL) endL -= Math.PI * 2;
  arc(cxs[0], kL, endL, 48);
  // скругление низа
  const e1 = [(TL[0] - P[0]), (TL[1] - P[1])], e2 = [(TR[0] - P[0]), (TR[1] - P[1])];
  const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
  const u1 = [e1[0] / l1, e1[1] / l1], u2 = [e2[0] / l2, e2[1] / l2];
  const theta = Math.acos(u1[0] * u2[0] + u1[1] * u2[1]), t = fil / Math.tan(theta / 2);
  const A = [P[0] + u1[0] * t, P[1] + u1[1] * t], B = [P[0] + u2[0] * t, P[1] + u2[1] * t];
  const ctr = [P[0], P[1] - fil / Math.sin(theta / 2)];
  const s0 = Math.atan2(A[1] - ctr[1], A[0] - ctr[0]), s1 = Math.atan2(B[1] - ctr[1], B[0] - ctr[0]);
  for (let i = 0; i <= 10; i++) { const a = s0 + ((s1 - s0) * i) / 10; pts.push([ctr[0] + fil * Math.cos(a), ctr[1] + fil * Math.sin(a)]); }
  // правая доля: от касательной вверх и через верх к выемке
  let endR = kR; while (endR > aR) endR -= Math.PI * 2;
  arc(cxs[1], aR, endR, 48);
  pts.pop();
  return pts;
}
const polyPath = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + "z";

/* Облачко сообщения: круг и хвостик к левому нижнему углу, все стыки скруглены. */
function bubble(cx = 12.4, cy = 11.4, R = 9.4) {
  const from = (128 * Math.PI) / 180, to = (162 * Math.PI) / 180, pts = [], rr = [];
  for (let i = 0; i <= 60; i++) { const a = to + ((Math.PI * 2 - (to - from)) * i) / 60; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); rr.push(i === 0 || i === 60 ? 1 : 0); }
  pts.push([2.2, 21.6]); rr.push(1.1);
  return fillet(pts, rr);
}

const circle = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 1-${2 * r} 0 ${r} ${r} 0 1 1 ${2 * r} 0z`;

const MARK = ramp("#f6f6f8", "#dcdce1");
/* Толстая шайба с крупной круглой кромкой. */
const disc = (grad, r = 9.6) => L({ d: circle(12, 12, r), depth: 2.6, bevel: 1.8, bevelSize: 0.9, z: -1.3, grad });
/* Бюст: плечи — тело вращения, сверху голова-шар. */
const shoulders = [[0, 0], [0.39, 0.04], [0.69, 0.18], [0.88, 0.39], [0.97, 0.63], [1, 0.87], [0.97, 1], [0, 1]];
const bust = (x, top, w, h, r, z, grad) => [
  L({ lathe: shoulders.map(([a, b]) => [f(a * w), f(top + b * h)]).reverse(), x, z, grad }),
  L({ sphere: true, x, y: top - r - 0.5, r, z: z - r, grad }),
];

export default {
  users: icon([
    ...bust(16.2, 13.6, 5.6, 7.4, 3.1, -3, TEAL),
    ...bust(8.8, 14.2, 6.6, 7.8, 3.6, 1.6, BLUE),
  ]),

  /* Столбики разной высоты на подставке. */
  "chart-column": icon([
    L({ rbox: [21, 1.8, 9], r: 0.8, pos: [12, 21.1, -4.5], grad: WHITE }),
    L({ rbox: [4.6, 7, 4.6], r: 1.2, pos: [6.2, 16.7, -2.3], grad: SKY }),
    L({ rbox: [4.6, 11.4, 4.6], r: 1.2, pos: [12, 14.5, -2.3], grad: BLUE }),
    L({ rbox: [4.6, 16.6, 4.6], r: 1.2, pos: [17.8, 11.9, -2.3], grad: BLUE_DEEP }),
  ]),

  /* Шестерёнка: толстая сталь, оранжевая втулка. */
  settings: icon([
    L({ d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915zM15.2 12a3.2 3.2 0 1 0-6.4 0 3.2 3.2 0 1 0 6.4 0z",
      rule: "evenodd", depth: 3, bevel: 1.1, bevelSize: 0.8, z: -1.5, grad: STEEL }),
    L({ torus: true, x: 12, y: 12, R: 3.1, r: 1, z: 2.2, grad: ORANGE }),
  ]),

  "circle-check": icon([
    disc(GREEN),
    L({ tube: "M7.4 12.3l3.2 3.2 6-6.3", r: 1.15, z: 2.3, grad: MARK }),
  ]),

  "triangle-alert": icon([
    L({ d: fillet([[12, 1.6], [22.8, 20.8], [1.2, 20.8]], 2.6), depth: 2.6, bevel: 1.7, bevelSize: 0.9, z: -1.3, grad: YELLOW }),
    L({ tube: "M12 8.4v5", r: 1.15, z: 2.3, grad: GRAPHITE }),
    L({ sphere: true, x: 12, y: 17.2, r: 1.3, flat: 0.75, z: 2.3, grad: GRAPHITE }),
  ]),

  "circle-help": icon([
    disc(BLUE),
    L({ tube: "M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.3-2.8 3.7", r: 1.15, z: 2.3, grad: MARK }),
    L({ sphere: true, x: 12, y: 17.4, r: 1.3, flat: 0.75, z: 2.3, grad: MARK }),
  ]),

  "message-circle": icon([
    L({ d: bubble(), depth: 2.6, bevel: 1.8, bevelSize: 0.9, z: -1.3, grad: VIOLET }),
    ...[8, 12.4, 16.8].map((x) => L({ sphere: true, x, y: 11.4, r: 1.35, flat: 0.7, z: 2.2, grad: MARK })),
  ]),

  /* Закладка: толстая лента с вырезом снизу. */
  bookmark: icon([
    L({ d: fillet([[5, 2.4], [19, 2.4], [19, 21.4], [12, 16.6], [5, 21.4]], [2.2, 2.2, 1, 1.4, 1]), depth: 2.8, bevel: 1.4, bevelSize: 0.8, z: -1.4, grad: CORAL }),
  ]),

  /* Мишень: толстая шайба, кольца ступенями, центр выше всех. */
  target: icon([
    disc(RED),
    L({ cyl: true, x: 12, y: 12, r: 6.8, h: 1, z: 2.4, grad: MARK, fillet: 0.4 }),
    L({ cyl: true, x: 12, y: 12, r: 4.6, h: 1, z: 3, grad: RED, fillet: 0.4 }),
    L({ cyl: true, x: 12, y: 12, r: 2.2, h: 1, z: 3.6, grad: MARK, fillet: 0.4 }),
  ]),

  star: icon([
    L({ d: star(12, 12.9, 11.2, 5.6, 1.6, 1.2), depth: 2.4, bevel: 1.8, bevelSize: 0.8, z: -1.2, grad: GOLD }),
  ]),

  heart: icon([
    L({ d: polyPath(resample(heartAt(0), 0.25)), depth: 2.6, bevel: 2.2, bevelSize: 0.85, z: -1.3, grad: RED }),
  ]),

  sparkles: icon([
    L({ d: spark(10.2, 13.4, 10.2, 0.36, 1.3), depth: 2.4, bevel: 1.5, bevelSize: 0.7, z: -1.2, grad: GOLD }),
    L({ d: spark(18.8, 5.2, 4.4, 0.4, 0.8), depth: 1.6, bevel: 1, bevelSize: 0.6, z: -0.2, grad: ORANGE }),
    L({ d: spark(19.6, 18.6, 3, 0.42, 0.6), depth: 1.2, bevel: 0.7, bevelSize: 0.6, z: -1.4, grad: ORANGE }),
  ]),

  /* Знак помощника: те же искры в фирменных зелёных Корзиллы. */
  "sparkles-ai": icon([
    L({ d: spark(10.2, 13.4, 10.2, 0.36, 1.3), depth: 2.4, bevel: 1.5, bevelSize: 0.7, z: -1.2, grad: ramp("#a9dc6c", "#87c540", "#6fae2c") }),
    L({ d: spark(18.8, 5.2, 4.4, 0.4, 0.8), depth: 1.6, bevel: 1, bevelSize: 0.6, z: -0.2, grad: ramp("#6aa72a", "#4f8a1c", "#3f7115") }),
    L({ d: spark(19.6, 18.6, 3, 0.42, 0.6), depth: 1.2, bevel: 0.7, bevelSize: 0.6, z: -1.4, grad: ramp("#6aa72a", "#4f8a1c", "#3f7115") }),
  ]),

  /* Настольный глобус: океан, выпуклые материки, стальная дуга и подставка. */
  globe: (() => {
    const R = 8.6, cy = 10.6;
    /* Материк — шар почти радиуса глобуса, чуть сдвинутый наружу: на поверхности остаётся
       широкое выпуклое пятно. k — доля радиуса (больше — шире пятно). */
    const land = (x, y, k) => {
      const dx = x - 12, dy = y - cy, dz = Math.sqrt(Math.max(0, R * R - dx * dx - dy * dy)), rb = k * R, d = R - rb + 0.32;
      return L({ sphere: true, x: 12 + (dx / R) * d, y: cy + (dy / R) * d, r: rb, z: (dz / R) * d - rb, grad: ramp("#7fd394", "#4fb26a") });
    };
    return icon([
      L({ sphere: true, x: 12, y: cy, r: R, z: -R, grad: ramp("#7fbcf0", "#4a94dc", "#3579c2") }),
      // материки — несколько перекрытых пятен
      ...[[7.8, 6.8, 0.64], [6.8, 9.6, 0.6], [9.6, 13.4, 0.58], [10.6, 16, 0.54]].map(([x, y, k]) => land(x, y, k)),
      ...[[15.6, 11.2, 0.62], [16, 14.4, 0.58], [14.4, 5.6, 0.52]].map(([x, y, k]) => land(x, y, k)),
      { group: [L({ torus: true, x: 12, y: 12, R: R + 1.3, r: 0.5, z: 0, arc: Math.PI, grad: STEEL, mat: "silver" })], rot: [0, 0, -Math.PI / 2 - 0.35], pos: [0, 12 - cy, 0] },
      L({ cyl: true, axis: "y", x: 12, y: 20.6, r: 0.7, h: 1.6, z: 0, grad: STEEL, mat: "silver" }),
      L({ cyl: true, axis: "y", x: 12, y: 21.8, r: 4.4, r2: 4.8, h: 1.2, z: 0, grad: GRAPHITE }),
    ]);
  })(),

  "layout-grid": icon([
    ...[[7, 7, BLUE], [17, 7, YELLOW], [7, 17, WHITE], [17, 17, BLUE]].map(([x, y, grad]) => L({ rrect: [8.6, 8.6], r: 2.4, depth: 3.4, bevel: 1.2, pos: [x, y, -1.7], grad })),
  ]),

  /* Метка: каплевидное тело вращения, светлая шайба и тень-подставка. */
  "map-pin": (() => {
    const cy = 9, R = 7.6, tip = 21.4, beta = Math.acos(R / (tip - cy)), end = Math.PI - beta;
    const profile = [[0, tip], [0.5, tip - 0.4]];
    for (let i = 40; i >= 0; i--) { const a = (end * i) / 40; profile.push([f(R * Math.sin(a)), f(cy - R * Math.cos(a))]); }
    return icon([
      L({ cyl: true, axis: "y", x: 12, y: 21.6, r: 4.2, h: 0.6, z: 0, grad: LINE }),
      L({ lathe: profile, x: 12, grad: RED }),
      L({ sphere: true, x: 12, y: 9, r: 3, flat: 0.5, z: 5.8, grad: MARK }),
    ], { tiltY: 0.18 });
  })(),

  phone: icon([
    L({ d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384z",
      depth: 3, bevel: 1.6, bevelSize: 0.75, z: -1.5, grad: GREEN }),
  ]),

  /* Колокольчик: тело вращения, кромка, язычок, ушко и красная точка уведомления. */
  bell: icon([
    L({ torus: true, x: 12, y: 2.9, R: 1.1, r: 0.5, z: 0, grad: GOLD }),
    L({ lathe: [[0, 3.4], [1.8, 3.5], [3.6, 4.2], [4.9, 5.6], [5.6, 7.6], [5.9, 10.2], [6.3, 12.8], [7.2, 14.8], [8.3, 16.2], [8.6, 16.9], [8.2, 17.4], [0, 17.4]].reverse(), x: 12, grad: YELLOW }),
    L({ torus: true, axis: "y", x: 12, y: 17.05, R: 8.2, r: 0.55, z: 0, grad: ramp("#f6b640", "#cf7d16") }),
    L({ sphere: true, x: 12, y: 18.7, r: 1.8, z: -1.8, grad: GOLD }),
    L({ sphere: true, x: 18.4, y: 5.2, r: 2.6, z: 1.4, grad: RED }),
  ]),

  /* Фотоаппарат: глубокий корпус, выступающий объектив, кнопка сверху. */
  camera: { look: "studio", layers: [
    L({ rbox: [7.6, 4, 6], r: 1.4, pos: [12, 7.6, -3], grad: GRAPHITE }),
    L({ cyl: true, axis: "y", x: 17.4, y: 7.6, r: 1.25, h: 1.4, z: 0.6, grad: CORAL }),
    L({ rbox: [20, 12.6, 8], r: 2.2, pos: [12, 14.6, -4], grad: GRAPHITE }),
    L({ rrect: [3.4, 2], r: 0.8, depth: 0.6, bevel: 0.25, pos: [5.6, 10.6, 3.8], grad: ramp("#f2f3f5", "#cfd2d8") }),
    L({ cyl: true, x: 12, y: 14.8, r: 5.3, h: 3.4, z: 3.4, grad: STEEL, mat: "silver", fillet: 0.5 }),
    L({ cyl: true, x: 12, y: 14.8, r: 4.3, h: 1.2, z: 6.2, grad: GRAPHITE }),
    L({ sphere: true, x: 12, y: 14.8, r: 3.3, flat: 0.32, z: 6.7, grad: GLASS, gradAngle: 120, props: { roughness: 0.25, clearcoat: 0 } }),
    L({ sphere: true, x: 10.8, y: 13.6, r: 0.7, flat: 0.4, z: 7.5, color: "#a9bde3" }),
  ] },

  /* Отзыв: облачко сообщения тёплым жёлтым, на нём светлая звезда оценки. */
  "message-star": icon([
    L({ d: bubble(), depth: 2.6, bevel: 1.8, bevelSize: 0.9, z: -1.3, grad: YELLOW }),
    L({ d: star(12.4, 11.6, 5.4, 2.6, 0.8, 0.5), depth: 1.2, bevel: 0.6, bevelSize: 0.4, z: 1.6, grad: MARK }),
  ]),

  /* Рупор: конус кораллового пластика раструбом вправо-вверх и к зрителю, светлое жерло, ручка. */
  megaphone: icon([
    { group: [
      L({ lathe: [[0, 3.2], [2.4, 3.2], [2.7, 4.2], [2.8, 5.6], [7.4, 17.2], [7.9, 18.2], [7.7, 19], [0, 19]].reverse(), x: 12, grad: CORAL }),
      L({ cyl: true, axis: "y", x: 12, y: 19.05, r: 6.6, h: 0.3, z: 0, grad: WHITE }),
      L({ cyl: true, axis: "y", x: 12, y: 2.6, r: 2.2, h: 1.4, z: 0, grad: GRAPHITE }),
      L({ rbox: [2.4, 5.2, 2.6], r: 1, pos: [8.2, 9.6, -1.3], grad: GRAPHITE }),
    ], rot: [0.25, -0.7, Math.PI / 2 + 0.35], pos: [0, 0, 0] },
  ]),

  /* Медаль: синяя и красная ленты, золотой диск, выпуклая звезда. */
  medal: icon([
    L({ d: fillet([[4.6, 1.4], [9.6, 1.4], [14.2, 11.6], [9.2, 11.6]], 0.6), depth: 1.2, bevel: 0.4, bevelSize: 0.3, z: -1.8, grad: BLUE_DEEP }),
    L({ d: fillet([[14.4, 1.4], [19.4, 1.4], [14.8, 11.6], [9.8, 11.6]], 0.6), depth: 1.2, bevel: 0.4, bevelSize: 0.3, z: -1.4, grad: RED }),
    L({ d: circle(12, 15.2, 7), depth: 2.6, bevel: 1.6, bevelSize: 0.8, z: -1, grad: GOLD }),
    L({ d: star(12, 15.5, 4, 1.9, 0.6, 0.4), depth: 0.9, bevel: 0.45, bevelSize: 0.35, z: 1.8, grad: YELLOW }),
  ]),
};
