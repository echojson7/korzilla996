/* Заявки с сайта — как в старой CMS («Заявки и заказы»): письма с форм, запросы
   обратного звонка и отзывы, которые ждут проверки. 180 дней по сегодняшнее утро:
   выходные и сегодняшнее утро записаны вручную, раньше — генератор с зерном, и всё
   старое уже разобрано. Сколько заявок приходит в день, следует за посещаемостью
   сайта (REVENUE.visitors) — график обзора и список сходятся.

   Тексты писали покупатели, поэтому они по-русски в любом языке интерфейса;
   подписи (виды, формы, состояния) — парой «английский, русский», как в
   catalog.js. Состояние меняют страницы прямо в этом списке (setStatus): до
   бэкенда — до перезагрузки. */

import { NOW, REVENUE, ME } from "./fixtures.js";
import { PRODUCTS } from "./catalog.js";
import { L } from "../core/i18n.js";

const HOUR = 3600e3;
const MINUTE = 60e3;

export const KINDS = {
  letter: { label: L("Letters", "Письма"), one: L("Letter", "Письмо"), icon: "mail" },
  call: { label: L("Callbacks", "Звонки"), one: L("Callback", "Звонок"), icon: "phone" },
  review: { label: L("Reviews", "Отзывы"), one: L("Review", "Отзыв"), icon: "star" },
};

/* Состояния по видам: первое — новое, ждёт ответа. Тоны — по правилам страниц:
   новое синее, ждёт — янтарь, сделано — зелёное, закрыто и скрыто — серое. */
export const STATES = {
  letter: {
    new: { label: L("New", "Новое"), tone: "blue" },
    answered: { label: L("Answered", "Отвечено"), tone: "green" },
    closed: { label: L("Closed", "Закрыто"), tone: "gray" },
  },
  call: {
    new: { label: L("Call back", "Перезвонить"), tone: "blue" },
    missed: { label: L("No answer", "Не дозвонились"), tone: "amber" },
    done: { label: L("Called back", "Перезвонили"), tone: "green" },
  },
  review: {
    new: { label: L("To check", "На проверке"), tone: "amber" },
    published: { label: L("Published", "Опубликован"), tone: "green" },
    hidden: { label: L("Hidden", "Скрыт"), tone: "gray" },
  },
};
export const stateOf = (request) => STATES[request.kind][request.status];
/* Ждёт ответа: новое письмо и звонок, недозвон, отзыв на проверке. */
export const isOpen = (request) => request.status === "new" || request.status === "missed";

/* Формы сайта, с которых приходят письма. */
export const FORMS = {
  question: L("Product question", "Вопрос о товаре"),
  feedback: L("Feedback", "Обратная связь"),
  wholesale: L("Wholesale buyers", "Оптовым покупателям"),
};

const product = (id) => PRODUCTS.find((item) => item.id === id);
export const pageOf = (id) => `/catalog/${product(id).slug}/`;

/* ---- Генератор -------------------------------------------------------------- */

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const rand = seeded(2026);
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (share) => rand() < share;

const MEN = ["Алексей", "Дмитрий", "Ильнур", "Рустам", "Сергей", "Андрей", "Тимур", "Айдар", "Олег", "Павел", "Михаил", "Артур", "Ринат", "Евгений", "Владимир", "Марсель"];
const WOMEN = ["Елена", "Гульнара", "Ольга", "Наталья", "Алсу", "Татьяна", "Ирина", "Лейсан", "Мария", "Юлия", "Анна", "Динара", "Светлана", "Регина", "Екатерина", "Альбина"];
const SURNAMES = ["Сафин", "Галиев", "Кузнецов", "Петров", "Хайруллин", "Николаев", "Мухаметзянов", "Соколов", "Ахметов", "Зарипов", "Морозов", "Шарипов", "Гарипов", "Лебедев", "Валиев", "Фёдоров", "Нуриев", "Васильев", "Каримов", "Белов"];
/* Город — чаще Челны, где магазин; веса повторами. */
const CITIES = ["Набережные Челны", "Набережные Челны", "Набережные Челны", "Набережные Челны", "Казань", "Казань", "Нижнекамск", "Нижнекамск", "Елабуга", "Альметьевск", "Зеленодольск", "Чистополь", "Менделеевск", "Заинск", "Бугульма", "Уфа", "Ижевск", "Москва"];
const MAIL = ["mail.ru", "yandex.ru", "gmail.com", "bk.ru", "inbox.ru"];
const CODES = ["917", "927", "937", "987", "919", "960", "965", "950", "903"];

const LAT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
const latin = (text) => [...text.toLowerCase()].map((char) => LAT[char] ?? char).join("");
const digits = (n) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join("");

function person() {
  const woman = chance(0.55);
  const first = pick(woman ? WOMEN : MEN);
  const last = `${pick(SURNAMES)}${woman ? "а" : ""}`;
  return {
    first, name: `${first} ${last}`, city: pick(CITIES),
    email: chance(0.6) ? `${latin(first)}.${latin(last)}@${pick(MAIL)}` : `${latin(last)}${digits(2)}@${pick(MAIL)}`,
    phone: `+7 ${pick(CODES)} ${digits(3)}-${digits(2)}-${digits(2)}`,
  };
}

/* Товар, о котором спрашивают и пишут отзыв: чаще продаваемый. */
const SOLD = PRODUCTS.filter((item) => !item.draft && item.sold > 0);
const TOTAL_SOLD = SOLD.reduce((sum, item) => sum + item.sold, 0);
function popular() {
  let at = rand() * TOTAL_SOLD;
  return SOLD.find((item) => (at -= item.sold) < 0) ?? SOLD[0];
}

const QUESTIONS = [
  "Есть в наличии? Хочу забрать сегодня после работы.",
  "Подскажите размеры в упаковке — проверить, войдёт ли в постамат.",
  "Можно оплатить при получении? И сколько ехать до {city}?",
  "Когда будет поступление? Нужно к выходным.",
  "Есть подарочная упаковка?",
  "Если взять пять штук, будет скидка?",
  "А другой цвет бывает?",
];
const FEEDBACK = [
  ["Где мой заказ", "Заказ оформила в понедельник, трек не обновляется. Подскажите, где посылка?"],
  ["Смена адреса", "Нужно поменять адрес доставки, переезжаем на другую квартиру."],
  ["Счёт для юрлица", "Нужен счёт на оплату от ООО, реквизиты пришлю в ответ."],
  ["Режим работы", "Работаете в субботу? Хотим приехать в магазин сами."],
  ["Замена товара", "Пришла кружка со сколом. Как оформить замену?"],
  ["Самовывоз", "Можно забрать заказ самовывозом? Удобно после 18:00."],
];
/* Благодарность и реклама — закрывают без ответа. */
const NO_REPLY = [
  ["Спасибо", "Спасибо за быструю доставку, всё пришло целым!"],
  ["Сотрудничество", "Предлагаем продвижение сайта в поиске, первые результаты через месяц. Пришлите телефон для связи."],
];
const WHOLESALE = [
  "Мы кофейня в городе {city}, интересуют кружки и наборы для пуровера оптом. Пришлите прайс и условия.",
  "Гостиница на 40 номеров, нужны полотенца и коврики для ванной, около 80 комплектов.",
  "Ищем подарочные наборы к Новому году, около 150 штук, с логотипом на коробке.",
  "Магазин интерьера, город {city}. Какие условия для дизайнеров и магазинов?",
];
const REPLIES = {
  question: ["Добрый день! Да, есть в наличии, можем отправить сегодня.", "Здравствуйте! Поступление на следующей неделе, можем отложить для вас.", "Добрый день! Доставка в {city} — 2–3 дня, оплатить можно при получении."],
  feedback: ["Добрый день! Посылка в пути, трек обновится сегодня вечером.", "Здравствуйте! Всё поменяли, курьер привезёт по новому адресу.", "Добрый день! Счёт отправили на почту."],
  wholesale: ["Добрый день! Прайс и условия для опта отправили на почту. Минимальный заказ — 30 000 ₽."],
};
const CALL_NOTES = ["Оформили заказ по телефону", "Рассказали про доставку, клиент оформит на сайте", "Отложили товар до субботы", "Ответили про наличие", "Договорились о самовывозе"];

/* Отзывы: о товаре — свои слова, о магазине — общие. Оценка 5 — чаще всего. */
const ABOUT = {
  p1: ["Плед мягкий, цвет как на фото.", "Взяли второй в подарок маме — понравился.", "Лён после стирки стал ещё приятнее."],
  p2: ["Воронка устойчивая, чайник льёт тонкой струйкой — то, что нужно.", "Набор красивый, только чайник маловат на двоих."],
  p3: ["Доска тяжёлая, не скользит по столу.", "Хорошая доска, пропитали маслом — как новая."],
  p4: ["Войлок плотный, мышь ходит отлично."],
  p5: ["Графин тонкий, но крепкий, пробка плотная."],
  p6: ["Сковорода тяжёлая, жарит ровно. После прокаливания ничего не липнет."],
  p7: ["Кружки увесистые, долго держат тепло."],
  p9: ["Лампа очень красивая, свет тёплый."],
  p10: ["Полотенца пушистые, хорошо впитывают."],
  p11: ["Часы тихие, ночью не слышно."],
  p12: ["Бумага плотная, ручка не просвечивает."],
  p13: ["Свеча горит ровно, запах не резкий."],
  p19: ["Календарь большой, удобно записывать дела."],
  p22: ["Брали в подарок коллеге, коробка очень красивая."],
};
const STORE = {
  5: ["Всё пришло быстро и целым. Спасибо!", "Доставили на следующий день, упаковано аккуратно.", "Менеджер перезвонил через пять минут, помог с выбором."],
  4: ["Хорошо, но доставка заняла почти неделю.", "Товар понравился, коробка пришла помятой."],
  3: ["Нормально, но ожидала плотнее.", "Цвет немного отличается от фото."],
  2: ["Курьер опоздал на два часа и не предупредил.", "Пришло с царапиной, поменяли, но пришлось ждать."],
  1: ["Заказ отменили через три дня без объяснений."],
};
const ANSWERS = {
  good: ["Спасибо за отзыв! Рады, что понравилось.", "Спасибо! Ждём вас снова."],
  bad: ["Извините за задержку. Мы сменили службу доставки, такого больше не повторится.", "Напишите нам номер заказа — заменим или вернём деньги."],
};
const rating = () => { const at = rand(); return at < 0.62 ? 5 : at < 0.84 ? 4 : at < 0.92 ? 3 : at < 0.97 ? 2 : 1; };
const fill = (text, who) => text.replace("{city}", who.city);

const at = (date, hours) => new Date(+date + hours * HOUR);
const log = (when, status, note = "") => ({ at: when, status, by: ME, note });

/* Одна заявка прошлого: уже разобрана. */
function past(kind, created) {
  const who = person();
  if (kind === "letter") {
    const form = pick(["question", "question", "question", "feedback", "feedback", "wholesale"]);
    const item = form === "question" ? popular() : null;
    const quiet = form === "feedback" && chance(0.15) ? pick(NO_REPLY) : null;
    const [subject, text] = form === "question" ? ["", pick(QUESTIONS)] : form === "wholesale" ? ["", pick(WHOLESALE)] : quiet ?? pick(FEEDBACK);
    const answered = at(created, 0.5 + rand() * 5);
    return {
      kind, created, name: who.name, email: who.email, city: who.city, form, subject, text: fill(text, who),
      product: item?.id ?? null, page: item ? pageOf(item.id) : form === "wholesale" ? "/help/wholesale/" : "/contacts/",
      status: quiet ? "closed" : "answered",
      log: [quiet ? log(answered, "closed") : log(answered, "answered", fill(pick(REPLIES[form]), who))],
    };
  }
  if (kind === "call") {
    const from = 10 + 2 * Math.floor(rand() * 5);
    const window = chance(0.3) ? null : [from, from + 2];
    const first = at(created, 0.2 + rand() * 1.5);
    const missed = chance(0.12);
    return {
      kind, created, name: chance(0.4) ? who.first : who.name, phone: who.phone, city: who.city, window,
      product: null, page: chance(0.5) ? "/" : "/contacts/", status: "done",
      log: missed ? [log(first, "missed"), log(at(first, 2 + rand() * 3), "done", pick(CALL_NOTES))] : [log(first, "done", pick(CALL_NOTES))],
    };
  }
  const stars = rating();
  const item = chance(0.7) ? popular() : null;
  const own = item && ABOUT[item.id] && stars >= 4 ? ABOUT[item.id] : STORE[stars];
  const checked = at(created, 1 + rand() * 20);
  const hidden = chance(0.06);
  const answer = !hidden && (stars <= 3 || chance(0.2)) ? pick(stars <= 3 ? ANSWERS.bad : ANSWERS.good) : "";
  return {
    kind, created, name: who.name, email: who.email, city: who.city, rating: stars, text: pick(own),
    product: item?.id ?? null, page: item ? pageOf(item.id) : "/about/reviews/",
    status: hidden ? "hidden" : "published",
    log: [log(checked, hidden ? "hidden" : "published", answer)],
  };
}

/* ---- Записанные вручную: суббота, воскресенье и утро понедельника ----------- */

const day = (offset, hour, minute = 0) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset, hour, minute);
const RECENT = [
  /* Сегодня — всё новое. */
  { kind: "call", created: day(0, 9, 52), name: "Ильнур", phone: "+7 917 284-35-61", city: "Набережные Челны", window: [12, 14], product: "p6", page: pageOf("p6"), status: "new", log: [] },
  { kind: "letter", created: day(0, 9, 47), name: "Гульнара Хайруллина", email: "gulnara.kh@mail.ru", city: "Казань", form: "question", subject: "", product: "p2", page: pageOf("p2"), status: "new", log: [],
    text: "Здравствуйте! Набор для пуровера ещё есть? Нужно два, хочу подарить коллегам в пятницу. Успеете доставить в Казань до четверга?" },
  { kind: "call", created: day(0, 8, 36), name: "Татьяна Морозова", phone: "+7 927 451-08-92", city: "Елабуга", window: null, product: null, page: "/", status: "new", log: [] },
  { kind: "letter", created: day(0, 8, 24), name: "Ринат Мухаметзянов", email: "zakupki@kofeiny-dvor.ru", city: "Нижнекамск", form: "wholesale", subject: "Опт для кофейни", product: null, page: "/help/wholesale/", status: "new", log: [],
    text: "Добрый день. Открываем вторую кофейню в Нижнекамске, нужны кружки по 350 мл — 60 штук и 10 наборов для пуровера. Пришлите оптовые цены и сроки. Счёт на ООО «Кофейный двор»." },
  { kind: "review", created: day(0, 7, 55), name: "Ольга Сафина", email: "olga.safina@mail.ru", city: "Набережные Челны", rating: 5, product: "p1", page: pageOf("p1"), status: "new", log: [],
    text: "Плед даже мягче, чем на фото. Графит как на сайте, после стирки не сел. Возьму ещё один на дачу." },
  /* Воскресенье — не разобрано. */
  { kind: "letter", created: day(-1, 21, 34), name: "Елена Петрова", email: "petrova.lena@yandex.ru", city: "Набережные Челны", form: "feedback", subject: "Самовывоз", product: null, page: "/contacts/", status: "new", log: [],
    text: "Можно забрать заказ самовывозом в Челнах? Живу рядом с проспектом Мира, удобно после 19:00." },
  { kind: "review", created: day(-1, 22, 10), name: "Алина Хабибуллина", email: "alina.hab@mail.ru", city: "Казань", rating: 5, product: "p7", page: pageOf("p7"), status: "new", log: [],
    text: "Кружки увесистые, держат тепло. Упаковали каждую отдельно, ничего не разбилось." },
  { kind: "review", created: day(-1, 19, 3), name: "Максим Егоров", email: "m.egorov@yandex.ru", city: "Уфа", rating: 4, product: "p9", page: pageOf("p9"), status: "new", log: [],
    text: "Лампа красивая, свет тёплый. Минус звезда — провод короче, чем хотелось бы, пришлось брать удлинитель." },
  { kind: "call", created: day(-1, 17, 12), name: "Айдар Галиев", phone: "+7 987 213-66-40", city: "Нижнекамск", window: [18, 20], product: null, page: "/contacts/", status: "missed",
    log: [log(day(-1, 18, 5), "missed", "Не взял трубку, перезвонить утром")] },
  { kind: "review", created: day(-1, 14, 26), name: "Денис Кузьмин", email: "kuzmin.denis@bk.ru", city: "Елабуга", rating: 2, product: null, page: "/about/reviews/", status: "new", log: [],
    text: "Заказ привезли на день позже, курьер не позвонил заранее. Сам товар хороший, но осадок остался." },
  /* Суббота — разобрано. */
  { kind: "letter", created: day(-2, 16, 40), name: "Светлана Гарипова", email: "zakupki@hotel-kama.ru", city: "Набережные Челны", form: "feedback", subject: "Счёт для юрлица", product: null, page: "/contacts/", status: "answered",
    text: "Пришлите, пожалуйста, счёт на 40 банных полотенец для гостиницы «Кама». Реквизиты во вложении.",
    log: [log(day(-2, 17, 25), "answered", "Светлана, добрый день! Счёт отправили на почту, отгрузим в течение двух дней после оплаты.")] },
  { kind: "call", created: day(-2, 11, 20), name: "Марат", phone: "+7 960 048-12-77", city: "Набережные Челны", window: [12, 14], product: null, page: "/", status: "done",
    log: [log(day(-2, 12, 10), "done", "Оформили заказ по телефону: две сковороды и доска")] },
  { kind: "review", created: day(-2, 10, 5), name: "Эльвира Шакирова", email: "elvira.shakirova@inbox.ru", city: "Зеленодольск", rating: 5, product: "p3", page: pageOf("p3"), status: "published",
    text: "Толстая и тяжёлая, не скользит по столу. Пропитали маслом — выглядит отлично.", log: [log(day(-2, 10, 40), "published")] },
  { kind: "letter", created: day(-2, 9, 12), name: "Павел Зайцев", email: "pavel.zaytsev@yandex.ru", city: "Ижевск", form: "question", subject: "", product: "p5", page: pageOf("p5"), status: "answered",
    text: "Когда снова будет графин? Нужен к выходным.", log: [log(day(-2, 10, 5), "answered", "Павел, поступление в среду, 14 октября. Можем отложить один для вас.")] },
  { kind: "review", created: day(-2, 8, 47), name: "Кирилл", email: "best.earn24@gmail.com", city: "", rating: 5, product: "p12", page: pageOf("p12"), status: "hidden",
    text: "Заработок в интернете от 5000 в день, пиши в телеграм", log: [log(day(-2, 9, 0), "hidden")] },
];

/* Прошлое — до субботы: столько заявок в день, сколько даёт посещаемость. */
const OLD = REVENUE.slice(0, -2);
const meanVisitors = OLD.reduce((sum, item) => sum + item.visitors, 0) / OLD.length;
const RATES = { letter: [2.1, 1.6], call: [1.4, 0.6], review: [0.8, 0.8] }; // [будни, выходные]
const PAST = [];
for (const { date, visitors } of OLD) {
  const weekend = [0, 6].includes(date.getDay());
  for (const kind of Object.keys(RATES)) {
    const count = Math.round(RATES[kind][weekend ? 1 : 0] * (visitors / meanVisitors) * (0.4 + rand() * 1.2));
    for (let n = 0; n < count; n++) {
      const hour = kind === "call" ? 8 + rand() * 12 : 7 + rand() * 16.5;
      PAST.push(past(kind, new Date(+date + hour * HOUR + Math.floor(rand() * 60) * MINUTE)));
    }
  }
}

/* Новые сверху; номер — по порядку прихода, как в старой CMS. */
export const REQUESTS = [...PAST, ...RECENT]
  .sort((a, b) => a.created - b.created)
  .map((request, at) => ({ ...request, id: `r${3187 + at}`, number: 3187 + at }))
  .reverse();

/* Заявки по дням за те же 180 дней, что продажи (REVENUE), — для графика обзора. */
export const REQUESTS_BY_DAY = REVENUE.map(({ date }) => {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { date, count: REQUESTS.filter((request) => request.created >= date && request.created < end).length };
});

/* Демо-часы: с открытия админки идёт время от NOW. */
const OPENED = Date.now();
export const clock = () => new Date(+NOW + (Date.now() - OPENED));

/* Сменить состояние: запись в истории с автором и необязательной заметкой (текст
   ответа, итог звонка). */
export function setStatus(request, status, note = "") {
  request.status = status;
  request.log.push({ at: clock(), status, by: ME, note });
}
