/* Жизненный цикл компонента: реестр экземпляров по хосту, идемпотентный mount,
   снятие поддерева, слушатели экземпляра на одном AbortSignal.

     export default defineComponent({
       name: "tabs",
       selector: "[data-ui-tabs]",          // без selector — программный модуль
       create(host, ctx, options) { … return { destroy() {}, …методы } },  // или null
       api: ({ get }) => ({ open(host) { get(host)?.open(); } }),
     });

   setup() отдаёт один и тот же замороженный объект: mount(root), unmount(root),
   get(host), create(host, options) и методы api. Пока у модуля нет ни одного
   экземпляра, unmount не обходит поддерево: перерисовка куска страницы снимает
   все загруженные модули, а стоят у неё обычно несколько.

   unmount(root) снимает и хосты в открытых панелях, унесённых из-под root в body
   (core/layer.js portal). Ошибка в destroy или уборке одного хоста идёт в консоль
   и не мешает снять остальные. */

import { emit, hostsOf } from "./dom.js";
import { portaledFrom } from "./layer.js";

export function defineComponent({ name, selector = null, create, api = null }) {
  const instances = new WeakMap();
  /* Программные хосты по селектору не найти — держим их, пока не сняли. */
  const living = selector ? null : new Set();
  let facade = null;
  let live = 0;

  /* Уборка в обратном порядке; упавшая не обрывает следующие. */
  function clean(host, cleanups) {
    for (const fn of cleanups.reverse()) {
      try {
        fn();
      } catch (error) {
        console.error(`[EOKIT] ${name}: уборка не прошла`, host, error);
      }
    }
  }

  function start(host, options) {
    const existing = instances.get(host);
    if (existing) return existing.instance;
    const controller = new AbortController();
    const { signal } = controller;
    const cleanups = [];
    const ctx = {
      signal,
      on(target, type, listener, opts) {
        const base = typeof opts === "boolean" ? { capture: opts } : opts;
        target.addEventListener(type, listener, { ...base, signal });
      },
      emit: (type, detail, opts) => emit(host, type, detail, opts),
      cleanup(fn) {
        cleanups.push(fn);
      },
    };
    let instance;
    try {
      instance = create(host, ctx, options);
    } catch (error) {
      console.error(`[EOKIT] ${name}: хост не поставлен`, host, error);
      controller.abort();
      clean(host, cleanups);
      return null;
    }
    if (!instance) {
      controller.abort();
      clean(host, cleanups);
      return null;
    }
    instances.set(host, { instance, controller, cleanups });
    living?.add(host);
    live += 1;
    return instance;
  }

  function stop(host) {
    const record = instances.get(host);
    if (!record) return false;
    instances.delete(host);
    living?.delete(host);
    live -= 1;
    try {
      record.instance.destroy?.();
    } catch (error) {
      console.error(`[EOKIT] ${name}: хост не снят чисто`, host, error);
    }
    record.controller.abort();
    clean(host, record.cleanups);
    return true;
  }

  /* Хосты под root и в панелях, унесённых из-под него: список берётся до снятия —
     снятый поповер вернёт панель на место, и её хосты уже не в body. */
  function targets(root) {
    const scopes = [root, ...portaledFrom(root)];
    if (!selector) return [...living].filter((host) => scopes.some((scope) => scope === host || scope.contains?.(host)));
    return scopes.length === 1 ? hostsOf(root, selector) : scopes.flatMap((scope) => hostsOf(scope, selector));
  }

  function setup() {
    if (facade) return facade;
    const get = (host) => instances.get(host)?.instance ?? null;
    facade = Object.freeze({
      mount(root = document) {
        if (!selector) return;
        for (const host of hostsOf(root, selector)) start(host);
      },
      unmount(root = document) {
        if (!live) return;
        for (const host of targets(root)) stop(host);
      },
      get,
      create: start,
      ...(api ? api({ get }) : null),
    });
    return facade;
  }

  return { name, selector, setup };
}
