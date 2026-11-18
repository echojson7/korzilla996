/* Перекладка с анимацией (FLIP): замер до, правка DOM, замер после, разница
   уходит анимацией сдвига к нулю (slide). Прерванные сдвиги складываются, а не
   прыгают: ничего не нужно читать из текущего transform.

     flip(items, () => list.append(row), { duration: 200, easing: "ease-out" });

   measure(el) → число по вертикали (по умолчанию offsetTop: раскладка без трансформов).
   При reduced motion — только правка. Возвращает карту «элемент → новое
   положение», её можно взять как кеш раскладки. */

import { reducedMotion, readMs, readVar } from "./tokens.js";

/* Сдвиг к месту. Складывается (composite add) с прежним, только пока тот ещё
   идёт: аддитивную анимацию Chromium не отдаёт композитору, и она пересчитывает
   стиль каждый кадр, а одиночная едет на композиторе. */
const sliding = new WeakMap();

export function slide(element, keyframes, timing) {
  const running = sliding.get(element) ?? 0;
  const animation = element.animate(keyframes, { ...timing, composite: running ? "add" : "replace" });
  sliding.set(element, running + 1);
  const done = () => sliding.set(element, sliding.get(element) - 1);
  animation.finished.then(done, done);
  return animation;
}

export function flip(items, mutate, { measure = (el) => el.offsetTop, duration = 200, easing = "ease-out" } = {}) {
  const list = () => (typeof items === "function" ? items() : [...items]);
  if (reducedMotion()) {
    mutate();
    return null;
  }
  const before = new Map(list().map((item) => [item, measure(item)]));
  mutate();
  const after = new Map(list().map((item) => [item, measure(item)]));
  for (const [item, to] of after) {
    const from = before.get(item);
    if (from === undefined) continue;
    const shift = from - to;
    if (Math.abs(shift) < 0.5) continue;
    slide(item, [{ transform: `translate3d(0, ${shift}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], { duration, easing });
  }
  return after;
}

/* Промис конца текущих анимаций элементов: getAnimations сбрасывает стиль, поэтому
   только что выставленное состояние уже играет. Нет анимаций — сразу. */
export function settled(...elements) {
  const running = elements.flatMap((element) => element?.getAnimations() ?? []);
  return running.length ? Promise.allSettled(running.map((animation) => animation.finished)) : Promise.resolve();
}

/* Резиновый край: за пределом смещение растёт всё туже и к limit только
   приближается. resistance — доля хода пальца в начале: RUBBER — как у прокрутки
   iOS, 1 — податливее. Знак distance сохраняется. Пружина назад — токены
   --ui-ease-spring и --ui-duration-spring. */
export const RUBBER = 0.55;

export function rubber(distance, limit, resistance = 1) {
  if (!distance || !(limit > 0)) return 0;
  return Math.sign(distance) * limit * (1 - 1 / ((Math.abs(distance) * resistance) / limit + 1));
}

/* ---- Пружины ---------------------------------------------------------------

   springEasing — кривая linear() затухающей пружины и время, за которое она
   успокаивается (отклонение меньше 0,2 %). Задаётся как в SwiftUI: response —
   время одного качания, bounce — доля перелёта (0 — без перелёта). Токены
   --ui-spring* посчитаны ею же (tools/springs.mjs), в рантайме её зовут только
   для своей пружины. */
export function springEasing({ response = 0.3, bounce = 0 } = {}) {
  const w0 = (2 * Math.PI) / response;
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const at = (t) => (zeta >= 1 ? 1 - Math.exp(-w0 * t) * (1 + w0 * t) : 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t)));
  let end = 0;
  for (let t = 0; t < 3; t += 0.001) if (Math.abs(1 - at(t)) > 0.002) end = t;
  const duration = Math.ceil(end * 100) * 10;
  const count = Math.min(40, Math.max(16, Math.round(duration / 12)));
  const points = [];
  for (let i = 0; i <= count; i++) points.push(i === count ? "1" : String(Number(at((end * i) / count).toFixed(3))));
  return { easing: `linear(${points.join(", ")})`, duration };
}

/* Тайминг пружины-токена для element.animate: --ui-spring, --ui-spring-bounce,
   --ui-spring-smooth, --ui-spring-press. Длительность — токен с суффиксом -time. */
export function springTiming(source, name = "--ui-spring") {
  const styles = source instanceof Element ? getComputedStyle(source) : source;
  return { easing: readVar(styles, name, "ease-out"), duration: readMs(styles, `${name}-time`, 300) };
}

/* Вход элемента пружиной: появился в разметке — подрастает из точки origin.
   from — начальный кадр (по умолчанию чуть меньше и прозрачный). При reduced
   motion — ничего. */
export function pop(element, { from = { opacity: 0, transform: "scale(0.92)" }, spring = "--ui-spring-bounce", origin } = {}) {
  if (!element || reducedMotion()) return null;
  if (origin) element.style.transformOrigin = origin;
  const timing = springTiming(element, spring);
  return element.animate([from, { opacity: 1, transform: "none" }], { ...timing, composite: "replace" });
}

/* Толчок: значение поменялось (счётчик, сумма, бейдж) — элемент коротко
   подпрыгивает. Повтор во время толчка перезапускает его, а не копит. */
const bumping = new WeakMap();
export function bump(element, { scale = 1.18 } = {}) {
  if (!element || reducedMotion()) return null;
  bumping.get(element)?.cancel();
  const timing = springTiming(element, "--ui-spring-press");
  const animation = element.animate([{ transform: `scale(${scale})` }, { transform: "none" }], timing);
  bumping.set(element, animation);
  return animation;
}

/* Уход элемента из списка: он гаснет и сжимается, затем удаляется, а соседи
   ниже доезжают на его место (flip). Возвращает промис конца. */
export async function leave(element, { siblings = () => [...(element.parentElement?.children ?? [])], remove = true } = {}) {
  if (!element) return;
  if (reducedMotion()) {
    if (remove) element.remove();
    return;
  }
  const styles = getComputedStyle(element);
  const out = readMs(styles, "--ui-duration-surface-out", 100);
  const fade = element.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], { duration: out, easing: readVar(styles, "--ui-ease-in", "ease-in"), fill: "forwards" });
  await fade.finished.catch(() => {});
  const others = () => siblings().filter((node) => node !== element && node.isConnected);
  const timing = springTiming(styles, "--ui-spring");
  flip(others, () => (remove ? element.remove() : (element.hidden = true)), timing);
}

/* ---- Уровень движения ------------------------------------------------------

   full — всё как задумано; lite — для слабых машин: без каскадов, без перелётов,
   без анимации раскладки, короче; off — переходов нет (как reduced motion).
   Атрибут data-ui-motion на <html>, токены — tokens.css. Выбор хранится в
   localStorage «ui-motion»; «auto» решает по железу: до четырёх ядер или
   до четырёх гигабайт памяти — lite. */
const MOTION_KEY = "ui-motion";

function weakDevice() {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8;
  return cores <= 4 || memory <= 4 || navigator.connection?.saveData === true;
}

export function getMotion() {
  return document.documentElement.dataset.uiMotion || "full";
}

export function getMotionChoice() {
  try {
    return localStorage.getItem(MOTION_KEY) || "auto";
  } catch {
    return "auto";
  }
}

export function setMotion(choice = "auto") {
  try {
    if (choice === "auto") localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, choice);
  } catch {}
  const level = choice === "auto" ? (weakDevice() ? "lite" : "full") : choice;
  const root = document.documentElement;
  if (level === "full") delete root.dataset.uiMotion;
  else root.dataset.uiMotion = level;
  return level;
}

if (globalThis.document?.documentElement?.dataset) setMotion(getMotionChoice());
