/* Демо-данные портала: сотрудники и отделы, воронки и сделки, задачи, шаблоны
   бизнес-процессов из Битрикс24. Даты считаются от сегодняшнего дня, чтобы
   демо выглядело живым. Сервер портала заменит их своими ответами. */

import { NOW, ME } from "../../js/data/fixtures.js";

export { ME };

NOW.setTime(Date.now());
const DAY = 86400000;
const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
export const day = (offset, hour = 10, minute = 0) => new Date(today.getTime() + offset * DAY + (hour * 60 + minute) * 60000);
export const TODAY = today;

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const word = a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
  return `${n.toLocaleString("ru-RU")} ${word}`;
}

/* ---- Отделы и сотрудники ---------------------------------------------------- */

export const DEPARTMENTS = {
  head: { name: "Руководство", icon: "briefcase" },
  sales: { name: "Продажи", icon: "briefcase" },
  dev: { name: "Разработка", icon: "keyboard" },
  design: { name: "Дизайн", icon: "palette" },
  seo: { name: "Продвижение", icon: "rocket" },
  support: { name: "Поддержка", icon: "message-circle" },
  finance: { name: "Бухгалтерия", icon: "calculator" },
};

const initials = (name) => name.split(" ").map((part) => part[0]).join("");
const person = (id, name, dept, role, tone, phone, extra = {}) => ({ id, name, dept, role, tone, phone, initials: initials(name), email: `${id}@korzilla.ru`, ...extra });

export const STAFF = [
  person("kirill", "Кирилл Андреев", "head", "Директор", "violet", "+7 917 255-10-01", { head: true }),
  person("olga", "Ольга Гарипова", "head", "Операционный директор", "teal", "+7 917 255-10-02"),
  person("denis", "Денис Хабибуллин", "sales", "Руководитель отдела продаж", "blue", "+7 917 255-10-11", { head: true }),
  person("alina", "Алина Зарипова", "sales", "Менеджер по продажам", "pink", "+7 917 255-10-12"),
  person("roman", "Роман Шайхутдинов", "sales", "Менеджер по продажам", "amber", "+7 917 255-10-13", { away: "В отпуске до " }),
  person("artem", "Артём Сафин", "dev", "Ведущий разработчик", "green", "+7 917 255-10-21", { head: true }),
  person("ilya", "Илья Мухаметов", "dev", "Разработчик", "red", "+7 917 255-10-22"),
  person("timur", "Тимур Галиев", "dev", "Верстальщик", "olive", "+7 917 255-10-23"),
  person("dina", "Дина Валиева", "design", "Арт-директор", "orange", "+7 917 255-10-31", { head: true }),
  person("ksenia", "Ксения Миронова", "design", "Дизайнер", "teal", "+7 917 255-10-32"),
  person("marat", "Марат Ибрагимов", "seo", "SEO-специалист", "blue", "+7 917 255-10-41", { head: true }),
  person("elena", "Елена Кузнецова", "seo", "Контент-менеджер", "violet", "+7 917 255-10-42"),
  person("ruslan", "Руслан Ахметов", "support", "Специалист поддержки", "amber", "+7 917 255-10-51", { head: true }),
  person("nadia", "Надежда Сорокина", "finance", "Главный бухгалтер", "green", "+7 917 255-10-61", { head: true }),
];
STAFF.find((one) => one.id === "roman").away += new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(day(9));

export const WHO = Object.fromEntries(STAFF.map((one) => [one.id, one]));

/* Вошедший сотрудник — директор: так в демо видно всё. */
Object.assign(ME, WHO.kirill, { permissions: ["*"] });

/* ---- Воронки и сделки ------------------------------------------------------- */

export const FUNNELS = {
  sites: {
    name: "Сайты",
    stages: [
      ["new", "Новая заявка", "blue"], ["need", "Выявление потребности", "blue"], ["offer", "КП отправлено", "violet"],
      ["contract", "Договор", "amber"], ["prepay", "Предоплата", "amber"], ["work", "Разработка", "teal"], ["handover", "Сдача проекта", "green"],
    ],
  },
  seo: {
    name: "Продвижение",
    stages: [["new", "Заявка", "blue"], ["audit", "Аудит", "violet"], ["offer", "КП", "violet"], ["contract", "Договор", "amber"], ["work", "Работы по месяцам", "teal"]],
  },
  support: {
    name: "Поддержка",
    stages: [["new", "Обращение", "blue"], ["estimate", "Оценка", "violet"], ["work", "В работе", "teal"], ["check", "Проверка клиентом", "green"]],
  },
};

const deal = (id, funnel, stage, title, company, sum, owner, created, next = null) => ({ id, funnel, stage, title, company, sum, owner, created: day(-created), next });

export const DEALS = [
  deal(1201, "sites", "new", "Сайт стоматологии", "Клиника «Улыбка»", 180000, "alina", 0, ["Позвонить, уточнить бюджет", 0]),
  deal(1202, "sites", "new", "Интернет-магазин шин", "ООО «Колесо»", 420000, "denis", 1, ["Перезвонить после 15:00", 0]),
  deal(1203, "sites", "new", "Лендинг выставки", "Экспо-Кама", 65000, "alina", 1),
  deal(1196, "sites", "need", "Каталог спецтехники", "КамаТехСнаб", 350000, "denis", 4, ["Встреча в офисе клиента", 1]),
  deal(1194, "sites", "need", "Сайт школы танцев", "Студия «Ритм»", 90000, "alina", 6),
  deal(1188, "sites", "offer", "Корпоративный сайт завода", "АО «Челны-Металл»", 760000, "denis", 9, ["Ждём ответа по КП", 2]),
  deal(1185, "sites", "offer", "Магазин детской одежды", "ИП Хасанова", 240000, "alina", 11, ["Отправить второй вариант КП", -1]),
  deal(1179, "sites", "contract", "Сайт автосервиса", "Автоцентр «Восток»", 150000, "denis", 15, ["Подписание договора", 0]),
  deal(1172, "sites", "prepay", "Портал недвижимости", "АН «Кама-Дом»", 580000, "denis", 20, ["Выставлен счёт на 50%", 3]),
  deal(1160, "sites", "work", "Интернет-магазин мебели", "Мебель-Люкс", 470000, "alina", 34),
  deal(1154, "sites", "work", "Сайт ресторана", "Ресторан «Тюбетей»", 120000, "alina", 41),
  deal(1149, "sites", "handover", "Каталог стройматериалов", "СтройДвор", 310000, "denis", 52, ["Акт на подпись", 1]),
  deal(2041, "seo", "new", "Продвижение магазина цветов", "Флорика", 35000, "marat", 2, ["Запросить доступы к Метрике", 0]),
  deal(2038, "seo", "audit", "Аудит и рост трафика", "Медтехника", 45000, "marat", 6),
  deal(2035, "seo", "offer", "SEO под регионы", "КамаТехСнаб", 60000, "denis", 10, ["Созвон по КП", 1]),
  deal(2030, "seo", "contract", "Продвижение клиники", "Клиника «Здоровье»", 40000, "marat", 14),
  deal(2022, "seo", "work", "Ежемесячное продвижение", "Мебель-Люкс", 30000, "marat", 70),
  deal(2019, "seo", "work", "Контекст и SEO", "Автоцентр «Восток»", 55000, "marat", 95),
  deal(3110, "support", "new", "Не работает форма заявки", "Ресторан «Тюбетей»", 3000, "ruslan", 0, ["Ответить клиенту", 0]),
  deal(3108, "support", "estimate", "Новый раздел «Акции»", "Мебель-Люкс", 18000, "ruslan", 2),
  deal(3105, "support", "work", "Перенос на новый хостинг", "СтройДвор", 12000, "ilya", 4, ["Перенос ночью", 1]),
  deal(3101, "support", "check", "Правки в каталоге", "Медтехника", 6000, "timur", 7),
];

/* ---- Задачи ----------------------------------------------------------------- */

export const TASK_STATES = {
  new: { label: "Новая", tone: "blue" },
  work: { label: "Выполняется", tone: "amber" },
  review: { label: "На проверке", tone: "violet" },
  done: { label: "Завершена", tone: "green" },
};

const task = (id, title, owner, author, deadline, state, deal = null, extra = {}) => ({ id, title, owner, author, deadline: deadline == null ? null : day(deadline, 18), state, deal, ...extra });

export const TASKS = [
  task(501, "Согласовать структуру сайта стоматологии", "kirill", "alina", 0, "work", 1201),
  task(502, "Подписать договор с Автоцентром «Восток»", "kirill", "denis", 0, "new", 1179),
  task(503, "Проверить отчёт по продвижению за месяц", "kirill", "marat", 1, "review", 2022),
  task(504, "Утвердить отпуск Р. Шайхутдинова", "kirill", "roman", -1, "new"),
  task(505, "Макет главной — Мебель-Люкс", "ksenia", "dina", 2, "work", 1160),
  task(506, "Вёрстка каталога мебели", "timur", "artem", 4, "work", 1160),
  task(507, "Импорт товаров из 1С — Мебель-Люкс", "ilya", "artem", 3, "new", 1160),
  task(508, "Перенос СтройДвора на новый хостинг", "ilya", "ruslan", 1, "work", 3105),
  task(509, "Подготовить КП для завода", "denis", "kirill", -2, "work", 1188),
  task(510, "Отправить второй вариант КП", "alina", "denis", -1, "new", 1185),
  task(511, "Аудит сайта Медтехники", "marat", "denis", 2, "work", 2038),
  task(512, "Тексты для раздела «Услуги» клиники", "elena", "marat", 5, "new", 2030),
  task(513, "Починить форму заявки ресторана", "ruslan", "ruslan", 0, "work", 3110),
  task(514, "Выставить счёт на предоплату", "nadia", "denis", 0, "new", 1172),
  task(515, "Акт выполненных работ — СтройДвор", "nadia", "denis", 1, "review", 1149),
  task(516, "Сверка с поставщиком хостинга", "nadia", "olga", 6, "new"),
  task(517, "Логотип для школы танцев", "dina", "alina", 7, "new", 1194),
  task(518, "Регламент передачи проектов в поддержку", "olga", "kirill", 10, "work"),
  task(519, "Настроить Метрику на сайте ресторана", "marat", "alina", -4, "done", 1154),
  task(520, "Свести смету портала недвижимости", "artem", "denis", -3, "done", 1172),
];

/* ---- Бизнес-процессы из Битрикс24 ------------------------------------------- */

/* Шаблоны выгружены из Битрикс24 целиком (дерево действий, параметры,
   переменные). Движка процессов ещё нет: шаблоны лежат и ждут его. */
export const BP_KINDS = {
  deal: { label: "Сделки", icon: "briefcase" },
  lead: { label: "Лиды", icon: "inbox" },
  list: { label: "Списки", icon: "clipboard-list" },
  ai: { label: "ИИ-агенты", icon: "sparkles-ai" },
};

const bp = (id, name, kind, actions, auto = false, extra = {}) => ({ id, name, kind, actions, auto, ...extra });

export const PROCESSES = [
  bp(260, "Весь процесс (запускается автоматически)", "deal", 589, true, { note: "Ведёт сделку по стадиям во всех воронках" }),
  bp(262, "Договор на разработку сайта", "deal", 34),
  bp(264, "Договор на продвижение", "deal", 31),
  bp(266, "Договор на поддержку", "deal", 27),
  bp(270, "Коммерческое предложение", "deal", 22),
  bp(272, "Счёт на предоплату", "deal", 18),
  bp(274, "Счёт на окончательный расчёт", "deal", 18),
  bp(276, "Акт выполненных работ", "deal", 16),
  bp(278, "Акт сверки", "deal", 12),
  bp(280, "Передача проекта в поддержку", "deal", 25),
  bp(282, "Продление продвижения", "deal", 19, true),
  bp(284, "Возврат сделки в работу", "deal", 9),
  bp(286, "Напоминание о неоплаченном счёте", "deal", 11, true),
  bp(288, "Запрос доступов у клиента", "deal", 8),
  bp(290, "Закрывающие документы", "deal", 21),
  bp(292, "Смена воронки", "deal", 7),
  bp(294, "Повторная продажа", "deal", 14),
  bp(1324, "Смена ответственного", "lead", 6, true),
  bp(301, "Касса", "list", 15),
  bp(303, "Исходящие документы", "list", 13),
  bp(305, "Счёт от поставщика", "list", 17),
  bp(307, "Отпуск", "list", 12),
  bp(309, "Командировка", "list", 14),
  bp(311, "Заявка на покупку", "list", 10),
  bp(313, "Служебная записка", "list", 8),
  bp(401, "Оценка звонка менеджера", "ai", 5, true),
  bp(402, "Разбор пропущенных звонков", "ai", 4, true),
  bp(403, "Проверка скрипта продаж", "ai", 5, true),
];

/* ---- Лента ------------------------------------------------------------------ */

export const FEED = [
  { who: "alina", text: "создала сделку «Сайт стоматологии»", at: day(0, 9, 14), icon: "briefcase" },
  { who: "denis", text: "перевёл «Сайт автосервиса» на стадию «Договор»", at: day(0, 9, 2), icon: "arrow-right" },
  { who: "marat", text: "отправил на проверку отчёт по продвижению", at: day(-1, 17, 40), icon: "file-text" },
  { who: "nadia", text: "получила оплату по сделке «Портал недвижимости» — 290 000 ₽", at: day(-1, 15, 5), icon: "banknote" },
  { who: "artem", text: "завершил задачу «Свести смету портала недвижимости»", at: day(-1, 12, 30), icon: "check" },
  { who: "roman", text: "подал заявление на отпуск", at: day(-2, 11, 20), icon: "calendar" },
];
