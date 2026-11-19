/* Перенос в массиве (реактивном): убрать элемент и вставить перед before;
   без before — в конец. Колонки фильтруют массив, порядок сохраняется. */
export function moveBefore<T>(list: T[], key: number | string, keyOf: (item: T) => number | string, before: number | string | null) {
  const from = list.findIndex((one) => keyOf(one) === key);
  if (from < 0) return null;
  const [item] = list.splice(from, 1);
  const at = before == null ? -1 : list.findIndex((one) => keyOf(one) === before);
  if (at < 0) list.push(item);
  else list.splice(at, 0, item);
  return item;
}

export interface BoardColumn {
  id: string;
  label: string;
  hue: number;
  total?: string;
}

export interface Column<R> {
  key: string;
  label: string;
  sort?: (row: R) => string | number;
  class?: string;
}
