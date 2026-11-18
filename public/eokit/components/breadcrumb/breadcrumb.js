/* Крошки: путь по разделам; ветки открывает popover. Модуль владеет одним —
   длиной пути. Пока путь не влезает в строку, середина прячется за кнопкой «…».
   Нажатие показывает путь целиком, пока на крошки смотрят: ушли курсор или
   фокус — компактная форма вернулась.

     <nav aria-label="Хлебные крошки">
       <ol class="ui-breadcrumb" data-ui-breadcrumb>
         <li class="ui-breadcrumb__item"><a class="ui-breadcrumb__link" href="/">Корзилла</a></li>
         <li class="ui-breadcrumb__item" data-ui-breadcrumb-more hidden>
           <button type="button" class="ui-btn ui-btn--ghost ui-btn--icon-xs ui-breadcrumb__toggle" aria-expanded="false">
             <span class="ui-icon" data-ui-icon="ellipsis"></span>
           </button>
         </li>
         …разделы и ветки…
         <li class="ui-breadcrumb__item"><span class="ui-breadcrumb__current" aria-current="page">…</span></li>
       </ol>
     </nav>

   Первый раздел и текущая страница остаются всегда; середину из одного пункта не
   прячем. Без кнопки «…» модуль не ставится: путь просто переносится на вторую
   строку. Сменился путь — unmount и mount хоста.

   Состояние — data-fold на хосте: full (путь целиком), folded (середина за «…»),
   expanded (показан кнопкой). Путь целиком стоит в ряду высотой в строку: не
   влез — хвост переносится за нижний край, и в том же кадре, до отрисовки,
   наблюдатель размера сворачивает середину; своя наблюдаемая высота в колбэке не
   меняется. Ширина пути запоминается, пока он показан: развернуть обратно
   решает арифметика, без пробной раскладки. Свернуть не дала открытая ветка —
   data-fold снят, путь переносится, как без модуля, до закрытия ветки. */

import { defineComponent } from "../../core/component.js";
import { ownParts, restore, setAttr, setData, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { messages } from "../../core/locale.js";
import { observeSize } from "../../core/observe.js";
import { frame } from "../../core/schedule.js";

const SELECTOR = "[data-ui-breadcrumb]";
const ITEM = ".ui-breadcrumb__item";
const MORE = "[data-ui-breadcrumb-more]";
const TOGGLE = ".ui-breadcrumb__toggle";
/* Дробные ширины пунктов в сумме расходятся с шириной ряда на сотые. */
const EPS = 0.5;

const t = messages("breadcrumb", {
  ru: { more: "Показать весь путь" },
  en: { more: "Show full path" },
});

function create(host, ctx) {
  const items = ownParts(host, ITEM, SELECTOR);
  const more = items.find((item) => item.matches(MORE));
  const toggle = more?.querySelector(TOGGLE);
  const path = items.filter((item) => item !== more);
  const middle = path.slice(1, -1);
  if (!toggle || middle.length < 2) return null;

  const saved = [[host, snapshot(host, ["data-fold"])], [toggle, snapshot(toggle, ["aria-expanded", "aria-label"])], ...items.map((item) => [item, snapshot(item, ["hidden"])])];
  /* Своя подпись «…» — из словаря, когда кнопка появляется: за сменой <html lang>. */
  const named = !toggle.hasAttribute("aria-label") && !toggle.hasAttribute("aria-labelledby");

  /* full | folded | expanded | wrap — последнее без data-fold: ряд как без модуля. */
  let state = "";
  let width = 0;
  let full = 0;

  const itemOf = (node) => node?.closest?.(ITEM);
  const fits = () => full <= width + EPS;
  /* Раскрытая ветка держит свой пункт: иначе меню теряет якорь, а фокус — место. */
  const branchOpen = () => path.some((item) => item.querySelector("[aria-expanded='true']"));

  function show(next) {
    if (next === state) return;
    const active = document.activeElement;
    if (next === "folded") {
      if (named) setAttr(toggle, "aria-label", t("more"));
      setAttr(more, "hidden", null);
      /* Фокус с исчезающего пункта — на «…»: путь разворачивают ею же. */
      if (middle.includes(itemOf(active))) focus(toggle);
      for (const item of middle) setAttr(item, "hidden", true);
    } else {
      for (const item of middle) setAttr(item, "hidden", null);
      if (next !== "expanded") {
        if (more.contains(active)) focus(middle[0].querySelector("a[href], button"));
        setAttr(more, "hidden", true);
      }
    }
    setAttr(toggle, "aria-expanded", String(next === "expanded"));
    setData(host, "fold", next === "wrap" ? null : next);
    state = next;
  }

  /* Компактная форма — если путь не влезает и ветки закрыты. */
  function settle() {
    if (!branchOpen()) show(fits() ? "full" : "folded");
  }

  /* Перенос растит высоту ряда — уже не в колбэке наблюдателя, а кадром позже. */
  const wrapLater = frame(() => {
    if (state === "full" && !fits()) show(branchOpen() ? "wrap" : "folded");
  });

  /* Решение по последнему замеру. Показанный кнопкой и перенесённый пути ждут
     ухода взгляда и закрытия ветки. */
  function fit() {
    if (state === "expanded" || state === "wrap") return;
    if (fits()) show("full");
    else if (state === "folded" || !branchOpen()) show("folded");
    else wrapLater();
  }

  const watcher = {
    /* Колбэк наблюдателя идёт после раскладки: чтения ничего не пересчитывают.
       Ширина пути — сумма пунктов, пока середина на месте. */
    read() {
      width = host.getBoundingClientRect().width;
      if (state !== "folded") full = path.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0);
    },
    write: fit,
  };
  show("full");
  let unwatch = observeSize(host, watcher);
  ctx.cleanup(() => unwatch());
  ctx.cleanup(wrapLater.cancel);

  /* Шрифт догрузился — подписи сменили ширину, а ряд свою нет, и наблюдатель
     молчит. Путь целиком и новая подписка: замер после следующей раскладки. */
  if (document.fonts?.status === "loading") {
    document.fonts.ready.then(() => {
      if (ctx.signal.aborted || state === "expanded" || state === "wrap") return;
      show("full");
      unwatch();
      unwatch = observeSize(host, watcher);
    });
  }

  ctx.on(toggle, "click", () => (state === "expanded" ? settle() : show("expanded")));

  /* Касание даёт pointerleave сразу после отпускания, до click: путь свернулся бы
     из-под пальца. Поэтому уход указателя — только у мыши. */
  ctx.on(host, "pointerleave", (event) => {
    if (event.pointerType === "mouse" && state === "expanded") settle();
  });
  ctx.on(host, "focusout", (event) => {
    if (state === "expanded" && !host.contains(event.relatedTarget)) settle();
  });

  /* Ветка закрылась: поповер ещё вернёт фокус на свою кнопку — решаем после него. */
  ctx.on(host, "popover:close", () => {
    queueMicrotask(() => {
      if (ctx.signal.aborted) return;
      if (state === "wrap") settle();
      else if (state === "expanded" && !host.matches(":hover") && !host.contains(document.activeElement)) settle();
    });
  });

  return {
    host,
    destroy() {
      for (const [node, attrs] of saved) restore(node, attrs);
    },
  };
}

export default defineComponent({
  name: "breadcrumb",
  selector: SELECTOR,
  create,
});
