/* Настройки сайтов — демо-данные вкладок «Настроек»: сайт и домены, контакты,
   режим работы, реквизиты, корзина, оплата и доставка, уведомления, доступ,
   города, интеграции. Бэкенд CMS заменит их ответом сервера; вкладки читают и
   пишут их через modules/core/settings/store.js.

   values — значения полей формы по имени поля (как в разметке вкладки), lists —
   списки, которые меняются сразу, мимо плашки сохранения. Тексты — парой
   «английский, русский», по языку интерфейса; телефоны, почта и реквизиты — как
   есть. Телефоны записаны в формате маски кита, чтобы поле не менялось при
   монтировании. Реквизиты выдуманы, но с верными контрольными цифрами. */

import { L } from "../core/i18n.js";
import { NOW } from "./fixtures.js";

const at = (days, hours, minutes = 0) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, hours, minutes).toISOString();

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/* Банки по БИК: поле «Банк» и корр. счёт заполняются сами. */
export const BANKS = {
  "049205603": { name: L("Sberbank, Bank of Tatarstan branch No. 8610", "ПАО Сбербанк, отделение «Банк Татарстан» № 8610"), corr: "30101810600000000603" },
  "049205805": { name: L("Ak Bars Bank", "ПАО «АК БАРС» БАНК"), corr: "30101810000000000805" },
  "044525974": { name: L("T-Bank", "АО «ТБанк»"), corr: "30101810145250000974" },
  "044525593": { name: L("Alfa-Bank", "АО «Альфа-Банк»"), corr: "30101810200000000593" },
};

/* Интеграции: self — настраивается в админке, paid — подключает поддержка
   Korzilla по заявке. price — разовая цена, если известна. sites — только у этих
   сайтов. */
export const APPS = [
  { id: "onec", tone: "amber", about: L("Two-way exchange with 1C: products, prices and stock come to the site, orders go back to 1C. Runs on a schedule.", "Двусторонний обмен с 1С: товары, цены и остатки приходят на сайт, заказы уходят обратно в 1С. Работает по расписанию."), kind: "paid", icon: "refresh-cw", price: L("from 15,000 ₽", "от 15 000 ₽"), title: L("1C:Enterprise", "1С:Предприятие"), text: L("Products, prices and stock from 1C", "Товары, цены и остатки из 1С") },
  { id: "excel", tone: "green", about: L("The site reads your price list by itself and updates prices and stock. Handy when there is no 1C.", "Сайт сам читает ваш прайс и обновляет цены и остатки. Удобно, если 1С нет."), logo: "excel", kind: "paid", icon: "file-spreadsheet", price: L("from 15,000 ₽", "от 15 000 ₽"), title: L("Excel price list", "Excel-прайс"), text: L("Prices and stock from a file on a schedule", "Цены и остатки из файла по расписанию") },
  { id: "metrica", tone: "red", about: L("Free analytics from Yandex: visits, traffic sources and which ads bring orders. Session Replay shows what visitors do.", "Бесплатная аналитика Яндекса: посещаемость, источники и какая реклама приводит заказы. Вебвизор показывает, что делают посетители."), logo: "yandex-metrica", kind: "self", icon: "chart-line", title: L("Yandex Metrica", "Яндекс Метрика"), text: L("Visits and where orders come from", "Посещаемость и откуда приходят заказы") },
  { id: "wazzup", tone: "green", about: L("Order and request alerts come to WhatsApp, and you can answer customers from the same chat.", "Уведомления о заказах и заявках приходят в WhatsApp, отвечать покупателям можно из того же чата."), logo: "whatsapp", kind: "self", icon: "message-circle-more", title: L("WhatsApp via Wazzup", "WhatsApp через Wazzup"), text: L("Order and request alerts in WhatsApp", "Заказы и заявки в WhatsApp") },
  { id: "smtp", tone: "blue", about: L("Letters about orders come from your mailbox. Customers see your shop name, and replies come to you.", "Письма о заказах уходят с вашего ящика. Покупатель видит имя магазина, а ответы приходят вам."), kind: "self", icon: "mail", title: L("Your own sending address", "Своя почта для писем"), text: L("Letters to customers come from your address, not noreply@korzilla.ru", "Письма покупателям — с вашего адреса, а не с noreply@korzilla.ru") },
  { id: "bitrix", tone: "blue", about: L("Every order and request becomes a deal in the CRM with the customer contacts. Managers don’t copy anything by hand.", "Каждый заказ и заявка становятся сделкой в CRM с контактами покупателя. Менеджеры ничего не переносят руками."), kind: "paid", icon: "users", title: L("Bitrix24 or amoCRM", "Битрикс24 или amoCRM"), text: L("Orders and requests go straight to the CRM", "Заказы и заявки сразу в CRM") },
  { id: "delivery", tone: "orange", about: L("The cart shows real delivery prices and dates of the carriers by the customer’s address.", "В корзине — настоящие цены и сроки служб доставки по адресу покупателя."), kind: "paid", icon: "truck", price: "18 000 ₽", title: L("Delivery cost in the cart", "Расчёт доставки в корзине"), text: L("CDEK, Russian Post, DPD, Boxberry", "СДЭК, Почта России, DPD, Boxberry") },
  { id: "pay", tone: "violet", about: L("Customers pay by card, SBP or in parts right on the site. The money goes to your account, the receipt is sent automatically.", "Покупатель платит картой, по СБП или частями прямо на сайте. Деньги приходят на ваш счёт, чек уходит автоматически."), kind: "paid", icon: "credit-card", title: L("Card and SBP payments", "Оплата картой и по СБП"), text: L("YooKassa or a bank, also pay in parts", "ЮKassa или банк, оплата частями") },
  { id: "moysklad", tone: "teal", about: L("Stock on the site follows MoySklad, orders arrive there as customer orders.", "Остатки на сайте идут за МойСкладом, заказы попадают туда как заказы покупателей."), kind: "paid", icon: "warehouse", title: L("MoySklad", "МойСклад"), text: L("Stock and orders with the warehouse", "Остатки и заказы со складом") },
  { id: "telegram", tone: "blue", about: L("A bot posts new orders and requests to your Telegram chat with the contents and the phone number.", "Бот присылает новые заказы и заявки в ваш чат в Telegram — с составом и телефоном."), logo: "telegram", kind: "paid", icon: "send", title: L("Telegram alerts", "Уведомления в Telegram"), text: L("Orders and requests in a chat", "Заказы и заявки в чат") },
  { id: "ai", tone: "violet", about: L("A neural network reads product names and descriptions and builds sections and attributes for the filter.", "Нейросеть читает названия и описания товаров и раскладывает их по разделам и характеристикам для фильтра."), kind: "paid", icon: "ai", price: L("from 28,000 ₽", "от 28 000 ₽"), title: L("Catalog structure by AI", "Структура каталога нейросетью"), text: L("Sorts products into sections and attributes", "Разложит товары по разделам и характеристикам") },
];

/* Письма покупателю: тема и текст по умолчанию. Состав и сумму заказа сайт
   добавляет под текст сам. */
const letters = () => [
  { id: "order", on: true, title: L("Order accepted", "Заказ принят"), sub: L("Right after checkout, with the order contents", "Сразу после оформления, с составом заказа"),
    subject: L("We’ve got your order", "Мы получили ваш заказ"),
    body: L("<p>Thank you for the order. A manager will call during business hours to confirm it.</p>", "<p>Спасибо за заказ. Менеджер позвонит в рабочее время и подтвердит его.</p>") },
  { id: "status", on: true, title: L("Order status changed", "Статус заказа изменился"), sub: L("When the order is shipped or ready for pickup", "Когда заказ отправлен или готов к выдаче"),
    subject: L("Your order status has changed", "Статус вашего заказа изменился"),
    body: L("<p>The new status is below. Questions — call the store, the number is in the signature.</p>", "<p>Новый статус — ниже. Если есть вопросы, позвоните в магазин: номер в подписи письма.</p>") },
  { id: "invoice", on: true, title: L("Invoice", "Счёт на оплату"), sub: L("A PDF invoice when the customer pays by invoice", "PDF со счётом, если выбрана оплата по счёту"),
    subject: L("Invoice for your order", "Счёт на оплату заказа"),
    body: L("<p>The invoice is attached. We start packing the order once the payment arrives.</p>", "<p>Счёт во вложении. Начнём собирать заказ, когда оплата поступит на счёт.</p>") },
];

const hours = (week, saturday, sunday) => Object.fromEntries(DAYS.flatMap((day, index) => {
  const span = index < 5 ? week : index === 5 ? saturday : sunday;
  return [[`hours.${day}.on`, Boolean(span)], [`hours.${day}.from`, (span ?? week)[0]], [`hours.${day}.to`, (span ?? week)[1]]];
}));

/* ---- Сайты --------------------------------------------------------------------- */

const SITES = {
  merbau: () => ({
    values: {
      "site.tz": "msk",
      "contacts.phone": "+7 (855) 225-48-17",
      "contacts.phone2": "+7 (917) 284-36-10",
      "contacts.email": "info@merbay.ru",
      "contacts.whatsapp": "+7 (917) 284-36-10",
      "contacts.address": L("40 Syuyumbike Avenue, Naberezhnye Chelny", "Набережные Челны, пр. Сююмбике, 40"),
      "contacts.telegram": "@merbay_chelny",
      "contacts.vk": "vk.com/merbay_chelny",
      ...hours(["10:00", "21:00"], ["10:00", "21:00"], ["10:00", "21:00"]),
      "legal.form": "ooo",
      "legal.name": L("Merbau LLC", "ООО «Мербау»"),
      "legal.inn": "1650387212",
      "legal.kpp": "165001001",
      "legal.ogrn": "1191650012840",
      "legal.address": L("40 Syuyumbike Avenue, office 12, Naberezhnye Chelny, Republic of Tatarstan, 423821", "423821, Республика Татарстан, г. Набережные Челны, пр. Сююмбике, д. 40, офис 12"),
      "legal.bik": "049205603",
      "legal.bank": BANKS["049205603"].name,
      "legal.corr": BANKS["049205603"].corr,
      "legal.account": "40702810762000048213",
      "checkout.buyers": "all",
      "checkout.min": "0",
      "checkout.login": false,
      "cart.name": "required", "cart.email": "optional", "cart.city": "required", "cart.address": "optional", "cart.comment": "optional", "cart.inn": "required",
      "price.empty": L("Ask for price", "Уточняйте цену"),
      "stock.out": "order",
      "stock.show": "words",
      "stock.low": "10",
      "reviews.mode": "check",
      "reviews.photos": true,
      "notify.emails": "info@merbay.ru, anton.odintsov@yandex.ru",
      "notify.whatsapp": "+7 (917) 284-36-10",
      "notify.order": ["email", "whatsapp", "app"], "notify.form": ["email", "app"], "notify.call": ["email", "whatsapp", "app"], "notify.review": ["email"], "notify.exchange": ["email"],
      "callback.days": "all", "callback.from": "09:00", "callback.to": "21:00",
      "security.sms": true,
      "cities.on": true, "cities.mode": "sub", "cities.ask": true, "cities.sitemap": true,
    },
    lists: {
      domains: [
        { host: "merbay.ru", main: true, until: "2027-01-14" },
        { host: "www.merbay.ru" },
        { host: "merbau.korzilla.ru", tech: true },
      ],
      /* Как в демо-заказах (js/data/orders.js: SHOP, costOf): организации платят
         по счёту, люди — картой на сайте или при получении. */
      payments: [
        { id: "card", kind: "online", who: "person", on: true, name: L("Card on the site", "Картой на сайте"), text: L("Bank card or SBP right after checkout", "Банковской картой или по СБП, сразу после оформления") },
        { id: "cash", kind: "cash", who: "person", on: true, name: L("On receipt", "При получении"), text: L("Cash or card to the courier or in the store", "Наличными или картой курьеру и в магазине") },
        { id: "invoice", kind: "invoice", who: "company", on: true, name: L("By invoice", "По счёту"), text: L("The invoice comes by email after the manager’s call", "Счёт придёт на почту после звонка менеджера") },
      ],
      deliveries: [
        { id: "pickup", who: "all", on: true, price: 0, free: 0, days: L("same day", "в день заказа"), name: L("Pickup from the store", "Самовывоз из магазина"), text: L("40 Syuyumbike Avenue, daily 10:00–21:00", "пр. Сююмбике, 40, каждый день с 10 до 21") },
        { id: "courier", who: "all", on: true, price: 290, free: 3000, days: L("1–2 days", "1–2 дня"), cities: ["chelny"], name: L("Courier in Naberezhnye Chelny", "Курьером по Набережным Челнам"), text: L("Mon–Sat 11:00–20:00, the courier calls an hour ahead", "Пн–сб с 11 до 20, курьер позвонит за час") },
        { id: "cdek", who: "all", on: true, price: null, free: 0, days: L("1–7 days", "1–7 дней"), name: L("CDEK to a pickup point", "СДЭК до пункта выдачи"), text: L("Companies get it to the door", "Организациям привезём до двери") },
        { id: "post", who: "person", on: true, price: 290, from: true, free: 0, days: L("5–14 days", "5–14 дней"), name: L("Russian Post", "Почтой России"), text: L("290 ₽ in Tatarstan, 390 ₽ elsewhere in Russia, 30 ₽ per kilogram over 5 kg. Prepaid only", "По Татарстану 290 ₽, по России 390 ₽, сверх 5 кг — 30 ₽ за килограмм. Только по предоплате") },
      ],
      letters: letters(),
      devices: [
        { id: "d1", name: "iPhone 15", person: "AO", seen: at(0, 9, 12) },
        { id: "d2", name: "Samsung Galaxy A54", person: "MA", seen: at(1, 18, 40) },
      ],
      /* Те же люди, что в истории заказов и записей «Контента»: Мария ведёт заказы,
         Глеб собирает и возит, Марина отмечает оплату счетов, все пишут новости. */
      people: [
        { id: "AO", email: "anton.odintsov@yandex.ru", role: "owner", seen: at(0, 10) },
        { id: "MA", email: "maria@merbay.ru", role: "full", seen: at(0, 9, 40) },
        { id: "HM", email: "gleb@merbay.ru", role: "full", seen: at(0, 9, 5) },
        { id: "MR", email: "marina@merbay.ru", role: "full", seen: at(0, 9, 15) },
        { id: "i1", email: "dinar.valiev@merbay.ru", name: L("Dinar Valiev", "Динар Валиев"), role: "orders", invited: at(1, 12, 30) },
      ],
      cities: [
        { id: "chelny", main: true, on: true, slug: "", phone: "", name: L("Naberezhnye Chelny", "Набережные Челны"), in: L("in Naberezhnye Chelny", "в Набережных Челнах") },
        { id: "nkamsk", on: true, slug: "nizhnekamsk", phone: "+7 (855) 530-12-48", name: L("Nizhnekamsk", "Нижнекамск"), in: L("in Nizhnekamsk", "в Нижнекамске") },
        { id: "elabuga", on: true, slug: "elabuga", phone: "", name: L("Yelabuga", "Елабуга"), in: L("in Yelabuga", "в Елабуге") },
        { id: "kazan", on: false, slug: "kazan", phone: "+7 (843) 212-60-35", name: L("Kazan", "Казань"), in: L("in Kazan", "в Казани") },
      ],
      apps: {
        onec: { on: true, login: "merbay_1c", password: "Kz7-merbay-1c", get: ["products", "prices", "stock", "images", "props"], orders: true },
        metrica: { on: true, counter: "94716285", webvisor: true, ecommerce: true, goals: ["order", "cart", "form", "phone"], offline: true, account: "anton.odintsov@yandex.ru", visits: 1860 },
        wazzup: { on: true, key: "wz_5f2c9a71d04e4b8c", channel: "a41c2b7e-merbay" },
        pay: { on: true, provider: L("YooKassa", "ЮKassa") },
        delivery: { on: true, carriers: L("CDEK", "СДЭК") },
      },
      requests: [],
    },
  }),
};

/* ---- SEO (modules/seo) ------------------------------------------------------------
   Значения формы seo.* общие, у сайта — свои отличия, переадресации, битые
   ссылки за 30 дней и подключённые сервисы вкладки «Сервисы» (lists.services;
   Метрика — в lists.apps, общая с «Интеграциями»). Адреса — те же, что в разделах и записях «Контента». */

const seoValues = () => ({
  "seo.mode": "open", "seo.noindexFilters": true, "seo.pagination": "self",
  "seo.slash": "yes", "seo.case": "lower",
  "seo.params": ["utm", "yclid", "ysclid", "gclid", "fbclid", "from", "_openstat"], "seo.paramsOwn": "",
  "seo.tpl.page": L("{name} — {site}", "{name} — {site}"),
  "seo.tpl.pageText": "",
  "seo.tpl.section": L("{name} {in_city} — {site} catalog", "{name} {in_city} — каталог {site}"),
  "seo.tpl.sectionText": L("{name} {price_from} at {site}. Delivery {in_city} and across Russia.", "{name} {price_from} в магазине {site}. Доставка {in_city} и по России."),
  "seo.tpl.product": L("{name}: buy {in_city} for {price}", "{name} — купить {in_city} за {price}"),
  "seo.tpl.productText": L("{name} for {price} at {site}. Delivery {in_city} and across Russia.", "{name} за {price} в магазине {site}. Доставка {in_city} и по России."),
  "seo.gone": "parent",
  "seo.robots": "",
  "seo.sitemap": true, "seo.sitemap.sections": true, "seo.sitemap.products": true, "seo.sitemap.news": true, "seo.sitemap.images": true,
  "seo.head": "",
  "seo.ai.llms": true, "seo.ai.search": true, "seo.ai.yandex": true, "seo.ai.train": true,
  "seo.schema.org": true, "seo.schema.crumbs": true, "seo.schema.products": true, "seo.schema.reviews": true,
  "seo.ogName": "", "seo.ogTitle": "", "seo.ogText": "",
});

const SEO = {
  merbau: () => ({
    values: {
      "seo.ogTitle": L("Merbau — tableware and textiles for home", "Мербау — посуда и текстиль для дома"),
      "seo.ogText": L("Ceramics, linen and kitchenware in Naberezhnye Chelny. Pickup on Syuyumbike Avenue, delivery across Tatarstan.", "Керамика, лён и всё для кухни в Набережных Челнах. Самовывоз с проспекта Сююмбике, доставка по Татарстану."),
    },
    services: {
      "yandex-webmaster": { on: true, code: "4f3a1c9e7b2d6e80", account: "anton.odintsov@yandex.ru", auto: ["sitemap", "recrawl", "errors"], stats: { pages: 1248, iks: 140, issues: 2 } },
      "google-search-console": { on: true, code: "x7Kp2QvN9dLm4RtB8sYw1cHj6uEa3oZf5gTn0iVk", account: "anton.odintsov@yandex.ru", auto: ["sitemap", "errors"], stats: { pages: 1102, clicks: 3460 } },
      indexnow: { on: true, key: "c3e1a9f04b7d26e85a1f0c9b3d7e2a64", send: ["changed", "deleted"], sent: 14 },
      "yandex-feed": { on: true, schedule: "hourly", name: "Мербау Челны", only: ["stock", "photo"], utm: "utm_source=yandex&utm_medium=feed", count: 1912, at: at(0, 9, 20), skipped: 12 },
      "vk-pixel": { on: true, pixel: "3512748", events: ["view", "cart", "order", "form"], pricelist: "120438" },
      "yandex-business": { on: true, cards: { chelny: "https://yandex.ru/maps/org/merbau/1739520416/", nkamsk: "https://yandex.ru/maps/org/merbau/2318046691/" }, widget: "footer", goods: true, rating: 4.8, reviews: 126 },
      "2gis": { on: true, cards: { chelny: "https://2gis.ru/nabchelny/firm/70000001062837214" }, widget: "none", rating: 4.7, reviews: 58 },
      "yandex-wordstat": { on: true, account: "anton.odintsov@yandex.ru", region: "chelny", hints: true },
      "google-pagespeed": { on: true, schedule: "weekly", pages: ["home", "section", "product"], mobile: 78, desktop: 94 },
      "yandex-speller": { on: true, check: ["records", "meta", "products"], found: 3 },
    },
    redirects: [
      { id: "r1", from: "/catalog/tekstil/", to: "/catalog/textile/", hits: 388 },
      { id: "r2", from: "/dostavka/", to: "/help/shipping", hits: 214 },
      { id: "r3", from: "/opt.html", to: "/help/wholesale", hits: 57 },
      { id: "r5", from: "/akcii/*", to: "/sale/*", hits: 96 },
      { id: "r6", from: "/catalog/podarki/novyj-god/", code: 410, to: "", hits: 3 },
      { id: "r4", from: "/news/osennij-len/", to: "/news/osenniy-len/", hits: 0, auto: true },
    ],
    missing: [
      { path: "/catalog/kitchen/kruzhka-grafit/", hits: 23, seen: at(0, 11, 40) },
      { path: "/help/garantiya/", hits: 9, seen: at(1, 16, 5) },
      { path: "/catalog/podarki/", hits: 4, seen: at(5, 10, 20) },
    ],
  }),
};

/* Свежая копия настроек сайта. Сайт без своих данных получает данные первого. */
export function seedOf(site) {
  const make = SITES[site.id] ?? SITES.merbau;
  const seed = make();
  const seo = (SEO[site.id] ?? SEO.merbau)();
  seed.values = { ...seed.values, ...seoValues(), ...seo.values, "site.name": site.name };
  seed.lists.redirects = seo.redirects;
  seed.lists.missing = seo.missing;
  seed.lists.services = seo.services ?? {};
  return JSON.parse(JSON.stringify(seed));
}
