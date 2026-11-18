/* Порядок строк по ключам — общий для таблицы из разметки (tableSort), виртуальной
   таблицы и её воркера, поэтому без DOM. Ответ сразу на оба направления: таблица
   кэширует его по колонке, и смена направления или повторный выбор не сортируют
   заново. Правила: пустые всегда в конце, равные ключи — в порядке исходных
   индексов в обоих направлениях. */

const MISSING = 0xffffffff;

/* Ключи колонки: числа — Float64Array (пустое — NaN), строки — словарём: ids[i] —
   номер уникальной строки, uniques — сами строки. */
export function keysOf(count, numeric) {
  if (numeric) return { numeric, count, keys: new Float64Array(count) };
  const seen = new Map();
  const job = {
    numeric,
    count,
    ids: new Uint32Array(count),
    uniques: [],
    put(index, value) {
      let id = seen.get(value);
      if (id === undefined) {
        id = job.uniques.length;
        job.uniques.push(value);
        seen.set(value, id);
      }
      job.ids[index] = id;
    },
  };
  return job;
}

/* Числа: пустые (NaN) отдельно, остальные — сортировка индексов с добивкой по
   индексу (устойчиво). Убывание — группы равных ключей в обратном порядке, внутри
   группы порядок исходный. */
export function sortNumbers(keys) {
  const count = keys.length;
  const present = [];
  const missing = [];
  for (let index = 0; index < count; index += 1) {
    if (Number.isFinite(keys[index])) present.push(index);
    else missing.push(index);
  }
  const sorted = Uint32Array.from(present).sort((a, b) => keys[a] - keys[b] || a - b);
  const asc = new Uint32Array(count);
  const desc = new Uint32Array(count);
  asc.set(sorted);
  asc.set(missing, sorted.length);
  let at = 0;
  for (let end = sorted.length - 1; end >= 0; ) {
    let start = end;
    while (start > 0 && keys[sorted[start - 1]] === keys[sorted[end]]) start -= 1;
    desc.set(sorted.subarray(start, end + 1), at);
    at += end - start + 1;
    end = start - 1;
  }
  desc.set(missing, at);
  return { asc, desc };
}

/* Сравнений с коллатором — только между уникальными (у колонки «Кофейня» их шесть
   на 500 000 строк), сами строки раскладываются подсчётом за O(n). */
export function sortStrings(ids, uniques, collator) {
  const count = ids.length;
  const order = Array.from(uniques.keys()).sort((a, b) => collator.compare(uniques[a], uniques[b]));
  const rank = new Uint32Array(uniques.length).fill(MISSING);
  let ranks = 0;
  let previous = null;
  for (const id of order) {
    const value = uniques[id];
    if (value === "") continue;
    if (previous !== null && collator.compare(previous, value) !== 0) ranks += 1;
    rank[id] = ranks;
    previous = value;
  }
  const size = previous === null ? 0 : ranks + 1;
  const counts = new Uint32Array(size + 1);
  let blanks = 0;
  for (let index = 0; index < count; index += 1) {
    const value = rank[ids[index]];
    if (value === MISSING) blanks += 1;
    else counts[value + 1] += 1;
  }
  const up = new Uint32Array(size);
  const down = new Uint32Array(size);
  for (let value = 1; value < size; value += 1) up[value] = up[value - 1] + counts[value];
  for (let value = size - 2; value >= 0; value -= 1) down[value] = down[value + 1] + counts[value + 2];
  const asc = new Uint32Array(count);
  const desc = new Uint32Array(count);
  let tail = count - blanks;
  for (let index = 0; index < count; index += 1) {
    const value = rank[ids[index]];
    if (value === MISSING) {
      asc[tail] = index;
      desc[tail] = index;
      tail += 1;
    } else {
      asc[up[value]++] = index;
      desc[down[value]++] = index;
    }
  }
  return { asc, desc };
}

export const orderOf = (job, collator) => (job.numeric ? sortNumbers(job.keys) : sortStrings(job.ids, job.uniques, collator));
