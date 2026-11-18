/* Общие наблюдатели кита. Один ResizeObserver на всё: колбэк получает записи и
   сначала даёт всем подписчикам прочитать геометрию (read), потом — записать
   (write). N компонентов стоят одной раскладки, а не N вынужденных.

     const stop = observeSize(el, { read: (entry) => box, write: (box) => … });
     const stop = observeSize(el, (entry) => …);   // одна функция — это write без read

   Первый колбэк приходит после первой раскладки — им и делается первое измерение,
   без синхронного чтения в create. Цель, за которой уже следят, наблюдатель
   переподписывает: новый подписчик получает свой первый колбэк, а прежним он
   приходит, только если размер и правда сменился. Отписавшийся посреди пачки
   колбэков (его снял чужой write) своего уже не получит. Свою наблюдаемую высоту
   в колбэке не меняйте: это цикл наблюдателя. */

/* target → { subs, fresh: ждут первого колбэка, width, height: последний размер }. */
const sizeTargets = new Map();
let sizeObserver = null;

function onResize(entries) {
  const jobs = [];
  for (const entry of entries) {
    const record = sizeTargets.get(entry.target);
    if (!record) continue;
    const { width, height } = entry.contentRect;
    const changed = width !== record.width || height !== record.height;
    record.width = width;
    record.height = height;
    for (const sub of changed ? record.subs : record.fresh) jobs.push([sub, entry, record]);
    record.fresh.clear();
  }
  const live = ([sub, , record]) => record.subs.has(sub) && sizeTargets.get(record.target) === record;
  const reads = jobs.map((job) => (live(job) ? (job[0].read ? job[0].read(job[1]) : job[1]) : null));
  jobs.forEach((job, at) => live(job) && job[0].write?.(reads[at]));
}

export function observeSize(target, handler) {
  const sub = typeof handler === "function" ? { write: handler } : handler;
  sizeObserver ??= new ResizeObserver(onResize);
  let record = sizeTargets.get(target);
  if (!record) {
    sizeTargets.set(target, (record = { target, subs: new Set(), fresh: new Set(), width: -1, height: -1 }));
    sizeObserver.observe(target);
  } else {
    /* Повторный observe — колбэк с текущим размером после ближайшей раскладки. */
    record.fresh.add(sub);
    sizeObserver.unobserve(target);
    sizeObserver.observe(target);
  }
  record.subs.add(sub);
  return () => {
    record.subs.delete(sub);
    record.fresh.delete(sub);
    if (record.subs.size || sizeTargets.get(target) !== record) return;
    sizeTargets.delete(target);
    sizeObserver.unobserve(target);
  };
}

/* Видимость: один IntersectionObserver на rootMargin. Колбэк — (isVisible, entry). */
const visibleObservers = new Map();

export function observeVisible(target, callback, { rootMargin = "0px" } = {}) {
  let record = visibleObservers.get(rootMargin);
  if (!record) {
    const subs = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) for (const fn of subs.get(entry.target) ?? []) fn(entry.isIntersecting, entry);
    }, { rootMargin });
    visibleObservers.set(rootMargin, (record = { subs, observer }));
  }
  let fns = record.subs.get(target);
  if (!fns) {
    record.subs.set(target, (fns = new Set()));
    record.observer.observe(target);
  }
  fns.add(callback);
  return () => {
    fns.delete(callback);
    if (fns.size || record.subs.get(target) !== fns) return;
    record.subs.delete(target);
    record.observer.unobserve(target);
  };
}
