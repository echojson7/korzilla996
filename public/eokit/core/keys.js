/* Клавиатура в коллекциях: куда ведёт клавиша и поиск по первым буквам.

     const next = moveIndex(event, index, count, { orientation: "vertical", loop: true });
     if (next !== null) { event.preventDefault(); setActive(next); }

   columns > 1 — сетка (календарь, годы): стрелки по строкам и столбцам; шаг по
   столбцу за край сетки — null, а не соседняя ячейка. index -1 — «ничего не выбрано»: шаг
   вперёд ведёт на первый пункт, назад — на последний. Пропуск недоступных —
   skip(index) → true. */

const VERTICAL = { ArrowDown: 1, ArrowUp: -1 };
const HORIZONTAL = { ArrowRight: 1, ArrowLeft: -1 };

export function moveIndex(event, index, count, { orientation = "vertical", loop = false, rtl = false, columns = 1, skip = null } = {}) {
  if (!count || event.altKey || event.ctrlKey || event.metaKey) return null;
  const { key } = event;
  const valid = (at) => !skip?.(at);
  if (key === "Home" || key === "End") {
    const dir = key === "Home" ? 1 : -1;
    for (let at = dir > 0 ? 0 : count - 1; at >= 0 && at < count; at += dir) if (valid(at)) return at;
    return null;
  }
  const flip = rtl ? -1 : 1;
  let step = 0;
  if (columns > 1) step = key in VERTICAL ? VERTICAL[key] * columns : key in HORIZONTAL ? HORIZONTAL[key] * flip : 0;
  else if (orientation !== "horizontal" && key in VERTICAL) step = VERTICAL[key];
  else if (orientation !== "vertical" && key in HORIZONTAL) step = HORIZONTAL[key] * flip;
  if (!step) return null;

  /* Шаг на один пункт — идём, пропуская недоступные, по кругу при loop. Ничего не
     выбрано — назад идём от конца. */
  if (Math.abs(step) === 1) {
    let at = index < 0 && step < 0 ? count : index;
    for (let tries = 0; tries < count; tries += 1) {
      at += step;
      if (at < 0 || at >= count) {
        if (!loop) return null;
        at = (at + count) % count;
      }
      if (valid(at)) return at;
    }
    return null;
  }
  /* Строка сетки: за краем ячейки нет. Затем назад к ближайшему доступному. */
  if (index + step < 0 || index + step >= count) return null;
  let at = index + step;
  while (at !== index && !valid(at)) at -= Math.sign(step);
  return at === index ? null : at;
}

/* Поиск по буквам: набранное собирается, пауза 750 мс сбрасывает. Повтор одной
   буквы листает пункты на неё, если первые буквы у пунктов разные.

     const find = typeahead(() => labels);
     const at = find(event.key, activeIndex);   // индекс или -1 */
export function typeahead(labels, { reset = 750 } = {}) {
  let query = "";
  let timer = 0;
  return (key, from = -1) => {
    if (key.length !== 1 || key === " " && !query) return -1;
    clearTimeout(timer);
    timer = setTimeout(() => (query = ""), reset);
    const char = key.toLocaleLowerCase();
    const list = labels().map((label) => String(label ?? "").trim().toLocaleLowerCase());
    const repeat = query.length > 0 && [...query].every((c) => c === char);
    query += char;
    const needle = repeat ? char : query;
    const start = repeat || query.length === 1 ? from + 1 : Math.max(from, 0);
    for (let step = 0; step < list.length; step += 1) {
      const at = (start + step) % list.length;
      if (list[at].startsWith(needle)) return at;
    }
    return -1;
  };
}
