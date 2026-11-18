/* Группа флажков: общий флажок над пунктами. Отмечены все доступные пункты —
   общий отмечен, часть — в нём черта (indeterminate); щелчок по общему ставит его
   значение всем доступным пунктам. Недоступный пункт в счёт не идёт и при
   массовом выборе не меняется; нет доступных пунктов — общий недоступен.

     <div class="ui-checkbox-tree" data-ui-checkbox-tree>
       <label class="ui-check"><input type="checkbox" data-ui-checkbox-parent>…</label>
       <div class="ui-checkbox-tree__children">
         <label class="ui-check"><input type="checkbox" data-ui-checkbox-child>…</label>
       </div>
     </div>

   Группа внутри группы — пункт внешней: черта поднимается наверх, массовый выбор
   спускается вниз. Массовый выбор шлёт input и change с каждого изменённого
   пункта — форма и автосохранение видят их как щелчки. Сброс формы группа видит
   сама; отметки, записанные из кода без события, покажет
   kit("checkboxTree").refresh(host) — на любом уровне: пересчитывается вся
   группа, от внешней до самых вложенных. */

import { defineComponent } from "../../core/component.js";
import { afterReset, ownPart, ownParts, restore, setAttr, snapshot } from "../../core/dom.js";

const SELECTOR = "[data-ui-checkbox-tree]";
const PARENT = "input[data-ui-checkbox-parent]";
const CHILD = "input[data-ui-checkbox-child]";

const parentOf = (tree) => ownPart(tree, PARENT, SELECTOR);

/* Пункты группы: свои флажки и общие флажки групп, вложенных прямо в неё. Список
   — на каждый пересчёт: перерисованные пункты подхватываются без перезапуска. */
function itemsOf(tree) {
  const items = ownParts(tree, CHILD, SELECTOR).filter((input) => !input.matches(PARENT));
  for (const inner of tree.querySelectorAll(SELECTOR)) {
    const head = inner.parentElement.closest(SELECTOR) === tree && parentOf(inner);
    if (head) items.push(head);
  }
  return items;
}

/* on | off | mixed; null — пункт недоступен. Вложенная группа — по своим пунктам,
   а не по своей черте: порядок, в котором группы пересчитываются, не важен. */
function stateOf(item) {
  if (item.matches(PARENT)) return summary(item.closest(SELECTOR));
  return item.disabled ? null : item.checked ? "on" : "off";
}

function summary(tree) {
  let total = 0;
  let on = 0;
  let some = false;
  for (const item of itemsOf(tree)) {
    const state = stateOf(item);
    if (state === null) continue;
    total += 1;
    if (state === "on") on += 1;
    if (state !== "off") some = true;
  }
  if (!total) return null;
  return on === total ? "on" : some ? "mixed" : "off";
}

function create(host, ctx) {
  const parent = parentOf(host);
  if (!parent) return null;
  const saved = snapshot(parent, ["disabled"]);
  const indeterminate = parent.indeterminate;
  /* Свои события массового выбора всплывают сюда же — пересчёт после них один. */
  let cascading = false;

  function sync() {
    const state = summary(host);
    setAttr(parent, "disabled", saved.get("disabled") !== null || state === null);
    parent.checked = state === "on";
    parent.indeterminate = state === "mixed";
  }

  function cascade() {
    const target = parent.checked ? "on" : "off";
    const changed = [];
    for (const item of itemsOf(host)) {
      const state = stateOf(item);
      if (state === null || state === target) continue;
      item.checked = parent.checked;
      item.indeterminate = false;
      changed.push(item);
    }
    /* Общий флажок вложенной группы получает change и сам спускает выбор ниже. */
    cascading = true;
    for (const item of changed) {
      item.dispatchEvent(new Event("input", { bubbles: true }));
      item.dispatchEvent(new Event("change", { bubbles: true }));
    }
    cascading = false;
  }

  /* Один слушатель на группу: change всплывает. Изменение во вложенной группе
     сначала пересчитывает её (она глубже), потом эту. */
  ctx.on(host, "change", (event) => {
    if (cascading) return;
    if (event.target === parent) cascade();
    sync();
  });
  afterReset(ctx, parent, sync);
  sync();

  return {
    host,
    refresh: sync,
    destroy() {
      /* Отметки — данные пользователя, их не трогаем; черта и выключение — модуля. */
      parent.indeterminate = indeterminate;
      restore(parent, saved);
    },
  };
}

export default defineComponent({
  name: "checkboxTree",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    /* Правка во вложенной группе меняет и общие флажки над ней, а правка снаружи —
       под ней: пересчёт — всей группы от внешнего хоста. Каждый уровень считает по
       пунктам, а не по соседям, поэтому порядок не важен. */
    refresh(host) {
      let top = host;
      for (let up = host.parentElement?.closest(SELECTOR); up; up = up.parentElement?.closest(SELECTOR)) top = up;
      for (const tree of [top, ...top.querySelectorAll(SELECTOR)]) get(tree)?.refresh();
    },
  }),
});
