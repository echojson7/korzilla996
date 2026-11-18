/* Спиннер, скелетон и неопределённую полосу прогресса (без aria-valuenow) рисует
   CSS. Модуль только останавливает их бесконечную анимацию вне экрана:
   data-offscreen → animation-play-state: paused. Один общий IntersectionObserver
   на все хосты (core/observe.js). Хост полосы — любая .ui-progress__bar: доля
   появляется и пропадает на ходу, а снятие ищет хосты по селектору; ставить
   паузу только неопределённой полосе — дело CSS. */
import { defineComponent } from "../../core/component.js";
import { setData } from "../../core/dom.js";
import { observeVisible } from "../../core/observe.js";

function create(host) {
  const stop = observeVisible(host, (visible) => setData(host, "offscreen", !visible));
  return {
    destroy() {
      stop();
      setData(host, "offscreen", null);
    },
  };
}

export default defineComponent({ name: "spinner", selector: ".ui-spinner, .ui-skeleton, .ui-progress__bar", create });
