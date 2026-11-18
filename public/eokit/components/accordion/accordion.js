/* Аккордеон: секции в авторской разметке, модуль только открывает и закрывает.

     <div class="ui-accordion" data-ui-accordion data-type="single">
       <div class="ui-accordion__item is-open">
         <h3 class="ui-accordion__heading">
           <button type="button" class="ui-accordion__trigger" aria-expanded="true">
             <span class="ui-accordion__label">Доставка</span>
             <span class="ui-icon ui-accordion__chevron" data-ui-icon="chevron-down"></span>
           </button>
         </h3>
         <div class="ui-accordion__panel">…</div>
       </div>
     </div>

   data-type="single" (по умолчанию) держит открытой одну секцию, и её можно
   закрыть; "multiple" открывает секции независимо. Признак в разметке — is-open
   на пункте или aria-expanded="true" на кнопке; дальше модуль держит их в паре.

   Закрытая панель в разметке может быть hidden (без скрипта не попадает в
   табуляцию). Модуль снимает hidden — иначе display: none и высота не
   анимируется — и держит закрытую панель inert.

   Клавиши — APG: Enter и пробел кнопка переключает сама, ↑ ↓ Home End переносят
   фокус между заголовками. Роль region не ставится: кнопка с aria-controls уже
   называет секцию.

   kit("accordion").toggle(host, item, open?) — item — пункт или его номер; на
   хосте — accordion:toggle (detail: item, open). */

import { defineComponent } from "../../core/component.js";
import { ensureId, ownPart, ownParts, restore, setAttr, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { moveIndex } from "../../core/keys.js";

const SELECTOR = "[data-ui-accordion]";
const ITEM = ".ui-accordion__item";
const TRIGGER = ".ui-accordion__trigger";
const PANEL = ".ui-accordion__panel";
const OPEN = "is-open";

const TRIGGER_ATTRS = ["id", "aria-expanded", "aria-controls"];
const PANEL_ATTRS = ["id", "hidden", "inert"];

function create(host, ctx) {
  /* Пункты и части — только свои: вложенный аккордеон живёт своим хостом. */
  const pairs = [];
  for (const item of ownParts(host, ITEM, SELECTOR)) {
    const trigger = ownPart(item, TRIGGER, ITEM);
    const panel = ownPart(item, PANEL, ITEM);
    if (trigger && panel) pairs.push({ item, trigger, panel, saved: [item.classList.contains(OPEN), snapshot(trigger, TRIGGER_ATTRS), snapshot(panel, PANEL_ATTRS)] });
  }
  if (!pairs.length) return null;
  const multiple = host.dataset.type === "multiple";

  const isOpen = (pair) => pair.item.classList.contains(OPEN);

  function apply(pair, open, notify) {
    const { item, trigger, panel } = pair;
    const was = isOpen(pair);
    setAttr(panel, "hidden", null);
    /* Фокус из закрывающейся панели — на её кнопку, пока inert его не сбросил. */
    if (notify && !open && panel.contains(document.activeElement)) focus(trigger);
    item.classList.toggle(OPEN, open);
    setAttr(trigger, "aria-expanded", String(open));
    setAttr(panel, "inert", !open);
    if (notify && was !== open) ctx.emit("accordion:toggle", { item, open });
  }

  /* Одиночный режим закрывает соседей в том же кадре: высоты меняются местами
     одной анимацией, без рывка списка. */
  function toggle(pair, open = !isOpen(pair)) {
    if (open && !multiple) for (const other of pairs) if (other !== pair) apply(other, false, true);
    apply(pair, open, true);
  }

  const authored = (pair) => isOpen(pair) || pair.trigger.getAttribute("aria-expanded") === "true";
  const keep = multiple ? null : pairs.find(authored);
  for (const pair of pairs) {
    setAttr(pair.trigger, "aria-controls", ensureId(pair.panel, "ui-accordion-panel"));
    ensureId(pair.trigger, "ui-accordion-trigger");
  }
  for (const pair of pairs) apply(pair, multiple ? authored(pair) : pair === keep, false);

  const pairOf = (target) => pairs.find(({ trigger }) => trigger === target.closest?.(TRIGGER));
  const usable = (pair) => !pair.trigger.disabled;

  ctx.on(host, "click", (event) => {
    const pair = pairOf(event.target);
    if (pair && usable(pair)) toggle(pair);
  });

  ctx.on(host, "keydown", (event) => {
    const pair = pairOf(event.target);
    if (!pair) return;
    const next = moveIndex(event, pairs.indexOf(pair), pairs.length, { skip: (at) => !usable(pairs[at]) });
    if (next === null) return;
    event.preventDefault();
    /* Заголовок за краем окна — подвести к нему. */
    focus(pairs[next].trigger, { reveal: true });
  });

  return {
    host,
    toggle(target, open) {
      const pair = typeof target === "number" ? pairs[target] : pairs.find(({ item }) => item === target);
      if (pair && open !== isOpen(pair)) toggle(pair, open);
    },
    destroy() {
      for (const { item, trigger, panel, saved } of pairs) {
        item.classList.toggle(OPEN, saved[0]);
        restore(trigger, saved[1]);
        restore(panel, saved[2]);
      }
    },
  };
}

export default defineComponent({
  name: "accordion",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    toggle: (host, item, open) => void get(host)?.toggle(item, open),
  }),
});
