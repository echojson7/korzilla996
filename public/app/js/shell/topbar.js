/* Разметка шапки: кнопка панели, вкладки недавних страниц, справа — подпись
   страницы, поиск, помощник, заявки, язык (сегменты кита) и тема. Поведение —
   в shell/index.js, панель помощника — js/ai/panel.js. */

import { html, raw } from "../ui/html.js";
import { icon, e3d } from "../ui/icons.js";
import { kbd, isDark } from "../ui/kit.js";
import { t, label } from "../core/i18n.js";
import { isOn } from "../ai/assistant.js";
import { isOpen } from "../ai/panel.js";

const tip = (text) => raw(`data-ui-tooltip="${String(text).replace(/"/g, "&quot;")}" data-side="bottom" aria-label="${String(text).replace(/"/g, "&quot;")}"`);

function tab(page, index, here, crumb) {
  return html`<div class="tab" ${here ? raw('aria-current="page"') : ""}>
    <a class="tab__link" href="${index.href(page.id)}">${e3d(page.icon ?? "file-text")}<span class="tab__title">${label(page.title)}</span>${here && crumb
      ? html`<span class="ui-icon ui-icon--xs tab__chev" data-ui-icon="chevron-right" aria-hidden="true"></span><span class="tab__crumb">${crumb}</span>` : ""}</a>
    <button class="ui-close tab__x" type="button" data-action="close-tab" data-id="${page.id}" aria-label="${t("Close tab")}">${icon("x")}</button>
  </div>`;
}

/* Помощник: открывает и закрывает панель справа, ⌘J — то же. Выключен в
   настройках — кнопка спрятана (её показывает js/ai/panel.js). */
const assistant = () => html`<button class="ui-btn ui-btn--ghost ui-btn--icon-sm" type="button" data-action="assistant" aria-controls="assist" aria-expanded="${isOpen()}" aria-keyshortcuts="Meta+J Control+J" ${isOn() ? "" : raw("hidden")} ${tip(t("Assistant"))}>${icon("ai")}<template data-tooltip>${t("Assistant")}${kbd("⌘", "J")}</template></button>`;

/* tabs — id страниц; page — текущая (null — адрес не найден). */
export function topbar({ index, tabs, page, crumbs = [] }) {
  const dark = isDark();
  const crumb = crumbs.length ? label(crumbs.at(-1).label) : "";
  const requests = index.page("requests") && index.canAccess(index.page("requests"));
  return html`
    <button class="ui-btn ui-btn--ghost ui-btn--icon-sm" type="button" data-action="sidebar" ${tip(t("Toggle sidebar"))}>${icon("panel-left")}</button>
    <span class="top__sep"></span>
    <nav class="tabs" aria-label="${t("Open pages")}">
      ${tabs.map((id) => index.page(id)).filter(Boolean).map((entry) => tab(entry, index, entry.id === page?.id, crumb))}
      ${page ? "" : html`<div class="tab" aria-current="page"><span class="tab__link">${e3d("circle-help")}<span class="tab__title">${t("Not found")}</span></span></div>`}
      <button class="ui-btn ui-btn--ghost ui-btn--icon-sm tabs__add" type="button" data-action="palette" ${tip(t("Open page"))}>${icon("plus")}</button>
    </nav>
    <div class="top__end">
      <button class="ui-input ui-input--sm search-trigger top__search" type="button" data-action="palette">${icon("search", "xs")}<span>${t("Search…")}</span>${kbd("⌘", "K")}</button>
      <button class="ui-btn ui-btn--ghost ui-btn--icon-sm top__search-btn" type="button" data-action="palette" ${tip(t("Search"))}>${icon("search")}</button>
      ${assistant()}
      ${requests ? html`<a class="ui-btn ui-btn--ghost ui-btn--icon-sm" href="${index.href("requests")}" ${tip(t("Requests"))}>${icon("bell-dot")}</a>` : ""}
      <button class="ui-btn ui-btn--ghost ui-btn--icon-sm" type="button" data-action="theme" ${tip(dark ? t("Light mode") : t("Dark mode"))}>${icon(dark ? "sun" : "moon")}</button>
    </div>`;
}
