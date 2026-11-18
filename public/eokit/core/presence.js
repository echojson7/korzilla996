/* Вход и уход поверхности по data-state. Анимации живут в CSS: [data-state=open]
   играет вход, [data-state=closing] — уход; JS не знает ни длительностей, ни кривых.

     const p = presence(panel);                // hidden — снаружи, пока закрыта
     p.show();                                  // hidden=false, data-state=open
     await p.hide();                            // closing → (конец анимаций) → hidden
     p.settle();                                // доиграть уход сразу (снятие, повтор)

   Конец ухода — конец анимаций и переходов элемента (getAnimations), а не таймер:
   прерванная анимация тоже конец, при reduced motion их нет — уход мгновенный.
   show() во время ухода его отменяет; устаревший hide() резолвится false. */

import { settled } from "./motion.js";

const LIMIT = 1000;

export function presence(element, { hidden = true, also = [], open = "open", closing = "closing", closed = "" } = {}) {
  let turn = 0;
  let state = element.hidden || element.dataset.state !== open ? "closed" : "open";

  const finish = () => {
    state = "closed";
    if (hidden) element.hidden = true;
    if (element.dataset.state !== closed) element.dataset.state = closed;
  };

  return {
    get state() {
      return state;
    },
    show() {
      turn += 1;
      state = "open";
      if (hidden && element.hidden) element.hidden = false;
      if (element.dataset.state !== open) element.dataset.state = open;
    },
    hide() {
      if (state === "closed") return Promise.resolve(true);
      const mine = (turn += 1);
      state = "closing";
      element.dataset.state = closing;
      /* Не дольше LIMIT: анимация, которую так и не доиграли, не держит слой. */
      let timer = 0;
      const done = Promise.race([settled(element, ...also), new Promise((resolve) => (timer = setTimeout(resolve, LIMIT)))]);
      return done.then(() => {
        clearTimeout(timer);
        if (mine !== turn) return false;
        finish();
        return true;
      });
    },
    settle() {
      if (state !== "closing") return;
      turn += 1;
      finish();
    },
  };
}
