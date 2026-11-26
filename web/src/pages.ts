/* Разделы портала. Каждый — отдельный кусок сборки; preload() тянет его
   заранее, при наведении на пункт меню, поэтому переход мгновенный.
   Новый раздел — строка здесь и файл в pages/. */

import { defineAsyncComponent, type Component } from "vue";
import { House, Briefcase, ListChecks, Users, Workflow, MessagesSquare, UserRound, Settings } from "@lucide/vue";
import { can, isManager } from "./lib/access";

export interface PageDef {
  id: string;
  path: string;
  title: string;
  icon: Component;
  group: string;
  /* Не пункт меню: открывается ссылкой (профиль). */
  hidden?: boolean;
  /* Доступен ли раздел по правам роли (сервер проверяет сам). */
  allowed?: () => boolean;
  load: () => Promise<{ default: Component }>;
}

const once = (load: () => Promise<{ default: Component }>) => {
  let promise: Promise<{ default: Component }> | null = null;
  return () => (promise ??= load());
};

export const PAGES: PageDef[] = [
  { id: "overview", path: "/", title: "Обзор", icon: House, group: "", load: once(() => import("./pages/Overview.vue")) },
  { id: "messenger", path: "/messenger", title: "Мессенджер", icon: MessagesSquare, group: "", load: once(() => import("./pages/Messenger.vue")) },
  { id: "deals", path: "/deals", title: "Сделки", icon: Briefcase, group: "CRM", allowed: () => can("crm", "view"), load: once(() => import("./pages/Deals.vue")) },
  { id: "tasks", path: "/tasks", title: "Задачи", icon: ListChecks, group: "Работа", allowed: () => can("tasks", "view"), load: once(() => import("./pages/Tasks.vue")) },
  { id: "staff", path: "/staff", title: "Сотрудники", icon: Users, group: "Компания", allowed: () => can("staff", "view"), load: once(() => import("./pages/Staff.vue")) },
  { id: "profile", path: "/profile", title: "Профиль", icon: UserRound, group: "Компания", hidden: true, load: once(() => import("./pages/Profile.vue")) },
  { id: "processes", path: "/processes", title: "Бизнес-процессы", icon: Workflow, group: "Компания", allowed: () => can("processes", "view"), load: once(() => import("./pages/Processes.vue")) },
  { id: "settings", path: "/settings", title: "Настройки", icon: Settings, group: "Компания", allowed: isManager, load: once(() => import("./pages/Settings.vue")) },
];

export const views = new Map(PAGES.map((one) => [one.path, defineAsyncComponent({ loader: one.load, delay: 120 })]));
/* Раздел по адресу; закрытый для роли — как неизвестный: обзор. */
export const isAllowed = (one: PageDef) => !one.allowed || one.allowed();
export const pageOf = (path: string) => PAGES.find((one) => one.path === path && isAllowed(one)) ?? PAGES[0];

/* После первого кадра, в простое, подтягиваем все разделы: их мало, и
   любой следующий переход уже не ждёт сеть. */
export function warmUp() {
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 400));
  idle(() => PAGES.forEach((one) => one.load()));
}
