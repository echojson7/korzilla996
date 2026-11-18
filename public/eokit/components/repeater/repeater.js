/* Редактируемый список (repeater): пункты переставляют, удаляют сбоку и
   добавляют снизу. Перестановку целиком ведёт sortable — ручка, меню «выше,
   ниже», клавиатура, призрак и слот; этот модуль ставит кнопки удаления, ведёт
   «Добавить» и анимирует появление и уход пункта. Без модуля разметка — обычный
   список с кнопкой под ним.

     <div class="ui-repeater" data-ui-repeater data-min="1">
       <ol data-ui-sortable aria-label="Этапы заказа">
         <li data-ui-sortable-item data-value="new"><span data-ui-sortable-label>Новый</span></li>
       </ol>
       <button class="ui-repeater__add" type="button" data-ui-repeater-add>Добавить этап</button>
     </div>

   data-variant="secondary" — поля и бейджи внутри серые; карточка белая в обоих.
   data-min и data-max — сколько пунктов оставить и сколько завести: на пределе
   гаснут кнопки удаления или «Добавить». Своя кнопка удаления —
   [data-ui-repeater-remove] среди детей пункта, иначе модуль ставит свою в конец
   строки. Подпись в кнопках — data-label пункта, иначе текст его подписи.
   Поля пункта в ряд — .ui-repeater__fields (столбцов — --ui-repeater-cols),
   подписи столбцов над списком — .ui-repeater__head.

   События — с корня, всплывают:
     repeater:add      нажали «Добавить». Приложение заводит пункт и отдаёт его
                       kit("repeater").add(host, item): тот вырастает на месте.
     repeater:remove   нажали удаление (detail: item, value, index). Отменяемое:
                       preventDefault — приложение спросит само и потом позовёт
                       remove(host, item).
     repeater:removed  пункт свернулся и ушёл из документа (detail: value, index,
                       order). Здесь приложение правит свои данные: перерисовка
                       раньше оборвала бы анимацию.
   Перестановка — sortable:change со списка, через корень он тоже всплывает.

   API: add(host, item | html, { focus }) → пункт; remove(host, item) → промис;
   appear(host, item) — вырастить пункт, который приложение вставило само (после
   перерисовки); refresh(host); getOrder(host). При reduced motion — без анимации. */

import { defineComponent } from "../../core/component.js";
import { el, setAttr } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";
import { readMs, readVar, reducedMotion } from "../../core/tokens.js";
import sortable from "../sortable/sortable.js";

const SELECTOR = "[data-ui-repeater]";
const LIST = "[data-ui-sortable]";
const ITEM = "[data-ui-sortable-item]";
const REMOVE = "[data-ui-repeater-remove]";
const ADD = "[data-ui-repeater-add]";
const LABEL = "[data-ui-sortable-label]";
const FIELD = "input:not([type='hidden'], [type='checkbox'], [type='radio']), textarea, [contenteditable='true']";

const t = messages("repeater", {
  ru: { remove: "Удалить: {label}", item: "пункт" },
  en: { remove: "Remove: {label}", item: "item" },
});

const valueOf = (item) => item.dataset.value || item.id || "";
const labelOf = (item) => (item.dataset.label || item.querySelector(LABEL)?.textContent || valueOf(item) || t("item")).trim();

/* Высота пункта едет вместе с зазором списка: у не первого пункта уходит зазор
   над ним, у первого — под ним. Ключевые кадры — от полной строки к нулю. */
function fold(item, list, index) {
  const height = item.offsetHeight;
  const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
  const side = index > 0 ? "marginTop" : "marginBottom";
  const open = { height: `${height}px`, [side]: "0px", opacity: 1, transform: "none" };
  const shut = { height: "0px", [side]: `${-gap}px`, opacity: 0, transform: "scale(0.98)" };
  return [open, shut];
}

function animate(item, keyframes, duration, easing) {
  try {
    return item.animate(keyframes, { duration, easing });
  } catch {
    return item.animate(keyframes, { duration, easing: "ease-out" });
  }
}

function create(host, ctx) {
  const list = [...host.children].find((node) => node.matches(LIST));
  if (!list) return null;
  const sort = sortable.setup();
  const owned = !sort.get(list);
  if (!sort.create(list)) return null;
  const made = new Set();
  const icons = new Set();
  const leaving = new WeakSet();

  const items = () => [...list.children].filter((node) => node.matches(ITEM) && !leaving.has(node));
  const adders = () => [...host.querySelectorAll(ADD)].filter((node) => node.closest(SELECTOR) === host);
  const removerOf = (item) => [...item.querySelectorAll(REMOVE)].find((node) => node.closest(ITEM) === item) ?? null;
  const limit = (name, fallback) => {
    const value = host.dataset[name] ? Number(host.dataset[name]) : Number.NaN;
    return Number.isFinite(value) ? value : fallback;
  };

  /* Кнопка удаления — в конец строки, которую собрал sortable. */
  function decorate(item) {
    let button = removerOf(item);
    if (!button) {
      button = el("button", { type: "button", class: "ui-btn ui-btn--ghost ui-btn--icon-xs ui-repeater__remove", data: { uiRepeaterRemove: "" } }, icon("trash"));
      made.add(button);
      (item.querySelector(":scope > .ui-sortable__row") ?? item).append(button);
    }
    button.classList.add("ui-repeater__remove");
    setAttr(button, "aria-label", t("remove", { label: labelOf(item) }));
  }

  function paint() {
    const all = items();
    const min = limit("min", 0);
    const max = limit("max", Infinity);
    for (const item of all) {
      decorate(item);
      setAttr(removerOf(item), "disabled", all.length <= min);
    }
    for (const button of adders()) {
      if (!button.querySelector(".ui-icon")) {
        const plus = icon("plus");
        icons.add(plus);
        button.prepend(plus);
      }
      setAttr(button, "disabled", all.length >= max);
    }
  }

  function refresh() {
    sort.refresh(list);
    paint();
  }

  function motion(name) {
    const styles = getComputedStyle(host);
    return { duration: readMs(styles, name, 200), easing: readVar(styles, "--ui-ease", "ease-out") };
  }

  function appear(item) {
    if (reducedMotion() || !item.isConnected) return Promise.resolve();
    const { duration, easing } = motion("--ui-repeater-in");
    const [open, shut] = fold(item, list, items().indexOf(item));
    item.classList.add("is-entering");
    const animation = animate(item, [{ ...shut, transform: "translateY(-4px)" }, { opacity: 0, offset: 0.2 }, open], duration, easing);
    const done = () => item.classList.remove("is-entering");
    return animation.finished.then(done, done);
  }

  function add(node, { focus: take = "auto" } = {}) {
    let item = node;
    if (typeof node === "string") {
      const template = document.createElement("template");
      template.innerHTML = node.trim();
      item = template.content.firstElementChild;
    }
    if (!item) return null;
    list.append(item);
    refresh();
    appear(item);
    const field = take ? item.querySelector(FIELD) : null;
    if (field || take === true) focus(field ?? removerOf(item), { reveal: true });
    return item;
  }

  /* Фокус после удаления — на соседнюю кнопку удаления, без соседей — на
     «Добавить»: клавиатура остаётся там, где была. */
  async function remove(item) {
    if (!item || leaving.has(item) || item.parentElement !== list) return;
    const all = items();
    const index = all.indexOf(item);
    const value = valueOf(item);
    const rest = all.filter((one) => one !== item);
    const held = item.contains(document.activeElement);
    leaving.add(item);
    item.inert = true;
    item.classList.add("is-leaving");
    paint();
    if (!reducedMotion()) {
      const { duration } = motion("--ui-repeater-out");
      await animate(item, fold(item, list, index), duration, readVar(host, "--ui-ease-out", "ease-out")).finished.catch(() => {});
    }
    item.remove();
    leaving.delete(item);
    refresh();
    if (held) {
      const next = rest[index] ?? rest[index - 1];
      focus((next && removerOf(next)) ?? adders().find((button) => !button.disabled) ?? null);
    }
    ctx.emit("repeater:removed", { value, index, order: sort.getOrder(list) ?? [] });
  }

  ctx.on(host, "click", (event) => {
    const button = event.target.closest?.(`${REMOVE}, ${ADD}`);
    if (!button || button.disabled || button.closest(SELECTOR) !== host) return;
    if (button.matches(ADD)) {
      ctx.emit("repeater:add", { host });
      return;
    }
    const item = button.closest(ITEM);
    if (!item || item.parentElement !== list) return;
    const detail = { item, value: valueOf(item), index: items().indexOf(item) };
    if (ctx.emit("repeater:remove", detail, { cancelable: true })) remove(item);
  });
  /* Перенос мог вернуть пункт на место и пересобрать строку — подписи заново. */
  ctx.on(list, "sortable:change", paint);

  paint();

  return {
    add,
    remove,
    appear,
    refresh,
    getOrder: () => sort.getOrder(list),
    destroy() {
      for (const button of made) button.remove();
      for (const plus of icons) plus.remove();
      made.clear();
      icons.clear();
      if (owned) sort.unmount(list);
    },
  };
}

export default defineComponent({
  name: "repeater",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    add: (host, item, options) => get(host)?.add(item, options) ?? null,
    remove: (host, item) => get(host)?.remove(item) ?? Promise.resolve(),
    appear: (host, item) => get(host)?.appear(item) ?? Promise.resolve(),
    refresh: (host) => void get(host)?.refresh(),
    getOrder: (host) => get(host)?.getOrder() ?? null,
  }),
});
