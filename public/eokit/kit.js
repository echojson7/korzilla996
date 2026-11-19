/* EOKIT · вход кита. Каталог модулей поведения и их загрузка по имени.

     import { load, mount, unmount, kit, setTheme } from "../eokit/kit.js";
     await load(["popover", "select", "tabs"]);       // + icons (разметка с data-ui-icon)
     kit("tableView").create(host, { columns, dataSource });
     unmount(view); view.innerHTML = next; mount(view);   // перерисовка куска
     setTheme("dark");

   Модуль — { name, selector, setup() → { mount, unmount, get, … } } (core/component.js).
   load() ставит новые модули на документ; дальше mount(root) — после своей отрисовки. */

/* Версия кита: меняется вместе с CHANGELOG.md. */
export const version = "1.71.0";

export const catalog = {
  accordion: () => import("./components/accordion/accordion.js"),
  alert: () => import("./components/alert/alert.js"),
  badge: () => import("./components/badge/badge.js"),
  breadcrumb: () => import("./components/breadcrumb/breadcrumb.js"),
  carousel: () => import("./components/carousel/carousel.js"),
  cart: () => import("./components/cart/cart.js"),
  chart: () => import("./components/chart/chart.js"),
  checkboxTree: () => import("./components/checkbox-tree/checkbox-tree.js"),
  code: () => import("./components/code/code.js"),
  colorpicker: () => import("./components/colorpicker/colorpicker.js"),
  command: () => import("./components/command/command.js"),
  datepicker: () => import("./components/datepicker/datepicker.js"),
  dropdown: () => import("./components/dropdown/dropdown.js"),
  editor: () => import("./components/editor/editor.js"),
  fav: () => import("./components/fav/fav.js"),
  fileUpload: () => import("./components/file-upload/file-upload.js"),
  filterBuilder: () => import("./components/filter-builder/filter-builder.js"),
  icons: () => import("./components/icons/icons.js"),
  masks: () => import("./components/masks/masks.js"),
  modal: () => import("./components/modal/modal.js"),
  numberField: () => import("./components/number-field/number-field.js"),
  pagination: () => import("./components/pagination/pagination.js"),
  popover: () => import("./components/popover/popover.js"),
  prompt: () => import("./components/prompt/prompt.js"),
  prose: () => import("./components/prose/prose.js"),
  repeater: () => import("./components/repeater/repeater.js"),
  scaleSlider: () => import("./components/scale-slider/scale-slider.js"),
  select: () => import("./components/select/select.js"),
  sortable: () => import("./components/sortable/sortable.js"),
  spinner: () => import("./components/spinner/spinner.js"),
  tableView: () => import("./components/table/table-view.js"),
  tableColumns: () => import("./components/table/table-columns.js"),
  tableResize: () => import("./components/table/table-resize.js"),
  tableSort: () => import("./components/table/table-sort.js"),
  tabs: () => import("./components/tabs/tabs.js"),
  tooltip: () => import("./components/tooltip/tooltip.js"),
  tour: () => import("./components/tour/tour.js"),
  treeMenu: () => import("./components/tree-menu/tree-menu.js"),
};

/* apis: name → setup() загруженного модуля. mounted — модули, которые load() уже
   поставил на документ: загруженный в неудачной пачке ставится при ней же, но
   отметка отдельная, чтобы повтор load() не прошёл мимо. */
const apis = new Map();
const pending = new Map();
const mounted = new Set();

/* Файлы каждого модуля с вложенными импортами. В репозитории — null; сборка для
   выкладки (tools/build.mjs) вписывает сюда список. Тогда load() ставит им
   modulepreload разом, и браузер не узнаёт зависимости по одной за круг по сети. */
const DEPS = null;
const preloaded = new Set();

function preload(name) {
  for (const file of DEPS?.[name] ?? []) {
    if (preloaded.has(file)) continue;
    preloaded.add(file);
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = new URL(file, import.meta.url).href;
    document.head.append(link);
  }
}

/* Неудачный импорт (сеть, опечатка в чанке) не запоминается: повтор load() пробует снова. */
function loadOne(name) {
  if (!(name in catalog)) return Promise.reject(new Error(`[EOKIT] нет модуля «${name}»`));
  let promise = pending.get(name);
  if (!promise) {
    preload(name);
    promise = catalog[name]().then(({ default: module }) => {
      const api = module.setup();
      apis.set(name, api);
      return api;
    });
    promise.catch(() => pending.delete(name));
    pending.set(name, promise);
  }
  return promise;
}

/* Иконки из разметки нужны почти всегда и почти ничего не стоят: грузятся первыми.
   Не загрузился один модуль — остальные всё равно ставятся, а load() отклоняется
   его ошибкой (несколько — AggregateError). */
export async function load(names = []) {
  const fresh = ["icons", ...names].filter((name, at, list) => list.indexOf(name) === at && !mounted.has(name));
  const results = await Promise.allSettled(fresh.map(loadOne));
  const failed = [];
  results.forEach((result, at) => {
    const name = fresh[at];
    if (result.status === "rejected") failed.push(result.reason);
    else if (!mounted.has(name)) {
      mounted.add(name);
      result.value.mount?.(document);
    }
  });
  if (failed.length > 1) throw new AggregateError(failed, `[EOKIT] не загрузились модули: ${failed.length}`);
  if (failed.length) throw failed[0];
  return kit;
}

export function mount(root = document) {
  for (const api of apis.values()) api.mount?.(root);
}

/* Снять компоненты с поддерева до того, как узлы уйдут из документа. */
export function unmount(root = document) {
  for (const api of apis.values()) api.unmount?.(root);
}

export const kit = (name) => apis.get(name) ?? null;

export { setTheme, toggleTheme, isDark, setDensity, getDensity } from "./core/theme.js";
export { setMessages } from "./core/locale.js";
/* Движение: пружинный вход (pop), толчок значения (bump), уход строки с доездом
   соседей (leave), перекладка (flip), тайминг пружины-токена для animate
   (springTiming) и уровень движения full / lite / off (setMotion, «auto» — по железу). */
export { pop, bump, leave, flip, springTiming, springEasing, setMotion, getMotion, getMotionChoice } from "./core/motion.js";
