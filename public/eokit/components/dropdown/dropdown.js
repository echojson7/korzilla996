/* Выпадашка: кнопка, которая открывает меню. Панель, клавиатура, подменю и выбор
   пунктов — у поповера (хост тот же, с data-ui-popover); выпадашка показывает
   выбор на самой кнопке.

     <div class="ui-popover" data-ui-popover data-ui-dropdown>
       <button class="ui-btn" type="button" data-popover-trigger>
         <span class="ui-dropdown__prefix">Сортировка</span>
         <span class="ui-btn__label" data-dropdown-value>Новые</span>
         <span class="ui-icon ui-dropdown__chevron" data-ui-icon="chevron-down"></span>
       </button>
       <div data-popover-panel hidden><div class="ui-popover__menu" role="menu">
         <button class="ui-btn" type="button" role="menuitemradio" aria-checked="true" data-pick="new">…</button>
       </div></div>
     </div>

   [data-dropdown-value] — подпись отмеченного menuitemradio, [data-dropdown-count]
   — сколько отмечено menuitemcheckbox (ноль прячет счётчик). На каждый выбор хост
   шлёт dropdown:change (detail: value — отмеченный вариант, values — отмеченные
   флажки). Отметки, изменённые из кода, покажет kit("dropdown").refresh(host). */

import { defineComponent } from "../../core/component.js";
import { ownPart, setText } from "../../core/dom.js";

const SELECTOR = "[data-ui-dropdown]";

function create(host, ctx) {
  const trigger = ownPart(host, "[data-popover-trigger]", SELECTOR);
  /* Панель берётся до открытия: открытая уходит в body, ссылка на узел остаётся. */
  const panel = ownPart(host, "[data-popover-panel]", SELECTOR);
  if (!trigger || !panel) return null;
  const value = trigger.querySelector("[data-dropdown-value]");
  const count = trigger.querySelector("[data-dropdown-count]");
  const saved = { value: value?.textContent, count: count?.textContent, hidden: count?.hidden };

  const checked = (role) => [...panel.querySelectorAll(`[role='${role}'][aria-checked='true']`)];
  const labelOf = (item) => (item.querySelector(".ui-btn__label") ?? item).textContent.trim();

  function read() {
    const radio = checked("menuitemradio")[0];
    const flags = checked("menuitemcheckbox");
    if (value && radio) setText(value, labelOf(radio));
    if (count) {
      setText(count, String(flags.length));
      count.hidden = flags.length === 0;
    }
    return { value: radio?.dataset.pick ?? null, values: flags.map((item) => item.dataset.pick) };
  }

  /* menu:pick приходит, когда поповер уже переставил отметки. */
  ctx.on(trigger, "menu:pick", () => ctx.emit("dropdown:change", read()));
  read();

  return {
    refresh: read,
    destroy() {
      if (value) setText(value, saved.value);
      if (count) {
        setText(count, saved.count);
        count.hidden = saved.hidden;
      }
    },
  };
}

export default defineComponent({
  name: "dropdown",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (host) => get(host)?.refresh(),
  }),
});
