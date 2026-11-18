/* Заказы и покупатели демо-магазина «Мербау Челны»: товары для дома, самовывоз с
   пр. Сююмбике, курьер по городу, СДЭК и Почта России по стране. Оплата — картой
   на сайте, при получении или по счёту (организации).

   Сколько заказов в день — из продаж по дням (REVENUE в fixtures.js: сезон,
   выходные), оформляют их весь день, больше всего вечером. Каждый заказ проживает
   свою историю по часам магазина — подтверждение, оплата, сборка, отправка,
   получение — и к «сейчас» (NOW) стоит там, докуда успел дойти: воскресные
   вечерние ещё новые, отправленные СДЭК в пути. Последние пятнадцать заказов
   записаны руками, со своими комментариями. Случайность с зерном: снимки экранов
   совпадают от запуска к запуску.

   Выручка и заказы по дням для обзора — salesByDay(): из этих же заказов, поэтому
   график и список сходятся до рубля. Покупатели — люди и организации из заказов,
   без сегментов; у организации ИНН и контактное лицо.

   Здесь только исходные данные. Правки (статус, оплата, заметки) живут в
   modules/shop/orders/store.js. */

import { L } from "../core/i18n.js";
import { NOW, REVENUE, ME } from "./fixtures.js";

const ME_ID = ME.id;
import { PRODUCTS } from "./catalog.js";

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ---- Справочники ------------------------------------------------------------ */

export const SHOP = { city: "Набережные Челны", address: "пр. Сююмбике, 40", courier: 290, freeCourier: 3000 };

/* Статусы: тон по смыслу (ARCHITECTURE.md, «Вид страниц»), глиф — двухцветный
   кита: новый ждёт первого действия, в работе собирают, в пути везут. */
export const STATUSES = {
  new: { id: "new", label: L("New", "Новый"), many: L("New", "Новые"), tone: "blue", glyph: "duo-bell-bing" },
  work: { id: "work", label: L("In progress", "В работе"), many: L("In progress", "В работе"), tone: "amber", glyph: "duo-box" },
  sent: { id: "sent", label: L("Shipped", "Отправлен"), many: L("Shipped", "Отправлены"), tone: "amber", glyph: "duo-delivery" },
  done: { id: "done", label: L("Completed", "Выполнен"), many: L("Completed", "Выполнены"), tone: "green", glyph: "duo-check-circle" },
  canceled: { id: "canceled", label: L("Canceled", "Отменён"), many: L("Canceled", "Отменены"), tone: "gray", glyph: "" },
};

export const PAYMENTS = {
  card: { id: "card", label: L("Card on the site", "Картой на сайте") },
  cash: { id: "cash", label: L("On receipt", "При получении") },
  invoice: { id: "invoice", label: L("Invoice", "По счёту") },
};

export const DELIVERY = {
  pickup: { id: "pickup", label: L("Pickup", "Самовывоз") },
  courier: { id: "courier", label: L("Courier", "Курьер") },
  cdek: { id: "cdek", label: L("CDEK", "СДЭК") },
  post: { id: "post", label: L("Russian Post", "Почта России") },
};

/* Откуда заказ: корзина на сайте, «Купить в 1 клик» (только имя и телефон) или
   внесён вручную после звонка. */
export const SOURCES = {
  cart: { id: "cart", label: L("Site cart", "Корзина на сайте") },
  click: { id: "click", label: L("One-click order", "Купить в 1 клик") },
  manual: { id: "manual", label: L("Added by hand", "Внесён вручную") },
};

/* Оплата одним словом. Отменённый без денег — без состояния. */
export function paymentState(order) {
  const { method, paid, failed, refunded } = order.payment;
  if (refunded) return { id: "refund", label: L("Refunded", "Возврат"), tone: "gray" };
  if (paid) return { id: "paid", label: L("Paid", "Оплачен"), tone: "green" };
  if (order.status === "canceled") return { id: "none", label: L("Not paid", "Не оплачен"), tone: "" };
  if (failed) return { id: "failed", label: L("Payment failed", "Не прошла"), tone: "red" };
  if (method === "cash") return { id: "receipt", label: L("On receipt", "При получении"), tone: "gray" };
  return { id: "waiting", label: L("Awaiting payment", "Ждёт оплаты"), tone: "amber" };
}

export const subtotalOf = (order) => order.items.reduce((sum, line) => sum + line.price * line.qty, 0);
export const unitsOf = (order) => order.items.reduce((sum, line) => sum + line.qty, 0);

/* ---- Случайность с зерном ---------------------------------------------------- */

/* mulberry32: выход — хеш состояния, поэтому генератор заказа, засеянный выходом
   общего, не повторяет общий со сдвигом. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), s | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
}
const rand = seeded(20261012);
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (low, high) => low + Math.floor(rand() * (high - low + 1));
/* Выбор по весам: таблица weights([[значение, вес], …]) один раз, draw — сколько угодно. */
function weights(list) {
  let sum = 0;
  return { values: list.map(([value]) => value), edges: list.map(([, weight]) => (sum += weight)), total: sum };
}
function draw({ values, edges, total }) {
  const roll = rand() * total;
  for (let i = 0; i < edges.length; i++) if (roll < edges[i]) return values[i];
  return values[0];
}

/* ---- Города и доставка --------------------------------------------------------- */

/* [город, доля покупателей, тариф СДЭК до пункта, пункт СДЭК, дни в пути, улицы]. */
const CITY_LIST = [
  ["Набережные Челны", 38, 0, "", [0, 0], ["пр. Мира", "пр. Сююмбике", "пр. Вахитова", "Московский пр.", "пр. Чулман", "ул. Ахметшина", "бульвар Энтузиастов", "пр. Хасана Туфана", "ул. Шамиля Усманова", "пр. Яшьлек"]],
  ["Казань", 10, 390, "ул. Чистопольская, 20", [1, 2], ["ул. Чистопольская", "пр. Победы", "ул. Декабристов", "ул. Адоратского", "ул. Пушкина", "пр. Ямашева", "ул. Гвардейская"]],
  ["Нижнекамск", 4, 390, "пр. Мира, 47", [1, 2], ["пр. Мира", "пр. Химиков", "ул. Корабельная", "пр. Шинников"]],
  ["Елабуга", 2, 390, "пр. Нефтяников, 20", [1, 2], ["пр. Нефтяников", "ул. Тугарова", "ул. Окружное шоссе"]],
  ["Альметьевск", 2, 390, "ул. Ленина, 100", [1, 3], ["ул. Ленина", "ул. Шевченко", "пр. Строителей"]],
  ["Чистополь", 1, 390, "ул. Ленина, 19", [2, 3], ["ул. Энгельса", "ул. Ленина"]],
  ["Зеленодольск", 1, 390, "ул. Татарстан, 8", [1, 3], ["ул. Ленина", "ул. Татарстан"]],
  ["Москва", 9, 590, "ул. Покровка, 31", [2, 4], ["ул. Бутырская", "Каширское ш.", "ул. Земляной Вал", "Ленинский пр.", "ул. Профсоюзная", "ул. Народного Ополчения"]],
  ["Санкт-Петербург", 5, 690, "Лиговский пр., 50", [3, 5], ["Лиговский пр.", "ул. Савушкина", "пр. Просвещения", "Московский пр."]],
  ["Самара", 3, 490, "ул. Ново-Садовая, 24", [2, 4], ["ул. Ново-Садовая", "Московское ш.", "ул. Гагарина"]],
  ["Уфа", 3, 490, "пр. Октября, 33", [2, 3], ["пр. Октября", "ул. Менделеева", "ул. Ленина"]],
  ["Екатеринбург", 3, 590, "ул. Малышева, 51", [3, 5], ["ул. Малышева", "ул. Белинского", "ул. Куйбышева"]],
  ["Нижний Новгород", 2, 490, "ул. Белинского, 32", [2, 4], ["ул. Белинского", "ул. Родионова"]],
  ["Ижевск", 2, 450, "ул. Пушкинская, 130", [1, 3], ["ул. Пушкинская", "ул. Удмуртская"]],
  ["Чебоксары", 2, 450, "пр. Ленина, 7", [2, 3], ["пр. Ленина", "ул. Гагарина"]],
  ["Пермь", 2, 590, "ул. Ленина, 60", [3, 5], ["ул. Ленина", "Комсомольский пр."]],
  ["Ульяновск", 1, 490, "ул. Гончарова, 40", [2, 4], ["ул. Гончарова", "Московское ш."]],
  ["Тюмень", 1, 690, "ул. Республики, 65", [3, 6], ["ул. Республики", "ул. Мельникайте"]],
  ["Новосибирск", 1, 790, "Красный пр., 86", [4, 7], ["Красный пр.", "ул. Ленина"]],
  ["Краснодар", 1, 690, "ул. Красная, 154", [4, 6], ["ул. Красная", "ул. Северная"]],
];
const CITIES = new Map(CITY_LIST.map(([name, weight, cdek, point, days, streets]) => [name, { name, weight, cdek, point, days, streets }]));
const TATARSTAN = new Set(["Набережные Челны", "Казань", "Нижнекамск", "Елабуга", "Альметьевск", "Чистополь", "Зеленодольск"]);
const cityOf = (name) => CITIES.get(name) ?? { name, cdek: 490, point: "ул. Ленина, 1", days: [3, 5] };

const weightOf = (items) => items.reduce((sum, line) => sum + (line.product?.weight ?? 0.5) * line.qty, 0);

/* Доставка: курьер по городу 290 ₽, от 3 000 ₽ бесплатно; СДЭК по тарифу города,
   почта — 290 ₽ по Татарстану, 390 ₽ дальше; сверх 5 кг — 30 ₽ за килограмм. */
function costOf(type, city, items, subtotal) {
  if (type === "pickup") return 0;
  if (type === "courier") return subtotal >= SHOP.freeCourier ? 0 : SHOP.courier;
  const base = type === "post" ? (TATARSTAN.has(city) ? 290 : 390) : cityOf(city).cdek;
  return base + Math.max(0, Math.ceil(weightOf(items)) - 5) * 30;
}

/* Куда везти: самовывоз — магазин, СДЭК человеку — пункт выдачи, остальное — до
   двери. */
function addressOf(type, customer) {
  if (type === "pickup") return `${SHOP.city}, ${SHOP.address}`;
  if (type === "cdek" && customer.type === "person") return `${customer.city}, пункт СДЭК, ${cityOf(customer.city).point}`;
  return `${customer.city}, ${customer.address}`;
}

/* ---- Покупатели ---------------------------------------------------------------- */

/* Постоянные: [id, имя, телефон, почта, город, адрес, тон аватара]. */
const PEOPLE = [
  ["c1", "Ольга Сафина", "+7 917 263-45-18", "olga.safina@mail.ru", "Набережные Челны", "пр. Мира, 52, кв. 114", "orange"],
  ["c3", "Екатерина Волкова", "+7 987 214-30-77", "volkova.ek@yandex.ru", "Казань", "ул. Чистопольская, 64, кв. 210", "violet"],
  ["c4", "Артём Николаев", "+7 917 905-11-62", "artem.nikolaev@gmail.com", "Нижнекамск", "пр. Шинников, 11, кв. 38", "teal"],
  ["c5", "Алина Хабибуллина", "+7 937 588-02-49", "alina.hab@mail.ru", "Казань", "ул. Декабристов, 85, кв. 7", "red"],
  ["c6", "Денис Кузьмин", "+7 919 641-75-03", "kuzmin.denis@bk.ru", "Елабуга", "пр. Нефтяников, 104, кв. 52", "gray"],
  ["c8", "Максим Егоров", "+7 927 330-18-94", "m.egorov@yandex.ru", "Уфа", "ул. Ленина, 72, кв. 15", "amber"],
  ["c9", "Дарья Белоусова", "+7 911 802-56-31", "dasha.belousova@gmail.com", "Санкт-Петербург", "Лиговский пр., 120, кв. 44", "pink"],
  ["c11", "Ксения Лаврова", "+7 927 744-21-08", "lavrova.k@mail.ru", "Самара", "ул. Ново-Садовая, 160, кв. 81", "olive"],
  ["c12", "Игорь Смирнов", "+7 917 287-64-10", "igor.smirnov@inbox.ru", "Набережные Челны", "ул. Шамиля Усманова, 28, кв. 61", "violet"],
  ["c14", "Павел Зайцев", "+7 912 455-90-26", "pavel.zaytsev@yandex.ru", "Ижевск", "ул. Пушкинская, 154, кв. 19", "teal"],
  ["c15", "Виктория Ершова", "+7 916 520-37-84", "v.ershova@gmail.com", "Москва", "ул. Профсоюзная, 93, кв. 205", "pink"],
  ["c16", "Олег Фролов", "+7 903 345-81-66", "frolov.oleg@mail.ru", "Чебоксары", "пр. Ленина, 37, кв. 12", "gray"],
  ["c18", "Андрей Попов", "+7 922 108-47-59", "a.popov@bk.ru", "Екатеринбург", "ул. Малышева, 85, кв. 30", "orange"],
  ["c19", "Юлия Морозова", "+7 920 276-15-43", "yulia.morozova@yandex.ru", "Нижний Новгород", "ул. Белинского, 61, кв. 9", "violet"],
  ["c21", "Анастасия Королёва", "+7 925 610-44-27", "koroleva.nastya@gmail.com", "Москва", "Ленинский пр., 78, кв. 132", "red"],
  ["c22", "Сергей Тихонов", "+7 902 793-26-15", "s.tikhonov@mail.ru", "Пермь", "ул. Ленина, 50, кв. 27", "olive"],
  ["c23", "Эльвира Шакирова", "+7 960 045-73-82", "elvira.shakirova@inbox.ru", "Зеленодольск", "ул. Ленина, 38, кв. 4", "teal"],
  ["c25", "Полина Григорьева", "+7 937 274-59-60", "polina.grig@yandex.ru", "Ульяновск", "ул. Гончарова, 17, кв. 23", "pink"],
  ["c26", "Ильдар Мухаметов", "+7 917 396-88-21", "ildar.m@mail.ru", "Альметьевск", "ул. Ленина, 121, кв. 46", "gray"],
  ["c27", "Вероника Лебедева", "+7 921 963-04-18", "veronika.lebedeva@gmail.com", "Санкт-Петербург", "ул. Савушкина, 36, кв. 70", "orange"],
  ["c28", "Кирилл Осипов", "+7 919 921-35-70", "kirill.osipov@bk.ru", "Тюмень", "ул. Республики, 142, кв. 88", "green"],
  ["c29", "Айгуль Нуриева", "+7 917 851-62-34", "aigul.nurieva@mail.ru", "Чистополь", "ул. Энгельса, 129, кв. 6", "violet"],
];

/* Организации: [id, название, вывеска (буквы аватара), контакт, телефон, почта,
   город, адрес, ИНН, тон]. У ИП ИНН из 12 цифр, у ООО — из 10. */
const COMPANIES = [
  ["c2", "ООО «Зерно»", "Зерно", "Тимур Садыков", "+7 495 120-45-30", "t.sadykov@zerno.ru", "Москва", "ул. Покровка, 17, офис 3", "7709512836", "teal"],
  ["c7", "ООО «Отель Кама»", "Отель Кама", "Светлана Гарипова", "+7 8552 47-12-90", "zakupki@hotel-kama.ru", "Набережные Челны", "пр. Хасана Туфана, 12", "1650287415", "blue"],
  ["c10", "ИП Ахметов Р. Р.", "Уют-Дом", "Руслан Ахметов", "+7 917 920-14-56", "opt@uyut-dom.ru", "Альметьевск", "ул. Ризы Фахретдина, 44", "164401928374", "green"],
  ["c13", "ООО «Пекарня Тесто»", "Тесто", "Наталья Карпова", "+7 843 207-55-14", "hello@pekarnya-testo.ru", "Казань", "ул. Пушкина, 12", "1655409873", "amber"],
  ["c17", "ИП Валиева Л. Ф.", "Чайная лавка", "Лилия Валиева", "+7 987 296-41-07", "lilia@chaynaya-lavka.ru", "Казань", "ул. Кави Наджми, 8", "165912347856", "olive"],
  ["c20", "ИП Зиннатуллин М. Р.", "Подарки", "Марат Зиннатуллин", "+7 917 285-63-90", "marat@podarki-chelny.ru", "Набережные Челны", "пр. Мира, 3", "165008712345", "pink"],
  ["c24", "ООО «Интерьер Лофт»", "Интерьер Лофт", "Роман Белов", "+7 843 211-08-36", "info@interier-loft.ru", "Казань", "ул. Николая Ершова, 1А", "1660314578", "violet"],
  ["c30", "ООО «Кафе Печка»", "Печка", "Евгений Рябов", "+7 8555 41-20-63", "zakaz@kafe-pechka.ru", "Нижнекамск", "пр. Химиков, 20", "1651073925", "orange"],
];

const initialsOf = (text) => text.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
/* Сводка по заказам покупателя (ниже, CUSTOMERS): сколько заказов, на сколько без
   отменённых, первый и последний. */
const STATS = { orders: 0, spent: 0, firstOrder: null, lastOrder: null };
const BUYER = new Map();
const add = (customer) => (BUYER.set(customer.id, customer), customer);
for (const [id, name, phone, email, city, address, tone] of PEOPLE) add({ id, type: "person", name, phone, email, city, address, tone, initials: initialsOf(name), ...STATS });
for (const [id, name, brand, contact, phone, email, city, address, inn, tone] of COMPANIES) add({ id, type: "company", name, brand, contact, phone, email, city, address, inn, tone, initials: initialsOf(brand), ...STATS });

/* Новые покупатели: имя из списков (в Татарстане чаще татарские), почта латиницей,
   адрес по городу. Имена не повторяются. */
const NAMES = {
  ru: {
    f: ["Анна", "Мария", "Елена", "Наталья", "Татьяна", "Ирина", "Ольга", "Светлана", "Юлия", "Екатерина", "Анастасия", "Марина", "Оксана", "Людмила", "Галина", "Дарья", "Ксения", "Алина", "Виктория", "Полина", "Ангелина", "Валентина", "Надежда", "Вера", "Евгения", "Кристина", "Софья", "Лариса", "Яна", "Арина"],
    m: ["Александр", "Дмитрий", "Сергей", "Андрей", "Алексей", "Максим", "Евгений", "Иван", "Михаил", "Николай", "Владимир", "Артём", "Денис", "Павел", "Роман", "Игорь", "Олег", "Константин", "Кирилл", "Илья", "Антон", "Вадим", "Виктор", "Юрий", "Станислав", "Егор", "Никита", "Григорий", "Василий", "Фёдор"],
    last: ["Иванов", "Петров", "Кузнецов", "Соколов", "Новиков", "Медведев", "Григорьев", "Козлов", "Лебедев", "Васильев", "Смирнов", "Попов", "Морозов", "Волков", "Алексеев", "Павлов", "Семёнов", "Голубев", "Виноградов", "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов", "Комаров", "Орлов", "Киселёв", "Макаров", "Андреев", "Ковалёв", "Ильин", "Гусев", "Титов", "Баранов", "Куликов", "Степанов", "Яковлев", "Сорокин", "Сергеев", "Романов", "Захаров", "Борисов", "Герасимов", "Пономарёв", "Лазарев", "Никитин", "Соболев", "Поляков", "Цветков", "Данилов", "Жуков", "Журавлёв", "Крылов", "Максимов", "Федотов", "Матвеев", "Бобров", "Дмитриев", "Калинин", "Антонов", "Тимофеев", "Филиппов", "Марков", "Шестаков", "Казаков", "Ефимов", "Денисов", "Громов", "Фомин", "Давыдов", "Мельников", "Щербаков", "Власов", "Маслов", "Исаков", "Гаврилов", "Родионов", "Котов", "Горбунов", "Быков", "Зуев", "Савельев", "Панов", "Суворов", "Абрамов", "Воронов", "Мухин", "Архипов", "Трофимов", "Мартынов", "Чернов"],
  },
  tt: {
    f: ["Гульнара", "Лейсан", "Динара", "Регина", "Алсу", "Айгуль", "Эльвира", "Гузель", "Резеда", "Лилия", "Альбина", "Венера", "Камила", "Ильмира", "Зульфия", "Диляра", "Райля", "Элина", "Чулпан", "Миляуша"],
    m: ["Тимур", "Руслан", "Рустем", "Ильнур", "Айдар", "Марат", "Ринат", "Ильдар", "Рамиль", "Азат", "Булат", "Артур", "Радик", "Наиль", "Ильшат", "Фарид", "Дамир", "Эмиль", "Ренат", "Салават"],
    last: ["Галиев", "Сафин", "Гарипов", "Миннуллин", "Ахмадуллин", "Хайруллин", "Фазлыев", "Закиров", "Сабиров", "Шарипов", "Валиев", "Нуриев", "Гилязов", "Хасанов", "Зарипов", "Камалов", "Латыпов", "Файзуллин", "Ибрагимов", "Абдуллин", "Гайнуллин", "Мингазов", "Юсупов", "Ганиев", "Габдуллин", "Шайхутдинов", "Мухаметзянов", "Гимадиев", "Ахметзянов", "Гарифуллин", "Нигматуллин", "Сагдиев", "Шакиров", "Ризванов", "Каримов", "Мансуров", "Насибуллин", "Тухватуллин", "Яруллин", "Мавлютов"],
  },
};
const DOMAINS = ["mail.ru", "yandex.ru", "gmail.com", "bk.ru", "inbox.ru", "list.ru"];
const MOBILE = ["917", "927", "937", "987", "919", "960", "965", "986", "904", "903", "950", "953", "905", "916", "925", "999"];
const TONES = ["blue", "violet", "pink", "red", "orange", "amber", "olive", "green", "teal", "gray"];
const LATIN = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
const latinCache = new Map();
const latin = (text) => {
  if (!latinCache.has(text)) latinCache.set(text, [...text.toLowerCase()].map((char) => LATIN[char] ?? char).join(""));
  return latinCache.get(text);
};

const takenNames = new Set([...BUYER.values()].map((customer) => customer.name));
let nextBuyer = 31;
const CITY_ODDS = weights(CITY_LIST.map(([name, weight]) => [name, weight]));
/* Почта из полного имени — имена не повторяются, значит и почта. */
const MAIL = [(first, last) => `${first}.${last}`, (first, last) => `${last}.${first}`, (first, last) => `${first}${last}`, (first, last, n) => `${last}_${first}${n}`];

/* Новый покупатель: имя, город и тон сразу — по ним список и поиск; телефон, почта
   и адрес — из своего зерна при первом обращении: покупателей тысячи, а смотрят
   единицы. */
class Buyer {
  constructor(name, city, tone, seed) {
    this.id = `c${nextBuyer++}`;
    this.type = "person";
    this.name = name;
    this.city = city;
    this.tone = tone;
    this.initials = name[0] + name[name.indexOf(" ") + 1];
    this.orders = 0;
    this.spent = 0;
    this.firstOrder = null;
    this.lastOrder = null;
    this.seed = seed;
    this.contacts = null;
  }
  get phone() { return this.details().phone; }
  get email() { return this.details().email; }
  get address() { return this.details().address; }
  details() {
    if (!this.contacts) {
      const r = seeded(this.seed);
      const take = (list) => list[Math.floor(r() * list.length)];
      const num = (n) => String(Math.floor(r() * 10 ** n)).padStart(n, "0");
      const [first, last] = this.name.split(" ").map(latin);
      this.contacts = {
        phone: `+7 ${take(MOBILE)} ${num(3)}-${num(2)}-${num(2)}`,
        email: `${take(MAIL)(first, last, 70 + Math.floor(r() * 30))}@${take(DOMAINS)}`,
        address: `${take(cityOf(this.city).streets)}, ${2 + Math.floor(r() * 159)}, кв. ${1 + Math.floor(r() * 240)}`,
      };
    }
    return this.contacts;
  }
}

function newBuyer() {
  const city = draw(CITY_ODDS);
  const group = NAMES[chance(TATARSTAN.has(city) ? 0.5 : 0.08) ? "tt" : "ru"];
  const sex = chance(0.62) ? "f" : "m";
  let name = "";
  for (let tries = 0; tries < 20 && (!name || takenNames.has(name)); tries++) name = `${pick(group[sex])} ${pick(group.last)}${sex === "f" ? "а" : ""}`;
  takenNames.add(name);
  return add(new Buyer(name, city, pick(TONES), Math.floor(rand() * 2 ** 32)));
}

/* ---- Товары в заказе ------------------------------------------------------------ */

const PRODUCT = new Map(PRODUCTS.map((product) => [product.id, product]));
/* Что покупают люди: товар тем чаще, чем лучше он продаётся (catalog.js: sold). */
const SHELF = weights(PRODUCTS.filter((product) => !product.draft && product.price != null && product.sold > 0).map((product) => [product, product.sold]));
const LINES = weights([[1, 45], [2, 30], [3, 15], [4, 7], [5, 3]]);
const QTY = weights([[1, 88], [2, 10], [3, 2]]);
const line = (id, qty) => {
  const product = PRODUCT.get(id);
  return { product, id, name: product.name, sku: product.sku, price: product.price, qty };
};

function basket() {
  const count = draw(LINES);
  const ids = new Set();
  for (let tries = 0; ids.size < count && tries < 20; tries++) ids.add(draw(SHELF).id);
  return [...ids].map((id) => line(id, draw(QTY)));
}

/* Организации: что берут и сколько, как часто (дней) и как везти. */
const TRADE = {
  c2: { every: 14, items: [["p2", 4, 8], ["p7", 6, 16], ["p22", 2, 6], ["p15", 4, 10]] },
  c7: { every: 21, items: [["p10", 10, 30], ["p1", 4, 10], ["p16", 6, 12], ["p13", 6, 12]] },
  c10: { every: 10, items: [["p1", 4, 10], ["p13", 6, 12], ["p16", 6, 12], ["p17", 4, 10], ["p11", 2, 6], ["p8", 2, 4]] },
  c13: { every: 30, items: [["p3", 2, 6], ["p7", 4, 8], ["p6", 1, 3]] },
  c17: { every: 20, items: [["p7", 4, 8], ["p2", 2, 4], ["p15", 4, 8], ["p22", 2, 4]] },
  c20: { every: 12, items: [["p22", 4, 8], ["p13", 6, 12], ["p16", 4, 10], ["p17", 4, 10], ["p20", 6, 12]] },
  c24: { every: 30, items: [["p8", 1, 4], ["p9", 1, 3], ["p11", 1, 3], ["p17", 2, 6]] },
  c30: { every: 45, items: [["p6", 2, 4], ["p3", 2, 6], ["p7", 4, 8]] },
};
function tradeBasket(id) {
  const list = TRADE[id].items.filter(() => chance(0.65));
  return (list.length ? list : TRADE[id].items.slice(0, 1)).map(([pid, low, high]) => line(pid, between(low, high)));
}

/* Постоянные люди: сколько заказов за полгода (кроме записанных руками). */
const REGULAR = {
  c1: 5, c3: 2, c4: 4, c5: 3, c6: 1, c8: 3, c9: 3, c11: 2, c12: 4, c14: 3, c15: 2,
  c16: 3, c18: 4, c19: 2, c21: 4, c22: 1, c23: 3, c25: 2, c26: 4, c27: 3, c28: 3, c29: 2,
};

const COMMENTS = [
  "Позвоните перед доставкой.", "Нужна подарочная упаковка.", "Доставка после 18:00, днём никого нет.",
  "Упакуйте понадёжнее, отправляю в подарок.", "Можно оставить у двери.", "Подъезд со двора, третий этаж.",
  "Заберу в субботу.", "Чек положите в коробку, нужен для работы.", "Если пледа нет в графите, подойдёт бежевый.",
  "Код домофона 47, квартира 112.", "Это подарок, ценник уберите, пожалуйста.", "Пишите в WhatsApp, звонить неудобно.",
];
const REASONS = [
  "Покупатель передумал.", "Покупатель оформил заказ заново с другим адресом.", "Нашёл дешевле, отказался.",
  "Дубль заказа: покупатель нажал «Оформить» дважды.", "Не устроил срок доставки.",
];

/* ---- Часы магазина ------------------------------------------------------------- */

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5, 6];
const BANK_DAYS = [1, 2, 3, 4, 5];
/* [с, до] часов: заказы подтверждают каждый день, склад и курьер — пн–сб, банк
   зачисляет по будням, магазин выдаёт и покупатели забирают с 10 до 21. */
const DUTY = [9, 21];
const STOCK = [9, 19];
const COURIER = [11, 20];
const BANK = [9, 18];
const STORE = [10, 21];

/* Ближайший момент в окне [с, до) на разрешённый день; вне окна — начало
   следующего окна плюс до spread минут очереди. */
function slot(time, [from, to], days = EVERY_DAY, spread = 30, r = rand) {
  const date = new Date(time);
  const hour = date.getHours() + date.getMinutes() / 60;
  if (days.includes(date.getDay()) && hour >= from && hour < to) return time;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (hour >= from ? 1 : 0), from, 0);
  while (!days.includes(next.getDay())) next.setDate(next.getDate() + 1);
  return next.getTime() + Math.floor(r() * spread) * MIN;
}

/* Когда оформляют заказ: по часам суток, больше всего вечером. */
const HOURS = weights([1.2, 0.6, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2.2, 3.2, 4, 4.6, 5.2, 5.4, 5, 4.8, 4.8, 5, 5.6, 6.4, 7, 6.6, 4.8, 2.8].map((weight, hour) => [hour, weight]));
const timeIn = (day) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), draw(HOURS), between(0, 59), between(0, 59)).getTime();

/* ---- История заказа -------------------------------------------------------------- */

/* Событие: at — время в мс, kind — что случилось, by — код сотрудника (TEAM). */
const ev = (at, kind, extra) => (extra ? { at, kind, ...extra } : { at, kind });
const NO_PAYMENT = "Не дозвонились, оплату так и не провели.";
const NO_INVOICE = "Счёт так и не оплатили.";

/* У заказа свой генератор (plan.seed). Развилки — его первые выпадения, всегда в
   этом порядке: история (story) и итог без истории (outcome) читают их одинаково. */
const forks = (r) => ({ manager: r() < 0.8 ? "MA" : "AO", cancel: r() < 0.03, cardOk: r() < 0.94, linkPaid: r() < 0.75, invoicePaid: r() < 0.95 });

/* Жизнь заказа от оформления до получения по часам магазина. События могут уйти
   за «сейчас» — заказ берёт только прошедшие. */
function storyOf({ seed, created, method, delivery, customer, source }) {
  const r = seeded(seed);
  const { manager, cancel, cardOk, linkPaid, invoicePaid } = forks(r);
  const span = (low, high) => low + Math.floor(r() * (high - low + 1));
  const at = (time, window, days, spread) => slot(time, window, days, spread, r);
  const card = method === "card" && source !== "manual";
  const events = [ev(created, "created", source === "manual" ? { by: manager } : null)];
  let paid = 0;
  if (card) {
    if (cardOk) events.push(ev((paid = created + span(1, 3) * MIN), "paid"));
    else events.push(ev(created + 2 * MIN, "failed"));
  }
  const confirm = Math.max(created + 2 * MIN, at(created + span(4, 40) * MIN, DUTY, EVERY_DAY, 90));
  if (cancel) {
    events.push(ev(confirm, "status", { to: "canceled", by: manager, reason: REASONS[span(0, REASONS.length - 1)] }));
    if (paid) events.push(ev(confirm + span(2, 20) * MIN, "refund", { by: manager }));
    return events;
  }
  if (card && !cardOk) {
    events.push(ev(confirm, "link", { by: manager }));
    if (!linkPaid) {
      events.push(ev(at(confirm + span(26, 50) * HOUR, DUTY), "status", { to: "canceled", by: manager, reason: NO_PAYMENT }));
      return events;
    }
    events.push(ev((paid = confirm + span(15, 240) * MIN), "paid", { link: true }));
  }
  events.push(ev(confirm + MIN, "status", { to: "work", by: manager }));
  if (method === "card" && !card) {
    events.push(ev(confirm + 2 * MIN, "link", { by: manager }));
    events.push(ev((paid = confirm + span(10, 120) * MIN), "paid", { link: true }));
  }
  if (method === "invoice") {
    const sent = confirm + span(5, 20) * MIN;
    events.push(ev(sent, "invoice", { by: manager }));
    if (!invoicePaid) {
      events.push(ev(at(sent + 8 * DAY, DUTY), "status", { to: "canceled", by: manager, reason: NO_INVOICE }));
      return events;
    }
    events.push(ev((paid = at(sent + span(18, 70) * HOUR, BANK, BANK_DAYS, 240)), "paid", { by: "MR" }));
  }
  const ready = at(Math.max(confirm, paid) + span(1, 5) * HOUR, STOCK, WEEKDAYS, 120);
  let done;
  if (delivery === "pickup") {
    events.push(ev(ready, "ready", { by: "HM" }));
    done = at(ready + span(2, 50) * HOUR, STORE, EVERY_DAY, 300);
  } else if (delivery === "courier") {
    const out = at(ready + span(1, 20) * HOUR, COURIER, WEEKDAYS, 180);
    events.push(ev(out, "status", { to: "sent", by: "HM" }));
    done = out + span(40, 200) * MIN;
  } else {
    const out = at(ready + span(1, 24) * HOUR, STOCK, WEEKDAYS, 240);
    const track = (delivery === "cdek" ? "15" : "423800") + String(Math.floor(r() * 1e8)).padStart(8, "0");
    events.push(ev(out, "status", { to: "sent", by: "HM", track }));
    const [low, high] = cityOf(customer.city).days;
    const transit = delivery === "post" ? span(low + 3, high + 7) : span(low, high);
    done = at(out + transit * DAY + span(0, customer.type === "company" ? 0 : 48) * HOUR, STORE, EVERY_DAY, 300);
  }
  /* Выдал магазин или свой курьер — с именем; получил в пункте — без. */
  const hand = delivery === "pickup" ? { by: manager } : delivery === "courier" ? { by: "HM" } : null;
  if (method === "cash") events.push(ev(done, "paid", hand));
  events.push(ev(done + MIN, "status", { to: "done", ...hand }));
  return events;
}

/* Итог заказа, который давно закончился, — без истории: выполнен или отменён,
   оплачен ли, была ли неудачная попытка и возврат. Развилки те же, что у story. */
function settle(order) {
  const { cancel, cardOk, linkPaid, invoicePaid } = forks(seeded(order.seed));
  const { method } = order.payment;
  const card = method === "card" && order.source !== "manual";
  const failed = card && !cardOk;
  const canceled = cancel || (failed && !linkPaid) || (method === "invoice" && !invoicePaid);
  const refunded = cancel && card && cardOk;
  order.status = canceled ? "canceled" : "done";
  order.payment.paid = !canceled || refunded;
  order.payment.failed = failed;
  order.payment.refunded = refunded;
}

/* ---- Сборка заказа --------------------------------------------------------------- */

/* Заказ старше месяца закончился наверняка (самая долгая история — почта на
   другой конец страны — короче): его статус — итог, история считается, когда её
   откроют. Свежие проживают историю сразу. */
const SETTLED = 30 * DAY;
const HISTORY = new Map();
const story = (order) => storyOf({ seed: order.seed, created: order.created.getTime(), method: order.payment.method, delivery: order.delivery.type, customer: order.customer, source: order.source });
const passed = (events) => events.filter((event) => event.at <= NOW.getTime()).sort((a, b) => a.at - b.at);

/* История заказа до «сейчас», по времени. */
export function historyOf(order) {
  if (!HISTORY.has(order)) HISTORY.set(order, order.seed == null ? [] : passed(story(order)));
  return HISTORY.get(order);
}

/* plan: seed, created (мс), customer, items, delivery, method, source, comment;
   у записанных руками вместо seed — history. */
function build(plan) {
  const { created, customer, items, delivery, method } = plan;
  const subtotal = items.reduce((sum, one) => sum + one.price * one.qty, 0);
  const cost = costOf(delivery, customer.city, items, subtotal);
  const order = {
    id: "", number: 0, created: new Date(created), source: plan.source ?? "cart", comment: plan.comment ?? "",
    status: "new", customer, items,
    delivery: { type: delivery, address: addressOf(delivery, customer), cost },
    payment: { method, paid: false, failed: false, refunded: false, invoice: null },
    total: subtotal + cost,
    seed: plan.seed ?? null,
    problem: null,
  };
  if (plan.history) HISTORY.set(order, passed(plan.history));
  if (plan.history || created > NOW.getTime() - SETTLED) {
    const events = historyOf(order);
    order.status = events.findLast((event) => event.kind === "status")?.to ?? "new";
    order.payment.paid = events.some((event) => event.kind === "paid");
    order.payment.failed = events.some((event) => event.kind === "failed");
    order.payment.refunded = events.some((event) => event.kind === "refund");
  } else settle(order);
  order.problem = problemOf(order);
  return order;
}

/* Проблема, которую решают руками: оплата картой не прошла, денег нет. */
export const problemOf = (order) => (order.payment.failed && !order.payment.paid && order.status !== "canceled" ? L("Card payment failed", "Оплата картой не прошла") : null);

/* Трек-номер — из истории. */
export const trackOf = (order, events = historyOf(order)) => events.findLast((event) => event.track)?.track ?? "";

/* ---- Последние заказы: записаны руками ----------------------------------------- */

/* Момент «days дней назад в hh:mm» от сегодняшнего демо-дня. */
const at = (days, hh, mm) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, hh, mm).getTime();

const RECENT = [
  {
    created: at(0, 9, 41), buyer: "c1", items: [["p1", 1], ["p13", 1]], delivery: "courier", method: "cash",
    comment: "Позвоните за час до приезда, домофон не работает.",
    history: [ev(at(0, 9, 41), "created")],
  },
  {
    created: at(0, 8, 17), buyer: "c13", items: [["p7", 6], ["p3", 4]], delivery: "cdek", method: "invoice",
    comment: "Счёт пришлите на почту, оплатим в течение двух дней. Нужны закрывающие документы.",
    history: [ev(at(0, 8, 17), "created")],
  },
  {
    created: at(0, 7, 12), buyer: "c29", items: [["p10", 2], ["p16", 1]], delivery: "post", method: "card",
    history: [ev(at(0, 7, 12), "created"), ev(at(0, 7, 14), "failed")],
  },
  {
    created: at(1, 21, 36), buyer: "c6", items: [["p6", 1]], delivery: "cdek", method: "card",
    history: [ev(at(1, 21, 36), "created"), ev(at(1, 21, 37), "paid")],
  },
  {
    created: at(2, 15, 20), buyer: "c7", items: [["p10", 20], ["p16", 10]], delivery: "courier", method: "invoice", source: "manual",
    comment: "Привезите в будни с 9 до 17, пропуск закажем заранее.",
    history: [
      ev(at(2, 15, 20), "created", { by: "MA" }),
      ev(at(2, 15, 21), "status", { to: "work", by: "MA" }),
      ev(at(2, 16, 5), "invoice", { by: "MA" }),
      ev(at(2, 16, 6), "note", { by: "MA", text: "Счёт ушёл Светлане на почту, оплату ждём до среды. Полотенца отложила на складе." }),
    ],
  },
  {
    created: at(2, 12, 44), buyer: "c3", items: [["p9", 1]], delivery: "cdek", method: "card",
    history: [
      ev(at(2, 12, 44), "created"),
      ev(at(2, 12, 45), "paid"),
      ev(at(2, 13, 10), "status", { to: "work", by: "MA" }),
      ev(at(2, 13, 12), "note", { by: "MA", text: "Плафон хрупкий: упаковать в коробку с уплотнителем." }),
    ],
  },
  {
    created: at(3, 19, 10), buyer: "c12", items: [["p11", 1], ["p17", 2]], delivery: "pickup", method: "cash",
    history: [
      ev(at(3, 19, 10), "created"),
      ev(at(3, 19, 32), "status", { to: "work", by: "MA" }),
      ev(at(2, 11, 15), "ready", { by: "HM" }),
      ev(at(2, 11, 20), "note", { by: "MA", text: "Созвонились: заберёт в понедельник после 18:00." }),
    ],
  },
  {
    created: at(3, 14, 31), buyer: "c10", items: [["p1", 8], ["p13", 12], ["p16", 12]], delivery: "cdek", method: "invoice",
    comment: "Отгрузка до пятницы, это под открытие нового магазина.",
    history: [
      ev(at(3, 14, 31), "created"),
      ev(at(3, 15, 2), "status", { to: "work", by: "MA" }),
      ev(at(3, 15, 10), "invoice", { by: "MA" }),
      ev(at(2, 11, 40), "paid", { by: "MR" }),
      ev(at(0, 9, 5), "note", { by: "HM", text: "Пледы собраны, свечи и диффузоры доберём к обеду." }),
    ],
  },
  {
    created: at(4, 16, 5), buyer: "c9", items: [["p2", 1], ["p7", 1]], delivery: "cdek", method: "card",
    history: [
      ev(at(4, 16, 5), "created"),
      ev(at(4, 16, 6), "paid"),
      ev(at(4, 16, 40), "status", { to: "work", by: "MA" }),
      ev(at(3, 15, 30), "status", { to: "sent", by: "HM", track: "1529441706" }),
    ],
  },
  {
    created: at(4, 11, 48), buyer: "c14", items: [["p12", 5], ["p20", 2], ["p19", 1]], delivery: "post", method: "card",
    history: [
      ev(at(4, 11, 48), "created"),
      ev(at(4, 11, 49), "paid"),
      ev(at(4, 12, 15), "status", { to: "work", by: "MA" }),
      ev(at(3, 11, 20), "status", { to: "sent", by: "HM", track: "42380087014527" }),
    ],
  },
  {
    created: at(5, 13, 15), buyer: "c2", items: [["p2", 6], ["p7", 12]], delivery: "cdek", method: "invoice",
    comment: "Это для трёх кофеен, коробки подпишите по точкам: Покровка, Пятницкая, Таганка.",
    history: [
      ev(at(5, 13, 15), "created"),
      ev(at(5, 13, 40), "status", { to: "work", by: "MA" }),
      ev(at(5, 13, 52), "invoice", { by: "MA" }),
      ev(at(4, 10, 15), "paid", { by: "MR" }),
      ev(at(4, 15, 40), "status", { to: "sent", by: "HM", track: "1529402233" }),
    ],
  },
  {
    created: at(5, 10, 2), buyer: "c5", items: [["p22", 1]], delivery: "cdek", method: "card",
    comment: "Это подарок, чек в коробку не кладите.",
    history: [
      ev(at(5, 10, 2), "created"),
      ev(at(5, 10, 3), "paid"),
      ev(at(5, 10, 30), "status", { to: "work", by: "MA" }),
      ev(at(5, 16, 10), "status", { to: "sent", by: "HM", track: "1529387754" }),
      ev(at(3, 13, 2), "status", { to: "done" }),
    ],
  },
  {
    created: at(6, 17, 40), buyer: "c8", items: [["p5", 2]], delivery: "cdek", method: "card",
    history: [
      ev(at(6, 17, 40), "created"),
      ev(at(6, 17, 41), "paid"),
      ev(at(6, 18, 5), "status", { to: "canceled", by: "MA", reason: "Графины закончились, от замены покупатель отказался." }),
      ev(at(6, 18, 12), "refund", { by: "MA" }),
    ],
  },
  {
    created: at(6, 12, 20), buyer: "c1", items: [["p7", 1]], delivery: "pickup", method: "cash",
    history: [
      ev(at(6, 12, 20), "created"),
      ev(at(6, 12, 45), "status", { to: "work", by: "MA" }),
      ev(at(6, 14, 30), "ready", { by: "HM" }),
      ev(at(6, 18, 30), "paid", { by: "MA" }),
      ev(at(6, 18, 31), "status", { to: "done", by: "MA" }),
    ],
  },
  {
    created: at(7, 15, 5), buyer: "c20", items: [["p22", 5], ["p17", 10]], delivery: "courier", method: "invoice",
    history: [
      ev(at(7, 15, 5), "created"),
      ev(at(7, 15, 30), "status", { to: "work", by: "MA" }),
      ev(at(7, 15, 41), "invoice", { by: "MA" }),
      ev(at(6, 10, 20), "paid", { by: "MR" }),
      ev(at(6, 14, 0), "status", { to: "sent", by: "HM" }),
      ev(at(6, 16, 45), "status", { to: "done", by: "HM" }),
    ],
  },
];

/* ---- Генератор ----------------------------------------------------------------------- */

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const dayStart = (time) => { const date = new Date(time); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); };

/* Дни: 180 полных из продаж по дням и сегодняшний до «сейчас» (сколько в прошлый
   такой же день недели). */
const DAYS = [...REVENUE.map((day) => ({ date: day.date, count: day.orders })), { date: dayStart(NOW), count: REVENUE.at(-7).orders, today: true }];
const slots = new Map(DAYS.map((day) => [dayKey(day.date), []]));
const plant = (time, order) => slots.get(dayKey(new Date(time)))?.push({ time, ...order });

/* Записанные руками, постоянные люди и организации — на своих днях; остальное
   добирают новые и вернувшиеся покупатели. */
for (const order of RECENT) plant(order.created, { recent: order });
const older = DAYS.slice(0, -8);
for (const [id, count] of Object.entries(REGULAR)) {
  for (let i = 0; i < count; i++) plant(timeIn(pick(older).date), { buyer: BUYER.get(id) });
}
for (const [id, trade] of Object.entries(TRADE)) {
  for (let time = DAYS[0].date.getTime() + between(0, trade.every) * DAY; time < at(8, 0, 0); time += Math.round(trade.every * (0.7 + rand() * 0.6)) * DAY) {
    const day = new Date(time);
    if (!BANK_DAYS.includes(day.getDay())) continue;
    plant(new Date(day.getFullYear(), day.getMonth(), day.getDate(), between(9, 16), between(0, 59)).getTime(), { buyer: BUYER.get(id) });
  }
}

const people = [];
const list = [];
for (const day of DAYS) {
  const planned = slots.get(dayKey(day.date));
  const spare = Math.max(0, day.count - planned.length);
  for (let i = 0; i < spare; i++) {
    const back = people.length > 40 && chance(0.24);
    planned.push({ time: timeIn(day.date), buyer: back ? pick(people) : null });
  }
  planned.sort((a, b) => a.time - b.time);
  for (const slotted of planned) {
    if (slotted.time > NOW.getTime()) continue;
    if (slotted.recent) {
      const { buyer, items, ...rest } = slotted.recent;
      list.push(build({ ...rest, customer: BUYER.get(buyer), items: items.map(([id, qty]) => line(id, qty)) }));
      continue;
    }
    let customer = slotted.buyer;
    if (!customer) people.push((customer = newBuyer()));
    const company = customer.type === "company";
    const local = customer.city === SHOP.city;
    const delivery = company ? (local ? "courier" : "cdek") : local ? (chance(0.45) ? "pickup" : "courier") : chance(0.75) ? "cdek" : "post";
    const method = company ? "invoice" : local ? (chance(0.55) ? "card" : "cash") : delivery === "cdek" && chance(0.08) ? "cash" : "card";
    const hour = new Date(slotted.time).getHours();
    const source = company ? (chance(0.5) ? "manual" : "cart") : chance(0.04) && hour >= 9 && hour < 21 ? "manual" : chance(0.1) ? "click" : "cart";
    const items = company ? tradeBasket(customer.id) : basket();
    const comment = !company && chance(0.16) ? pick(COMMENTS) : "";
    list.push(build({ seed: Math.floor(rand() * 2 ** 32), created: slotted.time, customer, items, delivery, method, source, comment }));
  }
}

/* Номера — по времени оформления (дни и заказы в дне уже по порядку); счета —
   сквозные по времени выставления. */
const FIRST_NUMBER = 12604;
list.forEach((order, at) => { order.number = FIRST_NUMBER + at; order.id = String(order.number); });
const invoices = list.filter((order) => order.payment.method === "invoice")
  .flatMap((order) => historyOf(order).filter((event) => event.kind === "invoice").map((event) => [event, order]))
  .sort((a, b) => a[0].at - b[0].at);
invoices.forEach(([event, order], at) => { event.invoice = 171 + at; order.payment.invoice = event.invoice; });

/* Все заказы, новые сверху. */
export const ORDERS = list.reverse();
let NEXT_NUMBER = ORDERS[0].number + 1;

const BY_ID = new Map(ORDERS.map((order) => [order.id, order]));
export const orderOf = (id) => BY_ID.get(String(id)) ?? null;


/* ---- Покупатели со сводкой ------------------------------------------------------ */

/* Покупатели, у которых есть заказы, со сводкой; последние сверху — в каком
   порядке покупатель впервые встречается в заказах от новых к старым. */
export const CUSTOMERS = (() => {
  const list = [];
  for (const order of ORDERS) {
    const customer = order.customer;
    if (!customer.orders) {
      customer.lastOrder = order.created;
      list.push(customer);
    }
    customer.orders += 1;
    customer.firstOrder = order.created;
    if (order.status !== "canceled") customer.spent += order.total;
  }
  return list;
})();
export const customerOf = (id) => BUYER.get(id) ?? null;

/* ---- Данные сайта вместо демо ---------------------------------------------------

   Когда админка открыта на сайте и администратор вошёл, js/data/live.js приносит
   заказы и покупателей сайта (/admin-old/shop/live), и они встают на место демо —
   в те же ORDERS, CUSTOMERS и карты по id, поэтому страницы ничего об этом не
   знают. Остальные разделы остаются на демо-данных.

   Статусы сайта — свой справочник; в виде админки их пять, и каждый статус
   сайта встаёт в свой по смыслу: отменённый, конечный, «отправлен», новый,
   остальные — «в работе». Неизвестные способы доставки и оплаты дописываются
   в справочники под своими названиями. */
const LIVE_SOURCE = { cart: "cart", quick: "click", app: "cart", admin: "manual", import: "manual" };

export function useLive(data) {
  const statuses = new Map(data.statuses.map((status) => [status.key, status]));
  const statusOf = (key) => {
    const status = statuses.get(key);
    if (!status) return key === "new" ? "new" : "work";
    if (status.is_cancelled) return "canceled";
    if (status.is_final) return "done";
    if (key === "new") return "new";
    if (key === "shipped" || /отправ|в пути/i.test(status.name)) return "sent";
    return "work";
  };
  for (const [key, name] of Object.entries(data.deliveries ?? {})) DELIVERY[key] ??= { id: key, label: name };
  for (const [key, name] of Object.entries(data.payments ?? {})) PAYMENTS[key] ??= { id: key, label: name };
  DELIVERY.none ??= { id: "none", label: L("Not chosen", "Не выбрана") };
  PAYMENTS.none ??= { id: "none", label: L("Not chosen", "Не выбрана") };

  BUYER.clear();
  const buyerOf = (row) => {
    const key = row.user_id ? `u${row.user_id}` : `g${(row.customer.phone || row.customer.email || row.customer.name || row.id).toString().replace(/\W+/g, "")}`;
    let buyer = BUYER.get(key);
    if (!buyer) {
      const name = row.customer?.name || row.name || row.customer?.email || row.email || L("No name", "Без имени");
      buyer = add({ id: key, type: "person", name, phone: row.customer?.phone ?? row.phone ?? "", email: row.customer?.email ?? row.email ?? "", city: "", address: row.address ?? "", tone: TONES[BUYER.size % TONES.length], initials: initialsOf(name), ...STATS });
    }
    return buyer;
  };
  for (const user of data.customers) buyerOf({ user_id: user.id, customer: user, id: user.id });

  const orders = data.orders.map((row) => {
    const order = {
      id: String(row.number), number: row.number, engineId: row.id, created: new Date(row.placed_at),
      source: LIVE_SOURCE[row.source] ?? "cart", comment: row.comment ?? "",
      status: statusOf(row.status), customer: buyerOf(row),
      items: row.items.map((item, at) => ({ product: null, id: String(item.product_id ?? `l${at}`), name: item.name, sku: item.article ?? "", price: item.price, qty: item.quantity })),
      delivery: { type: row.delivery && DELIVERY[row.delivery] ? row.delivery : "none", address: row.address ?? "", cost: row.delivery_total },
      payment: { method: row.payment && PAYMENTS[row.payment] ? row.payment : "none", paid: Boolean(row.paid_at) || Boolean(statuses.get(row.status)?.is_paid), failed: false, refunded: false, invoice: null },
      total: row.total, seed: null, problem: null,
    };
    HISTORY.set(order, row.events.map((event) => {
      const at = new Date(event.at ?? row.placed_at).getTime();
      if (event.kind === "created") return { at, kind: "created" };
      if (event.kind === "paid") return { at, kind: "paid", by: event.by_admin ? ME_ID : undefined };
      if (event.status) return { at, kind: "status", to: statusOf(event.status), by: event.by_admin ? ME_ID : undefined, reason: event.comment ?? undefined };
      return { at, kind: "note", text: event.comment ?? "", by: event.by_admin ? ME_ID : undefined };
    }));
    return order;
  });

  ORDERS.splice(0, ORDERS.length, ...orders);
  BY_ID.clear();
  for (const order of ORDERS) BY_ID.set(order.id, order);
  NEXT_NUMBER = (ORDERS[0]?.number ?? 0) + 1;

  CUSTOMERS.length = 0;
  for (const order of ORDERS) {
    const customer = order.customer;
    if (!customer.orders) { customer.lastOrder = order.created; CUSTOMERS.push(customer); }
    customer.orders += 1;
    customer.firstOrder = order.created;
    if (order.status !== "canceled") customer.spent += order.total;
  }
  for (const customer of BUYER.values()) if (!customer.orders) CUSTOMERS.push(customer);
}

/* Заказы покупателя, новые сверху. */
export const ordersOf = (customerId, list = ORDERS) => list.filter((one) => one.customer.id === customerId);

/* ---- Продажи по дням ------------------------------------------------------------- */

/* Выручка и число заказов по дням оформления — те же 180 полных дней, что в
   REVENUE (сегодняшний день ещё идёт). Отменённые не в счёт. */
export function salesByDay(list = ORDERS) {
  const days = new Map(REVENUE.map((day) => [dayKey(day.date), { date: day.date, revenue: 0, orders: 0 }]));
  for (const order of list) {
    const day = order.status === "canceled" ? null : days.get(dayKey(order.created));
    if (!day) continue;
    day.revenue += order.total;
    day.orders += 1;
  }
  return [...days.values()];
}
