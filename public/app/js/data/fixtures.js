/* Общие демо-данные: «сегодня», сотрудники, продажи по дням и разделы сайта. Заказы
   и покупатели — в orders.js, каталог — в catalog.js, заявки — в requests.js. Всё
   детерминировано: «сегодня» зафиксировано, случайность с зерном — снимки экранов от
   запуска к запуску совпадают. Бэкенд CMS заменит эти данные ответами сервера. */

export const NOW = new Date(2026, 9, 12, 10, 0);
import { t } from "../core/i18n.js";

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const initialsOf = (name) => name.split(" ").map((part) => part[0]).join("");

/* Сотрудники магазина. id — код, по которому на человека ссылаются заказы и записи
   «Контента» (и сохранённые в браузере данные), initials — буквы на аватаре, tone —
   тон кита. */
const person = (id, name, tone) => ({ id, name, tone, initials: initialsOf(name) });
export const TEAM = {
  MA: person("MA", "Мария Андреева", "teal"),
  HM: person("HM", "Глеб Миронов", "red"),
  MR: person("MR", "Марина Руденко", "olive"),
  AO: person("AO", "Антон Одинцов", "violet"),
};
export const ME = { ...TEAM.AO, permissions: ["*"] };

/* Продажи по дням: 180 полных дней по вчера — сегодняшний день ещё идёт. value —
   выручка в рублях, orders — заказы (средний чек около 7 000 ₽), visitors — посетители
   сайта по Метрике (конверсия около 2 %). В выходные заказов больше; сезон — летний
   спад и рост с сентября: последние 30 дней примерно на 10 % выше прошлых 30. */
const SEASON = [[3, 0.9], [4, 0.9], [5, 0.88], [6, 0.84], [7, 0.9], [8, 1], [9, 1.1]]; // [месяц с 0, множитель в его середине]
function season(date) {
  const at = date.getMonth() + (date.getDate() - 1) / new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() - 0.5;
  const next = SEASON.findIndex(([month]) => month >= at);
  if (next <= 0) return SEASON.at(next)[1];
  const [[m0, k0], [m1, k1]] = [SEASON[next - 1], SEASON[next]];
  return k0 + ((at - m0) / (m1 - m0)) * (k1 - k0);
}
export const REVENUE = (() => {
  const rand = seeded(42);
  const days = [];
  for (let i = 180; i >= 1; i--) {
    const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
    const weekend = [0, 6].includes(date.getDay()) ? 1.15 : 1;
    const orders = Math.round(34 * season(date) * weekend * (0.88 + rand() * 0.24));
    const check = 7000 * (0.9 + rand() * 0.2);
    days.push({ date, value: Math.round(orders * check), orders, visitors: Math.round(orders / (0.018 + rand() * 0.004)) });
  }
  return days;
})();

/* Разделы сайта: дерево до трёх уровней. Функция — каждый вызов даёт свежую копию:
   страница «Разделы» правит дерево и хранит его у себя (store.js). kind — тип
   раздела старой CMS: text, news, portfolio, docs, gallery, reviews,
   contacts (их записи — модели «Контента» с тем же id) и catalog (товары). */
const section = (id, title, kind, children = [], { published = true, menu = true } = {}) => ({ id, title: t(title), slug: id, kind, published, menu, children });
/* Разделы сайта вместо демо (js/data/live.js): дерево из разделов движка, тип
   раздела — по компоненту. Главная (путь «/») в дерево не входит, как и в демо. */
export const LIVE_KIND = { textpage: "text", news: "news", portfolio: "portfolio", documents: "docs", gallery: "gallery", reviews: "reviews", advantages: "text", contacts: "contacts", catalog: "catalog" };
let liveSections = null;
export function useLiveSections(rows) {
  const node = (row) => ({ id: `s${row.id}`, title: row.name, slug: row.slug || `s${row.id}`, kind: LIVE_KIND[row.component] ?? "text", published: row.is_published, menu: true, children: [] });
  const nodes = new Map(rows.filter((row) => row.path !== "/").map((row) => [row.id, node(row)]));
  const roots = [];
  for (const row of rows) {
    const item = nodes.get(row.id);
    if (!item) continue;
    const parent = nodes.get(row.parent_id);
    (parent ? parent.children : roots).push(item);
  }
  liveSections = roots;
}

export const siteSections = () => (liveSections ? structuredClone(liveSections) : demoSections());
const demoSections = () => [
  section("catalog", "Catalog", "catalog", [
    section("kitchen", "Kitchen", "catalog", [
      section("cookware", "Cookware", "catalog"),
      section("tableware", "Tableware", "catalog"),
    ]),
    section("textile", "Textile", "catalog", [
      section("throws", "Blankets and throws", "catalog"),
      section("bath", "For the bathroom", "catalog"),
    ]),
    section("decor", "Decor", "catalog", [
      section("candles", "Candles and scents", "catalog"),
      section("clocks", "Wall clocks", "catalog"),
    ]),
    section("office", "Office", "catalog"),
    section("gifts", "Gifts", "catalog"),
    section("sale", "Sale", "catalog", [], { published: false }),
  ]),
  section("new", "New arrivals", "catalog"),
  section("help", "For customers", "text", [
    section("shipping", "Shipping", "text"),
    section("payment", "Payment", "text"),
    section("returns", "Returns and exchanges", "text"),
    section("wholesale", "For wholesale buyers", "text"),
  ]),
  section("news", "News", "news"),
  section("projects", "Our projects", "portfolio"),
  section("about", "About the store", "text", [
    section("reviews", "Reviews", "reviews"),
    section("certificates", "Certificates", "gallery"),
    section("gallery", "Photo gallery", "gallery"),
    section("docs", "Documents", "docs"),
    section("advantages", "Advantages", "text", [], { menu: false }),
  ]),
  section("contacts", "Contacts", "contacts"),
  section("privacy", "Privacy policy", "text", [], { menu: false }),
];
/* Ветки, свёрнутые при первом открытии. */
export const SECTIONS_COLLAPSED = ["about"];
