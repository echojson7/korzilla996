/* Разметка боковой панели: рейка модулей на холсте и панель сайта — переключатель
   сайта, поле команд, разделы из манифеста (дерево разделов кита).
   Только разметка: поведение — в shell/index.js. */

import { html, raw } from "../ui/html.js";
import { hicon, e3d, avatar } from "../ui/icons.js";
import { popover, menu, item, menuSep, menuLabel } from "../ui/kit.js";
import { countOf, sources } from "../core/extensions.js";
import { t, label, lang } from "../core/i18n.js";
import { brandMark } from "./logo.js";

const tip = (text, side = "right") => raw(`data-ui-tooltip="${String(text).replace(/"/g, "&quot;")}" data-side="${side}"`);

/* Ссылка или действие записи манифеста (пункт, кнопка рейки). */
export function target(entry, index) {
  if (entry.page) return { href: index.href(entry.page, { query: entry.query }) };
  if (entry.href) return { href: entry.href };
  return { action: entry.action ?? "soon" };
}

/* Внешний адрес (база знаний и т. п.) открывается в новой вкладке. */
const away = (href) => (/^https?:/.test(href) ? raw(' target="_blank" rel="noopener"') : "");

/* ---- Рейка ------------------------------------------------------------------- */

function railButton(entry, index, current, me) {
  const name = label(entry.label);
  const to = target(entry, index);
  const attrs = raw(`class="ui-btn ui-btn--ghost ui-btn--icon rail__btn" data-rail="${entry.id}" ${tip(name)} aria-label="${name}"${entry.id === current ? ' aria-current="page"' : ""}`);
  const body = hicon(entry.icon, "md");
  return html`${entry.divider ? raw('<span class="rail__sep"></span>') : ""}${to.href
    ? html`<a ${attrs} href="${to.href}"${away(to.href)}>${body}</a>`
    : html`<button ${attrs} type="button" data-action="${to.action}" data-text="${name}">${body}</button>`}`;
}

export function rail(index, current, me) {
  const items = index.rail;
  return html`
    <nav class="rail" aria-label="${t("Apps")}">
      <a class="rail__logo" href="${index.href(index.app.home)}" aria-label="Korzilla 996" ${tip("Korzilla 996")} data-variant="surface" data-delay="0">${brandMark()}<template data-tooltip><span class="ui-tooltip__title">Korzilla 996</span><span class="ui-tooltip__meta">портал компании</span></template></a>
      <div class="rail__nav">${items.filter((entry) => !entry.end).map((entry) => railButton(entry, index, current, me))}</div>
      <div class="rail__end">
        ${items.filter((entry) => entry.end).map((entry) => railButton(entry, index, current, me))}
        ${popover(html`<button class="ui-btn ui-btn--ghost ui-btn--icon rail__me" type="button" data-popover-trigger aria-label="${me.name}">${avatar(me)}</button>`, menu([
          menuLabel(me.name),
          item("profile", hicon("user"), t("Profile")),
          index.page("settings") ? item("settings", hicon("settings"), t("Settings"), { href: index.href("settings") }) : "",
          item("theme", hicon("moon"), t("Dark mode"), { checked: document.documentElement.classList.contains("dark") }),
          item("density", hicon("a-large-small"), t("Large controls"), { checked: document.documentElement.dataset.density === "large" }),
          menuSep,
          menuLabel(t("Language")),
          item("lang:ru", "", "Русский", { radio: lang === "ru" }),
          item("lang:en", "", "English", { radio: lang === "en" }),
          menuSep,
          item("signout", hicon("log-out"), t("Sign out"), { danger: true }),
        ]), { side: "right", align: "end", cls: "rail__account" })}
      </div>
    </nav>`;
}

/* ---- Панель сайта ------------------------------------------------------------ */

/* Знак сайта — аватар кита: логотип (logo в config/sites.json) на белой подложке,
   без логотипа — первая буква названия. */
const siteMark = (site, size = "") => {
  const cls = size ? ` ui-avatar--${size}` : "";
  return site.logo
    ? html`<span class="ui-avatar ui-avatar--logo${cls}">${raw(`<img src="${site.logo}" alt="" decoding="async">`)}</span>`
    : html`<span class="ui-avatar${cls}" data-tone="gray">${site.name.slice(0, 1)}</span>`;
};

/* Меню сайта — только то, что про сайт; тема и выход — в меню аккаунта на рейке.
   Переключения сайтов пока нет: в меню настройки сайта и «Новый сайт», который
   ещё недоступен. */
function siteMenu(site) {
  return popover(html`
    <button class="ui-btn ui-btn--ghost site" type="button" data-popover-trigger aria-label="${site.name}${site.domain ? `, ${site.domain}` : ""}">
      ${siteMark(site)}<span class="ui-btn__label site__name">${site.name}</span>${hicon("chevrons-up-down", "xs")}
    </button>`, menu([
    item("settings", hicon("settings"), "Настройки портала"),
  ]));
}

/* Строка дерева. Ветка — кнопка, раскрывается; лист — ссылка или действие.
   Шеврон ветки — кнопка кита в виде <span>: кнопку в кнопку не вложить, а нажатие
   и так раскрывает строку. */
/* Пункты верхнего уровня — с объёмными иконками набора кита (eokit/icons3d): icon
   пункта или его страницы, та же, что во вкладке, палитре и шапке страницы.
   С line: true — линейная Phosphor (у «Обзора»). */
const leadIcon = (entry, page) => {
  const name = entry.icon ?? page?.icon;
  if (!name) return "";
  return entry.line ? hicon(name, "", { cls: "ui-tree-menu__icon" }) : e3d(name, 0, "ui-tree-menu__icon");
};

/* Конец строки: счётчик, кольцо доли (progress — счётчик, который отдаёт
   { value, max }) или отметка шага (done у пункта из source: true или false). */
function ending(entry) {
  if ("done" in entry) return html`<span class="ui-tree-menu__mark" ${entry.done ? raw('data-state="done"') : ""} aria-label="${entry.done ? t("Done") : t("Not done yet")}" role="img">${hicon("check")}</span>`;
  const meter = entry.progress ? countOf(entry.progress) : null;
  if (meter?.max) {
    const share = Math.round((Math.min(meter.value, meter.max) / meter.max) * 100);
    return html`<span class="ui-progress-ring ui-progress-ring--sm" role="img" aria-label="${t("{done} of {total}", { done: meter.value, total: meter.max })}" style="--ui-value: ${share}" data-tone="green"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ui-progress-ring__track" cx="18" cy="18" r="15" pathLength="100"></circle><circle class="ui-progress-ring__fill" cx="18" cy="18" r="15" pathLength="100"></circle></svg></span>`;
  }
  const count = countOf(entry.count);
  return count != null && count !== 0 ? html`<span class="ui-tree-menu__count">${count}</span>` : "";
}

function node(entry, index, state, depth) {
  const page = entry.page ? index.page(entry.page) : null;
  const name = label(entry.label ?? page?.title);
  const lead = depth ? "" : leadIcon(entry, page);
  const end = ending(entry);
  const children = [...(entry.children ?? []), ...(entry.source ? sources.get(entry.source)?.() ?? [] : [])];
  if (children.length) {
    const open = state.open.has(entry.id);
    return html`<li class="ui-tree-menu__node">
      <button class="ui-tree-menu__item" type="button" aria-expanded="${open}" data-branch="${entry.id}" ${state.collapsed ? tip(name) : ""}>${lead}<span class="ui-tree-menu__label">${name}</span>${end}<span class="ui-btn ui-btn--ghost ui-btn--icon-xs side-toggle" aria-hidden="true">${hicon("chevron-down", "", { turn: "flip" })}</span></button>
      <ul class="ui-tree-menu__list" ${open ? "" : "hidden"}>${children.map((child) => node(child, index, state, depth + 1))}</ul>
    </li>`;
  }
  const to = target(entry, index);
  const attrs = raw(`class="ui-tree-menu__item" data-nav="${entry.id}"${state.collapsed ? ` ${tip(name)}` : ""}`);
  const body = html`${lead}<span class="ui-tree-menu__label">${name}</span>${end}`;
  return html`<li class="ui-tree-menu__node">${to.href
    ? html`<a ${attrs} href="${to.href}"${away(to.href)}>${body}</a>`
    : html`<button ${attrs} type="button" data-action="${to.action}" data-text="${name}" ${entry.value != null ? html`data-value="${entry.value}"` : ""}>${body}</button>`}</li>`;
}

const tree = (items, index, state, name) => html`
  <nav class="ui-tree-menu" data-ui-tree-menu aria-label="${name}"><ul class="ui-tree-menu__list">${items.map((entry) => node(entry, index, state, 0))}</ul></nav>`;


/* Кнопки шапки секции, пока модуль не дал своих (tools): заготовки, без действий. */
const SECTION_TOOLS = [
  { icon: "ellipsis", label: { en: "More", ru: "Ещё" }, action: "soon" },
  { icon: "plus", label: { en: "Add", ru: "Добавить" }, action: "soon" },
];

function section(entry, index, state) {
  const name = label(entry.label);
  if (!entry.label) return tree(entry.items, index, state, t("Main"));
  const closed = state.closed.has(entry.id);
  return html`
    <section class="sec" ${closed ? "data-closed" : ""}>
      <div class="sec__head" ${entry.collapsible ? raw(`data-action="section" data-id="${entry.id}"`) : ""}>
        ${entry.collapsible ? html`<button class="ui-btn ui-btn--ghost ui-btn--icon-xs sec__toggle" type="button" data-action="section" data-id="${entry.id}" aria-expanded="${!closed}" aria-label="${name}">${hicon("chevron-down", "", { turn: "fold" })}</button>` : ""}
        <span class="sec__name">${name}</span>
        ${(entry.tools ?? SECTION_TOOLS).map((tool) => html`<button class="ui-btn ui-btn--ghost ui-btn--icon-xs" type="button" data-action="${tool.action}" data-text="${label(tool.label)}" aria-label="${label(tool.label)}" ${tip(label(tool.label), "top")}>${hicon(tool.icon)}</button>`)}
      </div>
      <div class="sec__body"><div>${tree(entry.items, index, state, name)}</div></div>
    </section>`;
}

/* Раздел с when показывается, пока счётчик when не ложь: временные разделы
   (знакомство с админкой) прячутся без пересборки манифеста. */
const shown = (entry) => !entry.when || !!countOf(entry.when);

export function panel(index, site, sites, state) {
  const [main, ...rest] = index.sections.filter(shown);
  const top = main && !main.label ? main : null;
  return html`
    <div class="panel">
      <div class="panel__head">${siteMenu(site)}</div>
      <div class="panel__scroll">
        <div class="panel__top">
          <button class="ui-input search-trigger" type="button" data-action="palette" ${state.collapsed ? tip(t("Search")) : ""}>${hicon("search", "xs")}<span>${t("Search")}</span><kbd class="ui-kbd">/</kbd></button>
          ${top ? section(top, index, state) : ""}
        </div>
        ${(top ? rest : index.sections.filter(shown)).map((entry) => section(entry, index, state))}
      </div>
    </div>`;
}
