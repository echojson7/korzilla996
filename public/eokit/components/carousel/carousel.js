/* Карусель: лента кадров на Embla 8.6 (vendor/embla-carousel). Модуль добавляет
   стрелки, точки, превью и просмотр во весь экран (carousel-lightbox.js).

     <div class="ui-carousel" data-ui-carousel data-loop data-arrows data-dots>
       <div class="ui-carousel__viewport">
         <div class="ui-carousel__track">
           <div class="ui-carousel__slide" data-ui-thumb="…">
             <div class="ui-carousel__frame"><img alt="…" data-ui-src="…"></div>
           </div>
         </div>
       </div>
     </div>

   Настройки хоста: data-per-view 2 | 3, data-orientation="vertical", data-align,
   data-loop, data-lazy (радиус подгрузки, false — всё сразу), data-autoplay (мс),
   data-duration, data-drag-free, data-skip-snaps, data-arrows (свои кнопки —
   [data-ui-carousel-prev] / [data-ui-carousel-next]), data-dots, data-thumbs,
   data-dots-placement / data-thumbs-placement="overlay", data-caption,
   data-lightbox. «false» и «0» выключают флаг.

   Embla встаёт по первому замеру окна: в create раскладку не читаем, а карусель в
   скрытой вкладке получает настоящие снапы, когда её покажут. Кадры подгружаются,
   только пока карусель у экрана; автопрокрутка стоит вне экрана, на скрытой
   вкладке, под курсором, при фокусе с клавиатуры, во время жеста и просмотра.

   kit("carousel").get(host) → { scrollNext(jump), scrollPrev(jump), scrollTo(index,
   jump), selected(), openLightbox(index) }. Смена кадра — carousel:select { index }. */

import EmblaCarousel from "../../vendor/embla-carousel/embla-carousel.esm.js";
import { defineComponent } from "../../core/component.js";
import { el, ensureId, restore, setAttr, setData, snapshot } from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";
import { observeSize, observeVisible } from "../../core/observe.js";
import { reducedMotion } from "../../core/tokens.js";

const SELECTOR = "[data-ui-carousel]";
/* По этим целям ленту не тянут: Embla сама пропускает поля, но не их обёртки. */
const NO_DRAG = "button, input, textarea, select";
const HOST_ATTRS = ["role", "aria-roledescription", "aria-label", "data-loop", "data-dots-placement", "data-thumbs-placement", "data-caption"];
const VIEWPORT_ATTRS = ["id", "tabindex", "aria-label"];
const SLIDE_ATTRS = ["role", "aria-roledescription", "aria-label", "inert"];
const IMG_ATTRS = ["src", "data-ui-src", "loading"];

const t = messages("carousel", {
  ru: {
    carousel: "карусель",
    gallery: "Галерея",
    slides: "Слайды",
    slide: "слайд",
    position: "{n} из {count}",
    frame: "Кадр {n}",
    prev: "Предыдущий слайд",
    next: "Следующий слайд",
    thumbsPrev: "Предыдущие миниатюры",
    thumbsNext: "Следующие миниатюры",
  },
  en: {
    carousel: "carousel",
    gallery: "Gallery",
    slides: "Slides",
    slide: "slide",
    position: "{n} of {count}",
    frame: "Slide {n}",
    prev: "Previous slide",
    next: "Next slide",
    thumbsPrev: "Previous thumbnails",
    thumbsNext: "Next thumbnails",
  },
});

/* Просмотр грузится один раз на страницу: заранее, когда карусель с data-lightbox
   показалась, — к щелчку он уже здесь. */
let viewerModule = null;
const loadViewer = () => (viewerModule ??= import("./carousel-lightbox.js"));

function wants(host, key) {
  if (!(key in host.dataset)) return false;
  const value = host.dataset[key];
  return value !== "false" && value !== "0";
}

function readConfig(host) {
  const data = host.dataset;
  let lazy = 1;
  if ("lazy" in data && data.lazy !== "" && data.lazy !== "true") {
    const value = Number(data.lazy);
    lazy = data.lazy === "false" || data.lazy === "0" ? -1 : Number.isFinite(value) && value >= 0 ? value : 1;
  }
  let delay = 0;
  if (wants(host, "autoplay")) {
    const value = Number(data.autoplay);
    delay = Number.isFinite(value) && value > 0 ? value : 4000;
  }
  const dots = wants(host, "dots");
  const thumbs = wants(host, "thumbs");
  return {
    vertical: data.orientation === "vertical",
    align: ["start", "center", "end"].includes(data.align) ? data.align : "start",
    loop: wants(host, "loop"),
    lazy,
    delay,
    duration: Math.min(60, Math.max(5, Number(data.duration) || 25)),
    dragFree: wants(host, "dragFree"),
    skipSnaps: wants(host, "skipSnaps"),
    arrows: wants(host, "arrows"),
    dots: dots && (data.dotsPlacement === "overlay" ? "overlay" : "below"),
    thumbs: thumbs && (data.thumbsPlacement === "overlay" ? "overlay" : "below"),
    caption: wants(host, "caption"),
    lightbox: wants(host, "lightbox"),
  };
}

/* Кадры снапа — из приватного реестра Embla: публичного API для группы нет. К
   внутренностям вендора модуль обращается только здесь. */
const groupOf = (embla, snap = embla.selectedScrollSnap()) => embla.internalEngine().slideRegistry[snap] ?? [snap];

const captionOf = (slide, at) => slide.querySelector(".ui-carousel__title")?.textContent.trim() || slide.querySelector("img")?.alt || t("frame", { n: at + 1 });

function markCurrent(buttons, current) {
  buttons.forEach((button, at) => {
    button.classList.toggle("is-active", at === current);
    setAttr(button, "aria-current", at === current ? "true" : null);
  });
}

function create(host, ctx) {
  const viewport = host.querySelector(".ui-carousel__viewport");
  const track = viewport?.querySelector(".ui-carousel__track");
  const slides = track ? [...track.children].filter((node) => node.classList.contains("ui-carousel__slide")) : [];
  if (!slides.length) return null;

  const config = readConfig(host);
  const saved = [[host, snapshot(host, HOST_ATTRS)], [viewport, snapshot(viewport, VIEWPORT_ATTRS)], ...slides.map((slide) => [slide, snapshot(slide, SLIDE_ATTRS)])];
  const owned = [];
  const watched = new WeakSet();
  const holds = new Set(["offscreen"]);
  let embla = null;
  let thumbsEmbla = null;
  /* Направление строки: Embla его не видит сама, а в RTL лента идёт справа. Чтение
     — в первом замере, вместе со стартом Embla. */
  let direction = "ltr";
  let start = 0;
  let snap = -1;
  let visible = false;
  let timer = 0;
  let viewer = null;
  let opening = false;
  let destroyed = false;

  const own = (node) => (owned.push(node), node);

  setData(host, "loop", config.loop);
  setData(host, "dotsPlacement", config.dots || null);
  setData(host, "thumbsPlacement", config.thumbs || null);
  setData(host, "caption", config.caption);
  setAttr(host, "role", host.getAttribute("role") || "region");
  setAttr(host, "aria-roledescription", host.getAttribute("aria-roledescription") || t("carousel"));
  setAttr(host, "aria-label", host.getAttribute("aria-label") || t("gallery"));
  ensureId(viewport, "ui-carousel");
  viewport.tabIndex = 0;
  setAttr(viewport, "aria-label", viewport.getAttribute("aria-label") || t("slides"));
  slides.forEach((slide, at) => {
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", t("slide"));
    slide.setAttribute("aria-label", t("position", { n: at + 1, count: slides.length }));
  });

  /* Сцена режет выезжающие стрелки, в ней же точки и превью «поверх». */
  let stage = viewport.parentElement;
  const ownStage = !stage.classList.contains("ui-carousel__stage");
  if (ownStage) {
    stage = el("div", { class: "ui-carousel__stage" });
    viewport.before(stage);
    stage.append(viewport);
  }

  function arrow(side, glyph) {
    const authored = host.querySelector(`[data-ui-carousel-${side}]`);
    if (authored) {
      saved.push([authored, snapshot(authored, ["disabled", "aria-controls"])]);
      authored.setAttribute("aria-controls", viewport.id);
      return authored;
    }
    const button = own(el("button", { type: "button", class: `ui-btn ui-btn--icon-sm ui-carousel__nav ui-carousel__${side}`, "aria-label": t(side), "aria-controls": viewport.id }, icon(glyph)));
    stage.append(button);
    return button;
  }
  const prev = config.arrows ? arrow("prev", "chevron-left") : null;
  const next = config.arrows ? arrow("next", "chevron-right") : null;

  /* Превью: своя лента Embla, только когда ряд не влезает. */
  let thumbs = null;
  if (config.thumbs) {
    const buttons = slides.map((slide, at) => {
      const img = slide.querySelector("img");
      const src = slide.dataset.uiThumb || img?.dataset.uiSrc || img?.getAttribute("src");
      return el("button", { type: "button", class: "ui-carousel__thumb", "aria-label": captionOf(slide, at) }, src ? el("img", { alt: "", src }) : null);
    });
    const thumbViewport = el("div", { class: "ui-carousel__thumbs-viewport" }, el("div", { class: "ui-carousel__thumbs-track" }, ...buttons));
    const back = el("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--icon-sm ui-carousel__thumb-nav", "aria-label": t("thumbsPrev") }, icon("chevron-left"));
    const forth = el("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--icon-sm ui-carousel__thumb-nav", "aria-label": t("thumbsNext") }, icon("chevron-right"));
    const root = own(el("div", { class: "ui-carousel__thumbs" }, back, thumbViewport, forth));
    (config.thumbs === "overlay" ? stage : host).append(root);
    thumbs = { root, viewport: thumbViewport, buttons, back, forth };
    /* Ряд, который влез, стоит по центру без кнопок; не влез — листается. Размер
       ленты превью Embla узнаёт отсюда, из общего наблюдателя, а не из своего. */
    ctx.cleanup(observeSize(thumbViewport, {
      read: () => ({
        overflow: thumbViewport.firstElementChild.scrollWidth > thumbViewport.clientWidth + 1,
        direction: getComputedStyle(thumbViewport).direction,
      }),
      write({ overflow, direction: dir }) {
        root.classList.toggle("is-scrollable", overflow);
        if (overflow && !thumbsEmbla) {
          thumbsEmbla = EmblaCarousel(thumbViewport, { align: "center", containScroll: "trimSnaps", dragFree: true, direction: dir, watchSlides: false, watchResize: false });
          if (embla) thumbsEmbla.scrollTo(groupOf(embla)[0], true);
        } else if (!overflow && thumbsEmbla) {
          thumbsEmbla.destroy();
          thumbsEmbla = null;
        } else if (thumbsEmbla) {
          thumbsEmbla.reInit();
        }
      },
    }));
  }

  const dots = config.dots ? own(el("div", { class: "ui-carousel__dots" })) : null;
  if (dots) (config.dots === "overlay" ? stage : host).append(dots);

  /* --- медиа: адрес из data-ui-src подставляется, когда кадр подходит к окну --- */

  function watch(img) {
    if (watched.has(img)) return;
    watched.add(img);
    /* У кадра автора часто нет class: снятие вернёт атрибут как был, без class="". */
    saved.push([img, snapshot(img, ["class"])]);
    if (img.complete && img.naturalWidth) {
      img.classList.add("is-loaded");
      return;
    }
    const slide = img.closest(".ui-carousel__slide");
    const frame = slide.querySelector(".ui-carousel__frame");
    if (frame && !frame.querySelector(".ui-carousel__loader")) frame.append(own(el("span", { class: "ui-carousel__loader" }, el("span", { class: "ui-spinner ui-spinner--slice" }))));
    slide.classList.add("is-loading");
    const done = () => {
      img.classList.add("is-loaded");
      slide.classList.remove("is-loading");
    };
    ctx.on(img, "load", done, { once: true });
    ctx.on(img, "error", done, { once: true });
  }

  function hydrate(slide) {
    for (const img of slide.querySelectorAll("img")) {
      const src = img.dataset.uiSrc;
      if (src && !img.getAttribute("src")) {
        saved.push([img, snapshot(img, IMG_ATTRS)]);
        img.loading = "eager";
        img.src = src;
        delete img.dataset.uiSrc;
      }
      if (img.getAttribute("src")) watch(img);
    }
  }

  /* Радиус вокруг выбранного снапа и всего, что видно; в петле — по кругу. */
  function hydrateAround() {
    if (!visible || !embla) return;
    const radius = config.lazy;
    const count = slides.length;
    const wanted = new Set();
    const mark = (center) => {
      for (let delta = -radius; delta <= radius; delta += 1) {
        const at = center + delta;
        if (config.loop) wanted.add((at + count) % count);
        else if (at >= 0 && at < count) wanted.add(at);
      }
    };
    if (radius < 0) slides.forEach((_, at) => wanted.add(at));
    else for (const at of [...groupOf(embla), ...embla.slidesInView()]) mark(at);
    for (const at of wanted) hydrate(slides[at]);
  }

  for (const img of track.querySelectorAll("img[src]")) watch(img);

  /* --- выбор кадра --------------------------------------------------------- */

  /* Вне окна кадр недоступен ни мыши, ни Tab, ни чтению с экрана. */
  function paintInert() {
    const shown = new Set([...groupOf(embla), ...embla.slidesInView()]);
    slides.forEach((slide, at) => {
      if (slide.inert === shown.has(at)) slide.inert = !shown.has(at);
    });
  }

  function paintDots() {
    const count = embla.scrollSnapList().length;
    if (!dots || dots.children.length === count) return;
    dots.replaceChildren(...Array.from({ length: count }, (_, at) => el("button", { type: "button", class: "ui-carousel__dot", "aria-label": t("frame", { n: at + 1 }) })));
  }

  function paint() {
    const index = embla.selectedScrollSnap();
    const first = groupOf(embla, index)[0];
    if (prev) setAttr(prev, "disabled", !embla.canScrollPrev());
    if (next) setAttr(next, "disabled", !embla.canScrollNext());
    if (dots) markCurrent([...dots.children], index);
    if (thumbs) markCurrent(thumbs.buttons, first);
    thumbsEmbla?.scrollTo(first, reducedMotion());
    paintInert();
    hydrateAround();
    if (index === snap) return;
    snap = index;
    ctx.emit("carousel:select", { index });
  }

  /* --- автопрокрутка: один таймер, пока не держит ни одна причина ------------- */

  function plan() {
    clearTimeout(timer);
    timer = 0;
    if (!config.delay || holds.size || !embla || embla.scrollSnapList().length < 2) return;
    timer = setTimeout(() => {
      timer = 0;
      const jump = reducedMotion();
      if (embla.canScrollNext()) embla.scrollNext(jump);
      else embla.scrollTo(0, jump);
    }, config.delay);
  }

  function hold(reason, on) {
    if (holds.has(reason) === on) return;
    if (on) holds.add(reason);
    else holds.delete(reason);
    plan();
  }

  if (config.delay) {
    if (document.hidden) holds.add("hidden");
    ctx.on(document, "visibilitychange", () => hold("hidden", document.hidden));
    ctx.on(host, "pointerenter", () => hold("hover", true));
    ctx.on(host, "pointerleave", () => hold("hover", false));
    /* Фокус с клавиатуры останавливает ленту; щелчок мышью по окну — нет. */
    ctx.on(host, "focusin", (event) => hold("focus", event.target.matches(":focus-visible")));
    ctx.on(host, "focusout", (event) => !host.contains(event.relatedTarget) && hold("focus", false));
  }

  /* --- старт Embla по первому замеру окна -------------------------------------- */

  function boot() {
    embla = EmblaCarousel(viewport, {
      align: config.align,
      axis: config.vertical ? "y" : "x",
      direction,
      loop: config.loop,
      dragFree: config.dragFree,
      skipSnaps: config.skipSnaps,
      duration: config.duration,
      startIndex: start,
      containScroll: config.loop ? false : "trimSnaps",
      watchSlides: false,
      watchResize: false,
      /* Кадры за окном inert — фокус в них не попадёт, слушать Tab на document незачем. */
      watchFocus: false,
      watchDrag:(_api, event) => !event.target.closest?.(NO_DRAG),
    });
    embla.on("select", () => {
      paint();
      plan();
    });
    /* Новые размеры — новые снапы: точки пересобираются по их числу. */
    embla.on("reInit", () => {
      paintDots();
      paint();
      plan();
    });
    embla.on("slidesInView", () => {
      paintInert();
      hydrateAround();
    });
    embla.on("pointerDown", () => {
      host.classList.add("is-dragging");
      hold("drag", true);
    });
    embla.on("pointerUp", () => {
      host.classList.remove("is-dragging");
      hold("drag", false);
    });
    paintDots();
    paint();
    plan();
  }

  /* Первый замер приходит и для скрытого окна — с нулём; ждём настоящий. Дальше
     тот же общий наблюдатель сообщает Embla новый размер окна (свой ResizeObserver
     на окно и каждый кадр у неё выключен): кадры — доли окна, их размер идёт за ним. */
  let size = null;
  ctx.cleanup(observeSize(viewport, {
    read: (entry) => ({ width: entry.contentRect.width, height: entry.contentRect.height, direction: embla ? null : getComputedStyle(host).direction }),
    write(box) {
      if (destroyed || !box.width || !box.height) return;
      if (embla) {
        if (Math.abs(box.width - size.width) < 0.5 && Math.abs(box.height - size.height) < 0.5) return;
        size = box;
        embla.reInit();
        return;
      }
      size = box;
      direction = box.direction;
      try {
        boot();
      } catch (error) {
        console.error("[EOKIT] carousel: Embla не встала", host, error);
      }
    },
  }));

  ctx.cleanup(observeVisible(host, (seen) => {
    visible = seen;
    hold("offscreen", !seen);
    if (!seen) return;
    hydrateAround();
    if (config.lightbox) loadViewer();
  }, { rootMargin: "48px 0px" }));

  /* --- просмотр ------------------------------------------------------------- */

  function openViewer(index, keyboard = false) {
    if (!config.lightbox || viewer || opening) return;
    /* Кому вернуть фокус — запоминаем сейчас: пока грузится модуль, фокус может уйти. */
    const opener = document.activeElement;
    opening = true;
    loadViewer().then(({ openLightbox }) => {
      opening = false;
      if (destroyed || viewer) return;
      hold("viewer", true);
      viewer = openLightbox({
        slides,
        index,
        loop: config.loop,
        duration: config.duration,
        opener,
        fallback: viewport,
        keyboard,
        onClose() {
          viewer = null;
          hold("viewer", false);
        },
      });
    });
  }

  const jump = () => reducedMotion();

  ctx.on(host, "click", (event) => {
    const target = event.target;
    if (prev?.contains(target)) return embla?.scrollPrev(jump());
    if (next?.contains(target)) return embla?.scrollNext(jump());
    if (dots?.contains(target)) {
      const at = [...dots.children].indexOf(target.closest(".ui-carousel__dot"));
      return at >= 0 && embla?.scrollTo(at, jump());
    }
    if (thumbs?.root.contains(target)) {
      if (thumbs.back.contains(target)) return thumbsEmbla?.scrollPrev();
      if (thumbs.forth.contains(target)) return thumbsEmbla?.scrollNext();
      const at = thumbs.buttons.indexOf(target.closest(".ui-carousel__thumb"));
      return at >= 0 && embla?.scrollTo(at, jump());
    }
    /* Щелчок после перетаскивания Embla гасит сама (захват на окне ленты). */
    const slide = viewport.contains(target) && target.closest(".ui-carousel__slide");
    if (slide) openViewer(slides.indexOf(slide));
  });

  ctx.on(viewport, "keydown", (event) => {
    if (event.target !== viewport || !embla || event.altKey || event.ctrlKey || event.metaKey) return;
    /* В RTL «вперёд» — влево: лента идёт справа налево. */
    const [back, forth] = config.vertical ? ["ArrowUp", "ArrowDown"] : direction === "rtl" ? ["ArrowRight", "ArrowLeft"] : ["ArrowLeft", "ArrowRight"];
    if (event.key === back) embla.scrollPrev(jump());
    else if (event.key === forth) embla.scrollNext(jump());
    else if (event.key === "Home") embla.scrollTo(0, jump());
    else if (event.key === "End") embla.scrollTo(embla.scrollSnapList().length - 1, jump());
    else if ((event.key === "Enter" || event.key === " ") && config.lightbox) openViewer(groupOf(embla)[0], true);
    else return;
    event.preventDefault();
  });

  return {
    scrollNext: (leap = jump()) => embla?.scrollNext(leap),
    scrollPrev: (leap = jump()) => embla?.scrollPrev(leap),
    /* До старта Embla номер запоминается и станет начальным. */
    scrollTo(index, leap = jump()) {
      if (embla) embla.scrollTo(index, leap);
      else start = index;
    },
    selected: () => (embla ? embla.selectedScrollSnap() : start),
    openLightbox: (index = embla ? groupOf(embla)[0] : start) => openViewer(index),
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      viewer?.destroy();
      thumbsEmbla?.destroy();
      embla?.destroy();
      host.classList.remove("is-dragging");
      for (const slide of slides) slide.classList.remove("is-loading");
      for (const node of owned) node.remove();
      if (ownStage) stage.replaceWith(viewport);
      for (const [node, attrs] of saved) restore(node, attrs);
    },
  };
}

export default defineComponent({
  name: "carousel",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    openLightbox: (host, index) => get(host)?.openLightbox(index),
  }),
});
