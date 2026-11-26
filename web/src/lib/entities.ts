/* Чаты карточек («task:12», «deal:5»…): что это за карточка, значок и адрес. */
import { Briefcase, FolderKanban, ListChecks, UserRound, Workflow } from "@lucide/vue";
import type { Component } from "vue";
import { href } from "./router";

export interface EntityKind {
  label: string;
  open: string;
  icon: Component;
  url: (id: string) => string;
}

const KINDS: Record<string, EntityKind> = {
  task: { label: "Задача", open: "Открыть задачу", icon: ListChecks, url: (id) => href("/tasks", { open: id }) },
  deal: { label: "Сделка", open: "Открыть сделку", icon: Briefcase, url: (id) => href("/deals", { open: id }) },
  project: { label: "Проект", open: "Открыть проект", icon: FolderKanban, url: (id) => href("/tasks", { project: id }) },
  process: { label: "Бизнес-процесс", open: "Открыть процесс", icon: Workflow, url: (id) => href("/processes", { open: id }) },
  staff: { label: "Сотрудник", open: "Открыть профиль", icon: UserRound, url: (id) => href("/profile", { id }) },
};

export function entityOf(entity?: string | null): (EntityKind & { id: string; href: string }) | null {
  const [kind, id] = (entity ?? "").split(":");
  const one = KINDS[kind];
  return one && id ? { ...one, id, href: one.url(id) } : null;
}

/* «Задача: Сверить счета» → «Сверить счета»: тип и так виден по метке. */
export function entityTitle(title: string, entity?: string | null): string {
  const one = entityOf(entity);
  return one && title.startsWith(`${one.label}: `) ? title.slice(one.label.length + 2) : title;
}
