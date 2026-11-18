/* Отрисовка маршрута в рабочую панель. Один проход:
   cleanup прошлой страницы → unmount кита → page.load() (ленивый импорт модуля) →
   render(ctx) → mount кита → page.mount(host, ctx) → cleanup.

   У прохода свой номер: поздний import устаревшего маршрута отбрасывается.
   Модуль не загрузился или render бросил — блок с причиной и «Повторить».

   Контракт модуля страницы (load в манифесте отдаёт модуль с default):
     export default {
       render(ctx) → разметка (может быть async),
       mount?(host, ctx) → cleanup,
       crumbs?(ctx) → [{ label }],   хвост вкладки в шапке
     } */

import { mount, unmount } from "../ui/kit.js";
import { failure, notFound, placeholder } from "../ui/blocks.js";
import { label } from "./i18n.js";

export function createView(host) {
  let generation = 0;
  let cleanup = null;
  let shown = null;

  function clear() {
    try { cleanup?.(); } catch (error) { console.error(error); }
    cleanup = null;
    unmount(host);
  }

  /* Вход: блоки страницы каскадом, первые шесть по очереди, остальные
     вместе с шестым — длинная страница не должна проявляться секунду. */
  function enter(page) {
    if (!page) return;
    [...page.children].slice(0, 6).forEach((el, i) => el.style.setProperty("--i", i));
    page.classList.add("is-entering");
    const runs = [page, ...page.children].flatMap((el) => el.getAnimations());
    Promise.allSettled(runs.map((a) => a.finished)).then(() => page.classList.remove("is-entering"));
  }

  /* ctx уже собран оболочкой; onReady(module, ctx) — шапке нужны crumbs. */
  async function show(ctx, onReady) {
    const mine = ++generation;
    const { page } = ctx;
    const same = shown && shown === page?.id;
    let module = null;
    try {
      if (page?.load) module = (await page.load()).default;
      if (mine !== generation) return;
      const markup = !page ? notFound(ctx.hash, ctx.href(ctx.index.app.home)) : module ? await module.render(ctx) : placeholder(label(page.title), label(page.description));
      if (mine !== generation) return;
      const scroll = host.scrollTop;
      clear();
      host.innerHTML = String(markup);
      if (page?.width) host.firstElementChild?.setAttribute("data-width", page.width);
      mount(host);
      shown = page?.id ?? null;
      if (same) host.scrollTop = scroll;
      else {
        host.scrollTop = 0;
        enter(host.firstElementChild);
      }
      onReady?.(module, ctx);
      cleanup = module?.mount?.(host, ctx) ?? null;
    } catch (error) {
      if (mine !== generation) return;
      console.error(error);
      clear();
      shown = null;
      host.innerHTML = String(failure(error));
      onReady?.(null, ctx);
    }
  }

  return { show, clear };
}
