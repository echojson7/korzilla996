/* Пагинация: номера страниц и поле перехода рисует модуль, стрелки «назад»
   и «вперёд» — авторская разметка.

     <nav aria-label="Пагинация">
       <ul class="ui-pagination" data-ui-pagination data-pages="12" data-page="2">
         <li><button type="button" class="ui-btn ui-pagination__nav"
                     data-ui-pagination-nav="prev" aria-label="Назад">
           <span class="ui-icon" data-ui-icon="chevron-left"></span>
         </button></li>
         <li><button type="button" class="ui-btn ui-pagination__nav"
                     data-ui-pagination-nav="next" aria-label="Вперёд">
           <span class="ui-icon" data-ui-icon="chevron-right"></span>
         </button></li>
       </ul>
     </nav>

   Ряд — окно номеров с якорями: «‹ 1 … 4 5 [6] 7 8 из 48 ›». Сколько номеров
   влезает, решает ширина ряда; слот, стрелки, поле и зазор меряются
   с отрисованного, а не берутся константами. Клетки строятся один раз на
   максимум, дальше меняются подписи, aria-current и hidden: пересборка снесла бы
   фокус.

   Поле перехода стоит за номерами, перед «вперёд», когда все номера в ряд не влезут ни
   при какой ширине (страниц больше девяти). Номер и Enter — переход (вне
   диапазона — прижимается к 1 или N), поле после этого пустеет; Esc очищает.
   Клавиатура на кнопках: ←/→ — соседняя страница, Home/End — первая и
   последняя, цифра уходит в поле. data-jump="off" на ряду — без поля.

   Число страниц и текущая — data-pages и data-page; модуль пишет текущую обратно
   в data-page. Сменили их не через модуль — kit("pagination").refresh(host).
   На хосте — pagination:change (detail: page, total). */

import { defineComponent } from "../../core/component.js";
import { el, isRtl, restore, setAttr, setText, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { messages, numberFormat } from "../../core/locale.js";
import { clamp } from "../../core/math.js";
import { observeSize } from "../../core/observe.js";

const SELECTOR = "[data-ui-pagination]";
const NAV_ATTR = "data-ui-pagination-nav";
const PAGE_ATTR = "data-ui-pagination-page";
const GAP = "…";
/* Предел окна: по два соседа с каждой стороны, якоря 1 и N и два пропуска. */
const MAX_SIBLING = 2;
const MAX_SLOTS = MAX_SIBLING * 2 + 5;

const t = messages("pagination", {
  ru: { page: "Страница {page}", prev: "Предыдущая страница", next: "Следующая страница", go: "Стр.", of: "из", field: "Перейти к странице, от 1 до {total}" },
  en: { page: "Page {page}", prev: "Previous page", next: "Next page", go: "Page", of: "of", field: "Go to page, 1 to {total}" },
});

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, at) => from + at);

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

/* Соседей вокруг текущей: окна с якорями — 5 (1 … x … N), 7 и 9 клеток. Меньше
   пяти — якорей нет, окно едет за текущей страницей. */
function siblingsFor(capacity) {
  if (capacity >= MAX_SLOTS) return MAX_SIBLING;
  if (capacity >= 7) return 1;
  if (capacity >= 5) return 0;
  return -1;
}

/* Число клеток не зависит от страницы: стрелки не переезжают под курсором. */
function itemsFor(page, total, capacity) {
  const sibling = siblingsFor(capacity);
  if (sibling < 0) {
    const size = Math.min(capacity, total);
    const start = clamp(page - Math.floor((size - 1) / 2), 1, Math.max(1, total - size + 1));
    return range(start, start + size - 1);
  }
  const size = sibling * 2 + 5;
  if (total <= size) return range(1, total);
  const left = Math.max(page - sibling, 1);
  const right = Math.min(page + sibling, total);
  if (left <= 2) return [...range(1, size - 2), GAP, total];
  if (right >= total - 1) return [1, GAP, ...range(total - size + 3, total)];
  return [1, GAP, ...range(left, right), GAP, total];
}

function readState(host) {
  const total = toInt(host.dataset.pages, 0);
  return total < 1 ? null : { total, page: clamp(toInt(host.dataset.page, 1), 1, total) };
}

function create(host, ctx) {
  const state = readState(host);
  /* Без числа страниц собирать не из чего. */
  if (!state) return null;
  let { total, page } = state;
  /* До первого замера окно — на максимум: разметка сразу целая, без чтений. */
  let capacity = MAX_SLOTS;

  const navs = [...host.querySelectorAll(`[${NAV_ATTR}]`)];
  const saved = [[host, snapshot(host, ["data-page"])], ...navs.map((nav) => [nav, snapshot(nav, ["disabled", "aria-label"])])];
  /* Подпись стрелки без своей — из словаря на каждой отрисовке, как у страниц:
     смена <html lang> не оставит стрелки на прежнем языке. */
  const named = navs.filter((nav) => !nav.hasAttribute("aria-label") && ["prev", "next"].includes(nav.getAttribute(NAV_ATTR)));

  const cells = Array.from({ length: MAX_SLOTS }, () => {
    const button = el("button", { type: "button", class: "ui-btn ui-pagination__page" });
    const gap = el("span", { class: "ui-pagination__gap", "aria-hidden": "true", text: GAP });
    return { cell: el("li", { class: "ui-pagination__cell" }, button, gap), button, gap };
  });
  const input = el("input", { class: "ui-input ui-pagination__input", type: "text", inputmode: "numeric", autocomplete: "off", enterkeyhint: "go" });
  const field = el("li", { class: "ui-pagination__field" }, input);

  /* Клетки и поле — перед «вперёд» (или его <li>): стрелки остаются там, где их
     написал автор, и ряд замыкает «вперёд». */
  const next = navs.find((nav) => nav.getAttribute(NAV_ATTR) === "next");
  const anchor = next?.parentElement === host ? next : next?.parentElement;
  const fragment = document.createDocumentFragment();
  fragment.append(...cells.map(({ cell }) => cell), field);
  host.insertBefore(fragment, anchor?.parentElement === host ? anchor : null);

  const withField = () => host.dataset.jump !== "off" && total > MAX_SLOTS;

  function render() {
    const items = itemsFor(page, total, capacity);
    const format = numberFormat({ useGrouping: false });
    cells.forEach(({ cell, button, gap }, at) => {
      const item = items[at];
      setAttr(cell, "hidden", item === undefined);
      if (item === undefined) return;
      const isGap = item === GAP;
      setAttr(gap, "hidden", !isGap);
      setAttr(button, "hidden", isGap);
      /* Пропуск перед последней страницей читается как «из N»: последний номер
         и есть число страниц. Левый пропуск — многоточие. */
      if (isGap) setText(gap, items[at + 1] === total ? t("of") : GAP);
      /* Спрятанная кнопка не называет себя текущей страницей. */
      setAttr(button, "aria-current", item === page ? "page" : null);
      if (isGap) return;
      setText(button, format.format(item));
      setAttr(button, PAGE_ATTR, item);
      setAttr(button, "aria-label", t("page", { page: format.format(item) }));
    });
    setAttr(field, "hidden", !withField());
    input.maxLength = String(total).length;
    setAttr(input, "placeholder", t("go"));
    setAttr(input, "aria-label", t("field", { total: format.format(total) }));
    for (const nav of navs) {
      const which = nav.getAttribute(NAV_ATTR);
      setAttr(nav, "disabled", which === "prev" ? page <= 1 : page >= total);
      if (named.includes(nav)) setAttr(nav, "aria-label", t(which));
    }
    setAttr(host, "data-page", page);
  }

  const current = () => cells.find(({ button }) => button.getAttribute("aria-current") === "page")?.button;

  /* Окно сдвигается под нажатой кнопкой: фокус уходит на текущую страницу, а не
     остаётся на клетке, где теперь другой номер. Недоступная стрелка фокус тоже
     не держит. */
  function commit(value) {
    const nextPage = clamp(value, 1, total);
    if (nextPage === page) return;
    const active = host.contains(document.activeElement) ? document.activeElement : null;
    page = nextPage;
    render();
    if (active && (active.matches(`[${PAGE_ATTR}]`) || active.disabled)) focus(current());
    ctx.emit("pagination:change", { page, total });
  }

  /* Набранный номер — переход, поле пустеет: оно спрашивает «куда», а текущую
     страницу и так видно в ряду. */
  function go() {
    const value = toInt(input.value, Number.NaN);
    input.value = "";
    if (Number.isFinite(value)) commit(value);
  }

  ctx.on(host, "click", (event) => {
    const button = event.target.closest(`[${NAV_ATTR}], [${PAGE_ATTR}]`);
    if (!button || !host.contains(button) || button.disabled) return;
    event.preventDefault();
    const which = button.getAttribute(NAV_ATTR);
    commit(which === "prev" ? page - 1 : which === "next" ? page + 1 : toInt(button.getAttribute(PAGE_ATTR), page));
  });

  ctx.on(input, "input", () => {
    const digits = input.value.replace(/\D+/g, "");
    if (digits !== input.value) input.value = digits;
  });
  ctx.on(input, "blur", go);

  ctx.on(host, "keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target === input) {
      if (event.key === "Enter") {
        event.preventDefault();
        go();
      } else if (event.key === "Escape" && input.value) {
        /* Esc сначала очищает поле, и только пустое отпускает Esc дальше — окну,
           в котором стоит пагинация. */
        event.preventDefault();
        event.stopPropagation();
        input.value = "";
      }
      return;
    }
    if (/^[0-9]$/.test(event.key) && withField()) {
      event.preventDefault();
      focus(input);
      input.value = event.key;
      return;
    }
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    const target = step ? page + (isRtl(host) ? -step : step) : event.key === "Home" ? 1 : event.key === "End" ? total : null;
    if (target == null || event.shiftKey) return;
    event.preventDefault();
    commit(target);
  });

  /* Ряд высотой в одну клетку (pagination.css): лишние клетки переносятся за
     нижний край, и окно пересчитывается в том же кадре, до отрисовки. Высота
     ряда в колбэке не меняется — наблюдатель не зацикливается. */
  ctx.cleanup(observeSize(host, {
    read(entry) {
      const button = cells.find(({ cell, button: node }) => !cell.hidden && !node.hidden)?.button;
      const slot = button?.offsetWidth ?? 0;
      const fixed = navs.reduce((sum, nav) => sum + nav.offsetWidth, 0) + (field.hidden ? 0 : field.offsetWidth);
      const gap = Number.parseFloat(getComputedStyle(host).columnGap) || 0;
      const width = entry.contentBoxSize[0].inlineSize;
      /* n номеров, стрелки, поле и зазоры между всеми должны уложиться в ряд. */
      const extra = field.hidden ? gap : gap * 2;
      return width > 0 && slot > 0 ? clamp(Math.floor((width - fixed - extra) / (slot + gap)), 1, MAX_SLOTS) : MAX_SLOTS;
    },
    write(fit) {
      if (fit === capacity) return;
      capacity = fit;
      render();
    },
  }));

  render();

  return {
    host,
    get page() {
      return page;
    },
    /* data-pages / data-page сменили не через модуль. */
    refresh() {
      const fresh = readState(host);
      if (!fresh) return;
      ({ total, page } = fresh);
      render();
    },
    destroy() {
      for (const { cell } of cells) cell.remove();
      field.remove();
      for (const [node, attrs] of saved) restore(node, attrs);
    },
  };
}

export default defineComponent({
  name: "pagination",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (host) => void get(host)?.refresh(),
  }),
});
