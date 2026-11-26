/* Поля сделки для условий и робота «Изменить поля»: основные + свои. */
import { computed } from "vue";
import { crm } from "../../../lib/crm";
import { robots } from "../../../lib/robots";

export interface FieldDef { key: string; title: string; type: string; options?: { id: string; label: string }[] }

/** Для условий: всё, по чему можно проверить сделку. */
export const conditionFields = computed<FieldDef[]>(() => [
  ...robots.keys.map((one) => ({ key: one.key, title: one.title, type: one.type })),
  ...crm.fields.filter((one) => one.type !== "file").map((one) => ({ key: one.code, title: one.title + (one.active ? "" : " (выкл.)"), type: one.type, options: one.options })),
]);

/** Что робот может записать. */
export const writableFields = computed<FieldDef[]>(() => [
  { key: "title", title: "Название", type: "string" },
  { key: "amount", title: "Сумма", type: "number" },
  { key: "close_date", title: "Дата завершения", type: "date" },
  { key: "comments", title: "Комментарий", type: "text" },
  ...crm.fields.filter((one) => one.type !== "file" && one.active).map((one) => ({ key: one.code, title: one.title, type: one.type, options: one.options })),
]);

/** Поля-даты: от них можно отсчитать задержку. */
export const dateFields = computed<FieldDef[]>(() => [
  { key: "close_date", title: "Дата завершения", type: "date" },
  ...crm.fields.filter((one) => one.type === "date" || one.type === "datetime").map((one) => ({ key: one.code, title: one.title, type: one.type })),
]);

export const fieldTitle = (key: string) => conditionFields.value.find((one) => one.key === key)?.title ?? key;
