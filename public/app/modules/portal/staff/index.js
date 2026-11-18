/* Сотрудники: вкладки по отделам и таблица кита. Руководитель отдела отмечен,
   отпуск — серым чипом. Поиск прячет строки на месте. */

import { html, on } from "../../../js/ui/html.js";
import { icon, avatar } from "../../../js/ui/icons.js";
import { loadKit, toast } from "../../../js/ui/kit.js";
import { pageHead, status } from "../../../js/ui/blocks.js";
import { toolbar, segments, listCard, listTable } from "../../../js/views/list.js";
import { STAFF, DEPARTMENTS, plural } from "../data.js";

const tabOf = (query) => (DEPARTMENTS[query.get("dept")] ? query.get("dept") : "all");

const COLUMNS = [
  { label: "Сотрудник", icon: icon("user"), width: 300 },
  { label: "Отдел", icon: icon("users"), width: 180 },
  { label: "Телефон", icon: icon("phone"), sort: "none", width: 180 },
  { label: "Почта", icon: icon("mail"), sort: "none", width: 220 },
  { label: "Сейчас", icon: icon("clock"), width: 200 },
];

const row = (one) => html`<tr>
  <td data-cell="title" data-sort-value="${one.name}"><span class="st-person">${avatar(one)}<span class="st-person__text"><span class="st-person__name">${one.name}</span><span class="st-person__role">${one.role}${one.head && !/руковод|директор/i.test(one.role) ? " · руководитель отдела" : ""}</span></span></span></td>
  <td>${DEPARTMENTS[one.dept].name}</td>
  <td class="num"><a class="ui-link" href="tel:${one.phone.replace(/[^\d+]/g, "")}">${one.phone}</a></td>
  <td><a class="ui-link" href="mailto:${one.email}">${one.email}</a></td>
  <td>${one.away ? status(one.away, "olive") : status("На работе", "green")}</td>
</tr>`;

export default {
  crumbs: ({ query }) => (tabOf(query) === "all" ? [] : [{ label: DEPARTMENTS[tabOf(query)].name }]),
  async render({ query, page }) {
    await loadKit(["tableSort", "tabs"]);
    const tab = tabOf(query);
    const list = tab === "all" ? STAFF : STAFF.filter((one) => one.dept === tab);
    const tabs = [{ key: "all", label: "Все", count: STAFF.length }, ...Object.entries(DEPARTMENTS).map(([key, dept]) => ({ key, label: dept.name, count: STAFF.filter((one) => one.dept === key).length }))];
    return html`<div class="page st">
      ${pageHead(page.title, `${plural(STAFF.length, "сотрудник", "сотрудника", "сотрудников")} в ${plural(Object.keys(DEPARTMENTS).length, "отделе", "отделах", "отделах")}`, html`
        <button class="ui-btn ui-btn--secondary" type="button" data-invite>${icon("plus")}<span class="ui-btn__label">Пригласить</span></button>`, page.icon)}
      ${toolbar({ search: { placeholder: "Имя, должность или телефон", value: query.get("q") ?? "" }, tabs: segments("dept", "Отделы", tabs, tab) })}
      ${listCard({ some: true, table: listTable({ id: "st-table", cls: "st-table", label: page.title, columns: COLUMNS, rows: list.map(row) }), empty: "" })}
    </div>`;
  },

  mount(host, ctx) {
    const filter = (text) => {
      const words = text.toLowerCase();
      for (const tr of host.querySelectorAll("tbody tr")) tr.hidden = Boolean(words) && !tr.textContent.toLowerCase().includes(words);
      ctx.setQuery({ q: text || null }, { render: false });
    };
    if (ctx.query.get("q")) filter(ctx.query.get("q"));
    let timer = 0;
    const offs = [
      on(host, "input", "[data-search]", (event, input) => { clearTimeout(timer); timer = setTimeout(() => filter(input.value.trim()), 120); }),
      on(host, "click", "[data-invite]", () => toast("Приглашения появятся вместе со входом сотрудников", { type: "info" })),
      on(host, "tabs:change", '[data-segments="dept"]', (event) => ctx.setQuery({ dept: event.detail.trigger.dataset.value === "all" ? null : event.detail.trigger.dataset.value })),
    ];
    return () => { clearTimeout(timer); offs.forEach((off) => off()); };
  },
};
