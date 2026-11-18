/* Тур: пошаговое знакомство с экраном. Вокруг подсвеченного элемента — затемнение
   с вырезом, рядом — карточка шага: заголовок, текст, прогресс, «Назад» и «Далее».

     const tour = kit("tour").start({
       id: "admin",                        // ключ прогресса в localStorage; storage: false — не хранить
       steps: [
         { id: "hello", title: "…", text: "…" },                        // без target — карточка по центру
         { id: "menu", target: ".side-nav", title: "Меню сайта", text: "…", side: "right" },
       ],
       start: "resume",                    // номер, id шага или "resume" — где остановились
       progress: "dots",                   // dots | bar | count
     });
     tour.next(); tour.prev(); tour.go("menu"); tour.close(); tour.refresh();

   Шаг: target — селектор, элемент или функция → элемент; side и align — как у
   поповера (по умолчанию bottom и center), не влезает — карточка встаёт с другой
   стороны. padding и radius выреза — по умолчанию --ui-tour-pad и скругление
   самого элемента плюс этот отступ (вырез идёт параллельно краю). interactive —
   элемент в вырезе можно нажимать. optional — элемента нет на экране, шаг
   пропускается (без флага карточка встаёт по центру). before(step, index) —
   что сделать до показа (перейти на страницу), можно async: элемент тур ждёт
   до 2 с. html — доверенная разметка вместо text, media — разметка над
   заголовком (объёмная иконка, картинка).

   Затемнение — полосы и углы вокруг выреза, без blur и без тени во весь экран:
   переезд между шагами и прокрутку ведёт композитор (translate, scale,
   opacity), главный поток в это время свободен — даже если страница под туром
   перерисовывается, вырез и карточка едут ровно. Пока страницу листают или
   меняется её размер, оба стоят у элемента без перехода.

   Клавиатура: → и ← — шаги (в RTL наоборот), Esc закрывает, Tab ходит по кругу
   внутри карточки. Пока тур открыт, горячие клавиши страницы молчат: тур
   модальный. Нажатие мимо карточки ничего не закрывает — карточка вздрагивает;
   dismissible: true — закрывает.

   Прогресс: kit("tour").read(id) → { at, seen: [id шагов], finished }, reset(id),
   active() — открытый тур. Шаг считается пройденным, когда с него ушли: «Далее»,
   «Назад», другой шаг, закрытие. События на document: tour:step { id, step,
   index }, tour:close { id, index, reason, finished }; то же — onStep и onClose. */

import { defineComponent } from "../../core/component.js";
import { el, emit, isRtl, setAttr, setData, setText, setVar, uid } from "../../core/dom.js";
import { alignOf, autoUpdate, place, sideOf } from "../../core/floating.js";
import { focus, returnFocus, trapTab } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { openLayer } from "../../core/layer.js";
import { messages } from "../../core/locale.js";
import { presence } from "../../core/presence.js";
import { frame } from "../../core/schedule.js";
import { readMs, readPx, readVar, reducedMotion } from "../../core/tokens.js";

const t = messages("tour", {
  ru: { next: "Далее", back: "Назад", done: "Готово", close: "Закрыть тур", count: "{n} из {total}", step: "Шаг {n} из {total}" },
  en: { next: "Next", back: "Back", done: "Done", close: "Close tour", count: "{n} of {total}", step: "Step {n} of {total}" },
});

const STORE = "ui-tour:";
/* Сколько ждать элемент шага после before(): страница могла ещё грузиться. */
const WAIT = 2000;
/* Сколько ждать конца плавной прокрутки к элементу: scrollend приходит не везде. */
const SCROLL_WAIT = 600;
const TYPING = "input:not([type='checkbox'], [type='radio'], [type='button']), textarea, select, [contenteditable]:not([contenteditable='false'])";

/* ---- Прогресс в localStorage ------------------------------------------------- */

function read(id) {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE + id) ?? "null");
  } catch {}
  return {
    at: Number.isInteger(saved?.at) ? saved.at : 0,
    seen: Array.isArray(saved?.seen) ? saved.seen.filter((value) => typeof value === "string") : [],
    finished: saved?.finished === true,
  };
}

function write(id, state) {
  try {
    localStorage.setItem(STORE + id, JSON.stringify(state));
  } catch {}
}

function reset(id) {
  try {
    localStorage.removeItem(STORE + id);
  } catch {}
}

/* ---- Элемент шага -------------------------------------------------------------- */

function resolve(target) {
  if (!target) return null;
  let node = target;
  try {
    if (typeof node === "function") node = node();
    if (typeof node === "string") node = document.querySelector(node);
  } catch {
    return null;
  }
  return node instanceof Element && node.isConnected && node.getClientRects().length ? node : null;
}

/* Элемент появится после перехода на страницу: ждём его мутациями, не дольше ms.
   Проверка — раз в кадр, а не на каждую пачку мутаций: resolve() читает
   раскладку, а страница, которая строится, присылает их десятками. */
function waitFor(target, ms, alive) {
  return new Promise((done) => {
    let timer = 0;
    let ended = false;
    const check = frame(() => {
      if (ended) return;
      const node = alive() ? resolve(target) : null;
      if (node || !alive()) finish(node);
    });
    const observer = new MutationObserver(check);
    function finish(node) {
      ended = true;
      observer.disconnect();
      check.cancel();
      clearTimeout(timer);
      done(node);
    }
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
    timer = setTimeout(() => finish(alive() ? resolve(target) : null), ms);
  });
}

/* Виден ли элемент целиком; огромный — хотя бы его верх. Элемент шапки у самого
   края окна тоже виден: листать к нему нечего. */
function inView(node) {
  const rect = node.getBoundingClientRect();
  const root = document.documentElement;
  const tall = rect.height > root.clientHeight;
  return rect.left >= 0 && rect.right <= root.clientWidth
    && rect.top >= 0 && (tall ? rect.top < root.clientHeight / 2 : rect.bottom <= root.clientHeight);
}

/* Прокрутка к элементу: плавная (без reduced motion). Конец — scrollend или
   срок; если за два кадра не сдвинулось ничего (листать некуда), ждать нечего. */
function reveal(node) {
  return new Promise((done) => {
    const smooth = !reducedMotion();
    let timer = 0;
    let moved = false;
    const onScroll = () => { moved = true; };
    const finish = () => {
      document.removeEventListener("scrollend", finish, true);
      document.removeEventListener("scroll", onScroll, true);
      clearTimeout(timer);
      done();
    };
    if (smooth) {
      document.addEventListener("scrollend", finish, true);
      document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      timer = setTimeout(finish, SCROLL_WAIT);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!moved) finish(); }));
    }
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: smooth ? "smooth" : "instant" });
    if (!smooth) finish();
  });
}

/* ---- Вырез ------------------------------------------------------------------------ */

const EDGES = ["top", "right", "bottom", "left"];
const CORNERS = ["tl", "tr", "bl", "br"];

/* Разметка выреза (устройство — в tour.css): затемнение полосами и углами,
   кромка отрезками и дугами. */
function spotParts() {
  const corners = () => CORNERS.map((corner) => el("i", { class: "ui-tour__corner", "data-corner": corner }));
  const scrim = el("div", { class: "ui-tour__scrim" }, ...EDGES.map((edge) => el("i", { class: "ui-tour__shade", "data-edge": edge })), ...corners());
  const ring = el("div", { class: "ui-tour__ring" }, ...EDGES.map((edge) => el("i", { class: "ui-tour__line", "data-edge": edge })), ...corners());
  return el("div", { class: "ui-tour__spot", "aria-hidden": "true" }, scrim, ring);
}

/* Вырез и карточка встают на целые пиксели экрана: слой на дробном месте
   размывает кромку. */
const snap = (value) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
};

/* ---- Тур ------------------------------------------------------------------------- */

let active = null;

function create(root, ctx, options) {
  const steps = (options?.steps ?? []).filter(Boolean).map((step, at) => ({ ...step, id: String(step.id ?? at) }));
  if (!steps.length) return null;
  const id = options.id ?? "";
  const storage = !!id && options.storage !== false;
  const state = storage ? read(id) : { at: 0, seen: [], finished: false };
  const style = options.progress === "bar" || options.progress === "count" ? options.progress : "dots";

  /* Разметка. Тур — свой корень [data-ui-layer]: поповеры и подсказки в карточке
     уходят в него, а не под затемнение. */
  const block = el("div", { class: "ui-tour__block" });
  const spot = spotParts();
  const cells = [...spot.querySelectorAll(".ui-tour__corner")];
  const close = el("button", { class: "ui-close ui-close--sm ui-tour__close", type: "button", "aria-label": t("close") }, icon("x"));
  const media = el("div", { class: "ui-tour__media", hidden: true });
  const title = el("h2", { class: "ui-tour__title" });
  const text = el("div", { class: "ui-tour__text" });
  const body = el("div", { class: "ui-tour__body" }, media, title, text);
  const meter = style === "count"
    ? el("span", { class: "ui-tour__count" })
    : el("div", { class: `ui-progress-steps${style === "dots" ? " ui-progress-steps--dots" : ""} ui-tour__progress`, role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(steps.length) },
      ...steps.map(() => el("span", { class: "ui-progress-steps__step" })));
  const back = el("button", { class: "ui-btn ui-btn--ghost ui-btn--sm", type: "button", "data-tour": "back" }, el("span", { class: "ui-btn__label", text: t("back") }));
  const forward = el("button", { class: "ui-btn ui-btn--primary ui-btn--sm", type: "button", "data-tour": "next" }, el("span", { class: "ui-btn__label" }));
  const foot = el("div", { class: "ui-tour__foot" }, meter, el("div", { class: "ui-tour__actions" }, back, forward));
  const card = el("section", { class: "ui-tour__card", role: "dialog", "aria-modal": "true", tabindex: "-1" }, close, body, foot);
  const live = el("div", { class: "ui-sr-only", "aria-live": "polite" });
  title.id = `${root.id}-title`;
  text.id = `${root.id}-text`;
  card.setAttribute("aria-labelledby", title.id);
  card.setAttribute("aria-describedby", text.id);
  root.className = "ui-tour";
  root.dataset.uiLayer = "";
  root.hidden = true;
  root.append(block, spot, card, live);

  const life = presence(root);
  const opener = document.activeElement;
  const rtl = isRtl(document.documentElement);
  let at = -1;
  let target = null;
  let radius = 0;
  let shown = 0;
  let hole = "";
  let media0 = null;
  let pad = 0;
  let turn = 0;
  let swap = 0;
  let nudge = 0;
  let stopAuto = null;
  let closed = false;
  let layer = null;

  const step = () => steps[at];
  const indexOf = (value) => (typeof value === "number" ? value : steps.findIndex((entry) => entry.id === String(value)));

  /* ---- Отрисовка шага ------------------------------------------------------------- */

  function fill(entry, index, dir) {
    setAttr(media, "hidden", !entry.media);
    /* Ту же картинку не пересобирать: новый узел — новая раскладка и декодирование. */
    if (entry.media && entry.media !== media0) media.innerHTML = entry.media;
    media0 = entry.media ?? media0;
    setText(title, entry.title ?? "");
    if (entry.html != null) text.innerHTML = entry.html;
    else setText(text, entry.text ?? "");
    const last = index === steps.length - 1;
    setText(forward.firstChild, entry.next ?? (last ? t("done") : t("next")));
    setAttr(back, "hidden", index === 0);
    const n = index + 1;
    if (style === "count") setText(meter, t("count", { n, total: steps.length }));
    else {
      setAttr(meter, "aria-valuenow", n);
      setAttr(meter, "aria-valuetext", t("step", { n, total: steps.length }));
      [...meter.children].forEach((dot, k) => setData(dot, "state", k < index ? "done" : k === index ? "current" : null));
    }
    /* Новый текст въезжает со стороны хода: две одинаковые анимации по очереди —
       смена имени перезапускает её без лишнего чтения раскладки. */
    if (dir) {
      body.dataset.dir = dir;
      body.dataset.swap = (swap += 1) % 2 ? "a" : "b";
    }
    setText(live, `${t("step", { n, total: steps.length })}. ${entry.title ?? ""}`);
  }

  /* Вырез — вокруг элемента с отступом, скругление параллельно его краю. Нет
     элемента — вырез сжимается в точку по центру, затемнён весь экран. Сначала
     все чтения (элемент, карточка), потом записи: чтение после записи
     заставило бы браузер пересчитать раскладку лишний раз за кадр. */
  function paint() {
    if (closed) return;
    const entry = step();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (target && !target.isConnected) relocate();
    let rect;
    if (target) {
      const box = target.getBoundingClientRect();
      const x = snap(box.left - pad);
      const y = snap(box.top - pad);
      rect = new DOMRect(x, y, snap(box.right + pad) - x, snap(box.bottom + pad) - y);
      place(card, { getBoundingClientRect: () => rect }, { prefix: "--ui-tour", side: sideOf(entry.side), align: alignOf(entry.align, "center"), rtl });
    } else {
      rect = new DOMRect(snap(vw / 2), snap(vh / 2), 0, 0);
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      setVar(card, "--ui-tour-x", `${snap((vw - w) / 2)}px`);
      setVar(card, "--ui-tour-y", `${snap(Math.max(16, (vh - h) / 2))}px`);
      setData(card, "side", "center");
    }
    /* Радиус не больше половины стороны: иначе углы сошлись бы внахлёст. */
    shown = target ? Math.min(radius, rect.width / 2, rect.height / 2) : 0;
    setVar(spot, "--ui-tour-spot-x", `${rect.x}px`);
    setVar(spot, "--ui-tour-spot-y", `${rect.y}px`);
    setVar(spot, "--ui-tour-spot-w", `${rect.width}px`);
    setVar(spot, "--ui-tour-spot-h", `${rect.height}px`);
    setVar(spot, "--ui-tour-spot-r", `${shown}px`);
    setVar(spot, "--ui-tour-spot-lx", String(Math.max(0, rect.width - shown * 2)));
    setVar(spot, "--ui-tour-spot-ly", String(Math.max(0, rect.height - shown * 2)));
    setData(spot, "empty", !target);
    /* Нажимать можно только в вырезе: в заслонке — дыра той же формы (для
       указателя прямоугольник, скругление не важно). */
    const next = target && entry.interactive
      ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.left}px ${rect.top}px, ${rect.right}px ${rect.top}px, ${rect.right}px ${rect.bottom}px, ${rect.left}px ${rect.bottom}px, ${rect.left}px ${rect.top}px)`
      : "";
    if (next !== hole) block.style.clipPath = hole = next;
  }

  /* Радиус сменился на переезде: клетки углов уже нового размера, scale ведёт
     их от старого — дуга растёт вместе с отрезками кромки, на композиторе. */
  function morph(from) {
    if (from === shown || reducedMotion()) return;
    const ratio = (from + 1) / (shown + 1);
    const styles = getComputedStyle(root);
    const timing = { duration: readMs(styles, "--ui-duration-tour", 280), easing: readVar(styles, "--ui-ease", "ease") };
    for (const cell of cells) cell.animate({ scale: [String(ratio), "1"] }, timing);
  }

  /* Элемент шага пропал (страница перерисовала кусок): ищем его заново, нет —
     карточка по центру. */
  function relocate() {
    const again = resolve(step()?.target);
    if (again === target) return;
    target = again;
    track();
  }

  function track() {
    stopAuto?.();
    stopAuto = autoUpdate(target ?? document.documentElement, card, paint, { onDetach: () => { relocate(); paint(); } });
    if (target) {
      pad = step().padding ?? readPx(root, "--ui-tour-pad", 4);
      radius = step().radius ?? Math.max(readPx(root, "--ui-tour-r", 8), (Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0) + pad);
    }
  }

  /* ---- Переходы ------------------------------------------------------------------- */

  function mark() {
    const entry = step();
    if (entry && !state.seen.includes(entry.id)) state.seen.push(entry.id);
    state.at = Math.max(0, at);
    if (storage) write(id, state);
  }

  async function show(index, dir = "") {
    if (closed || index < 0 || index >= steps.length) return;
    const mine = (turn += 1);
    const alive = () => !closed && mine === turn;
    const entry = steps[index];
    if (at >= 0 && index !== at) mark();
    if (entry.before) {
      try {
        await entry.before(entry, index);
      } catch (error) {
        console.error("[EOKIT] tour: before() шага не прошёл", entry.id, error);
      }
      if (!alive()) return;
    }
    let node = resolve(entry.target);
    if (entry.target && !node) node = await waitFor(entry.target, WAIT, alive);
    if (!alive()) return;
    if (entry.target && !node && entry.optional) {
      const skip = index + (dir === "back" ? -1 : 1);
      if (skip >= 0 && skip < steps.length) return show(skip, dir);
      if (dir !== "back") return finish();
    }
    if (node && !inView(node)) {
      await reveal(node);
      if (!alive()) return;
    }

    const first = at < 0;
    at = index;
    target = node;
    fill(entry, index, first ? "" : dir || "next");
    if (first) {
      root.hidden = false;
      life.show();
    } else root.dataset.moving = "";
    const from = shown;
    track();
    paint();
    if (!first) {
      morph(from);
      const running = [...card.getAnimations(), ...spot.getAnimations({ subtree: true })];
      Promise.allSettled(running.map((animation) => animation.finished)).then(() => { if (alive()) delete root.dataset.moving; });
    }

    /* Фокус — на «Далее»: Enter ведёт дальше. Если он уже в карточке и кнопка
       осталась видна, не трогаем. */
    const inside = card.contains(document.activeElement) && document.activeElement.checkVisibility?.() !== false;
    if (!inside) focus(forward);
    state.at = index;
    if (storage) write(id, state);
    emit(document, "tour:step", { id, step: entry, index });
    options.onStep?.(entry, index);
  }

  function finish() {
    if (closed) return;
    state.finished = true;
    end("finish");
  }

  function end(reason) {
    if (closed) return;
    if (at >= 0) mark();
    if (reason === "finish") state.at = 0;
    if (storage) write(id, state);
    closed = true;
    turn += 1;
    stopAuto?.();
    stopAuto = null;
    layer?.close();
    layer = null;
    window.removeEventListener("keydown", onKey, true);
    returnFocus(root, opener);
    if (active === api) active = null;
    /* Ушёл — снять экземпляр: destroy уберёт корень. */
    life.hide().then(() => tour.setup().unmount(root));
    const detail = { id, index: at, reason, finished: state.finished };
    emit(document, "tour:close", detail);
    options.onClose?.(detail);
  }

  const next = () => (at >= steps.length - 1 ? finish() : show(at + 1, "next"));
  const prev = () => show(at - 1, "back");

  /* ---- Ввод ------------------------------------------------------------------------- */

  /* Захват окна — раньше слушателей страницы: её горячие клавиши (поиск, палитра)
     под туром молчат. Esc пропускаем — его закрывает стек слоёв. */
  function onKey(event) {
    if (event.key === "Escape") return;
    if (event.key === "Tab") {
      trapTab(event, card);
      event.stopPropagation();
      return;
    }
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const typing = event.target instanceof Element && event.target.closest(TYPING);
    if (plain && !typing && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      if ((event.key === "ArrowRight") !== rtl) next();
      else if (at > 0) prev();
    }
    event.stopPropagation();
  }

  ctx.on(forward, "click", next);
  ctx.on(back, "click", prev);
  ctx.on(close, "click", () => end("close"));
  /* Нажатие мимо карточки фокус не забирает и тур не закрывает: карточка
     вздрагивает (две одинаковые анимации по очереди — перезапуск без чтения). */
  ctx.on(block, "pointerdown", (event) => event.preventDefault());
  ctx.on(block, "click", () => {
    if (options.dismissible) end("outside");
    else card.dataset.nudge = (nudge += 1) % 2 ? "a" : "b";
  });

  const api = {
    get id() { return id; },
    get index() { return at; },
    get step() { return step(); },
    next,
    prev,
    go: (value) => show(indexOf(value), indexOf(value) < at ? "back" : "next"),
    close: () => end("close"),
    refresh() {
      if (closed || at < 0) return;
      relocate();
      paint();
    },
  };

  /* Открыт другой тур — он закрывается: два затемнения друг над другом — бессмыслица. */
  active?.close();
  active = api;
  document.body.append(root);
  layer = openLayer({
    elements: () => [root],
    modal: true,
    outside: false,
    focus: false,
    onDismiss(reason) {
      if (reason === "escape") end("escape");
    },
  });
  window.addEventListener("keydown", onKey, true);

  const wanted = options.start === "resume" ? (state.finished ? 0 : state.at) : indexOf(options.start ?? 0);
  show(Math.min(Math.max(0, wanted), steps.length - 1));

  return {
    ...api,
    destroy() {
      end("close");
      root.remove();
    },
  };
}

const tour = defineComponent({
  name: "tour",
  create,
  api: () => ({
    /* Программный модуль: корень создаётся здесь, экземпляр ведёт defineComponent. */
    start(options) {
      return tour.setup().create(el("div", { id: uid("ui-tour") }), options);
    },
    active: () => active,
    read,
    reset,
  }),
});

export default tour;
