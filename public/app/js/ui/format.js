/* Числа, деньги, проценты, даты — по языку интерфейса. */

import { locale, t } from "../core/i18n.js";

/* Рубли: «1 234 ₽», с копейками — «8 214,60 ₽». В английском интерфейсе знак тот же. */
const MONEY = new Intl.NumberFormat(locale, { style: "currency", currency: "RUB", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat(locale, { style: "currency", currency: "RUB", currencyDisplay: "narrowSymbol" });
const NUMBER = new Intl.NumberFormat(locale);
const FIXED = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
const DECIMAL = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const FULL_DATE = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
const LONG_DATE = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
const WEEKDAY_DATE = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
const asDate = (value) => (value instanceof Date ? value : new Date(value));

export const money = (n, cents = false) => (cents ? CENTS : MONEY).format(n);
export const number = (n) => NUMBER.format(n);
export const percent = (n) => `${n > 0 ? "+" : ""}${FIXED.format(n)}%`;
export const shortDate = (date) => DATE.format(date);
export const time = (date) => TIME.format(date);
/* «4,0» — знак после запятой всегда; «4» / «4,2» — только если он есть. */
export const fixed = (n) => FIXED.format(n);
export const decimal = (n) => DECIMAL.format(n);
/* «3 нояб. 2026 г.», «3 ноября 2026 г.», «понедельник, 3 ноября»; дата или ISO. */
export const fullDate = (date) => FULL_DATE.format(asDate(date));
export const longDate = (date) => LONG_DATE.format(asDate(date));
export const weekdayDate = (date) => WEEKDAY_DATE.format(asDate(date));

/* Адрес из названия — та же таблица, что у движка (src/Core/Structure/Slugger.php),
   чтобы подсказанный адрес совпадал с тем, что сохранит сервер. */
const LATIN = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "i", є: "e", ґ: "g", ў: "u", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h",
  ä: "a", ö: "o", ü: "u", ß: "ss", é: "e", è: "e", ç: "c", ñ: "n", å: "a", ø: "o", æ: "ae", "№": "n", "&": "and", "+": "plus", "%": "percent",
};
export const slugify = (text, max = 60) => [...String(text ?? "").trim().toLowerCase()].map((char) => LATIN[char] ?? char).join("")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");

/* Id новой записи в демо: префикс, время, случайный хвост. */
export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* «3h ago» до суток, дальше дата. */
export function ago(date, now) {
  const hours = Math.round((now - date) / 3600e3);
  return hours < 1 ? t("now") : hours < 24 ? t("{n}h ago", { n: hours }) : shortDate(date);
}
