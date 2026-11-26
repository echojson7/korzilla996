/* Демо-данные портала: сотрудники и отделы, воронки и сделки, задачи,
   шаблоны бизнес-процессов из Битрикс24 и лента. Даты считаются от сегодня,
   чтобы демо выглядело живым. Сервер портала заменит их своими ответами. */

import { reactive } from "vue";
import { DAY, startOfDay } from "./format";

export type Tone = "accent" | "success" | "warning" | "danger" | "default";

export const TODAY = startOfDay(new Date());
export const day = (offset: number, hour = 10, minute = 0) => new Date(TODAY.getTime() + offset * DAY + (hour * 60 + minute) * 60_000);

/* ---- Отделы и сотрудники ---- */

export interface Department {
  id: string;
  name: string;
}
export const DEPARTMENTS: Department[] = [
  { id: "head", name: "Руководство" },
  { id: "sales", name: "Продажи" },
  { id: "dev", name: "Разработка" },
  { id: "design", name: "Дизайн" },
  { id: "seo", name: "Продвижение" },
  { id: "support", name: "Поддержка" },
  { id: "finance", name: "Бухгалтерия" },
];
export const DEPT = Object.fromEntries(DEPARTMENTS.map((one) => [one.id, one]));

export interface Person {
  id: string;
  name: string;
  dept: string;
  role: string;
  hue: number;
  phone: string;
  email: string;
  initials: string;
  head?: boolean;
  away?: string;
}

const awayTill = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(day(9));
const person = (id: string, name: string, dept: string, role: string, hue: number, phone: string, extra: Partial<Person> = {}): Person => ({
  id, name, dept, role, hue, phone, email: `${id}@korzilla.ru`,
  initials: name.split(" ").map((part) => part[0]).join(""),
  ...extra,
});

export const STAFF: Person[] = [
  person("kirill", "Кирилл Андреев", "head", "Директор", 290, "+7 917 255-10-01", { head: true }),
  person("olga", "Ольга Гарипова", "head", "Операционный директор", 190, "+7 917 255-10-02"),
  person("denis", "Денис Хабибуллин", "sales", "Руководитель отдела продаж", 250, "+7 917 255-10-11", { head: true }),
  person("alina", "Алина Зарипова", "sales", "Менеджер по продажам", 350, "+7 917 255-10-12"),
  person("roman", "Роман Шайхутдинов", "sales", "Менеджер по продажам", 70, "+7 917 255-10-13", { away: `В отпуске до ${awayTill}` }),
  person("artem", "Артём Сафин", "dev", "Ведущий разработчик", 150, "+7 917 255-10-21", { head: true }),
  person("ilya", "Илья Мухаметов", "dev", "Разработчик", 25, "+7 917 255-10-22"),
  person("timur", "Тимур Галиев", "dev", "Верстальщик", 110, "+7 917 255-10-23"),
  person("dina", "Дина Валиева", "design", "Арт-директор", 45, "+7 917 255-10-31", { head: true }),
  person("ksenia", "Ксения Миронова", "design", "Дизайнер", 200, "+7 917 255-10-32"),
  person("marat", "Марат Ибрагимов", "seo", "SEO-специалист", 230, "+7 917 255-10-41", { head: true }),
  person("elena", "Елена Кузнецова", "seo", "Контент-менеджер", 300, "+7 917 255-10-42"),
  person("ruslan", "Руслан Ахметов", "support", "Специалист поддержки", 80, "+7 917 255-10-51", { head: true }),
  person("nadia", "Надежда Сорокина", "finance", "Главный бухгалтер", 140, "+7 917 255-10-61", { head: true }),
];
export const WHO: Record<string, Person> = Object.fromEntries(STAFF.map((one) => [one.id, one]));

/* Вошедший в демо — директор: так видно всё. С сервером имя и должность
   берутся из учётки (см. session.ts). */
export const ME_ID = "kirill";

/* ---- Воронки и сделки ---- */

export interface Stage {
  id: string;
  label: string;
  hue: number;
}
export interface Funnel {
  id: string;
  name: string;
  stages: Stage[];
}
const stage = (id: string, label: string, hue: number): Stage => ({ id, label, hue });
export const FUNNELS: Funnel[] = [
  {
    id: "sites", name: "Сайты",
    stages: [stage("new", "Новая заявка", 240), stage("need", "Выявление потребности", 220), stage("offer", "КП отправлено", 285), stage("contract", "Договор", 60), stage("prepay", "Предоплата", 40), stage("work", "Разработка", 190), stage("handover", "Сдача проекта", 145)],
  },
  {
    id: "seo", name: "Продвижение",
    stages: [stage("new", "Заявка", 240), stage("audit", "Аудит", 285), stage("offer", "КП", 300), stage("contract", "Договор", 60), stage("work", "Работы по месяцам", 190)],
  },
  {
    id: "support", name: "Поддержка",
    stages: [stage("new", "Обращение", 240), stage("estimate", "Оценка", 285), stage("work", "В работе", 190), stage("check", "Проверка клиентом", 145)],
  },
];
export const FUNNEL = Object.fromEntries(FUNNELS.map((one) => [one.id, one]));

export interface Deal {
  id: number;
  funnel: string;
  stage: string;
  title: string;
  company: string;
  sum: number;
  owner: string;
  created: Date;
  next: { text: string; at: number } | null;
  /* Описание в Markdown. */
  text?: string;
}
const deal = (id: number, funnel: string, stage: string, title: string, company: string, sum: number, owner: string, created: number, next: [string, number] | null = null): Deal => ({
  id, funnel, stage, title, company, sum, owner, created: day(-created), next: next && { text: next[0], at: next[1] },
});

export const deals = reactive<Deal[]>([
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
]);

/* ---- Задачи ---- */

export type TaskState = "new" | "work" | "review" | "done";
export const TASK_STATES: { id: TaskState; label: string; tone: Tone; hue: number }[] = [
  { id: "new", label: "Новая", tone: "accent", hue: 240 },
  { id: "work", label: "Выполняется", tone: "warning", hue: 60 },
  { id: "review", label: "На проверке", tone: "default", hue: 285 },
  { id: "done", label: "Завершена", tone: "success", hue: 145 },
];
export const TASK_STATE = Object.fromEntries(TASK_STATES.map((one) => [one.id, one])) as Record<TaskState, (typeof TASK_STATES)[number]>;

export interface Task {
  id: number;
  title: string;
  owner: string;
  author: string;
  deadline: Date | null;
  state: TaskState;
  deal: number | null;
  important?: boolean;
  text?: string;
}
const task = (id: number, title: string, owner: string, author: string, deadline: number | null, state: TaskState, deal: number | null = null, extra: Partial<Task> = {}): Task => ({
  id, title, owner, author, deadline: deadline == null ? null : day(deadline, 18), state, deal, ...extra,
});

export const tasks = reactive<Task[]>([
  task(501, "Согласовать структуру сайта стоматологии", "kirill", "alina", 0, "work", 1201, { important: true }),
  task(502, "Подписать договор с Автоцентром «Восток»", "kirill", "denis", 0, "new", 1179),
  task(503, "Проверить отчёт по продвижению за месяц", "kirill", "marat", 1, "review", 2022),
  task(504, "Утвердить отпуск Р. Шайхутдинова", "kirill", "roman", -1, "new"),
  task(505, "Макет главной — Мебель-Люкс", "ksenia", "dina", 2, "work", 1160),
  task(506, "Вёрстка каталога мебели", "timur", "artem", 4, "work", 1160),
  task(507, "Импорт товаров из 1С — Мебель-Люкс", "ilya", "artem", 3, "new", 1160),
  task(508, "Перенос СтройДвора на новый хостинг", "ilya", "ruslan", 1, "work", 3105, { important: true }),
  task(509, "Подготовить КП для завода", "denis", "kirill", -2, "work", 1188),
  task(510, "Отправить второй вариант КП", "alina", "denis", -1, "new", 1185),
  task(511, "Аудит сайта Медтехники", "marat", "denis", 2, "work", 2038),
  task(512, "Тексты для раздела «Услуги» клиники", "elena", "marat", 5, "new", 2030),
  task(513, "Починить форму заявки ресторана", "ruslan", "ruslan", 0, "work", 3110, { important: true }),
  task(514, "Выставить счёт на предоплату", "nadia", "denis", 0, "new", 1172),
  task(515, "Акт выполненных работ — СтройДвор", "nadia", "denis", 1, "review", 1149),
  task(516, "Сверка с поставщиком хостинга", "nadia", "olga", 6, "new"),
  task(517, "Логотип для школы танцев", "dina", "alina", 7, "new", 1194),
  task(518, "Регламент передачи проектов в поддержку", "olga", "kirill", 10, "work"),
  task(519, "Настроить Метрику на сайте ресторана", "marat", "alina", -4, "done", 1154),
  task(520, "Свести смету портала недвижимости", "artem", "denis", -3, "done", 1172),
]);

export const isOpen = (one: Task) => one.state !== "done";
export const isOverdue = (one: Task) => isOpen(one) && one.deadline != null && one.deadline < TODAY;

/* ---- Бизнес-процессы из Битрикс24 ---- */

export const BP_KINDS = [
  { id: "deal", label: "Сделки" },
  { id: "lead", label: "Лиды" },
  { id: "list", label: "Списки" },
  { id: "ai", label: "ИИ-агенты" },
];
export const BP_KIND = Object.fromEntries(BP_KINDS.map((one) => [one.id, one]));

export interface Process {
  id: number;
  name: string;
  kind: string;
  actions: number;
  auto: boolean;
  note?: string;
}
const bp = (id: number, name: string, kind: string, actions: number, auto = false, note?: string): Process => ({ id, name, kind, actions, auto, note });

export const PROCESSES: Process[] = [
  bp(260, "Весь процесс (запускается автоматически)", "deal", 589, true, "Ведёт сделку по стадиям во всех воронках"),
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

/* ---- Лента ---- */

export interface FeedEntry {
  who: string;
  text: string;
  at: Date;
}
export const FEED: FeedEntry[] = [
  { who: "alina", text: "создала сделку «Сайт стоматологии»", at: day(0, 9, 14) },
  { who: "denis", text: "перевёл «Сайт автосервиса» на стадию «Договор»", at: day(0, 9, 2) },
  { who: "marat", text: "отправил на проверку отчёт по продвижению", at: day(-1, 17, 40) },
  { who: "nadia", text: "получила оплату по сделке «Портал недвижимости» — 290 000 ₽", at: day(-1, 15, 5) },
  { who: "artem", text: "завершил задачу «Свести смету портала недвижимости»", at: day(-1, 12, 30) },
  { who: "roman", text: "подал заявление на отпуск", at: day(-2, 11, 20) },
];
