/* Страница-форма: шапка, форма во вкладках кита (открытая — в адресе,
   ?section=…) или одной панелью, плашка «Сохранить» внизу. На ней стоят
   «Настройки» и «SEO» (modules/core/settings/page.js — поля в настройках сайта),
   «Персонализация», «CSS стили» и «Иконки» (свои данные и своё сохранение).

   Каркас — formFrame, поведение — formControl: смена вкладки пишется в адрес,
   любая правка красит плашку по dirty(), кнопки плашки и Ctrl/Cmd+S зовут
   save() и discard(). Что считать правкой и как сохранять — дело страницы. */

import { html, on } from "../ui/html.js";
import { t } from "../core/i18n.js";

/* Открытая вкладка: из адреса или первая. */
export const openTab = (tabs, query) => (tabs.some((tab) => tab.id === query.get("section")) ? query.get("section") : tabs[0].id);

/* tabs — [{ id, text, body }]; lazy — body только у открытой, остальные
   страница дорисует при первом открытии. Одна вкладка (solo) — форма без полосы
   вкладок. */
export function formFrame({ id, cls = "", head, tabs, open, aria = "", solo = false, lazy = false }) {
  const form = solo
    ? html`<form class="set-solo" id="${id}" autocomplete="off" novalidate>
            <div class="set-panel" id="tab-${tabs[0].id}">${tabs[0].body}</div>
          </form>`
    : html`<form class="ui-tabs set-tabs" id="${id}" data-ui-tabs autocomplete="off" novalidate>
          <div class="ui-tabs__list" role="tablist" aria-label="${aria}">${tabs.map((tab) => html`
            <button class="ui-tabs__trigger" type="button" role="tab" data-tab="${tab.id}" aria-controls="tab-${tab.id}" aria-selected="${tab.id === open}">${tab.text}</button>`)}</div>
          ${tabs.map((tab) => html`<div class="ui-tabs__panel set-panel" role="tabpanel" id="tab-${tab.id}" ${tab.id === open ? "" : "hidden"}>${!lazy || tab.id === open ? tab.body : ""}</div>`)}
        </form>`;
  return html`<div class="page settings${cls ? ` ${cls}` : ""}">
      ${head}
      ${form}

      <div class="save-bar" id="save-bar" role="region" aria-label="${t("Unsaved changes")}"><span class="ui-text-muted">${t("Unsaved changes")}</span>
        <button class="ui-btn ui-btn--ghost" type="button" data-save="discard"><span class="ui-btn__label">${t("Discard")}</span></button>
        <button class="ui-btn ui-btn--primary" type="button" data-save="save"><span class="ui-btn__label">${t("Save changes")}</span></button>
      </div>
    </div>`;
}

/* form — узел формы; first — id вкладки без параметра в адресе; onTab(id) —
   до записи в адрес (дорисовать вкладку). */
export function formControl(host, ctx, { form, first, dirty, save, discard, onTab = null }) {
  const bar = host.querySelector("#save-bar");
  const sync = () => bar.classList.toggle("is-on", dirty());
  const selector = `#${form.id}`;
  /* Ctrl+S / Cmd+S — сохранить, а не «сохранить страницу» браузера. */
  const onKey = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    save();
  };
  host.addEventListener("keydown", onKey);
  const offs = [
    on(host, "tabs:change", selector, (event) => {
      if (event.target !== form) return;
      const id = event.detail.trigger.dataset.tab;
      onTab?.(id);
      ctx.setQuery({ section: id === first ? null : id }, { render: false });
    }),
    on(host, "input", selector, sync),
    on(host, "change", selector, sync),
    on(host, "submit", selector, (event) => event.preventDefault()),
    on(host, "click", "[data-save]", (event, button) => (button.dataset.save === "save" ? save() : discard())),
  ];
  return {
    sync,
    off() {
      host.removeEventListener("keydown", onKey);
      offs.forEach((off) => off());
    },
  };
}
