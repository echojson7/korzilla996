/* Порядок строк таблицы с рендером строк — вне главного потока. Ключи приходят
   без копирования (числа — Float64Array, строки — словарём), ответ — порядок на
   оба направления. Коллатор — на языке страницы и с теми же правилами, что
   collator() ядра: таблица сортирует одинаково здесь и без воркера. */

import { orderOf } from "./table-order.js";

const collators = new Map();

self.onmessage = (event) => {
  const { token, lang, job } = event.data;
  let collator = collators.get(lang);
  if (!collator) collators.set(lang, (collator = new Intl.Collator(lang, { numeric: true, sensitivity: "base" })));
  const { asc, desc } = orderOf(job, collator);
  self.postMessage({ token, asc, desc }, [asc.buffer, desc.buffer]);
};
