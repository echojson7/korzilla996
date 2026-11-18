/* Язык интерфейса: русский (по умолчанию) и английский (исходный). Ключ словаря — английская
   строка, {имя} — подстановка. Подпись из манифеста бывает строкой (идёт через
   словарь) или объектом { en, ru } — так модуль клиента приносит свой перевод.
   Язык читается один раз при загрузке; переключение перезагружает страницу. */

import { RU, RU_PLURAL } from "./ru.js";

export const LANGS = { en: "EN", ru: "RU" };
const KEY = "kza.lang";
export const lang = (() => { try { return localStorage.getItem(KEY) === "en" ? "en" : "ru"; } catch { return "ru"; } })();
export const locale = lang === "ru" ? "ru-RU" : "en-US";
document.documentElement.lang = lang;

const fill = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match)) : text);

export const t = (text, vars) => fill(lang === "ru" ? RU[text] ?? text : text, vars);

/* То же слово в другом месте: Completed у заказа — «Выполнен», у вкладки заказов — «Выполненные». */
export const tc = (where, text, vars) => fill(lang === "ru" ? RU[`${where}|${text}`] ?? RU[text] ?? text : text, vars);

/* Подпись манифеста: строка или { en, ru }. */
export const label = (value, vars) =>
  value == null ? "" : typeof value === "object" ? fill(value[lang] ?? value.en ?? Object.values(value)[0] ?? "", vars) : t(value, vars);

/* Строка на двух языках прямо в коде (демо-данные, тексты экранов без словаря). */
export const L = (en, ru) => (lang === "ru" ? ru : en);

/* Число со словом: формы английского — [одна, много], русского — [1, 2–4, 5+]. */
const EN_PLURAL = {
  order: ["{n} order", "{n} orders"],
  selected: ["{n} selected", "{n} selected"],
  account: ["{n} account", "{n} accounts"],
};
const rules = new Intl.PluralRules(locale);
const RU_INDEX = { one: 0, few: 1, many: 2, other: 1 };

export function tn(n, key) {
  const form = rules.select(n);
  const text = lang === "ru" ? RU_PLURAL[key][RU_INDEX[form]] : EN_PLURAL[key][form === "one" ? 0 : 1];
  return fill(text, { n });
}

/* Модуль приносит свой словарь: addWords(RU_модуля, RU_PLURAL_модуля, EN_PLURAL_модуля).
   Звать на импорте словаря модуля — до первых t() его страниц. */
export function addWords(ru = {}, ruPlural = {}, enPlural = {}) {
  Object.assign(RU, ru);
  Object.assign(RU_PLURAL, ruPlural);
  Object.assign(EN_PLURAL, enPlural);
}

export function setLang(next) {
  if (next === lang || !LANGS[next]) return;
  try { localStorage.setItem(KEY, next); } catch {}
  location.reload();
}
