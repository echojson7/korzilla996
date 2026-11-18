/* Планирование: работа раз в кадр и уступка главному потоку между кусками. */

/* const place = frame(() => …); place(); place(); — один вызов в ближайшем кадре.
   place.cancel() — отменить, place.flush() — выполнить сейчас, если ждёт. */
export function frame(fn) {
  let id = 0;
  const run = () => {
    id = 0;
    fn();
  };
  const schedule = () => {
    id ||= requestAnimationFrame(run);
  };
  schedule.cancel = () => {
    if (id) cancelAnimationFrame(id);
    id = 0;
  };
  schedule.flush = () => {
    if (!id) return;
    cancelAnimationFrame(id);
    run();
  };
  return schedule;
}

/* Отдать поток браузеру между кусками долгой работы. scheduler.yield не
   откладывает задачу в конец очереди и не зажимается до 4 мс, как вложенный
   setTimeout; где его нет — MessageChannel. */
export function yieldToMain() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

/* Кусок работы по времени: const spent = slice(8); while (…) { …; if (spent()) await yieldToMain(); } */
export function slice(ms = 8) {
  let start = performance.now();
  return () => {
    const now = performance.now();
    if (now - start < ms) return false;
    start = now;
    return true;
  };
}
