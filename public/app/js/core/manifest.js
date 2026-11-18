/* Манифесты: слои → одно описание админки → индекс.

   Сайт (sites/index.js) перечисляет слои по порядку: общие модули CMS, потом
   модули клиента, потом правки самого сайта. Слой — модуль с картами по id:

     export default {
       id: "shop",
       app:      { home: "overview" },
       sections: { store: { label: "Store", order: 20, collapsible: true } },
       pages:    { orders: { path: "orders", title: "Orders", load: () => import("./orders/index.js") } },
       nav:      { orders: { section: "main", page: "orders", order: 30 } },
       rail:     { … }, commands: { … },
       register(admin) { … },   // счётчики, действия, строки палитры (extensions.js)
     };

   Слияние: запись с тем же id дополняет прежнюю (поля поверх), null удаляет её,
   новый id добавляет. Так клиентский слой меняет подпись или порядок пункта, не
   переписывая модуль, убирает раздел и добавляет свою страницу. load страницы —
   ленивый импорт её модуля: сборка (tools/build.mjs) режет по нему бандл.

   check() собирает ошибки списком с путём до поля; createIndex() отдаёт то, чем
   пользуются роутер, оболочка и страницы. */

const MAPS = ["sections", "pages", "nav", "rail", "commands"];

/* Слои → одно описание. У записи остаётся from — id слоя, который её добавил;
   entries — register() слоёв по порядку. */
export function compose(layers, app = {}) {
  const out = { app: { ...app }, entries: [], layers: [] };
  const removed = {};
  for (const key of MAPS) { out[key] = {}; removed[key] = new Set(); }
  for (const layer of layers) {
    out.layers.push(layer.id);
    if (layer.register) out.entries.push(layer.register);
    Object.assign(out.app, layer.app);
    for (const key of MAPS) {
      for (const [id, value] of Object.entries(layer[key] ?? {})) {
        if (value === null) { delete out[key][id]; removed[key].add(id); }
        else out[key][id] = out[key][id] ? { ...out[key][id], ...value } : { from: layer.id, ...value };
      }
    }
  }
  cascade(out, removed);
  return out;
}

/* Убранная страница уводит за собой ссылки на неё (пункты, рейку, команды),
   убранный раздел — свои пункты, убранный пункт — вложенные. Слою клиента не
   нужно перечислять всё, что от удалённого зависело. */
function cascade(out, removed) {
  const gone = (entry) => removed.pages.has(entry.page) || removed.sections.has(entry.section);
  for (const key of ["rail", "commands"]) {
    for (const [id, entry] of Object.entries(out[key])) if (gone(entry)) delete out[key][id];
  }
  let dropped = new Set(removed.nav);
  do {
    const next = new Set();
    for (const [id, item] of Object.entries(out.nav)) {
      if (gone(item) || dropped.has(item.parent)) { delete out.nav[id]; next.add(id); }
    }
    dropped = next;
  } while (dropped.size);
}

const one = (entry, ...keys) => keys.filter((key) => entry[key] != null).length;

export function check(manifest) {
  const errors = [];
  const { app, sections, pages, nav, rail, commands } = manifest;
  const paths = new Map();
  if (!pages[app.home]) errors.push(`app.home: нет страницы «${app.home}»`);
  for (const [id, page] of Object.entries(pages)) {
    if (!page.title) errors.push(`pages.${id}.title: нужен заголовок`);
    if (typeof page.path !== "string") errors.push(`pages.${id}.path: нужен путь`);
    else if (paths.has(page.path)) errors.push(`pages.${id}.path: путь «${page.path}» уже у страницы «${paths.get(page.path)}»`);
    else paths.set(page.path, id);
    if (page.nav && !nav[page.nav]) errors.push(`pages.${id}.nav: нет пункта «${page.nav}»`);
  }
  for (const [id, item] of Object.entries(nav)) {
    if (!item.section && !item.parent) errors.push(`nav.${id}: нужен section или parent`);
    if (item.section && !sections[item.section]) errors.push(`nav.${id}.section: нет раздела «${item.section}»`);
    if (item.parent && !nav[item.parent]) errors.push(`nav.${id}.parent: нет пункта «${item.parent}»`);
    if (one(item, "page", "href", "action") > 1) errors.push(`nav.${id}: page, href и action — только одно`);
    if (item.page && !pages[item.page]) errors.push(`nav.${id}.page: нет страницы «${item.page}»`);
  }
  for (const [id, item] of Object.entries(rail)) {
    if (item.page && !pages[item.page]) errors.push(`rail.${id}.page: нет страницы «${item.page}»`);
  }
  for (const [id, command] of Object.entries(commands)) {
    if (!one(command, "page", "action")) errors.push(`commands.${id}: нужен page или action`);
    if (command.page && !pages[command.page]) errors.push(`commands.${id}.page: нет страницы «${command.page}»`);
  }
  return errors;
}

const byOrder = (a, b) => (a.order ?? 100) - (b.order ?? 100);
const list = (map) => Object.entries(map).map(([id, value]) => ({ id, ...value })).sort(byOrder);
const pattern = (path) => path.split("/").filter(Boolean);

function toQuery(query) {
  if (!query) return "";
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(Object.entries(query).filter(([, value]) => value != null && value !== ""));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/* can(permission) — есть ли право у пользователя; страница требует все свои права. */
export function createIndex(manifest, { can = () => true } = {}) {
  const pages = new Map(Object.entries(manifest.pages).map(([id, page]) => [id, { id, permissions: [], ...page }]));
  const canAccess = (page) => !!page && page.permissions.every(can);
  const allowed = (item) => !item.page || canAccess(pages.get(item.page));

  const href = (id, { params = {}, query } = {}) => {
    const page = pages.get(id);
    if (!page) return "#/";
    const path = pattern(page.path).map((part) => (part.startsWith(":") ? encodeURIComponent(params[part.slice(1)] ?? "") : part)).join("/");
    return `#/${path}${toQuery(query)}`;
  };

  /* Путь адреса → страница и её :параметры. Точное совпадение сегментов. */
  const match = (path) => {
    const parts = pattern(path);
    for (const page of pages.values()) {
      const want = pattern(page.path);
      if (want.length !== parts.length) continue;
      const params = {};
      if (want.every((part, at) => (part.startsWith(":") ? ((params[part.slice(1)] = decodeURIComponent(parts[at])), true) : part === parts[at]))) return { page, params };
    }
    return null;
  };

  /* Дерево навигации: пункт без права исчезает, ветка без детей и без страницы —
     тоже (если у неё нет источника детей из данных), раздел без пунктов — тоже. */
  const items = list(manifest.nav).filter(allowed);
  const childrenOf = (id) => items.filter((item) => item.parent === id).map(grow).filter(Boolean);
  function grow(item) {
    const children = childrenOf(item.id);
    if (!item.page && !item.href && !item.action && !item.source && !children.length) return null;
    return { ...item, children };
  }
  const sections = list(manifest.sections)
    .map((section) => ({ ...section, items: items.filter((item) => item.section === section.id && !item.parent).map(grow).filter(Boolean) }))
    .filter((section) => section.items.length);

  /* Какой пункт подсвечивать на странице: page.nav или первый пункт с этой страницей. */
  const navOf = (pageId) => pages.get(pageId)?.nav ?? items.find((item) => item.page === pageId)?.id ?? null;

  return {
    app: manifest.app,
    layers: manifest.layers,
    entries: manifest.entries,
    pages,
    page: (id) => pages.get(id) ?? null,
    canAccess,
    href,
    match,
    navOf,
    nav: (id) => items.find((item) => item.id === id) ?? null,
    sections,
    rail: list(manifest.rail).filter(allowed),
    commands: list(manifest.commands).filter(allowed),
  };
}
