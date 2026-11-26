/* Длинные списки: показываем первые page строк, остальные — по мере
   прокрутки (метка в конце списка попадает в экран — показываем ещё).
   Так канбан и таблица на тысячи задач открываются сразу и не тормозят:
   браузер рисует сотню строк, а не десять тысяч. */

import { nextTick, onBeforeUnmount, reactive } from "vue";

export function useReveal(page = 60) {
  const shown = reactive(new Map<string, number>());
  const marks = new Map<string, HTMLElement>();
  const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = (entry.target as HTMLElement).dataset.more ?? "";
      more(id);
      /* Метка могла остаться в экране — переподписка даст новый сигнал. */
      const el = entry.target;
      io!.unobserve(el);
      nextTick(() => el.isConnected && io!.observe(el));
    }
  }, { rootMargin: "800px 0px" });

  const limit = (id = "") => shown.get(id) ?? page;
  function more(id = "") {
    shown.set(id, limit(id) + page * 2);
  }
  /* :ref для метки в конце списка: <li :ref="mark('pending')" data-more="pending"> */
  const mark = (id = "") => (el: unknown) => {
    const old = marks.get(id);
    if (old && old !== el) io?.unobserve(old);
    if (el instanceof HTMLElement) {
      marks.set(id, el);
      io?.observe(el);
    } else marks.delete(id);
  };
  onBeforeUnmount(() => io?.disconnect());

  return { limit, more, mark };
}
