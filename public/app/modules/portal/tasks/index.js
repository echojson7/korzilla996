/* Задачи: два вида — канбан и таблица (переключатель справа над списком, вид
   помнится). Вкладки «Мои», «Поручил», «Просрочены», «Все» отбирают задачи в обоих.

   Канбан — как в Битрикс24: колонки по статусу во всю высоту окна, у каждой
   своя прокрутка, доска листается вбок. Карточку тащат целиком (сортируемые
   списки кита одной группы, data-drag="item"), шапка колонки считает карточки,
   «+» в шапке открывает быструю задачу вверху колонки (Enter — добавить и
   ввести следующую, Esc — закрыть). Щелчок по карточке или строке открывает
   задачу панелью. В адресе: вкладка (?tab), вид (?view), открытая задача (?open). */

import { html, on, fragment } from "../../../js/ui/html.js";
import { icon, avatar } from "../../../js/ui/icons.js";
import { loadKit, openPanel, toast, kit } from "../../../js/ui/kit.js";
import { pageHead, status, empty } from "../../../js/ui/blocks.js";
import { toolbar, segments, listCard, listTable } from "../../../js/views/list.js";
import { shortDate } from "../../../js/ui/format.js";
import { TASKS, TASK_STATES, WHO, ME, DEALS, TODAY, day } from "../data.js";
import { overdue, open } from "../module.js";

/* role — чьи задачи; в таблице «Мои» и «Поручил» без завершённых, в канбане
   завершённые стоят в своей колонке. */
const TABS = {
  mine: { label: "Мои", role: (task) => task.owner === ME.id },
  given: { label: "Поручил", role: (task) => task.author === ME.id && task.owner !== ME.id },
  overdue: { label: "Просрочены", role: overdue },
  all: { label: "Все", role: () => true },
};
const tabOf = (query) => (TABS[query.get("tab")] ? query.get("tab") : "mine");
const testOf = (tab, view) => (view === "board" || tab === "all" ? TABS[tab].role : (task) => TABS[tab].role(task) && open(task));

const VIEW_KEY = "k996.tasks.view";
const VIEWS = { board: { label: "Канбан", glyph: "columns-3" }, table: { label: "Таблица", glyph: "list" } };
function viewOf(query) {
  const asked = query.get("view");
  if (VIEWS[asked]) return asked;
  try { return VIEWS[localStorage.getItem(VIEW_KEY)] ? localStorage.getItem(VIEW_KEY) : "board"; } catch { return "board"; }
}

const tomorrow = day(1);
const dueText = (task) => (task.deadline < tomorrow && task.deadline >= TODAY ? "сегодня" : task.deadline < day(2) && task.deadline >= tomorrow ? "завтра" : shortDate(task.deadline));
function deadline(task) {
  if (!task.deadline) return html`<span class="faint">без срока</span>`;
  return html`<span class="${overdue(task) ? "tk-late" : ""}">${dueText(task)}</span>`;
}
const person = (id) => html`<span class="tk-person">${avatar(WHO[id], "xs")}<span>${WHO[id].name}</span></span>`;
const dealOf = (task) => DEALS.find((deal) => deal.id === task.deal);
const find = (id) => TASKS.find((task) => String(task.id) === String(id));
const matches = (task, text) => !text || `${task.title} ${dealOf(task)?.title ?? ""} ${dealOf(task)?.company ?? ""} ${WHO[task.owner].name} ${WHO[task.author].name} ${task.id}`.toLowerCase().includes(text.toLowerCase());

/* ---- Таблица ------------------------------------------------------------------ */

const COLUMNS = [
  { label: "Задача", icon: icon("clipboard-list"), width: 360 },
  { label: "Ответственный", icon: icon("user"), width: 200 },
  { label: "Постановщик", icon: icon("user"), width: 200 },
  { label: "Срок", icon: icon("calendar"), sort: "date", width: 140 },
  { label: "Статус", icon: icon("status-progress"), width: 150 },
];

const row = (task) => {
  const deal = dealOf(task);
  return html`<tr data-entry="${task.id}" data-open="${task.id}" class="tk-row">
    <td data-cell="title"><span class="tk-title${task.state === "done" ? " is-done" : ""}">${task.title}</span>${deal ? html`<span class="tk-sub">${deal.title} · ${deal.company}</span>` : ""}</td>
    <td>${person(task.owner)}</td>
    <td>${person(task.author)}</td>
    <td data-sort-value="${task.deadline?.toISOString() ?? "9"}">${deadline(task)}</td>
    <td>${status(TASK_STATES[task.state].label, TASK_STATES[task.state].tone)}</td>
  </tr>`;
};

/* ---- Канбан ------------------------------------------------------------------- */

const STAGES = { new: "Новые", work: "Выполняются", review: "На проверке", done: "Завершены" };

/* Срок на карточке — строка с иконкой: просрочен красным, сегодня жёлтым, дальше серым. */
function due(task) {
  const tag = (tone, glyph, text) => html`<span class="tk-due" data-tone="${tone}">${icon(glyph)}<span>${text}</span></span>`;
  if (task.state === "done") return tag("green", "check", "Завершена");
  if (!task.deadline) return tag("none", "calendar", "Без срока");
  if (overdue(task)) return tag("red", "circle-alert", `Просрочена · ${shortDate(task.deadline)}`);
  return tag(task.deadline < tomorrow ? "amber" : "gray", "clock", dueText(task));
}

const card = (task) => {
  const deal = dealOf(task);
  return html`<li data-ui-sortable-item data-value="${task.id}" data-label="${task.title}">
    <button class="tk-card" type="button" data-ui-sortable-label data-open="${task.id}">
      <span class="tk-card__title${task.state === "done" ? " is-done" : ""}">${task.title}</span>
      ${deal ? html`<span class="tk-card__deal">${icon("briefcase")}<span>${deal.title}</span></span>` : ""}
      <span class="tk-card__foot">${due(task)}<span class="tk-card__who ui-avatar-group" title="${WHO[task.author].name} → ${WHO[task.owner].name}">${task.author !== task.owner ? avatar(WHO[task.author], "sm") : ""}${avatar(WHO[task.owner], "sm")}</span></span>
    </button>
  </li>`;
};

const byOrder = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity);

function board(list) {
  return html`<div class="tk-board" data-board>${Object.entries(STAGES).map(([id, label]) => {
    const cards = list.filter((task) => task.state === id).sort(byOrder);
    return html`<section class="tk-col" data-state="${id}" style="--tk-tone: var(--ui-${TASK_STATES[id].tone})">
      <header class="tk-col__head">
        <span class="tk-col__title">${label}</span>
        <span class="ui-badge ui-badge--count" data-count="${id}">${cards.length}</span>
        <button class="ui-btn ui-btn--ghost ui-btn--icon-xs tk-col__add" type="button" data-quick="${id}" aria-label="Быстрая задача в «${label}»" title="Быстрая задача">${icon("plus")}</button>
      </header>
      <form class="tk-quick" data-quick-form="${id}" hidden>
        <input class="ui-input ui-input--sm" type="text" name="title" placeholder="Что нужно сделать?" aria-label="Название задачи" autocomplete="off" required>
        <div class="tk-quick__actions">
          <button class="ui-btn ui-btn--primary ui-btn--xs" type="submit"><span class="ui-btn__label">Добавить</span></button>
          <button class="ui-btn ui-btn--ghost ui-btn--xs" type="button" data-quick-close><span class="ui-btn__label">Отмена</span></button>
        </div>
      </form>
      <ol class="ui-sortable tk-col__list" data-ui-sortable data-drag="item" data-group="tasks" data-state-list="${id}" aria-label="${label}">${cards.map(card)}</ol>
    </section>`;
  })}</div>`;
}

/* ---- Панель задачи ------------------------------------------------------------ */

const NEXT = { new: ["work", "Начать"], work: ["review", "На проверку"], review: ["done", "Завершить"] };

function sheet(task) {
  const deal = dealOf(task);
  const step = NEXT[task.state];
  return html`<div class="ui-modal__body">
      <dl class="ui-props ui-props--plate">
        <div><dt>Статус</dt><dd>${status(TASK_STATES[task.state].label, TASK_STATES[task.state].tone)}</dd></div>
        <div><dt>Ответственный</dt><dd>${person(task.owner)}</dd></div>
        <div><dt>Постановщик</dt><dd>${person(task.author)}</dd></div>
        <div><dt>Срок</dt><dd>${deadline(task)}</dd></div>
        ${deal ? html`<div><dt>Сделка</dt><dd>${deal.title} · ${deal.company}</dd></div>` : ""}
      </dl>
    </div>
    ${step ? html`<div class="ui-modal__footer"><button class="ui-btn" type="button" data-step="${step[0]}"><span class="ui-btn__label">${step[1]}</span></button></div>` : ""}`;
}

export default {
  crumbs: ({ query }) => [{ label: TABS[tabOf(query)].label }],
  async render({ query, page }) {
    const view = viewOf(query);
    await loadKit(view === "board" ? ["sortable", "tabs"] : ["tableSort", "tabs"]);
    const tab = tabOf(query);
    const list = TASKS.filter(testOf(tab, view));
    const late = TASKS.filter(overdue).length;
    const tabs = Object.entries(TABS).map(([key, one]) => ({ key, label: one.label, count: TASKS.filter(testOf(key, view)).length }));
    const views = Object.entries(VIEWS).map(([key, one]) => ({ key, label: html`${icon(one.glyph)}${one.label}` }));
    return html`<div class="page tk${view === "board" ? " tk--board" : ""}">
      ${pageHead(page.title, late ? `Просрочено: ${late}` : "Всё в срок", html`
        <button class="ui-btn" type="button" data-new>${icon("plus")}<span class="ui-btn__label">Задача</span></button>`, page.icon)}
      ${toolbar({
        search: { placeholder: "Название задачи, сделка или сотрудник", value: query.get("q") ?? "" },
        tabs: segments("tab", "Задачи", tabs, tab),
        end: segments("view", "Вид", views, view),
      })}
      ${view === "board" ? board(list) : listCard({
        some: list.length > 0,
        table: listTable({ id: "tk-table", cls: "tk-table", label: page.title, columns: COLUMNS, rows: list.map(row) }),
        empty: empty({ art: "clipboard-list", title: "Задач нет", text: tab === "overdue" ? "Всё сделано в срок." : "Здесь появятся задачи." }),
      })}
    </div>`;
  },

  mount(host, ctx) {
    const view = viewOf(ctx.query);
    try { localStorage.setItem(VIEW_KEY, view); } catch {}

    const show = (task) => {
      const panel = openPanel(sheet(task), { title: task.title, description: `Задача №${task.id}`, onClose: () => ctx.setQuery({ open: null }, { render: false }) });
      ctx.setQuery({ open: task.id }, { render: false });
      on(panel.host, "click", "[data-step]", (event, button) => {
        task.state = button.dataset.step;
        task.order = -Date.now();
        if (task.state === "done") {
          panel.close();
          toast(`Задача завершена: «${task.title}»`);
        } else panel.refresh(sheet(task));
        ctx.admin.changed();
        ctx.refresh();
      });
    };

    /* Счётчик колонки — видимые карточки (поиск прячет лишние на месте). */
    const repaint = (id) => {
      const count = host.querySelector(`[data-count="${id}"]`);
      if (count) count.textContent = host.querySelectorAll(`[data-state-list="${id}"] [data-ui-sortable-item]:not([hidden])`).length;
    };
    const repaintAll = () => Object.keys(STAGES).forEach(repaint);
    /* Порядок карточек колонки после переноса — в данные: перерисовка его сохранит. */
    const keepOrder = (list) => [...list.querySelectorAll("[data-ui-sortable-item]")].forEach((item, at) => {
      const task = find(item.dataset.value);
      if (task) task.order = at;
    });

    /* Поиск прячет строки и карточки на месте: перерисовка сбросила бы фокус поля. */
    const filter = (text) => {
      if (view === "board") {
        for (const item of host.querySelectorAll("[data-ui-sortable-item]")) item.hidden = !matches(find(item.dataset.value), text);
        repaintAll();
      } else for (const tr of host.querySelectorAll("tbody tr")) tr.hidden = !matches(find(tr.dataset.entry), text);
      ctx.setQuery({ q: text || null }, { render: false });
    };
    if (ctx.query.get("q")) filter(ctx.query.get("q"));
    const opened = find(ctx.query.get("open"));
    if (opened) show(opened);

    /* Быстрая задача: форма вверху колонки, после добавления остаётся открытой. */
    const quick = (id) => {
      for (const form of host.querySelectorAll("[data-quick-form]")) if (form.dataset.quickForm !== id) form.hidden = true;
      const form = host.querySelector(`[data-quick-form="${id}"]`);
      if (!form) return;
      form.hidden = false;
      form.elements.title.focus();
    };
    const closeQuick = (form) => {
      form.hidden = true;
      form.reset();
    };
    const add = (form) => {
      const title = form.elements.title.value.trim();
      if (!title) return form.elements.title.focus();
      const state = form.dataset.quickForm;
      const task = { id: Math.max(...TASKS.map((one) => one.id)) + 1, title, owner: ME.id, author: ME.id, deadline: null, state, deal: null, order: -Date.now() };
      TASKS.push(task);
      const list = host.querySelector(`[data-state-list="${state}"]`);
      list.prepend(fragment(card(task)));
      kit("sortable").refresh(list);
      list.scrollTop = 0;
      keepOrder(list);
      repaint(state);
      form.reset();
      form.elements.title.focus();
      ctx.admin.changed();
    };

    let timer = 0;
    const offs = [
      on(host, "sortable:change", "[data-state-list]", (event, list) => {
        if (list !== event.detail.root) return;
        const { item } = event.detail;
        const state = list.dataset.stateList;
        keepOrder(list);
        repaint(state);
        const task = find(item.dataset.value);
        if (!task || task.state === state || !list.contains(item)) return;
        const before = task.state;
        task.state = state;
        repaint(before);
        item.querySelector(".tk-card__title")?.classList.toggle("is-done", state === "done");
        const foot = item.querySelector(".tk-card__foot");
        if (foot) foot.firstElementChild.replaceWith(fragment(due(task)));
        ctx.admin.changed();
        toast(state === "done" ? `Задача завершена: «${task.title}»` : `«${task.title}» → ${STAGES[state]}`);
      }),
      on(host, "click", "[data-open]", (event, target) => {
        const task = find(target.dataset.open);
        if (task) show(task);
      }),
      on(host, "click", "[data-quick]", (event, button) => quick(button.dataset.quick)),
      on(host, "click", "[data-quick-close]", (event, button) => closeQuick(button.closest("form"))),
      on(host, "submit", "[data-quick-form]", (event, form) => {
        event.preventDefault();
        add(form);
      }),
      on(host, "keydown", "[data-quick-form]", (event, form) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        closeQuick(form);
        form.parentElement.querySelector("[data-quick]")?.focus();
      }),
      on(host, "click", "[data-new]", () => (view === "board" ? quick("new") : toast("Новая задача ставится в канбане: «+» в шапке колонки", { type: "info" }))),
      on(host, "input", "[data-search]", (event, input) => { clearTimeout(timer); timer = setTimeout(() => filter(input.value.trim()), 120); }),
      on(host, "tabs:change", '[data-segments="tab"]', (event) => ctx.setQuery({ tab: event.detail.trigger.dataset.value === "mine" ? null : event.detail.trigger.dataset.value, open: null })),
      on(host, "tabs:change", '[data-segments="view"]', (event) => {
        const next = event.detail.trigger.dataset.value;
        try { localStorage.setItem(VIEW_KEY, next); } catch {}
        ctx.setQuery({ view: next, open: null });
      }),
    ];
    return () => { clearTimeout(timer); offs.forEach((off) => off()); };
  },
};
