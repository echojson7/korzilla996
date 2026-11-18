/* Точки расширения, которые слой подключает своим register(admin):

     register(admin) {
       admin.counters.set("orders.open", () => ORDERS.filter(…).length);
       admin.sources.set("content.models", () => [{ id, label, href, count }]);
       admin.actions.set("orders.new", () => …);
       admin.search.push(() => [{ group: "Orders", label, lead, hint, href }]);
       admin.settings.set("content", { label, before: "integrations", load: () => import("./settings.js") });
     }

   counters — числа у пунктов меню (nav.count — имя счётчика или число);
   sources — дети пункта из данных (nav.source); actions — действия по имени
   (rail, nav, commands, data-action в разметке); search — строки палитры команд
   из данных; settings — вкладки модуля в настройках (перед вкладкой before, без
   него — в конец): load() отдаёт модуль с render(ui, admin) и
   mount(panel, admin, ctx) → cleanup, ui — разметка разделов самих настроек,
   чтобы вкладка выглядела как соседние. При смене сайта всё сбрасывается и
   модули регистрируются заново. */

export const counters = new Map();
export const sources = new Map();
export const actions = new Map();
export const search = [];
export const settings = new Map();

export function reset() {
  counters.clear();
  sources.clear();
  actions.clear();
  search.length = 0;
  settings.clear();
}

/* nav.count: число как есть, строка — имя счётчика; нет счётчика — пусто. */
export function countOf(spec) {
  if (spec == null) return null;
  if (typeof spec === "number") return spec;
  const read = counters.get(spec);
  return read ? read() : null;
}

/* register() слоёв — по порядку: слой клиента может переопределить счётчик или
   действие базового модуля. */
export function registerEntries(entries, admin) {
  for (const register of entries) register(admin);
}
