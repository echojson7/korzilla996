/* Оболочка: боковая панель, шапка, палитра, действия и горячие клавиши.
   Разметку дают sidebar.js и topbar.js, здесь — состояние и поведение; панель
   помощника — js/ai/panel.js (⌘J, кнопка в шапке, строка «Спросить» палитры).

   Состояние пользователя (свёрнутая панель, закрытые секции, раскрытые ветки,
   вкладки) лежит в localStorage; ветки и вкладки — отдельно для каждого сайта,
   у сайтов разный набор страниц. */

import { on } from "../ui/html.js";
import { mount, unmount, onPick, toast, isDark, getDensity } from "../ui/kit.js";
import { setLook } from "../ui/look.js";
import { read, write } from "../core/store.js";
import { actions } from "../core/extensions.js";
import { go } from "../core/router.js";
import { t, label, setLang } from "../core/i18n.js";
import { rail, panel } from "./sidebar.js";
import { topbar } from "./topbar.js";
import { openPalette, isOpen, closePalette } from "./palette.js";
import { toggle as toggleAssistant, ask } from "../ai/panel.js";
import { isOn as assistantOn } from "../ai/assistant.js";
import { getEngine, logout } from "../data/api.js";

/* Выход: на сайте — конец сессии (общей со старой админкой) и окно входа;
   на витрине — только тост. */
async function signOut() {
  if (!getEngine()) return toast(t("Signed out of the demo — nothing really changed"));
  try { await logout(); } catch { return toast(t("No connection to the server. Try again.")); }
  location.reload();
}

const narrow = () => matchMedia("(max-width: 1023px)").matches;
const TABS_MAX = 4;

export function createShell({ app, side, top, me, onSite, onRetry }) {
  let index = null;
  let site = null;
  let sites = [];
  let route = null;
  let topState = { page: null, crumbs: [] };
  const state = { collapsed: read("collapsed", false), closed: new Set(read("closed", [])), open: new Set(), tabs: [] };

  /* ---- Отрисовка ---------------------------------------------------------- */

  function renderSide() {
    const scroll = side.querySelector(".panel__scroll")?.scrollTop ?? 0;
    unmount(side);
    side.innerHTML = String(rail(index, railCurrent(), me)) + String(panel(index, site, sites, state));
    app.classList.toggle("is-collapsed", state.collapsed);
    markNav();
    mount(side);
    const scroller = side.querySelector(".panel__scroll");
    if (scroller) scroller.scrollTop = scroll;
  }

  function renderTop() {
    unmount(top);
    top.innerHTML = String(topbar({ index, tabs: state.tabs, ...topState }));
    mount(top);
  }

  /* Кнопка рейки текущей страницы: та, что ведёт на неё; иначе — первая со страницей. */
  function railCurrent() {
    const page = route?.page?.id;
    return index.rail.find((entry) => entry.page === page && !entry.query)?.id
      ?? index.rail.find((entry) => entry.page && !entry.end)?.id ?? null;
  }

  /* Подсветка пункта: точное совпадение адреса (пункт с query) важнее пункта страницы;
     адрес внутри пункта (запись модели под списком модели) — следом. */
  function markNav() {
    if (!route) return;
    const items = [...side.querySelectorAll("a.ui-tree-menu__item[href]")];
    const here = location.hash || "#/";
    const exact = items.find((item) => item.getAttribute("href") === here);
    const id = route.page ? index.navOf(route.page.id) : null;
    const inside = items.find((item) => here.split("?")[0].startsWith(`${item.getAttribute("href")}/`));
    const hit = exact ?? inside ?? items.find((item) => item.dataset.nav === id && !item.getAttribute("href").includes("?"))
      ?? items.find((item) => item.dataset.nav === id) ?? null;
    for (const item of items) {
      if (item === hit) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    const current = railCurrent();
    side.querySelectorAll("[data-rail]").forEach((button) => {
      if (button.dataset.rail === current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  /* Вкладки — недавние страницы, текущая всегда среди них. */
  function rememberTab(id) {
    if (state.tabs.includes(id)) return;
    state.tabs.push(id);
    while (state.tabs.length > TABS_MAX) state.tabs.splice(state.tabs.findIndex((tab) => tab !== id), 1);
    write(`tabs.${site.id}`, state.tabs);
  }

  /* ---- Действия ------------------------------------------------------------ */

  function toggleTheme() {
    setLook({ theme: isDark() ? "light" : "dark" });
    const dark = isDark();
    document.querySelectorAll('[data-pick="theme"]').forEach((item) => item.setAttribute("aria-checked", String(dark)));
    renderTop();
  }

  /* Размер: база или «Крупный» — галочкой в меню аккаунта. */
  function toggleDensity() {
    setLook({ size: getDensity() === "large" ? "base" : "large" });
    const large = getDensity() === "large";
    document.querySelectorAll('[data-pick="density"]').forEach((item) => item.setAttribute("aria-checked", String(large)));
  }

  function palette() {
    openPalette(index, (row) => {
      if (row.ask) ask(row.ask);
      else if (row.href) go(row.href);
      else if (row.action) run(row.action, null, row);
    });
  }

  const soon = (what) => toast(t("{what} is coming soon", { what }));

  const ACTIONS = {
    palette,
    assistant: () => toggleAssistant(),
    theme: toggleTheme,
    density: toggleDensity,
    sidebar() {
      if (narrow()) { app.classList.toggle("is-drawer"); return; }
      state.collapsed = !state.collapsed;
      write("collapsed", state.collapsed);
      renderSide();
    },
    section(button) {
      const id = button.dataset.id;
      if (state.closed.has(id)) state.closed.delete(id);
      else state.closed.add(id);
      write("closed", [...state.closed]);
      const sec = button.closest(".sec");
      sec.toggleAttribute("data-closed", state.closed.has(id));
      sec.querySelector(".sec__toggle")?.setAttribute("aria-expanded", String(!state.closed.has(id)));
    },
    "close-tab"(button) {
      const id = button.dataset.id;
      const at = state.tabs.indexOf(id);
      if (at < 0) return;
      state.tabs.splice(at, 1);
      write(`tabs.${site.id}`, state.tabs);
      if (id !== route?.page?.id) { renderTop(); return; }
      go(index.href(state.tabs[Math.min(at, state.tabs.length - 1)] ?? index.app.home));
    },
    retry: () => onRetry(),
    soon: (button, row) => soon(row?.label ?? button?.dataset.text ?? t("This")),
  };

  /* Имя действия: своё у оболочки или зарегистрированное модулем (extensions.actions). */
  function run(name, button, row) {
    if (ACTIONS[name]) return ACTIONS[name](button, row);
    const action = actions.get(name);
    if (action) return action({ trigger: button, row });
    soon(row?.label ?? button?.dataset.text ?? name);
  }

  on(document, "click", "[data-action]", (event, button) => {
    if (!app.contains(button) && !button.closest(".ui-modal, .ui-popover__menu, [data-popover-panel]")) return;
    event.preventDefault();
    run(button.dataset.action, button);
  });

  /* Пункты меню сайта и аккаунта. */
  onPick(side, ({ value }) => {
    if (value.startsWith("site:")) {
      const id = value.slice(5);
      if (id === "new") soon(t("New site"));
      else if (id !== site.id) onSite(id);
    } else if (value === "theme") toggleTheme();
    else if (value === "density") toggleDensity();
    else if (value === "settings") { if (index.page("settings")) go(index.href("settings")); }
    else if (value === "profile") soon(t("Profile"));
    else if (value.startsWith("lang:")) setLang(value.slice(5));
    else if (value === "signout") signOut();
  });

  /* Ветку раскрывает кит (aria-expanded на строке); запоминаем её состояние. */
  new MutationObserver((records) => {
    let changed = false;
    for (const { target } of records) {
      const id = target.dataset?.branch;
      if (!id) continue;
      const open = target.getAttribute("aria-expanded") === "true";
      if (open !== state.open.has(id)) { open ? state.open.add(id) : state.open.delete(id); changed = true; }
    }
    if (changed) write(`open.${site.id}`, [...state.open]);
  }).observe(side, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });

  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input, textarea, select, [contenteditable]");
    if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key.toLowerCase() === "k" || event.code === "KeyK")) {
      event.preventDefault();
      isOpen() ? closePalette() : palette();
    } else if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key.toLowerCase() === "j" || event.code === "KeyJ") && assistantOn()) {
      event.preventDefault();
      if (isOpen()) closePalette();
      toggleAssistant();
    } else if (event.key === "/" && !typing && !isOpen()) {
      event.preventDefault();
      palette();
    } else if (event.key === "Escape" && app.classList.contains("is-drawer")) app.classList.remove("is-drawer");
  });

  /* ---- Ручка для boot.js ------------------------------------------------- */

  return {
    /* Новый сайт или первый запуск. */
    setSite(nextIndex, nextSite, allSites) {
      index = nextIndex;
      site = nextSite;
      sites = allSites;
      state.open = new Set(read(`open.${site.id}`, ["products", "entries", "start.tour"]));
      state.tabs = read(`tabs.${site.id}`, [index.app.home]).filter((id) => index.page(id));
      topState = { page: null, crumbs: [] };
    },
    /* До отрисовки страницы: подсветка, вкладка, шторка закрыта. */
    navigate(next) {
      route = next;
      app.classList.remove("is-drawer");
      if (next.page) rememberTab(next.page.id);
      if (!side.firstElementChild) renderSide();
      else markNav();
    },
    /* Страница отрисована: шапка берёт её crumbs. */
    ready(module, ctx) {
      topState = {
        page: ctx.page,
        crumbs: (ctx.page && module?.crumbs?.(ctx)) ?? [],
      };
      renderTop();
      document.title = `${ctx.page ? label(ctx.page.title) : t("Not found")} — ${index.app.title ?? "Korzilla"}`;
    },
    /* Данные изменились: счётчики и источники пунктов. */
    refresh: () => renderSide(),
    rebuild() {
      side.innerHTML = "";
      renderSide();
    },
    run,
    toggleTheme,
  };
}
