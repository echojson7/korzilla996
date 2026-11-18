/* Запуск админки.

   1. sites/index.js — сайты и id их слоёв; сами слои (sites/layers.js) — одним
      куском после данных сайта.
   2. Разом: кит EOKIT, данные сайта, замена иконок и вид — одним кругом по сети.
   3. start(сайт): слои → compose → check → индекс → register слоёв → оболочка.
   4. Маршрут: hash → страница манифеста → ctx → view.
   5. Помощник (js/ai): реестр сайта до entry модулей, панель — одна на админку.
   6. Заказы и покупатели сайта вместо демо, если админка открыта на сайте
      и администратор вошёл (js/data/live.js); не вошёл — экран входа
      (js/shell/login.js).

   Смена сайта — тот же start() без перезагрузки: другие слои, другое меню,
   другие страницы. */

import config, { loadLayers } from "../sites/index.js";
import { compose, check, createIndex } from "./core/manifest.js";
import { counters, sources, actions, search, settings, reset, registerEntries } from "./core/extensions.js";
import { parse, go, patchQuery } from "./core/router.js";
import { createView } from "./core/view.js";
import { usePrefix, read, write } from "./core/store.js";
import { t, label } from "./core/i18n.js";
import { loadKit, kit, toast, openPanel } from "./ui/kit.js";
import { registerGlyphs, applyIcons } from "./ui/icons.js";
import { html } from "./ui/html.js";
import { createShell } from "./shell/index.js";
import { skills, subjects, prompts, briefs, features, isOn, useSite, setRoute } from "./ai/assistant.js";
import { initAssistant, onSite, ask } from "./ai/panel.js";
import { ME } from "./data/fixtures.js";
import { loadLive } from "./data/live.js";
import { session } from "./data/api.js";
import { loginScreen } from "./shell/login.js";
import { loadIcons } from "./data/icons.js";
import { loadAppearance } from "./data/appearance.js";
import { readLook, applyLook, applyAdminCss } from "./ui/look.js";

const app = document.getElementById("app");
const side = document.getElementById("side");
const top = document.getElementById("top");
const host = document.getElementById("view");

/* Старт — функцией, без await на верхнем уровне модуля: кусок страницы
   импортирует этот же файл, и ждать его загрузки, пока он сам ждёт, нельзя. */
async function main() {
  /* Всё, чего старт ждёт от сети, уходит одним кругом: модули кита, данные сайта,
     замена иконок («Внешний вид → Иконки») и вид сайта с CSS админки. */
  const kitReady = loadKit();
  const loadSite = (fresh) => Promise.all([loadLive(), loadIcons(), loadAppearance(fresh)]);
  let [live, iconChoice, look] = await loadSite();
  /* Админка на сайте, а не вошли — окно входа. Без движка (витрина на другом
     хосте) — демо. */
  if (!live) {
    const state = await session();
    if (state && !state.admin) {
      await kitReady;
      await loginScreen();
    } else if (state?.admin) [live, iconChoice, look] = await loadSite(true);
  }
  await kitReady;
  /* На сайте с данными: правки в браузере — под ключом сайта, отдельно от демо,
     а переключатель показывает настоящее название сайта. */
  usePrefix(live ? `${config.app.storageKey}.${live.key}` : config.app.storageKey);
  if (live) {
    const site = config.sites.find((entry) => entry.id === config.default) ?? config.sites[0];
    Object.assign(site, { name: live.site.name, domain: new URL(live.site.url).host, logo: null });
  }
  registerGlyphs(kit("icons"));
  /* Вид админки («Внешний вид → Персонализация»): index.html уже поставил его до
     первого кадра, здесь — то же через кит, чтобы «как в системе» следила за ОС. */
  applyLook(readLook());
  /* Замена иконок и CSS админки («CSS стили») — до первой отрисовки: иначе меню
     мигнуло бы глифами кита, а страница — без стиля. */
  await applyIcons(kit("icons"), iconChoice);
  applyAdminCss(look.css.admin);
  /* Слои манифестов — после данных сайта и приставки хранилища: их модули
     считают своё от «сейчас» и от пришедших данных. */
  const layers = await loadLayers();

  /* Право пользователя: «*» — всё. Бэкенд CMS отдаст список прав вместе с профилем. */
  const can = (permission) => ME.permissions.includes("*") || ME.permissions.includes(permission);

  /* То, что видят entry модулей и страницы (ctx.admin). */
  const admin = {
    counters, sources, actions, search, settings,
    me: ME,
    site: null,
    index: null,
    go,
    toast,
    openPanel,
    /* Модуль поменял данные — перерисовать счётчики и пункты из данных. */
    changed: () => shell.refresh(),
    /* Помощник: модули учат его своему (js/ai/assistant.js), страницы спрашивают. */
    assistant: { skills, subjects, prompts, briefs, features, on: isOn, ask },
  };

  const view = createView(host);
  const shell = createShell({ app, side, top, me: ME, onSite: (id) => start(id, true), onRetry: () => show() });
  initAssistant({ admin, app, aside: document.getElementById("assist") });

  function fatal(title, lines) {
    view.clear();
    side.innerHTML = "";
    top.innerHTML = "";
    host.innerHTML = String(html`<div class="page page--center"><div class="fatal"><h1 class="page-title">${title}</h1><ul>${lines.map((line) => html`<li>${line}</li>`)}</ul></div></div>`);
  }

  let index = null;

  function start(siteId, announce = false) {
    const site = config.sites.find((entry) => entry.id === siteId) ?? config.sites.find((entry) => entry.id === config.default) ?? config.sites[0];
    const manifest = compose(site.layers.map((id) => layers[id]), config.app);
    const errors = check(manifest);
    if (errors.length) {
      console.error("Manifest errors:", errors);
      return fatal(t("The site manifest has errors"), errors);
    }
    const next = createIndex(manifest, { can });
    reset();
    admin.site = site;
    admin.index = next;
    useSite(site);
    registerEntries(next.entries, admin);
    index = next;
    write("site", site.id);
    shell.setSite(index, site, config.sites);
    shell.rebuild();
    onSite();
    /* Сменили сайт, а открытой страницы на нём нет — на главную. */
    if (announce && !parse(index).page) go(index.href(index.app.home));
    show();
    if (announce) toast(t("Switched to {name}", { name: site.name }));
  }

  function show() {
    if (!index) return;
    const route = parse(index);
    const ctx = {
      ...route,
      index,
      admin,
      href: index.href,
      go,
      label,
      /* Фильтры в адрес без новой записи истории, затем перерисовка; render: false —
         только адрес (страница уже показала выбор сама: вкладка, панель). */
      setQuery(patch, { render = true } = {}) {
        ctx.query = route.query = patchQuery(index, route, patch);
        if (render) show();
      },
      refresh: () => show(),
    };
    shell.navigate(route);
    setRoute(ctx);
    view.show(ctx, (module, ready) => shell.ready(module, ready));
  }

  addEventListener("hashchange", show);
  start(read("site", config.default));
}

main();
