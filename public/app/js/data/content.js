/* Демо-данные модуля «Контент»: модели по типам разделов старой CMS, записи,
   медиатека, языки, этапы проверки. Сайт магазина вещей для дома в
   Набережных Челнах. Бэкенд CMS заменит их ответами сервера.

   Подписи моделей и тексты записей даны парой «английский, русский»: модели
   берут язык интерфейса, записи хранят обе версии — это и есть два языка контента.
   Основной язык контента — язык интерфейса, второй — перевод. Функция content()
   каждый раз собирает свежую копию: страницы правят её и хранят у себя (store.js). */

import { lang, L } from "../core/i18n.js";
import { NOW, ME } from "./fixtures.js";
import { PRODUCTS, LABELS } from "./catalog.js";

const DAY = 864e5;
const HOUR = 36e5;
const ago = (days, hours = 0) => new Date(NOW - days * DAY - hours * HOUR).toISOString();

/* ---- Языки и этапы ----------------------------------------------------------- */

export const LOCALES = lang === "ru"
  ? [{ code: "ru", name: "Русский", main: true }, { code: "en", name: "English" }]
  : [{ code: "en", name: "English", main: true }, { code: "ru", name: "Русский" }];
export const MAIN = LOCALES[0].code;
export const OTHER = LOCALES[1].code;

/* Тон — тон кита. required — этап, без которого запись не опубликовать. */
const stages = () => [
  { id: "writing", name: L("Writing", "Пишется"), tone: "gray" },
  { id: "review", name: L("In review", "На проверке"), tone: "amber" },
  { id: "fixes", name: L("Needs changes", "Нужны правки"), tone: "red" },
  { id: "ready", name: L("Ready", "Готово"), tone: "green", required: true },
];


/* ---- Типы записей -------------------------------------------------------------
   Заданы здесь и в админке не меняются (конструктора моделей контента нет).
   kind: collection — много записей, single — одна запись, block — группа полей,
   которая вставляется в другие типы (SEO, ссылка, текст на главной).
   Поле: id (имя в API), name, type и настройки типа (см. modules/content/fields.js);
   width — full | half | third, ширина в редакторе.

   Первые восемь типов — типы разделов старой CMS Korzilla с её полями: id типа
   совпадает с типом раздела в «Разделах» (modules/core/sections), раздел такого
   типа показывает его записи. Девятый тип, «Каталог», — товары магазина. */

const f = (id, name, type, options = {}) => ({ id, name, type, width: "full", ...options });

/* Типы со своими страницами в «Содержимом»: это не записи-статьи, а отдельные
   компоненты сайта со своим видом списка (отзывы, плитки баннеров,
   карточки точек). В ветке «Записи» их нет; редактор —
   общий редактор записи. */
export const OWN_PAGES = {
  reviews: { list: "reviews", entry: "review" },
  banner: { list: "banners", entry: "banner" },
  contacts: { list: "contacts", entry: "contact" },
};

const models = () => [
  {
    id: "text", kind: "collection", type: true, name: L("Text pages", "Текстовые страницы"), one: L("Text block", "Текстовый блок"), icon: "file-text",
    api: "text-block", plural: "text-blocks", draft: true, i18n: true, review: false, title: "title",
    fields: [
      f("title", L("Title", "Заголовок"), "text", { required: true, localized: true }),
      f("body", L("Full text", "Полный текст"), "richtext", { required: true, localized: true }),
      f("excerpt", L("Lead for the home page", "Анонс для главной страницы"), "text", { group: L("On the site", "Показ на сайте"), long: true, localized: true, max: 300 }),
      f("spoiler", L("Hide the text under a spoiler", "Спрятать текст под спойлер"), "boolean", { width: "half" }),
      f("seo", "SEO", "block", { block: "seo" }),
    ],
  },
  {
    id: "news", kind: "collection", type: true, name: L("News", "Новости"), one: L("News item", "Новость"), icon: "book-open",
    api: "news-item", plural: "news", draft: true, i18n: true, review: true, section: "news", title: "title",
    fields: [
      f("title", L("Title", "Заголовок"), "text", { required: true, localized: true, max: 90 }),
      f("date", L("Date", "Дата"), "date", { variant: "date", required: true, width: "half" }),
      f("slug", L("Address", "Адрес"), "uid", { from: "title", required: true, width: "half" }),
      f("excerpt", L("Lead", "Анонс"), "text", { long: true, localized: true, max: 220, hint: L("Shown in the news list and on the home page", "Виден в списке новостей и на главной") }),
      f("body", L("Full text", "Полный текст"), "richtext", { required: true, localized: true }),
      f("cover", L("Preview", "Превью"), "media", { group: L("Images", "Картинки"), accept: ["image"], width: "half" }),
      f("photos", L("Photos", "Фотографии"), "media", { accept: ["image"], multiple: true, width: "half" }),
      f("tags", L("Tags", "Теги"), "enum", { group: L("Tags and source", "Теги и источник"), options: [L("Store", "Магазин"), L("New arrivals", "Новинки"), L("Sales", "Акции"), L("Shipping", "Доставка")], multiple: true, width: "half" }),
      f("source", L("Source", "Источник"), "text", { format: "url", width: "half" }),
      f("seo", "SEO", "block", { block: "seo" }),
    ],
  },
  {
    id: "portfolio", kind: "collection", type: true, name: L("Portfolio", "Портфолио"), one: L("Project", "Проект"), icon: "briefcase",
    api: "project", plural: "projects", draft: true, i18n: true, review: false, section: "projects", title: "title",
    fields: [
      f("title", L("Name", "Название"), "text", { required: true, localized: true }),
      f("slug", L("Address", "Адрес"), "uid", { from: "title", required: true, width: "half" }),
      f("cover", L("Preview", "Превью"), "media", { group: L("Preview", "Превью"), accept: ["image"], width: "half" }),
      f("lead", L("Preview text", "Описание в превью"), "text", { long: true, localized: true, max: 200 }),
      f("price", L("Price", "Цена"), "number", { group: L("Price", "Цена"), format: "money", width: "half" }),
      f("from", L("Lower bound of the price", "Это нижняя граница цены"), "boolean", { width: "half", hint: L("The site writes “from 85,000 ₽”", "Сайт напишет «от 85 000 ₽»") }),
      f("photos", L("Photos", "Фотографии"), "media", { group: L("Photos", "Фотографии"), accept: ["image"], multiple: true }),
      f("body", L("Full description", "Полное описание"), "richtext", { localized: true }),
      f("products", L("Products in the project", "Товары в проекте"), "relation", { target: "product", many: true }),
    ],
  },
  {
    id: "docs", kind: "collection", type: true, name: L("Documents", "Документы"), one: L("Document", "Документ"), icon: "clipboard-list",
    api: "document", plural: "documents", draft: false, i18n: false, review: false, section: "docs", title: "title",
    fields: [
      f("title", L("Document name", "Название документа"), "text", { required: true }),
      f("file", L("File", "Файл"), "media", { accept: ["file"], width: "half", hint: L("The site shows the type and size itself", "Тип и размер сайт покажет сам") }),
      f("url", L("Or a link to a file on another site", "Или ссылка на файл с другого сайта"), "text", { format: "url", width: "half" }),
      f("date", L("Document date", "Дата документа"), "date", { variant: "date", width: "half" }),
      f("image", L("Image", "Изображение"), "media", { accept: ["image"], width: "half" }),
    ],
  },
  {
    id: "gallery", kind: "collection", type: true, name: L("Gallery", "Галерея"), one: L("Album", "Альбом"), icon: "image",
    api: "album", plural: "albums", draft: true, i18n: true, review: false, section: "gallery", title: "title",
    fields: [
      f("title", L("Name", "Название"), "text", { required: true, localized: true }),
      f("photos", L("Photos", "Фото"), "media", { group: L("Photos and video", "Фото и видео"), accept: ["image"], multiple: true, required: true, hint: L("Up to 20 photos, drag to reorder", "До 20 фото, порядок — перетаскиванием") }),
      f("video", L("Video", "Видео"), "media", { accept: ["video"], width: "half" }),
      f("clean", L("No watermark", "Без водяного знака"), "boolean", { width: "half" }),
      f("about", L("Description", "Описание"), "text", { group: L("Description", "Описание"), long: true, localized: true }),
    ],
  },
  {
    id: "reviews", kind: "collection", type: true, name: L("Reviews", "Отзывы"), one: L("Review", "Отзыв"), icon: "message-star",
    api: "review", plural: "reviews", draft: true, i18n: false, review: false, section: "reviews", title: "name", pages: OWN_PAGES.reviews,
    fields: [
      f("name", L("Name", "Имя"), "text", { required: true, width: "half" }),
      f("date", L("Date", "Дата"), "date", { variant: "date", required: true, width: "half" }),
      f("rating", "Оценка", "number", { format: "integer", min: 1, max: 5, width: "half", hint: "От 1 до 5, пусто — без оценки" }),
      f("text", L("Text", "Текст"), "text", { long: true, required: true, max: 2000 }),
      f("answer", L("Reply", "Ответ"), "text", { long: true, hint: L("Shown under the review on the site", "Виден на сайте под отзывом") }),
      f("photos", L("Images", "Изображения"), "media", { accept: ["image"], multiple: true }),
    ],
  },
  {
    id: "contacts", kind: "collection", type: true, name: L("Contacts", "Контакты"), one: L("Location", "Точка"), icon: "map-pin",
    api: "location", plural: "locations", draft: false, i18n: true, review: false, section: "contacts", title: "name", pages: OWN_PAGES.contacts,
    fields: [
      f("name", L("Location or office name", "Название точки или офиса"), "text", { required: true, localized: true, hint: L("The company's main phone, email and hours are in Settings → General", "Общие телефон, почта и режим работы компании — в настройках, вкладка «Основные»") }),
      f("address", L("Address", "Адрес"), "text", { required: true, localized: true }),
      f("phones", L("Phones", "Телефоны"), "text", { group: L("Contacts and hours", "Связь и часы работы"), long: true, width: "half", hint: L("One per line", "По одному в строке") }),
      f("email", L("Email", "Эл. почта"), "text", { format: "email", width: "half" }),
      f("hours", L("Opening hours", "Режим работы"), "enum", { options: [L("Every day", "Каждый день"), L("By weekday", "По дням недели"), L("Don't show", "Не показывать")], width: "half" }),
      f("hoursText", L("Hours as text", "Время текстом"), "text", { localized: true, width: "half", placeholder: L("Mon–Fri 9:00–18:00", "Пн–пт 9:00–18:00") }),
      f("photos", L("Photos", "Фотографии"), "media", { group: L("On the site", "На сайте"), accept: ["image"], multiple: true }),
      f("social", L("Show social links", "Вывести соцсети"), "boolean", { width: "half" }),
    ],
  },

  /* Вне типов разделов: баннеры и главная. Данные компании для шапки и подвала
     (телефоны, почта, адрес, режим работы, реквизиты) — в настройках, «Основные». */
  {
    id: "banner", kind: "collection", name: L("Banners", "Баннеры"), one: L("Banner", "Баннер"), icon: "megaphone",
    api: "banner", plural: "banners", draft: true, i18n: true, review: false, title: "title", pages: OWN_PAGES.banner,
    fields: [
      f("title", L("Headline", "Заголовок"), "text", { required: true, localized: true, max: 60 }),
      f("place", L("Where", "Где показывать"), "enum", { options: [L("Home page", "Главная"), L("Catalog", "Каталог"), L("Cart", "Корзина")], multiple: true, width: "half" }),
      f("image", L("Image", "Картинка"), "media", { accept: ["image"], required: true, width: "half" }),
      f("link", L("Button", "Кнопка"), "block", { block: "link" }),
      f("starts", L("Show from", "Показывать с"), "date", { group: L("Schedule and look", "Сроки и вид"), variant: "date", width: "half" }),
      f("ends", L("Show until", "Показывать до"), "date", { variant: "date", width: "half" }),
      f("tone", L("Background", "Фон"), "color", { width: "half" }),
    ],
  },
  {
    id: "home", kind: "single", name: L("Home page", "Главная страница"), icon: "house",
    api: "home-page", draft: true, i18n: true, review: true, title: "",
    fields: [
      f("hero", L("First screen", "Первый экран"), "block", { block: "hero", required: true }),
      f("blocks", L("Page blocks", "Блоки страницы"), "zone", { blocks: ["products", "copy", "banners"] }),
      f("seo", "SEO", "block", { block: "seo" }),
    ],
  },

  /* Блоки: вставляются полем «Блок» или в набор блоков. group — подпись группы. */
  { id: "seo", kind: "block", name: "SEO", group: L("Shared", "Общие"), api: "shared.seo", fields: [
    f("metaTitle", L("Page title", "Заголовок страницы"), "text", { localized: true, max: 60, hint: L("Up to 60 characters, shown in search results", "До 60 знаков, виден в поиске") }),
    f("metaDescription", L("Description", "Описание"), "text", { long: true, localized: true, max: 160 }),
    f("h1", L("H1 heading", "Заголовок H1"), "text", { localized: true, max: 90, hint: L("Empty — the entry name", "Пусто — название записи") }),
    f("shareImage", L("Share image", "Картинка для соцсетей"), "media", { accept: ["image"] }),
    f("canonical", L("Main address (canonical)", "Основной адрес (canonical)"), "text", { format: "url", hint: L("Only if this page copies another one. Empty — its own address", "Только если страница повторяет другую. Пусто — её собственный адрес") }),
    f("noindex", L("Hide from search engines", "Скрыть от поисковиков"), "boolean", { width: "half" }),
    f("nositemap", L("Leave out of the sitemap", "Не включать в карту сайта"), "boolean", { width: "half" }),
  ] },
  { id: "link", kind: "block", name: L("Link", "Ссылка"), group: L("Shared", "Общие"), api: "shared.link", fields: [
    f("label", L("Text", "Текст"), "text", { required: true, localized: true, width: "half" }),
    f("url", L("Address", "Адрес"), "text", { format: "url", required: true, width: "half" }),
  ] },
  { id: "hero", kind: "block", name: L("First screen", "Первый экран"), group: L("Pages", "Страницы"), api: "page.hero", fields: [
    f("title", L("Headline", "Заголовок"), "text", { required: true, localized: true }),
    f("text", L("Text", "Текст"), "text", { long: true, localized: true }),
    f("image", L("Image", "Картинка"), "media", { accept: ["image"], width: "half" }),
    f("button", L("Button", "Кнопка"), "block", { block: "link", width: "half" }),
  ] },
  { id: "products", kind: "block", name: L("Product selection", "Подборка товаров"), group: L("Pages", "Страницы"), api: "page.products", fields: [
    f("title", L("Headline", "Заголовок"), "text", { localized: true }),
    f("items", L("Products", "Товары"), "relation", { target: "product", many: true }),
  ] },
  { id: "copy", kind: "block", name: L("Text", "Текст"), group: L("Pages", "Страницы"), api: "page.text", fields: [
    f("body", L("Text", "Текст"), "richtext", { localized: true }),
  ] },
  { id: "banners", kind: "block", name: L("Banners", "Баннеры"), group: L("Pages", "Страницы"), api: "page.banners", fields: [
    f("items", L("Banners", "Баннеры"), "relation", { target: "banner", many: true }),
  ] },
];

/* ---- Медиатека ------------------------------------------------------------- */

/* Картинка файла в демо — объёмный предмет из набора кита (art). suggest — что
   демо-помощник ответит на «Описать» для картинки без описания. */
const folders = () => [
  { id: "news", name: L("News", "Новости") },
  { id: "projects", name: L("Portfolio", "Портфолио") },
  { id: "gallery", name: L("Gallery", "Галерея") },
  { id: "banners", name: L("Banners", "Баннеры") },
  { id: "icons", name: L("Icons", "Иконки") },
  { id: "docs", name: L("Documents", "Документы") },
];

const m = (id, file, folder, art, kb, size, alt, days, extra = {}) => ({ id, file, folder, art, kb, size, alt, caption: "", created: ago(days, id.length), kind: "image", ...extra });
const media = () => [
  m("m1", "magazin-syuyumbike.webp", "news", "store", 312, "1920×1280", L("The store on Syuyumbike Avenue: shelves with tableware and textiles", "Магазин на проспекте Сююмбике: стеллажи с посудой и текстилем"), 3),
  m("m2", "len-osen-2026.webp", "news", "sofa", 284, "1600×1067", L("Graphite and milk-white linen throws on a sofa", "Льняные пледы графитового и молочного цвета на диване"), 5),
  m("m3", "grafik-noyabr.webp", "news", "calendar", 148, "1600×900", "", 7, { suggest: L("November calendar with the holidays marked", "Календарь на ноябрь с отмеченными праздничными днями") }),
  m("m4", "dostavka-tatarstan.webp", "news", "truck", 196, "1600×900", L("Delivery van at the warehouse", "Фургон доставки у склада"), 9),
  m("m5", "kofeynya-zerno-zal.webp", "projects", "coffee", 341, "1920×1280", "", 12, { suggest: L("Zerno coffee shop hall: stoneware mugs on a wooden counter", "Зал кофейни «Зерно»: керамические кружки на деревянной стойке") }),
  m("m6", "kofeynya-zerno-polki.webp", "projects", "utensils", 268, "1920×1280", L("Tableware on open shelves in the coffee shop", "Посуда на открытых полках кофейни"), 14),
  m("m7", "kama-banketnyy-zal.webp", "projects", "glass-water", 367, "1920×1280", "", 15, { suggest: L("Hotel banquet hall, tables laid with linen cloths", "Банкетный зал гостиницы, столы накрыты льняными скатертями") }),
  m("m8", "pekarnya-testo.webp", "projects", "cooking-pot", 254, "1600×1200", L("Cast iron pans on a bakery shelf", "Чугунные формы на полке пекарни"), 16),
  m("m9", "magazin-zal.webp", "gallery", "store", 402, "1920×1280", L("Store hall with a ceramics display", "Торговый зал с витриной керамики"), 20),
  m("m10", "magazin-tekstil.webp", "gallery", "bath", 236, "1600×1200", "", 21, { suggest: L("Stacks of bath towels on a store shelf", "Стопки банных полотенец на полке магазина") }),
  m("m11", "sertifikat-tekstil.webp", "gallery", "file-text", 212, "1240×1754", L("Certificate of conformity for textiles", "Сертификат соответствия на текстиль"), 40),
  m("m12", "sertifikat-keramika.webp", "gallery", "file-text", 208, "1240×1754", "", 40, { suggest: L("Certificate of conformity for ceramic tableware", "Сертификат соответствия на керамическую посуду") }),
  m("m13", "banner-podarki.webp", "banners", "gift", 318, "1920×680", L("Gift boxes with ribbons", "Подарочные коробки с лентами"), 4),
  m("m14", "banner-keramika.webp", "banners", "coffee", 296, "1920×680", "", 6, { suggest: L("A row of glazed stoneware mugs on a shelf", "Ряд глазурованных керамических кружек на полке") }),
  m("m15", "banner-dostavka.webp", "banners", "truck", 164, "1920×680", L("Delivery van", "Фургон доставки"), 30),
  m("m16", "ikonka-dostavka.webp", "icons", "truck", 24, "256×256", L("Truck", "Грузовик"), 60),
  m("m17", "ikonka-obmen.webp", "icons", "package", 22, "256×256", L("Box", "Коробка"), 60),
  m("m18", "ikonka-opt.webp", "icons", "banknote", 21, "256×256", L("Banknotes", "Купюры"), 60),
  m("m19", "prays-opt-noyabr-2026.xlsx", "docs", "file-spreadsheet", 86, "", "", 2, { kind: "file" }),
  m("m20", "dogovor-postavki-obrazets.pdf", "docs", "file-text", 412, "", "", 45, { kind: "file" }),
  m("m21", "kartochka-organizatsii.pdf", "docs", "file-text", 96, "", "", 45, { kind: "file" }),
  m("m22", "magazin-tur.mp4", "gallery", "camera", 18400, "1920×1080", "", 12, { kind: "video" }),
  m("m23", "otzyv-pled-u-okna.webp", "gallery", "sofa", 178, "1200×1600", L("Linen throw on an armchair by the window", "Льняной плед на кресле у окна"), 8),
];

/* ---- Записи ----------------------------------------------------------------
   e(id, модель, поля, состояние). Значение-пара P(en, ru) — переводимое поле,
   остальное общее. status: draft | published | modified; у modified в before —
   поля, какими они опубликованы. missing — язык, на который запись не переведена:
   его текст лежит в ai — так демо-помощник «переводит» запись. */

/* Пара «английский, русский» — переводимое значение. */
class Pair { constructor(en, ru) { this.en = en; this.ru = ru; } }
const localize = (value, code) =>
  value instanceof Pair ? value[code] :
  Array.isArray(value) ? value.map((item) => localize(item, code)) :
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localize(item, code)])) :
  value;

function e(id, model, values, { status = "published", before = null, missing = null, stage = "ready", by = "MA", edited = 1, created = 30, published = null, assignee = null } = {}) {
  const data = {};
  for (const { code } of LOCALES) if (code !== missing) data[code] = localize(values, code);
  const publishedData = status === "draft" ? null : Object.fromEntries(Object.entries(data).map(([code, value]) => [code, before ? { ...value, ...localize(before, code) } : value]));
  return {
    id, model, status, data, published: publishedData, stage, assignee,
    ...(missing ? { ai: { [missing]: localize(values, missing) } } : null),
    created: ago(created), updated: ago(edited, 3), by,
    publishedAt: status === "draft" ? null : published ?? ago(Math.max(edited, 2)),
  };
}

const P = (en, ru) => new Pair(en, ru);
const html = P;

const entries = () => [
  e("t1", "text", {
    title: P("Delivery", "Доставка"),
    body: html("<p>A courier brings the order around Naberezhnye Chelny in 1–2 days, Mon–Sat from 11:00 to 20:00, and calls an hour before arrival. Delivery costs 290 ₽, and orders from 3,000 ₽ go free.</p><h2>Across Tatarstan and Russia</h2><p>By CDEK to a pickup point or by Russian Post. The cost is shown in the cart: by post it is 290 ₽ in Tatarstan and 390 ₽ elsewhere in Russia.</p><ul><li>Pickup from the store at 40 Syuyumbike Avenue: free, on the day of the order</li><li>Large orders for cafés and hotels: on a day you choose</li></ul>", "<p>По Набережным Челнам курьер привезёт заказ за 1–2 дня, в пн–сб с 11:00 до 20:00, и позвонит за час. Доставка стоит 290 ₽, заказы от 3 000 ₽ — бесплатно.</p><h2>По Татарстану и России</h2><p>СДЭК до пункта выдачи или Почта России, стоимость видна в корзине. Почтой — 290 ₽ по Татарстану и 390 ₽ по России.</p><ul><li>Самовывоз из магазина на пр. Сююмбике, 40 — бесплатно, в день заказа</li><li>Крупные заказы для кафе и гостиниц — в удобный вам день</li></ul>"),
    excerpt: P("", ""), spoiler: false,
    seo: { metaTitle: P("Delivery in Naberezhnye Chelny and across Russia", "Доставка по Набережным Челнам и России"), metaDescription: P("Courier in Chelny in 1–2 days, free from 3,000 ₽. Pickup on the day of the order.", "Курьером по Челнам за 1–2 дня, бесплатно от 3 000 ₽. Самовывоз в день заказа."), shareImage: "" },
  }, { edited: 6, created: 120 }),
  e("t2", "text", {
    title: P("Payment", "Оплата"),
    body: html("<p>Pay online with a Mir card or through the Faster Payments System, in cash or by card to the courier, or in the store. Companies pay by invoice: we send it within an hour on business days.</p>", "<p>Оплатить можно онлайн картой «Мир» или через СБП, наличными или картой курьеру, а также в магазине. Компании платят по счёту: присылаем его в течение часа в рабочие дни.</p>"),
    excerpt: P("", ""), spoiler: false,
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { edited: 30, created: 120 }),
  e("t3", "text", {
    title: P("Exchange and returns", "Обмен и возврат"),
    body: html("<p>An item that didn't fit can be exchanged or returned within 14 days if it hasn't been used and the packaging is intact. Bring it to the store or call us, and the courier will pick it up.</p><p>The money comes back within 3 business days in the way you paid.</p>", "<p>Товар, который не подошёл, можно обменять или вернуть в течение 14 дней, если им не пользовались и упаковка цела. Привезите его в магазин или позвоните — заберёт курьер.</p><p>Деньги вернём за 3 рабочих дня тем же способом, каким вы платили.</p>"),
    excerpt: P("", ""), spoiler: true,
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { edited: 44, created: 120 }),
  e("t4", "text", {
    title: P("For wholesale buyers", "Оптовым покупателям"),
    body: html("<p>We work with cafés, hotels, bakeries and gift shops. Wholesale prices start from an order of 30,000 ₽; the current price list is in the documents section.</p><p>Write to info@merbay.ru or call +7 (855) 225-48-17, and the manager will prepare an offer within a day.</p>", "<p>Работаем с кафе, гостиницами, пекарнями и магазинами подарков. Оптовые цены — от заказа на 30 000 ₽, свежий прайс-лист — в разделе «Документы».</p><p>Напишите на info@merbay.ru или позвоните +7 (855) 225-48-17 — менеджер подготовит предложение за день.</p>"),
    excerpt: P("", ""), spoiler: false,
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { status: "modified", before: { body: html("<p>We work with cafés, hotels and bakeries. Wholesale prices start from an order of 50,000 ₽.</p>", "<p>Работаем с кафе, гостиницами и пекарнями. Оптовые цены — от заказа на 50 000 ₽.</p>") }, edited: 1, created: 90, by: "HM" }),
  e("t5", "text", {
    title: P("About the store", "О магазине"),
    body: html("<p>We opened in 2019 with a small corner of linen and ceramics. Today the store on Syuyumbike Avenue holds about 400 things for the home from workshops in Tatarstan, Chuvashia and Udmurtia.</p><p>We know every maker in person and can tell you how a mug is fired or why linen gets softer after washing.</p>", "<p>Мы открылись в 2019 году с небольшого уголка льна и керамики. Сейчас в магазине на проспекте Сююмбике около 400 вещей для дома из мастерских Татарстана, Чувашии и Удмуртии.</p><p>Каждого мастера знаем лично и можем рассказать, как обжигают кружку или почему лён после стирки становится мягче.</p>"),
    excerpt: P("Things for the home from workshops in Tatarstan, Chuvashia and Udmurtia. Open since 2019.", "Вещи для дома из мастерских Татарстана, Чувашии и Удмуртии. Работаем с 2019 года."), spoiler: false,
    seo: { metaTitle: P("About the store", "О магазине"), metaDescription: P("", ""), shareImage: "m9" },
  }, { edited: 60, created: 120, by: "AO" }),
  e("t6", "text", {
    title: P("Privacy policy", "Политика конфиденциальности"),
    body: html("<p>We use your name, phone and address only to deliver orders and never pass them on to third parties, except delivery services.</p>", "<p>Имя, телефон и адрес нужны нам только для доставки заказа. Третьим лицам мы их не передаём, кроме служб доставки.</p>"),
    excerpt: P("", ""), spoiler: false,
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { edited: 90, created: 120 }),

  e("n1", "news", {
    title: P("The store moved to Syuyumbike Avenue, 40", "Магазин переехал на проспект Сююмбике, 40"),
    date: "2026-10-06", slug: "magazin-syuyumbike", cover: "m1", photos: ["m1", "m9"], tags: [L("Store", "Магазин")], source: "",
    excerpt: P("Twice the space, parking by the entrance and a corner where you can try the pour-over sets.", "Вдвое больше места, парковка у входа и уголок, где можно попробовать наборы для пуровера."),
    body: html("<p>From October 6 we are waiting for you at a new address: Syuyumbike Avenue, 40. The old store on Sh. Usmanova is closed.</p><p>Open daily from 10:00 to 21:00, orders can be picked up here too.</p>", "<p>С 6 октября ждём вас по новому адресу: проспект Сююмбике, 40. Старый магазин на улице Шамиля Усманова закрыт.</p><p>Работаем каждый день с 10:00 до 21:00, заказы с самовывозом забирайте тоже здесь.</p>"),
    seo: { metaTitle: P("The store on Syuyumbike Avenue", "Магазин на проспекте Сююмбике"), metaDescription: P("Syuyumbike Avenue, 40, daily 10:00–21:00.", "Проспект Сююмбике, 40, каждый день 10:00–21:00."), shareImage: "m1" },
  }, { edited: 6, created: 8 }),
  e("n2", "news", {
    title: P("Autumn linen: graphite and milk white", "Осенний лён: графит и молочный"),
    date: "2026-10-09", slug: "osenniy-len", cover: "m2", photos: ["m2"], tags: [L("New arrivals", "Новинки")], source: "",
    excerpt: P("Throws, napkins and tablecloths from a Cheboksary workshop arrived in two new colors.", "Пледы, салфетки и скатерти из чебоксарской мастерской приехали в двух новых цветах."),
    body: html("<p>Stone-washed linen, hand-hemmed edges. The throws are 140×200 cm, the tablecloths come in three sizes.</p><h2>How to care</h2><p>Wash at 40 °C without softener and dry flat.</p>", "<p>Стираный лён, края подшиты вручную. Пледы 140×200 см, скатерти — трёх размеров.</p><h2>Как ухаживать</h2><p>Стирать при 40 °C без кондиционера и сушить расправленными.</p>"),
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { status: "modified", before: { title: P("New linen colors", "Новые цвета льна") }, edited: 0, created: 4, stage: "review", by: "MR", assignee: "MA" }),
  e("n3", "news", {
    title: P("Delivery across Tatarstan in one day", "Доставка по Татарстану за один день"),
    date: "2026-09-29", slug: "dostavka-tatarstan", cover: "m4", photos: [], tags: [L("Shipping", "Доставка")], source: "",
    excerpt: P("Our van now goes to Kazan, Nizhnekamsk and Elabuga three times a week.", "Своя машина теперь ездит в Казань, Нижнекамск и Елабугу три раза в неделю."),
    body: html("<p>Orders placed before 15:00 on Monday, Wednesday and Friday arrive the next day. The price is the same as in Chelny.</p>", "<p>Заказы, оформленные до 15:00 в понедельник, среду и пятницу, привезём на следующий день. Цена — как по Челнам.</p>"),
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { missing: OTHER, edited: 13, created: 14, by: "HM" }),
  e("n4", "news", {
    title: P("15% off for cafés and restaurants", "Скидка 15 % для кафе и ресторанов"),
    date: "2026-09-15", slug: "skidka-kafe", cover: "m6", photos: [], tags: [L("Sales", "Акции")], source: "",
    excerpt: P("Tableware and textiles for your hall at wholesale prices from 30,000 ₽.", "Посуда и текстиль для зала по оптовым ценам от 30 000 ₽."),
    body: html("<p>The discount applies to kitchen and textile sections. Ask the manager for an invoice for the legal entity.</p>", "<p>Скидка действует на разделы «Кухня» и «Текстиль». Счёт на юрлицо — у менеджера.</p>"),
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { edited: 27, created: 28, by: "AO" }),
  e("n5", "news", {
    title: P("How we pick ceramics: a trip to Cheboksary", "Как мы выбираем керамику: поездка в Чебоксары"),
    date: "2026-10-12", slug: "keramika-cheboksary", cover: "", photos: [], tags: [L("Store", "Магазин")], source: "",
    excerpt: P("", ""),
    body: html("<p>Two potters, one kiln and about 300 mugs a week.</p>", "<p>Два гончара, одна печь и около 300 кружек в неделю.</p>"),
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { status: "draft", stage: "writing", by: "MR", edited: 0, created: 2 }),
  e("n6", "news", {
    title: P("Opening hours on the November holidays", "Режим работы в ноябрьские праздники"),
    date: "2026-10-30", slug: "noyabrskie-prazdniki", cover: "m3", photos: [], tags: [L("Store", "Магазин")], source: "",
    excerpt: P("On November 4 the store works from 11:00 to 18:00, deliveries resume on November 5.", "4 ноября магазин работает с 11:00 до 18:00, доставка — с 5 ноября."),
    body: html("<p>On November 3 we work as usual. On November 4 the store is open from 11:00 to 18:00 and there is no delivery. From November 5, everything is back to normal.</p>", "<p>3 ноября работаем как обычно. 4 ноября магазин открыт с 11:00 до 18:00, доставки нет. С 5 ноября — в обычном режиме.</p>"),
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { status: "draft", stage: "ready", by: "MA", edited: 0, created: 3 }),
  e("n7", "news", {
    title: P("New Year gift sets 2027", "Новогодние подарочные наборы 2027"),
    date: "2026-11-15", slug: "podarochnye-nabory-2027", cover: "m13", photos: [], tags: [L("New arrivals", "Новинки"), L("Sales", "Акции")], source: "",
    excerpt: P("Five ready-made sets from 2,490 ₽ and corporate gifts with your logo.", "Пять готовых наборов от 2 490 ₽ и корпоративные подарки с вашим логотипом."),
    body: html("<p>Sets come in a gift box with a card. For companies we print the logo on the box from 20 sets.</p>", "<p>Наборы — в подарочной коробке с открыткой. Компаниям печатаем логотип на коробке от 20 наборов.</p>"),
    seo: { metaTitle: P("", ""), metaDescription: P("", ""), shareImage: "" },
  }, { status: "draft", stage: "review", by: "HM", edited: 1, created: 5 }),

  e("pr1", "portfolio", {
    title: P("Tableware for the Zerno coffee shop", "Посуда для кофейни «Зерно»"), slug: "kofeynya-zerno", cover: "m5", photos: ["m5", "m6"], price: 186000, from: false, products: ["p2", "p7", "p5"],
    lead: P("Mugs, carafes and pour-over sets for a 40-seat hall.", "Кружки, графины и наборы для пуровера на зал в 40 мест."),
    body: html("<p>We picked tableware that survives a dishwasher three times a day and delivered it in two batches before the opening.</p>", "<p>Подобрали посуду, которая выдерживает посудомойку три раза в день, и привезли двумя партиями к открытию.</p>"),
  }, { edited: 20, created: 40, by: "AO" }),
  e("pr2", "portfolio", {
    title: P("Banquet hall of the Kama hotel", "Банкетный зал гостиницы «Кама»"), slug: "gostinitsa-kama", cover: "m7", photos: ["m7"], price: 85000, from: true, products: ["p1", "p10"],
    lead: P("Linen tablecloths and napkins for 120 guests.", "Льняные скатерти и салфетки на 120 гостей."),
    body: html("<p>Tablecloths were sewn to the size of the hotel's round tables.</p>", "<p>Скатерти сшили под размер круглых столов гостиницы.</p>"),
  }, { edited: 33, created: 60, by: "AO" }),
  e("pr3", "portfolio", {
    title: P("Testo bakery in Kazan", "Пекарня «Тесто» в Казани"), slug: "pekarnya-testo", cover: "m8", photos: ["m8"], price: 64000, from: false, products: ["p6", "p3"],
    lead: P("Cast iron pans and oak boards for the open kitchen.", "Чугунные формы и дубовые доски для открытой кухни."),
    body: html("", ""),
  }, { status: "draft", edited: 2, created: 5, by: "HM" }),

  e("d1", "docs", { title: L("Wholesale price list, November 2026", "Прайс-лист для оптовиков, ноябрь 2026"), file: "m19", url: "", date: "2026-10-10", image: "" }, { edited: 2, created: 2, by: "HM" }),
  e("d2", "docs", { title: L("Supply agreement (sample)", "Договор поставки (образец)"), file: "m20", url: "", date: "2026-03-01", image: "" }, { edited: 45, created: 45 }),
  e("d3", "docs", { title: L("Company details", "Карточка организации"), file: "m21", url: "", date: "2026-01-15", image: "" }, { edited: 45, created: 45 }),
  e("d4", "docs", { title: L("Certificate of conformity for textiles", "Сертификат соответствия на текстиль"), file: "", url: "https://pub.fsa.gov.ru/rss/certificate/view/2918341", date: "2025-12-08", image: "m11" }, { edited: 40, created: 40 }),

  e("g1", "gallery", { title: P("Store", "Магазин"), photos: ["m9", "m10", "m1"], video: "m22", clean: false, about: P("The store on Syuyumbike Avenue: textiles, ceramics and kitchen.", "Магазин на проспекте Сююмбике: текстиль, керамика и кухня.") }, { edited: 12, created: 20 }),
  e("g2", "gallery", { title: P("Certificates", "Сертификаты"), photos: ["m11", "m12"], video: "", clean: true, about: P("", "") }, { edited: 40, created: 40 }),

  e("rv1", "reviews", { name: "Ольга Сафина", date: "2026-10-03", rating: 5, text: L("I bought a linen throw for my mother. It came the next day in a nice box, and the courier called in advance. Soft even before washing.", "Купила маме льняной плед. Привезли на следующий день в красивой коробке, курьер позвонил заранее. Мягкий даже до стирки."), answer: L("Thank you, Olga! Say hello to your mother.", "Спасибо, Ольга! Передавайте привет маме."), photos: ["m23"] }, { edited: 8, created: 9 }),
  e("rv2", "reviews", { name: "Екатерина Волкова", date: "2026-09-21", rating: 4, text: L("The pour-over set is beautiful, but the kettle lid is a little loose. Otherwise everything is great.", "Набор для пуровера красивый, но крышка у чайника немного болтается. В остальном всё отлично."), answer: L("Ekaterina, we will replace the lid, the manager has already called you.", "Екатерина, крышку заменим, менеджер уже вам позвонил."), photos: [] }, { edited: 20, created: 21 }),
  e("rv3", "reviews", { name: "Лилия Валиева", date: "2026-09-10", rating: 5, text: L("We order mugs for our tea shop for the second year. Always on time, the invoice comes within an hour.", "Второй год заказываем кружки для чайной лавки. Всегда в срок, счёт приходит в течение часа."), answer: "", photos: [] }, { edited: 31, created: 32 }),
  e("rv4", "reviews", { name: "Игорь Смирнов", date: "2026-10-11", rating: 4, text: L("The cast iron skillet is heavy and good. I'd like a lid for it in the store too.", "Чугунная сковорода тяжёлая и хорошая. Хотелось бы ещё и крышку к ней в магазине."), answer: "", photos: [] }, { status: "draft", edited: 0, created: 1, by: "AO" }),
  e("rv5", "reviews", { name: "Рустем Галиев", date: "2026-10-12", rating: null, text: L("Is it possible to order a tablecloth to a custom size?", "Можно ли заказать скатерть под свой размер?"), answer: "", photos: [] }, { status: "draft", edited: 0, created: 0, by: "AO" }),


  e("c1", "contacts", { name: P("Store and pickup", "Магазин и самовывоз"), address: P("Naberezhnye Chelny, Syuyumbike Avenue, 40", "Набережные Челны, пр. Сююмбике, 40"), phones: "+7 (855) 225-48-17\n+7 (917) 284-36-10", email: "info@merbay.ru", hours: L("Every day", "Каждый день"), hoursText: P("Daily 10:00–21:00", "Каждый день 10:00–21:00"), photos: ["m9"], social: true }, { edited: 6, created: 120 }),
  e("c2", "contacts", { name: P("Warehouse", "Склад"), address: P("Naberezhnye Chelny, BSI, Profilnaya St., 21", "Набережные Челны, БСИ, ул. Профильная, 21"), phones: "+7 (855) 225-48-17", email: "info@merbay.ru", hours: L("By weekday", "По дням недели"), hoursText: P("Mon–Fri 9:00–18:00, wholesale shipments only, no pickup", "Пн–пт 9:00–18:00, только отгрузка оптовых заказов, без самовывоза"), photos: [], social: false }, { edited: 50, created: 120 }),

  e("b1", "banner", { title: P("Free delivery from 3,000 ₽", "Бесплатная доставка от 3 000 ₽"), place: [L("Cart", "Корзина")], image: "m15", link: { label: P("Details", "Подробнее"), url: "/help/shipping" }, starts: "2026-09-01", ends: "2026-10-31", tone: "#e8f1de" }, { edited: 30, created: 50 }),
  e("b2", "banner", { title: P("New ceramics from Cheboksary", "Новая керамика из Чебоксар"), place: [L("Home page", "Главная"), L("Catalog", "Каталог")], image: "m14", link: { label: P("See the mugs", "Смотреть кружки"), url: "/catalog/kitchen/tableware" }, starts: "2026-10-05", ends: "2026-11-15", tone: "#f3e6d8" }, { edited: 7, created: 10 }),
  e("b3", "banner", { title: P("New Year gift sets", "Новогодние подарочные наборы"), place: [L("Home page", "Главная")], image: "m13", link: { label: P("Choose a set", "Выбрать набор"), url: "/catalog/gifts" }, starts: "2026-11-15", ends: "2026-12-31", tone: "#f6dfdc" }, { status: "draft", edited: 1, created: 5, by: "AO" }),

  e("home", "home", {
    hero: { title: P("Things for the home from small workshops", "Вещи для дома из небольших мастерских"), text: P("Linen, oak, ceramics and wool. Next-day delivery across Chelny.", "Лён, дуб, керамика и шерсть. По Челнам привезём на следующий день."), image: "m9", button: { label: P("To the catalog", "В каталог"), url: "/catalog" } },
    blocks: [
      { block: "products", title: P("Bestsellers", "Хиты продаж"), items: ["p1", "p2", "p3", "p6"] },
      { block: "banners", items: ["b2"] },
      { block: "copy", body: P("<p>We ship from our warehouse in Naberezhnye Chelny the next day, and across Tatarstan in 1–2 days.</p>", "<p>Отправляем заказы со склада в Набережных Челнах на следующий день, по Татарстану — за 1–2 дня.</p>") },
    ],
    seo: { metaTitle: P("Things for the home in Naberezhnye Chelny", "Вещи для дома в Набережных Челнах"), metaDescription: P("Linen, ceramics, oak and wool. Delivery the next day.", "Лён, керамика, дуб и шерсть. Доставка на следующий день."), shareImage: "m9" },
  }, { status: "modified", before: { hero: { title: P("Home goods that last", "Вещи для дома, которые служат долго") } }, edited: 0, created: 120, stage: "review", by: "MA" }),
];

/* ---- История ----------------------------------------------------------------
   Версии записи: кто и когда сохранил и что поменял. Текущая версия — первая. */
const history = () => ({
  n2: [
    { at: ago(0, 3), by: "MR", note: L("Changed the title", "Изменён заголовок"), fields: ["title"] },
    { at: ago(2), by: "MA", note: L("Published", "Опубликовано"), fields: [], published: true },
    { at: ago(3), by: "MR", note: L("Added the care section", "Добавлен раздел про уход"), fields: ["body"] },
    { at: ago(4), by: "MR", note: L("Created", "Создано"), fields: [] },
  ],
  home: [
    { at: ago(0, 3), by: "MA", note: L("New headline on the first screen", "Новый заголовок первого экрана"), fields: ["hero"] },
    { at: ago(14), by: "AO", note: L("Published", "Опубликовано"), fields: [], published: true },
    { at: ago(15), by: "AO", note: L("Added the banners block", "Добавлен блок баннеров"), fields: ["blocks"] },
  ],
});

/* ---- Товары ------------------------------------------------------------------
   Тип «Товары»: его поля читает магазин. Записи и страницы — у магазина (pages:
   список #/products, товар #/products/:id). Без черновиков: правка цены видна
   сразу, на сайте товар — когда включён «Показывать на сайте». Записи собраны из
   каталога магазина (catalog.js). */

const productModel = () => ({
  id: "product", kind: "collection", name: L("Products", "Товары"), one: L("Product", "Товар"), icon: "tag",
  api: "product", plural: "products", draft: false, i18n: false, review: false, section: "catalog", title: "name",
  pages: { list: "products", entry: "product" },
  fields: [
    f("name", L("Name", "Название"), "text", { required: true, max: 120 }),
    f("section", L("Catalog section", "Раздел каталога"), "relation", { target: "section", kind: "catalog", required: true, width: "half" }),
    f("visible", L("Show on the site", "Показывать на сайте"), "boolean", { width: "half" }),
    f("labels", L("Labels", "Метки"), "enum", { options: [LABELS.new, LABELS.hit, LABELS.sale], multiple: true, hint: L("Badges on the product card and selections on the home page", "Плашки на карточке товара и подборки на главной") }),
    f("photos", L("Photos", "Фото"), "media", { group: L("Photos", "Фото"), accept: ["image"], multiple: true, hint: L("The first one is shown in the catalog and in search", "Первое видно в каталоге и в поиске") }),
    f("price", L("Price", "Цена"), "number", { group: L("Price and stock", "Цена и остаток"), format: "money", min: 0, width: "third", hint: L("Empty: the site shows “Ask for the price”", "Пусто — на сайте «Уточняйте цену»") }),
    f("oldPrice", L("Old price", "Старая цена"), "number", { format: "money", min: 0, width: "third", hint: L("Shown crossed out", "Видна зачёркнутой") }),
    f("stock", L("In stock", "Остаток"), "number", { format: "integer", unit: L("pcs", "шт."), min: 0, width: "third", hint: L("Empty: not counted", "Пусто — не учитывается") }),
    f("sku", L("SKU", "Артикул"), "text", { format: "code", width: "half" }),
    f("weight", L("Weight", "Вес"), "number", { format: "decimal", unit: L("kg", "кг"), min: 0, width: "half", hint: L("For the delivery cost", "Для расчёта доставки") }),
    f("text", L("Description", "Описание"), "richtext"),
    f("specs", L("Specifications", "Характеристики"), "block", { block: "spec", repeat: true, rows: true }),
    f("related", L("Bought together", "С этим товаром покупают"), "relation", { target: "product", many: true }),
    f("slug", L("Address", "Адрес"), "uid", { from: "name", required: true, width: "half" }),
    f("seo", "SEO", "block", { block: "seo" }),
  ],
});

const specBlock = () => ({ id: "spec", kind: "block", name: L("Specification", "Характеристика"), group: L("Store", "Магазин"), api: "product.spec", fields: [
  f("name", L("Name", "Название"), "text", { required: true, width: "half", placeholder: L("Material", "Материал") }),
  f("value", L("Value", "Значение"), "text", { required: true, width: "half", placeholder: L("Oak", "Дуб") }),
] });

const productsFolder = () => ({ id: "products", name: L("Products", "Товары") });

/* Фото товара — файл папки «Товары»: mp + номер товара. */
const photoOf = (product) => `mp${product.id.slice(1)}`;
const productMedia = () => PRODUCTS.filter((product) => product.photo).map((product, at) =>
  m(photoOf(product), `${product.slug}.webp`, "products", product.icon, 120 + ((at * 53) % 180), "1600×1600", product.alt ? product.name : "", 20 + at * 3,
    product.alt ? {} : { suggest: "Серая коробка для документов A4 с крышкой на магните" }));

/* С этим товаром покупают. */
const RELATED = { p1: ["p10"], p2: ["p7", "p22"], p6: ["p3", "p15"], p7: ["p2"], p9: ["p4", "p12"], p13: ["p16"], p22: ["p2", "p7"] };
/* Новые товары: сколько дней назад заведены. */
const FRESH = { p14: 5, p15: 9, p18: 3, p19: 12, p23: 1 };
/* Когда и кто менял товар: по его истории, а без истории — в разное время дня. */
const productEntries = (history) => PRODUCTS.map((product, at) => {
  const versions = history[product.id] ?? [];
  const updated = versions[0]?.at ?? ago(FRESH[product.id] ? 0 : at % 6, 0.25 + ((at * 97) % 540) / 60);
  const entry = e(product.id, "product", {
    name: product.name, section: product.section, visible: !product.draft, labels: product.labels.map((key) => LABELS[key]),
    photos: product.photo ? [photoOf(product)] : [], price: product.price, oldPrice: product.oldPrice, stock: product.stock,
    sku: product.sku, weight: product.weight, text: product.text ? `<p>${product.text}</p>` : "",
    specs: product.specs.map(([name, value]) => ({ name, value })), related: RELATED[product.id] ?? [], slug: product.slug,
    seo: { metaTitle: "", metaDescription: "", shareImage: "" },
  }, { created: FRESH[product.id] ?? 60 + at * 9, by: versions[0]?.by ?? ["MA", "HM", "AO"][at % 3] });
  return Object.assign(entry, { updated, publishedAt: updated }, versions.length ? { created: versions.at(-1).at } : {});
});

const productHistory = () => ({
  p6: [
    { at: ago(2, 5), by: "MA", note: L("Price 3,990 → 3,490 ₽, the old one is crossed out, “Sale” label", "Цена 3 990 → 3 490 ₽, старая зачёркнута, метка «Акция»"), fields: ["price", "oldPrice", "labels"] },
    { at: ago(41), by: "HM", note: L("Added specifications", "Добавлены характеристики"), fields: ["specs"] },
    { at: ago(132), by: "HM", note: L("Created", "Создано"), fields: [] },
  ],
  p23: [{ at: ago(1, 2), by: "1C", note: L("Added by the exchange with 1C, without a price and photos", "Добавлен обменом с 1С, без цены и фото"), fields: [] }],
});

/* Модель «Товары» с записями и фото — для первого открытия и для данных, сохранённых
   в браузере до неё (store.js добавляет их туда). */
export function catalogSeed() {
  const history = productHistory();
  return { models: [productModel(), specBlock()], folder: productsFolder(), media: productMedia(), entries: productEntries(history), history };
}

/* API-ключи и вебхуки для вкладки «Контент» в настройках. */
const tokens = () => [
  { id: "t1", name: L("Website", "Сайт"), access: "read", tail: "9f4c", used: ago(0, 1), created: ago(120) },
  { id: "t2", name: L("Telegram bot", "Телеграм-бот"), access: "read", tail: "b21e", used: ago(2), created: ago(60) },
  { id: "t3", name: L("Exchange with 1C", "Обмен с 1С"), access: "full", tail: "07aa", used: ago(14), created: ago(40) },
];
const hooks = () => [
  { id: "w1", name: L("Rebuild the site", "Пересобрать сайт"), url: "https://deploy.korzilla.ru/hooks/rebuild", events: ["publish", "unpublish"], on: true },
  { id: "w2", name: L("Telegram channel", "Канал в Telegram"), url: "https://hooks.korzilla.ru/telegram", events: ["publish"], on: false },
];

/* ---- Данные сайта вместо демо ------------------------------------------------

   Админка открыта на сайте и администратор вошёл — js/data/live.js приносит
   разделы, записи и медиатеку сайта (/admin-old/live), и первое открытие «Контента»
   берёт их вместо демо: те же модели, поля компонента сайта встают в поля
   записи по смыслу. Чего у сайта нет (этапы проверки, ключи API, вебхуки) —
   остаётся демо. Записи сайта — на основном языке; второй язык «не переведён». */
let LIVE = null;
export const useLiveContent = (data) => { LIVE = data; };

/* Компонент сайта → тип записи admin2. */
const LIVE_MODEL = { textpage: "text", news: "news", portfolio: "portfolio", documents: "docs", gallery: "gallery", reviews: "reviews", contacts: "contacts", banners: "banner", catalog: "product" };
const day = (value) => (value ? String(value).slice(0, 10) : "");
const ids = (list) => (list ?? []).map((id) => `s${id}`);
const one = (list) => ids(list)[0] ?? "";
const rich = (value) => value ?? "";
const NO_SEO = () => ({ metaTitle: "", metaDescription: "", shareImage: "" });

/* Значения записи admin2 из значений и файлов объекта сайта. */
const LIVE_VALUES = {
  text: (v) => ({ title: v.name ?? "", body: rich(v.body), excerpt: v.anons ?? "", spoiler: false, seo: NO_SEO() }),
  news: (v, m) => ({ title: v.name ?? "", date: day(v.published_at ?? v.created_at), slug: v.slug ?? "", excerpt: v.anons ?? "", body: rich(v.body), cover: one(m.image ?? m.cover ?? m.photo), photos: ids(m.gallery ?? m.photos), tags: [], source: v.source_url ?? "", seo: NO_SEO() }),
  portfolio: (v, m) => ({ title: v.name ?? "", slug: v.slug ?? "", cover: one(m.cover), lead: v.anons ?? "", price: null, from: false, photos: ids(m.gallery), body: rich(v.body), products: [] }),
  docs: (v, m) => ({ title: v.name ?? "", file: one(m.file), url: "", date: day(v.doc_date), image: "" }),
  gallery: (v, m) => ({ title: v.name ?? "", photos: ids(m.image ?? m.gallery), video: "", clean: false, about: v.anons ?? "" }),
  reviews: (v, m) => ({ name: [v.name, v.company].filter(Boolean).join(", "), date: day(v.published_at ?? v.created_at), rating: v.rating != null ? Number(v.rating) : null, text: v.body ?? "", answer: "", photos: ids(m.photo) }),
  contacts: (v, m) => ({ name: v.name ?? "", address: v.address ?? "", phones: Array.isArray(v.phones) ? v.phones.join("\n") : v.phones ?? "", email: v.email ?? "", hours: L("Every day", "Каждый день"), hoursText: v.work_time ?? "", photos: ids(m.photos ?? m.gallery), social: false }),
  banner: (v, m) => ({ title: v.name ?? "", place: [], image: one(m.image), link: { label: "", url: v.url ?? "" }, starts: "", ends: "", tone: "" }),
  product: (v, m) => ({
    name: v.name ?? "", section: v.section_id ? `s${v.section_id}` : "", visible: Boolean(v.is_published),
    labels: [v.is_new && LABELS.new, v.is_featured && LABELS.hit, v.discount_percent > 0 && LABELS.sale].filter(Boolean),
    photos: [...ids(m.photo), ...ids(m.gallery)], price: v.price_min != null ? Number(v.price_min) : null, oldPrice: null,
    stock: v.stock_total != null ? Number(v.stock_total) : null, sku: v.article ?? "", weight: v.weight != null ? Number(v.weight) : null,
    text: rich(v.body), specs: [], related: [], slug: v.slug ?? "", seo: NO_SEO(),
  }),
};

const KIND = (mime = "") => (mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file");

function liveSeed() {
  const media = LIVE.media.map((file) => ({
    id: `s${file.id}`, file: file.name, folder: file.folder || "site", art: KIND(file.mime) === "image" ? "image" : KIND(file.mime) === "video" ? "camera" : "file-text",
    kb: Math.max(1, Math.round(file.size / 1024)), size: file.width && file.height ? `${file.width}×${file.height}` : "",
    alt: file.alt ?? "", caption: file.title ?? "", created: file.created_at ?? new Date().toISOString(), kind: KIND(file.mime), url: file.url,
  }));
  const folders = [...new Set(media.map((file) => file.folder))].map((id) => ({ id, name: id === "site" ? L("Site", "Сайт") : id }));
  const entries = LIVE.objects.filter((object) => LIVE_MODEL[object.component] && LIVE_VALUES[LIVE_MODEL[object.component]]).map((object) => {
    const model = LIVE_MODEL[object.component];
    const values = object.values;
    const entry = e(`${object.component}-${object.id}`, model, LIVE_VALUES[model](values, object.media ?? {}), { status: values.is_published === false ? "draft" : "published", missing: OTHER, by: ME.id });
    const updated = values.updated_at ?? entry.updated;
    return Object.assign(entry, { created: values.created_at ?? entry.created, updated, publishedAt: values.is_published === false ? null : updated, site: { component: object.component, id: object.id, section: object.section_id } });
  });
  return {
    models: [...models(), productModel(), specBlock()], entries, media, folders, history: {},
    stages: stages(), tokens: tokens(), hooks: hooks(),
    ai: { text: true, translate: true, alt: true },
  };
}

/* Типы записей из кода: данные, сохранённые в браузере, берут их отсюда (store.js). */
export const contentModels = () => [...models(), productModel(), specBlock()];

export const contentSeed = () => {
  if (LIVE) return liveSeed();
  const catalog = catalogSeed();
  return {
    models: [...models(), ...catalog.models], entries: [...entries(), ...catalog.entries], media: [...media(), ...catalog.media],
    folders: [...folders(), catalog.folder], history: { ...history(), ...catalog.history },
    stages: stages(), tokens: tokens(), hooks: hooks(),
    ai: { text: true, translate: true, alt: true },
  };
};
