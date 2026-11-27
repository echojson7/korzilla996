/* Перетаскивание карточек в канбанах — одно на весь портал (задачи, сделки,
   роботы). Своё, на событиях указателя, без библиотек.
   Карточку берут мышью (сдвиг на 5 px) или пальцем (удержание 250 мс).
   Поднятая карточка — копия поверх страницы: чуть наклонена, с тенью,
   идёт за курсором; на её месте в колонке — пустой слот той же высоты,
   соседние карточки плавно расступаются (TransitionGroup name="card").
   Отпустили — копия садится в слот и исчезает. У краёв доски и колонки
   всё само прокручивается.

   Разметка, которую ждёт композабл:
   - доска: ref → board (прокрутка вбок);
   - колонка целиком: registerSection(id) — по ней ищем колонку под курсором;
   - список колонки: registerList(id) — в нём карточки с data-key и слот
     с data-slot, он же прокручивается по вертикали;
   - карточка: @pointerdown="drag.onPointerDown($event, key)";
     щелчок после переноса гасите через drag.wasDragged(). */

import { onBeforeUnmount, ref, type Ref } from "vue";

export type DragKey = number | string;

export interface CardDragOptions {
  /** Колонка карточки. */
  columnOf: (key: DragKey) => string | null;
  /** Карточки колонки по порядку. */
  keysIn: (column: string) => DragKey[];
  /** Бросили: в колонку column перед карточкой before (null — в конец). */
  onDrop: (key: DragKey, column: string, before: DragKey | null) => void;
  /** Можно ли сейчас таскать. */
  enabled?: () => boolean;
}

export function useCardDrag(options: CardDragOptions) {
  const dragging = ref<DragKey | null>(null);
  const over = ref<{ column: string; before: DragKey | null } | null>(null);
  const slotHeight = ref(64);
  const landed = ref<DragKey | null>(null);
  const board: Ref<HTMLElement | null> = ref(null);
  const lists = new Map<string, HTMLElement>();
  const sections = new Map<string, HTMLElement>();

  const unwrap = (el: unknown) => ((el as { $el?: HTMLElement } | null)?.$el ?? el) as HTMLElement | null;
  const registerList = (id: string) => (el: unknown) => {
    const node = unwrap(el);
    node instanceof HTMLElement ? lists.set(id, node) : lists.delete(id);
  };
  const registerSection = (id: string) => (el: unknown) => {
    const node = unwrap(el);
    node instanceof HTMLElement ? sections.set(id, node) : sections.delete(id);
  };

  /** Пока тянут — куда сядет карточка в этой колонке (для слота в разметке). */
  const targetIn = (column: string) => (dragging.value != null && over.value?.column === column ? over.value : null);

  function beforeAt(column: string, y: number): DragKey | null {
    const list = lists.get(column);
    if (!list) return null;
    const keys = options.keysIn(column);
    for (const card of list.querySelectorAll<HTMLElement>("[data-key]")) {
      if (card.dataset.key === String(dragging.value)) continue;
      const box = card.getBoundingClientRect();
      if (y < box.top + box.height / 2) return keys.find((key) => String(key) === card.dataset.key) ?? null;
    }
    return null;
  }
  function columnAt(x: number): string | null {
    for (const [id, el] of sections) {
      const box = el.getBoundingClientRect();
      if (x >= box.left && x < box.right) return id;
    }
    return null;
  }

  /* Автопрокрутка: курсор у края доски или колонки — едем в ту сторону. */
  let scrollTimer = 0;
  const pointer = { x: 0, y: 0, column: "" };
  function autoscroll() {
    const edge = 64;
    const step = (distance: number) => Math.ceil(((edge - distance) / edge) * 18);
    const el = board.value;
    if (el) {
      const box = el.getBoundingClientRect();
      if (pointer.x < box.left + edge) el.scrollLeft -= step(pointer.x - box.left);
      else if (pointer.x > box.right - edge) el.scrollLeft += step(box.right - pointer.x);
    }
    const list = lists.get(pointer.column);
    if (list) {
      const box = list.getBoundingClientRect();
      if (pointer.y < box.top + edge && pointer.y > box.top) list.scrollTop -= step(pointer.y - box.top);
      else if (pointer.y > box.bottom - edge && pointer.y < box.bottom) list.scrollTop += step(box.bottom - pointer.y);
    }
    if (dragging.value != null) track();
    scrollTimer = requestAnimationFrame(autoscroll);
  }

  let press: { key: DragKey; el: HTMLElement; x: number; y: number; dx: number; dy: number; touch: boolean; timer: number } | null = null;
  let ghost: HTMLElement | null = null;
  let justDragged = false;

  function onPointerDown(event: PointerEvent, key: DragKey) {
    if (options.enabled && !options.enabled()) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest("a, input, textarea, select, button:not([data-key])")) return;
    const el = event.currentTarget as HTMLElement;
    const box = el.getBoundingClientRect();
    const touch = event.pointerType === "touch";
    press = { key, el, x: event.clientX, y: event.clientY, dx: event.clientX - box.left, dy: event.clientY - box.top, touch, timer: 0 };
    if (touch) press.timer = window.setTimeout(() => press && begin(), 250);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", cancelPress);
  }
  function onPointerMove(event: PointerEvent) {
    if (!press) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (dragging.value == null) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (press.touch) {
        if (moved > 8) cancelPress();
      } else if (moved > 5) begin();
      return;
    }
    event.preventDefault();
    track();
  }
  function begin() {
    if (!press) return;
    const column = options.columnOf(press.key);
    if (column == null) return cancelPress();
    const box = press.el.getBoundingClientRect();
    slotHeight.value = box.height;
    ghost = press.el.cloneNode(true) as HTMLElement;
    ghost.classList.add("drag-ghost");
    ghost.removeAttribute("data-key");
    Object.assign(ghost.style, { width: `${box.width}px`, height: `${box.height}px`, left: "0px", top: "0px" });
    document.body.appendChild(ghost);
    moveGhost(pointer.x || press.x, pointer.y || press.y);
    requestAnimationFrame(() => ghost?.classList.add("is-lifted"));
    const keys = options.keysIn(column);
    const next = keys[keys.indexOf(press.key) + 1];
    dragging.value = press.key;
    over.value = { column, before: next ?? null };
    pointer.column = column;
    document.documentElement.classList.add("is-board-dragging");
    window.addEventListener("touchmove", blockTouch, { passive: false });
    scrollTimer = requestAnimationFrame(autoscroll);
  }
  function moveGhost(x: number, y: number) {
    if (ghost && press) ghost.style.transform = `translate3d(${x - press.dx}px, ${y - press.dy}px, 0)`;
  }
  function track() {
    moveGhost(pointer.x, pointer.y);
    const column = columnAt(pointer.x);
    if (!column) return;
    pointer.column = column;
    const before = beforeAt(column, pointer.y);
    if (over.value?.column !== column || over.value.before !== before) over.value = { column, before };
  }
  const blockTouch = (event: TouchEvent) => event.preventDefault();

  function onPointerUp() {
    if (!press) return;
    if (dragging.value == null) return cancelPress();
    const key = dragging.value;
    const target = over.value;
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    const slot = target ? lists.get(target.column)?.querySelector<HTMLElement>("[data-slot]") : null;
    const el = ghost;
    const box = slot?.getBoundingClientRect();
    const finishDrop = () => {
      land(key);
      if (target) options.onDrop(key, target.column, target.before);
      cleanup();
    };
    if (el && box && box.width > 0) {
      // Фиксируем текущее положение копии, чтобы посадка шла от курсора.
      el.getBoundingClientRect();
      el.classList.remove("is-lifted");
      el.classList.add("is-landing");
      el.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        finishDrop();
      };
      el.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 260);
    } else finishDrop();
    unlisten();
    press = null;
  }
  // Брошенная карточка встаёт на место слота сразу, без появления.
  let landTimer = 0;
  function land(key: DragKey) {
    landed.value = key;
    clearTimeout(landTimer);
    landTimer = window.setTimeout(() => (landed.value = null), 400);
  }
  function cancelPress() {
    if (press?.timer) clearTimeout(press.timer);
    unlisten();
    press = null;
    cleanup();
  }
  function unlisten() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", cancelPress);
    window.removeEventListener("touchmove", blockTouch);
  }
  function cleanup() {
    cancelAnimationFrame(scrollTimer);
    ghost?.remove();
    ghost = null;
    dragging.value = null;
    over.value = null;
    document.documentElement.classList.remove("is-board-dragging");
  }
  onBeforeUnmount(() => {
    unlisten();
    cleanup();
  });

  return {
    dragging, over, slotHeight, landed, board,
    registerList, registerSection, targetIn, onPointerDown,
    wasDragged: () => justDragged,
  };
}
