/* Жест указателем: смахнуть лист или тост, перетащить окно, строку, край столбца.

     element.addEventListener("pointerdown", (event) => track(event, {
       axis: "y", slop: 6,
       onStart() {}, onMove({ dx, dy }) {}, onEnd({ dx, dy, vx, vy, completed }) {},
     }));

   До порога slop жест не начат: движение поперёк оси отдаёт его браузеру
   (прокрутке). После — захват указателя, onMove не чаще кадра, скорость по
   последним 100 мс. Отмена — pointercancel, потеря захвата или Esc (completed:
   false). Начатый жест гасит следующий click: отпускание над кнопкой не нажмёт её.
   Слушатели окна живут только на время жеста; cancel() после конца — ничего. */

export const SWIPE = { slop: 6, share: 0.35, velocity: 0.45 };
const WINDOW = 100;

export function track(event, { axis = null, slop = 0, capture = event.target, onStart, onMove, onEnd } = {}) {
  const { pointerId: id, clientX: x0, clientY: y0 } = event;
  const controller = new AbortController();
  const samples = [];
  let started = false;
  let done = false;
  let raf = 0;
  let last = { dx: 0, dy: 0, x: x0, y: y0 };

  const flush = () => {
    raf = 0;
    onMove?.(last);
  };

  function velocity(time) {
    const recent = samples.filter(([at]) => time - at <= WINDOW);
    if (recent.length < 2) return { vx: 0, vy: 0 };
    const [t0, x1, y1] = recent[0];
    const [t1, x2, y2] = recent[recent.length - 1];
    const span = t1 - t0;
    return span > 0 ? { vx: (x2 - x1) / span, vy: (y2 - y1) / span } : { vx: 0, vy: 0 };
  }

  /* Один раз: cancel() после конца или из onEnd не повторит onMove и onEnd. */
  function stop(completed, time = performance.now()) {
    if (done) return;
    done = true;
    controller.abort();
    if (!started) return;
    try {
      capture?.releasePointerCapture?.(id);
    } catch {}
    if (raf) cancelAnimationFrame(raf);
    flush();
    if (completed) swallowClick(event.pointerType);
    onEnd?.({ ...last, ...velocity(time), completed });
  }

  const { signal } = controller;
  window.addEventListener("pointermove", (next) => {
    if (next.pointerId !== id) return;
    const dx = next.clientX - x0;
    const dy = next.clientY - y0;
    if (!started) {
      const along = axis === "x" ? Math.abs(dx) : axis === "y" ? Math.abs(dy) : Math.hypot(dx, dy);
      const across = axis === "x" ? Math.abs(dy) : axis === "y" ? Math.abs(dx) : 0;
      if (across > slop && across > along) return stop(false);
      if (along < slop) return;
      started = true;
      try {
        capture?.setPointerCapture?.(id);
      } catch {}
      onStart?.(last);
      /* onStart отменил жест: onEnd уже прошёл, кадра с движением после него нет. */
      if (signal.aborted) return;
    }
    samples.push([next.timeStamp, dx, dy]);
    if (samples.length > 32) samples.splice(0, samples.length - 32);
    last = { dx, dy, x: next.clientX, y: next.clientY };
    raf ||= requestAnimationFrame(flush);
  }, { signal });
  window.addEventListener("pointerup", (up) => up.pointerId === id && stop(true, up.timeStamp), { signal });
  window.addEventListener("pointercancel", (up) => up.pointerId === id && stop(false, up.timeStamp), { signal });
  /* Потеря захвата всплывает: на касании браузер сам захватывает указатель узлом
     под пальцем, и наш setPointerCapture отнимает захват у него — его
     lostpointercapture пришёл бы к capture снизу. Отмена — только своя потеря. */
  capture?.addEventListener?.("lostpointercapture", (lost) => lost.target === capture && lost.pointerId === id && started && stop(false, lost.timeStamp), { signal });
  window.addEventListener("keydown", (key) => {
    if (key.key !== "Escape" || !started) return;
    key.preventDefault();
    key.stopPropagation();
    stop(false);
  }, { signal, capture: true });

  return { cancel: () => stop(false) };
}

/* Жест закончился над тем же элементом — следом придёт click: гасим один. У мыши
   он идёт в той же задаче, что и pointerup. Касание и перо, сдвинутые меньше
   порога касания (~15 px), дают click отдельной задачей позже, а на странице без
   meta viewport — через ~300 мс: ждём до следующего нажатия, не дольше 400 мс. */
const TAP_CLICK = 400;

function swallowClick(pointerType) {
  const tap = pointerType !== "mouse";
  const swallow = (click) => {
    click.preventDefault();
    click.stopPropagation();
  };
  const off = () => {
    clearTimeout(timer);
    window.removeEventListener("click", swallow, { capture: true });
    window.removeEventListener("pointerdown", off, { capture: true });
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  if (tap) window.addEventListener("pointerdown", off, { capture: true, once: true });
  const timer = setTimeout(off, tap ? TAP_CLICK : 0);
}

/* Бросок: прошёл долю пути или летел быстрее порога. */
export const isFling = (distance, size, speed) => distance > size * SWIPE.share || speed > SWIPE.velocity;
