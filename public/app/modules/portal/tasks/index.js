/* Задачи: вкладки «Мои», «Поручил», «Просрочены», «Все», таблица кита.
   Строка открывает задачу панелью: описание, сделка, кнопки «Начать»,
   «На проверку», «Завершить». Вкладка — в адресе (?tab), открытая задача — ?open. */

import { html, on } from "../../../js/ui/html.js";
import { icon, avatar } from "../../../js/ui/icons.js";
import { loadKit, openPanel, toast } from "../../../js/ui/kit.js";
import { pageHead, status, empty } from "../../../js/ui/blocks.js";
import { toolbar, segments, listCard, listTable } from "../../../js/views/list.js";
import { shortDate } from "../../../js/ui/format.js";
import { TASKS, TASK_STATES, WHO, ME, DEALS, TODAY, day } from "../data.js";
import { overdue, open } from "../module.js";

const TABS = {
  mine: { label: "Мои", test: (task) => task.owner === ME.id && open(task) },
  given: { label: "Поручил", test: (task) => task.author === ME.id && task.owner !== ME.id && open(task) },
  overdue: { label: "Просрочены", test: overdue },
  all: { label: "Все", test: () => true },
};
const tabOf = (query) => (TABS[query.get("tab")] ? query.get("tab") : "mine");

const COLUMNS = [
  { label: "Задача", icon: icon("clipboard-list"), width: 360 },
  { label: "Ответственный", icon: icon("user"), width: 200 },
  { label: "Постановщик", icon: icon("user"), width: 200 },
  { label: "Срок", icon: icon("calendar"), sort: "date", width: 140 },
  { label: "Статус", icon: icon("status-progress"), width: 150 },
];

const tomorrow = day(1);
function deadline(task) {
  if (!task.deadline) return html`<span class="faint">без срока</span>`;
  const late = overdue(task);
  const text = task.deadline < tomorrow && task.deadline >= TODAY ? "сегодня" : task.deadline < day(2) && task.deadline >= tomorrow ? "завтра" : shortDate(task.deadline);
  return html`<span class="${late ? "tk-late" : ""}">${text}</span>`;
}
const person = (id) => html`<span class="tk-person">${avatar(WHO[id], "xs")}<span>${WHO[id].name}</span></span>`;
const dealOf = (task) => DEALS.find((deal) => deal.id === task.deal);

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
    await loadKit(["tableSort", "tabs"]);
    const tab = tabOf(query);
    const list = TASKS.filter(TABS[tab].test);
    const late = TASKS.filter(overdue).length;
    return html`<div class="page tk">
      ${pageHead(page.title, late ? `Просрочено: ${late}` : "Всё в срок", html`
        <button class="ui-btn" type="button" data-new>${icon("plus")}<span class="ui-btn__label">Задача</span></button>`, page.icon)}
      ${toolbar({
        search: { placeholder: "Название задачи, сделка или сотрудник", value: query.get("q") ?? "" },
        tabs: segments("tab", "Задачи", Object.entries(TABS).map(([key, one]) => ({ key, label: one.label, count: TASKS.filter(one.test).length })), tab),
      })}
      ${listCard({
        some: list.length > 0,
        table: listTable({ id: "tk-table", cls: "tk-table", label: page.title, columns: COLUMNS, rows: list.map(row) }),
        empty: empty({ art: "clipboard-list", title: "Задач нет", text: tab === "overdue" ? "Всё сделано в срок." : "Здесь появятся задачи." }),
      })}
    </div>`;
  },

  mount(host, ctx) {
    const find = (id) => TASKS.find((task) => String(task.id) === String(id));
    const show = (task) => {
      const panel = openPanel(sheet(task), { title: task.title, description: `Задача №${task.id}`, onClose: () => ctx.setQuery({ open: null }, { render: false }) });
      ctx.setQuery({ open: task.id }, { render: false });
      on(panel.host, "click", "[data-step]", (event, button) => {
        task.state = button.dataset.step;
        if (task.state === "done") {
          panel.close();
          toast(`Задача завершена: «${task.title}»`);
        } else panel.refresh(sheet(task));
        ctx.admin.changed();
        ctx.refresh();
      });
    };
    const filter = (text) => {
      const words = text.toLowerCase();
      for (const tr of host.querySelectorAll("tbody tr")) tr.hidden = Boolean(words) && !tr.textContent.toLowerCase().includes(words);
      ctx.setQuery({ q: text || null }, { render: false });
    };
    if (ctx.query.get("q")) filter(ctx.query.get("q"));
    const opened = find(ctx.query.get("open"));
    if (opened) show(opened);

    let timer = 0;
    const offs = [
      on(host, "click", "tr[data-open]", (event, tr) => show(find(tr.dataset.open))),
      on(host, "click", "[data-new]", () => toast("Создание задачи появится вместе с сервером портала", { type: "info" })),
      on(host, "input", "[data-search]", (event, input) => { clearTimeout(timer); timer = setTimeout(() => filter(input.value.trim()), 120); }),
      on(host, "tabs:change", '[data-segments="tab"]', (event) => ctx.setQuery({ tab: event.detail.trigger.dataset.value === "mine" ? null : event.detail.trigger.dataset.value, open: null })),
    ];
    return () => { clearTimeout(timer); offs.forEach((off) => off()); };
  },
};
