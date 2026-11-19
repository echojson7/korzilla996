/* Числа, деньги, даты и склонения по-русски. */

const moneyFmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat("ru-RU");
const shortFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const longFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

export const money = (value: number) => moneyFmt.format(value);
export const number = (value: number) => numberFmt.format(value);
export const shortDate = (date: Date) => shortFmt.format(date).replace(".", "");
export const time = (date: Date) => timeFmt.format(date);
export const longDate = (date: Date) => longFmt.format(date);

/* Короткая сумма для шапок колонок: 1,2 млн ₽, 350 тыс ₽. */
export function compactMoney(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  if (value >= 10_000) return `${Math.round(value / 1000).toLocaleString("ru-RU")} тыс ₽`;
  return money(value);
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const word = a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
  return `${n.toLocaleString("ru-RU")} ${word}`;
}

export const DAY = 86_400_000;
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
