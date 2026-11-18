/* Просмотр карусели во весь экран — модальный слой со своей лентой Embla. Его
   грузит carousel.js, когда карусель с data-lightbox показалась на экране.

   Всегда тёмный: на нём фотография. Уходит в body (из окна — в его слой
   [data-ui-layer]), страница под ним не прокручивается. Esc сначала сбрасывает
   увеличение, потом закрывает; Tab ходит по кругу внутри; по закрытии фокус
   возвращается туда, откуда открыли. Колесо увеличивает кадр, увеличенный кадр
   тянут указателем; на сенсорном экране кадр смахивают вниз, чтобы закрыть.
   Полные кадры грузятся по соседству с текущим, а не все сразу. */

import EmblaCarousel from "../../vendor/embla-carousel/embla-carousel.esm.js";
import { el, isRtl, setAttr, setText } from "../../core/dom.js";
import { focusInitial, returnFocus, trapTab } from "../../core/focus.js";
import { isFling, SWIPE, track } from "../../core/gesture.js";
import { icon } from "../../core/icons.js";
import { openLayer, portal } from "../../core/layer.js";
import { messages } from "../../core/locale.js";
import { presence } from "../../core/presence.js";
import { frame } from "../../core/schedule.js";
import { lockScroll } from "../../core/scroll-lock.js";
import { reducedMotion } from "../../core/tokens.js";

const ZOOM_STEP = 1.12;
const ZOOM_MAX = 4;

const t = messages("carousel", {
  ru: {
    view: "Просмотр",
    close: "Закрыть",
    prevFrame: "Предыдущий кадр",
    nextFrame: "Следующий кадр",
    rotation: "Поворот",
    rotateLeft: "Повернуть влево",
    rotateRight: "Повернуть вправо",
    count: "{n} из {count}",
    frame: "Кадр {n}",
  },
  en: {
    view: "Viewer",
    close: "Close",
    prevFrame: "Previous image",
    nextFrame: "Next image",
    rotation: "Rotation",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    count: "{n} of {count}",
    frame: "Slide {n}",
  },
});

const button = (className, label, glyph, data = null) => el("button", { type: "button", class: className, "aria-label": label, data }, icon(glyph));
/* Четверть оборота меняет стороны кадра местами. */
const turned = (deg) => Math.abs(deg % 180) === 90;

export function openLightbox({ slides, index, loop, duration, opener, fallback, keyboard, onClose }) {
  const items = slides.map((slide) => {
    const img = slide.querySelector("img");
    const src = img?.getAttribute("src") || img?.dataset.uiSrc || "";
    return { src, alt: img?.alt || "", thumb: slide.dataset.uiThumb || src };
  });
  const media = items.map((item) => (item.src ? el("img", { alt: item.alt }) : null));
  const closer = button("ui-close ui-close--lg ui-carousel-lightbox__close", t("close"), "x");
  const viewport = el("div", { class: "ui-carousel-lightbox__viewport" }, el("div", { class: "ui-carousel-lightbox__track" }, ...media.map((img) => el("div", { class: "ui-carousel-lightbox__slide" }, img))));
  const prev = button("ui-btn ui-btn--icon", t("prevFrame"), "chevron-left", { lightboxPrev: "" });
  const next = button("ui-btn ui-btn--icon", t("nextFrame"), "chevron-right", { lightboxNext: "" });
  const left = button("ui-btn ui-btn--icon", t("rotateLeft"), "rotate-ccw");
  const right = button("ui-btn ui-btn--icon", t("rotateRight"), "rotate-cw");
  const count = el("span", { class: "ui-carousel-lightbox__count" });
  const thumbs = items.map((item, at) => el("button", { type: "button", class: "ui-carousel-lightbox__thumb", "aria-label": item.alt || t("frame", { n: at + 1 }) }, item.thumb ? el("img", { alt: "", src: item.thumb }) : null));
  const strip = el("div", { class: "ui-carousel-lightbox__thumbs" }, ...thumbs);
  const dialog = el(
    "div",
    { class: "ui-carousel-lightbox", role: "dialog", "aria-modal": "true", "aria-label": t("view"), tabindex: "-1", data: loop ? { loop: "" } : null },
    closer,
    viewport,
    el("div", { class: "ui-carousel-lightbox__bar" }, prev, el("div", { class: "ui-carousel-lightbox__tools", role: "toolbar", "aria-label": t("rotation") }, left, right), count, next),
    strip,
  );

  const controller = new AbortController();
  const on = (target, type, fn, options) => target.addEventListener(type, fn, { ...options, signal: controller.signal });
  const rotations = items.map(() => 0);
  const zoom = { scale: 1, x: 0, y: 0 };
  const life = presence(dialog, { hidden: false, also: [viewport] });
  let current = index;
  let gesture = null;
  let closing = false;
  let finished = false;

  /* Поворот у каждого кадра свой; увеличение и сдвиг — только у текущего. */
  function paintMedia(at) {
    const img = media[at];
    if (!img) return;
    const active = at === current;
    const parts = [];
    if (active && (zoom.x || zoom.y)) parts.push(`translate(${zoom.x}px, ${zoom.y}px)`);
    if (rotations[at]) parts.push(`rotate(${rotations[at]}deg)`);
    if (active && zoom.scale !== 1) parts.push(`scale(${zoom.scale})`);
    img.style.transform = parts.join(" ");
  }

  const paintZoom = frame(() => {
    paintMedia(current);
    dialog.classList.toggle("is-zoomed", zoom.scale > 1);
  });

  function resetZoom() {
    zoom.scale = 1;
    zoom.x = 0;
    zoom.y = 0;
  }

  /* Пределы сдвига — по стороне кадра с учётом поворота. Читается до записи. */
  function bounds() {
    const img = media[current];
    const [w, h] = [img.offsetWidth, img.offsetHeight];
    return turned(rotations[current]) ? { w: h, h: w } : { w, h };
  }

  function clamp(box) {
    if (zoom.scale <= 1) return resetZoom();
    const maxX = (box.w * (zoom.scale - 1)) / 2;
    const maxY = (box.h * (zoom.scale - 1)) / 2;
    zoom.x = Math.min(maxX, Math.max(-maxX, zoom.x));
    zoom.y = Math.min(maxY, Math.max(-maxY, zoom.y));
  }

  /* Кадр текущий и соседи: полный размер грузится, только когда к нему подходят. */
  function load(center) {
    for (let delta = -1; delta <= 1; delta += 1) {
      const at = loop ? (center + delta + items.length) % items.length : center + delta;
      if (media[at] && !media[at].getAttribute("src")) media[at].src = items[at].src;
    }
  }

  function paintSelection() {
    const thumb = thumbs[current];
    const scroll = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    load(current);
    paintMedia(current);
    dialog.classList.toggle("is-zoomed", zoom.scale > 1);
    thumbs.forEach((node, at) => {
      node.classList.toggle("is-active", at === current);
      setAttr(node, "aria-current", at === current ? "true" : null);
    });
    strip.scrollLeft = scroll;
    setText(count, t("count", { n: current + 1, count: items.length }));
    setAttr(prev, "disabled", !embla.canScrollPrev());
    setAttr(next, "disabled", !embla.canScrollNext());
  }

  function rotate(delta) {
    const img = media[current];
    if (!img) return;
    const { clientWidth: width, clientHeight: height } = viewport;
    resetZoom();
    rotations[current] += delta;
    /* Повёрнутый кадр вписывается в окно по переставленным сторонам. */
    img.style.maxWidth = turned(rotations[current]) ? `${height}px` : "";
    img.style.maxHeight = turned(rotations[current]) ? `${width}px` : "";
    paintZoom();
  }

  function finish() {
    if (finished) return;
    finished = true;
    controller.abort();
    paintZoom.cancel();
    gesture?.cancel();
    embla.destroy();
    home();
    unlock();
    onClose();
  }

  /* Фокус уходит назад сразу, узел — после анимации ухода; ленту Embla не
     трогаем до конца, иначе кадр дёрнется на уходе. */
  function close() {
    if (closing) return;
    closing = true;
    layer.close();
    returnFocus(dialog, opener !== document.body && opener, fallback);
    life.hide().then(finish);
  }

  const home = portal(dialog, fallback);
  const unlock = lockScroll();
  life.show();
  /* Просмотр стоит в body (или слое): направление — его, в RTL лента идёт справа. */
  const rtl = isRtl(dialog);
  const embla = EmblaCarousel(viewport, {
    loop,
    align: "start",
    direction: rtl ? "rtl" : "ltr",
    containScroll: loop ? false : "trimSnaps",
    duration,
    startIndex: index,
    watchSlides: false,
    watchDrag: (_api, event) => zoom.scale <= 1 && !event.target.closest?.("button"),
  });
  current = embla.selectedScrollSnap();
  paintSelection();
  embla.on("select", () => {
    const was = current;
    current = embla.selectedScrollSnap();
    resetZoom();
    paintMedia(was);
    paintSelection();
  });

  const layer = openLayer({
    elements: () => [dialog],
    trigger: opener,
    modal: true,
    exclusive: true,
    outside: false,
    focus: false,
    onDismiss(reason) {
      if (reason === "escape" && zoom.scale > 1) {
        resetZoom();
        paintZoom();
        return;
      }
      close();
    },
  });
  focusInitial(dialog, { keyboard });

  on(dialog, "keydown", (event) => {
    if (event.key === "Tab") return trapTab(event, dialog);
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === (rtl ? "ArrowRight" : "ArrowLeft")) embla.scrollPrev(reducedMotion());
    else if (event.key === (rtl ? "ArrowLeft" : "ArrowRight")) embla.scrollNext(reducedMotion());
    else return;
    event.preventDefault();
  });

  on(dialog, "click", (event) => {
    const target = event.target;
    if (target === dialog || closer.contains(target)) return close();
    if (prev.contains(target)) return embla.scrollPrev(reducedMotion());
    if (next.contains(target)) return embla.scrollNext(reducedMotion());
    if (left.contains(target)) return rotate(-90);
    if (right.contains(target)) return rotate(90);
    const at = thumbs.indexOf(target.closest(".ui-carousel-lightbox__thumb"));
    if (at >= 0) embla.scrollTo(at, reducedMotion());
  });

  /* Горизонтальный свайп по трекпаду (deltaY = 0) — не увеличение. */
  on(viewport, "wheel", (event) => {
    if (!media[current] || !event.deltaY) return;
    event.preventDefault();
    const box = bounds();
    zoom.scale = Math.min(ZOOM_MAX, Math.max(1, zoom.scale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    clamp(box);
    paintZoom();
  }, { passive: false });

  /* Увеличенный кадр тянут любым указателем; не увеличенный на сенсорном экране
     смахивают вниз — бросок или треть высоты закрывают просмотр. */
  on(viewport, "pointerdown", (event) => {
    if (closing || event.button !== 0) return;
    if (zoom.scale > 1) {
      if (!event.target.closest("img")) return;
      const box = bounds();
      const from = { x: zoom.x, y: zoom.y };
      gesture = track(event, {
        onStart: () => dialog.classList.add("is-panning"),
        onMove({ dx, dy }) {
          zoom.x = from.x + dx;
          zoom.y = from.y + dy;
          clamp(box);
          paintMedia(current);
        },
        onEnd() {
          gesture = null;
          dialog.classList.remove("is-panning");
        },
      });
      return;
    }
    if (event.pointerType === "mouse") return;
    gesture = track(event, {
      axis: "y",
      slop: SWIPE.slop,
      onMove({ dy }) {
        dialog.style.transform = dy > 0 ? `translate3d(0, ${dy}px, 0)` : "";
      },
      onEnd({ dy, vy, completed }) {
        gesture = null;
        if (completed && dy > 0 && isFling(dy, dialog.clientHeight, vy)) close();
        else dialog.style.transform = "";
      },
    });
  });

  return {
    close,
    /* Снятие карусели при открытом просмотре: без анимации ухода. */
    destroy() {
      if (!closing) {
        closing = true;
        layer.close();
        returnFocus(dialog, opener !== document.body && opener, fallback);
      }
      life.settle();
      finish();
    },
  };
}
