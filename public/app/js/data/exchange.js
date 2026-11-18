/* Обмен с 1С: журнал запусков за две недели. Расписание ставят в самой 1С, как
   на сайтах старой CMS: полный обмен (разделы, товары, картинки, характеристики,
   цены, остатки) ночью в 03:00, цены и остатки — каждые два часа с 07:00 до 21:00.
   В старой CMS журнала не было, только «Дата выгрузки» в 1С.

   Ошибки — у товаров каталога (catalog.js), и они объясняют, что видно в
   каталоге: глобус пришёл вчера без цены и фото, звезда на ёлку три дня назад —
   скрытой (даты — как у записей «Контента», content.js: FRESH). Подписи — парой
   «английский, русский», как в catalog.js. */

import { NOW } from "./fixtures.js";
import { L } from "../core/i18n.js";

export const EXCHANGE = {
  system: L("1C:Trade Management 11", "1С:Управление торговлей 11"),
  path: "/1c_exchange.php",
  full: 3,
  every: 2,
  from: 7,
  to: 21,
};

export const RUN_KINDS = {
  full: L("Full exchange", "Полный обмен"),
  offers: L("Prices and stock", "Цены и остатки"),
};

/* Ошибки по товарам; days — сколько дней назад 1С прислала её впервые. */
const ERRORS = [
  { product: "p23", days: 1, text: L("No price in the “Retail” price type, the site shows “Ask for price”", "Нет цены в типе цен «Розничная», на сайте «Уточняйте цену»") },
  { product: "p23", days: 1, text: L("Picture globus-26.jpg is missing from the upload", "В выгрузке нет картинки globus-26.jpg") },
  { product: "p18", days: 3, text: L("Group “New Year” is not linked to a site section, the product was created hidden", "Группа «Новый год» не связана с разделом сайта, товар создан скрытым") },
];
const FAILED = L("1C did not answer in 60 seconds, the exchange was stopped", "1С не ответила за 60 секунд, обмен прерван");

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const rand = seeded(1001);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

/* Запуски с 28 сентября по сегодняшние 09:00, новые сверху. */
const RUNS = (() => {
  const runs = [];
  for (let back = 14; back >= 0; back--) {
    const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - back);
    const at = (hour) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour);
    const errors = ERRORS.filter((error) => back <= error.days);
    runs.push({
      at: at(EXCHANGE.full), kind: "full", seconds: between(240, 420), result: errors.length ? "warn" : "ok", errors,
      counts: (() => {
        /* Товары до глобуса и звезды — без них; у глобуса нет цены и картинки. */
        const globe = back <= 1, star = back <= 3;
        const products = 21 + globe + star;
        return { products, images: products - globe, prices: products - globe, stocks: products, sections: 14 };
      })(),
    });
    for (let hour = EXCHANGE.from; hour <= EXCHANGE.to; hour += EXCHANGE.every) {
      if (at(hour) > NOW) break;
      /* 8 октября в 15:00 1С не ответила; следующий запуск прошёл. */
      const failed = back === 4 && hour === 15;
      runs.push(failed
        ? { at: at(hour), kind: "offers", seconds: 60, result: "error", errors: [], message: FAILED, counts: { prices: 0, stocks: 0 } }
        : { at: at(hour), kind: "offers", seconds: between(18, 52), result: "ok", errors: [], counts: { prices: rand() < 0.3 ? between(1, 6) : 0, stocks: between(hour < 9 ? 1 : 4, 22) } });
    }
  }
  return runs.reverse().map((run, at) => ({ ...run, id: `x${runs.length - at}` }));
})();

export const lastRun = () => RUNS[0];

/* Следующий запуск по расписанию после момента now. */
export function nextRun(now = NOW) {
  for (let hour = EXCHANGE.from; hour <= EXCHANGE.to; hour += EXCHANGE.every) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour);
    if (at > now) return at;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, EXCHANGE.full);
}
