/* Общие заготовки для specs/: палитра look "studio", помощники слоёв.
   Стиль: настоящие объёмные предметы (глубина сравнима с шириной), матовый пластик,
   крупные скругления, свет мягкий; вид сверху-сбоку задаёт рендер. Белое — светло-серое,
   чтобы не сливалось со страницей. Цвета спокойные, без кислотности. */

/* Перелив сверху вниз из двух-трёх цветов. */
export const ramp = (...colors) => colors.map((color, i) => [i / (colors.length - 1), color]);
/* Полосы слева направо с чёткой границей (маркиза, флаг): gradAngle: 0. */
export const stripes = (n, a, b) => Array.from({ length: n }, (_, i) => [[i / n, i % 2 ? b : a], [(i + 1) / n, i % 2 ? b : a]]).flat();

/* Слой из матового пластика (по умолчанию) и иконка look "studio". */
export const L = (layer) => ({ mat: "plastic", ...layer });
export const icon = (layers, extra = {}) => ({ look: "studio", ...extra, layers });

/* Нейтраль. */
export const PAPER = ramp("#ececef", "#d5d5d9");
export const WHITE = ramp("#f1f1f3", "#d8d8dd");
export const CREAM = ramp("#f6eddd", "#e6d9c4");
export const BEIGE = ramp("#f0e2c8", "#ddc7a4");
export const STEEL = ramp("#e2e4ea", "#b4b8c3", "#9a9fab");
export const GRAPHITE = ramp("#5a5f6b", "#3e424c", "#30333b");
export const LINE = ramp("#b9b9bf", "#9e9ea6");
export const INK = "#4a4a4a";
export const KRAFT = ramp("#e8b97f", "#d49d5e", "#bf8546");
export const WOOD = ramp("#a5754f", "#7f5438");

/* Цвета. */
export const BLUE = ramp("#6cb6ec", "#4398dc", "#2f7cc6");
export const BLUE_DEEP = ramp("#4f9ee0", "#2c74c0");
export const NAVY = ramp("#6593cb", "#4876ae");
export const SKY = ramp("#9ccaf4", "#5d9be0");
export const YELLOW = ramp("#fbc24a", "#efa526", "#dc8d16");
export const GOLD = ramp("#ffd457", "#f6be2a");
export const ORANGE = ramp("#ffab5c", "#f5862f", "#e06d1c");
export const CORAL = ramp("#ff8a6a", "#ee6845", "#d9532f");
export const RED = ramp("#f2655a", "#e2463a", "#c93a30");
export const PINK = ramp("#ff9fb8", "#f2708f");
export const GREEN = ramp("#6fd08c", "#3fb262", "#2f9a50");
export const TEAL = ramp("#5fd3c4", "#2fb3a3", "#22968a");
export const VIOLET = ramp("#ab9bf2", "#8a72e0", "#7259c9");
export const GLASS = ramp("#5c7fc4", "#24345e", "#151d33");
