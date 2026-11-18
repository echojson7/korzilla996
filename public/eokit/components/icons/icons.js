/* Иконки из разметки: span[data-ui-icon="check"] становится <svg> глифа кита,
   span[data-ui-e3d="house"] — <img> объёмной иконки из eokit/icons3d.
   Хосты, вставленные позже (меню приложения, строки шаблонов), дорисовывает один
   наблюдатель за документом. Модули кита ставят иконки сами — icon() из
   core/icons.js, — этот модуль им не нужен.

     <span class="ui-icon" data-ui-icon="search" aria-hidden="true"></span>
     <span class="ui-e3d" data-ui-e3d="house" style="--ui-e3d: 24px"></span>
     kit("icons").register("brand", "<path d='…'/>", { viewBox: "0 0 32 32" });
     await kit("icons").apply({ "shopping-cart": "hugeicons" })   — глиф из набора
                                                  на замену (core/icon-sets.js) */

import { e3dSrc, has, hydrate, names, register } from "../../core/icons.js";
import { apply, refresh, loadSet, loadIndex, glyphOf } from "../../core/icon-sets.js";

let observer = null;

/* Узел, который успели убрать до записи наблюдателя (перерисовка куска страницы),
   не дорисовывается; поиск хостов внутри — один, в hydrate. */
function watch() {
  observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1 && node.isConnected && !(node instanceof SVGElement)) hydrate(node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/* Тот же контракт, что у defineComponent: setup() каждый раз отдаёт один объект. */
const api = Object.freeze({
  mount(root = document) {
    if (!observer) watch();
    hydrate(root);
  },
  unmount() {},
  register,
  has,
  names,
  e3dSrc,
  /* Наборы на замену: apply(выбор) → имена, чей глиф поменялся; refresh(имена)
     перерисовывает уже стоящие иконки. */
  apply: async (choice) => {
    const changed = await apply(choice);
    refresh(changed);
    return changed;
  },
  refresh,
  loadSet,
  loadIndex,
  glyphOf,
});

export default { name: "icons", selector: "[data-ui-icon], [data-ui-e3d]", setup: () => api };
