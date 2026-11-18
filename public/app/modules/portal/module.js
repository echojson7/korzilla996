/* Слой портала Korzilla 996: обзор, CRM, задачи, сотрудники и бизнес-процессы.
   Пока на демо-данных (data.js); сервер портала заменит их своими ответами. */

import { DEALS, TASKS, PROCESSES, WHO, ME, TODAY } from "./data.js";

const open = (task) => task.state !== "done";
const overdue = (task) => open(task) && task.deadline && task.deadline < TODAY;

function register(admin) {
  admin.counters.set("tasks.mine", () => TASKS.filter((task) => task.owner === ME.id && open(task)).length);
  admin.counters.set("deals.new", () => DEALS.filter((deal) => deal.stage === "new").length);
  admin.search.push(() => [
    ...DEALS.map((deal) => ({ group: "Сделки", label: deal.title, hint: deal.company, href: admin.index.href("deals", { query: { funnel: deal.funnel, open: deal.id } }) })),
    ...TASKS.map((task) => ({ group: "Задачи", label: task.title, hint: WHO[task.owner].name, href: admin.index.href("tasks", { query: { open: task.id } }) })),
    ...Object.values(WHO).map((one) => ({ group: "Сотрудники", label: one.name, hint: one.role, href: admin.index.href("staff", { query: { q: one.name } }) })),
  ]);
  admin.actions.set("tasks.overdue", () => admin.go(admin.index.href("tasks", { query: { tab: "overdue" } })));
}

export { overdue, open };

export default {
  id: "portal",
  app: { home: "overview" },
  sections: {
    main: { order: 0 },
    crm: { label: "CRM", order: 10, collapsible: true },
    work: { label: "Работа", order: 20, collapsible: true },
    company: { label: "Компания", order: 30, collapsible: true },
  },
  pages: {
    overview: { path: "", title: "Обзор", icon: "chart-column", load: () => import("./overview/index.js"), width: "wide" },
    deals: { path: "deals", title: "Сделки", icon: "target", load: () => import("./deals/index.js"), width: "wide" },
    tasks: { path: "tasks", title: "Задачи", icon: "clipboard-list", load: () => import("./tasks/index.js"), width: "wide" },
    staff: { path: "staff", title: "Сотрудники", icon: "users", load: () => import("./staff/index.js"), width: "wide" },
    processes: { path: "processes", title: "Бизнес-процессы", icon: "layout-grid", load: () => import("./processes/index.js"), width: "wide" },
  },
  nav: {
    overview: { section: "main", page: "overview", icon: "house", line: true, order: 10 },
    deals: { section: "crm", page: "deals", order: 10, count: "deals.new" },
    tasks: { section: "work", page: "tasks", order: 10, count: "tasks.mine" },
    staff: { section: "company", page: "staff", order: 10 },
    processes: { section: "company", page: "processes", order: 20 },
  },
  rail: {
    home: { label: "Портал", icon: "house", page: "overview", order: 10 },
    deals: { label: "Сделки", icon: "briefcase", page: "deals", order: 20 },
    tasks: { label: "Задачи", icon: "clipboard-list", page: "tasks", order: 30 },
    staff: { label: "Сотрудники", icon: "users", page: "staff", order: 40 },
  },
  commands: {
    theme: { label: "Тёмная тема", icon: "moon", action: "theme", order: 80 },
    overdue: { label: "Просроченные задачи", icon: "clock", action: "tasks.overdue", order: 20 },
  },
  register,
};
