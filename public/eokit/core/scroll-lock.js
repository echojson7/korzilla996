/* Блокировка прокрутки документа — общий ресурс для слоёв, которым она нужна
   (просмотр карусели; окно и палитра страницу не запирают: под ними она
   листается). Каждая блокировка — своя: снимает её только тот, кто поставил.

     const release = lockScroll();   // прокрутка заперта
     release();                       // снята, если других блокировок нет; повтор — ничего

   Полоса прокрутки при блокировке пропадает, и страница стала бы шире на её
   ширину. Ширину меряем разницей до и после, а не формулой: если у страницы свой
   scrollbar-gutter, разницы нет и поле не нужно. Поле — padding корня с той
   физической стороны, где была полоса: Chromium держит её справа и в RTL, а
   inline-end там — левый край, и страница съехала бы на ширину полосы. Сторону
   выдаёт край корня, сдвинувшийся при снятии полосы. Ту же величину получает
   --ui-scroll-lock-gap, чтобы фиксированные тосты и бар отступили сами (fixed
   padding корня не видит). */

const locks = new Set();
let saved = null;

function engage() {
  const root = document.documentElement;
  /* Чтения до записи: одна вынужденная раскладка — замер после overflow, без неё
     ширину полосы и её сторону не узнать. */
  const width = root.clientWidth;
  const left = root.getBoundingClientRect().left;
  const styles = getComputedStyle(root);
  saved = { overflow: root.style.overflow, side: null, padding: "" };
  root.style.overflow = "hidden";
  const gap = root.clientWidth - width;
  if (gap <= 0) return;
  const side = root.getBoundingClientRect().left < left ? "paddingLeft" : "paddingRight";
  saved.side = side;
  saved.padding = root.style[side];
  root.style[side] = `calc(${styles[side]} + ${gap}px)`;
  root.style.setProperty("--ui-scroll-lock-gap", `${gap}px`);
}

function disengage() {
  const root = document.documentElement;
  root.style.overflow = saved.overflow;
  if (saved.side) {
    root.style[saved.side] = saved.padding;
    root.style.removeProperty("--ui-scroll-lock-gap");
  }
  saved = null;
}

export function lockScroll() {
  const lock = {};
  if (!locks.size) engage();
  locks.add(lock);
  return function release() {
    if (!locks.delete(lock) || locks.size) return;
    disengage();
  };
}
