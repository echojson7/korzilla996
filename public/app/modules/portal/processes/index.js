/* Бизнес-процессы: шаблоны, выгруженные из Битрикс24. Сверху — сколько их
   по видам, ниже таблица: где работает шаблон, сколько в нём действий, как
   запускается. Движка процессов ещё нет, поэтому у всех «Ждёт движка». */

import { html, on } from "../../../js/ui/html.js";
import { icon } from "../../../js/ui/icons.js";
import { loadKit } from "../../../js/ui/kit.js";
import { pageHead, status, stat } from "../../../js/ui/blocks.js";
import { toolbar, segments, listCard, listTable } from "../../../js/views/list.js";
import { number } from "../../../js/ui/format.js";
import { PROCESSES, BP_KINDS, plural } from "../data.js";

const tabOf = (query) => (BP_KINDS[query.get("kind")] ? query.get("kind") : "all");

const COLUMNS = [
  { label: "Шаблон", icon: icon("file-text"), width: 420 },
  { label: "Где работает", icon: icon("layers"), width: 160 },
  { label: "Действий", icon: icon("list"), sort: "number", num: true, width: 120 },
  { label: "Запуск", icon: icon("play"), width: 180 },
  { label: "Состояние", icon: icon("status-pending"), width: 160 },
];

const row = (one) => html`<tr>
  <td data-cell="title"><span class="bp-name">${one.name}</span>${one.note ? html`<span class="bp-note">${one.note}</span>` : ""}</td>
  <td>${BP_KINDS[one.kind].label}</td>
  <td class="ui-table__num" data-sort-value="${one.actions}">${number(one.actions)}</td>
  <td>${one.auto ? "Автоматически" : "Вручную"}</td>
  <td>${status("Ждёт движка", "amber")}</td>
</tr>`;

function auto(kind) {
  const n = PROCESSES.filter((one) => one.kind === kind && one.auto).length;
  return n ? plural(n, "запускается сам", "запускаются сами", "запускаются сами") : "все запускаются вручную";
}

export default {
  crumbs: ({ query }) => (tabOf(query) === "all" ? [] : [{ label: BP_KINDS[tabOf(query)].label }]),
  async render({ query, page }) {
    await loadKit(["tableSort", "tabs"]);
    const tab = tabOf(query);
    const list = tab === "all" ? PROCESSES : PROCESSES.filter((one) => one.kind === tab);
    const actions = PROCESSES.reduce((sum, one) => sum + one.actions, 0);
    const tabs = [{ key: "all", label: "Все", count: PROCESSES.length }, ...Object.entries(BP_KINDS).map(([key, kind]) => ({ key, label: kind.label, count: PROCESSES.filter((one) => one.kind === key).length }))];
    return html`<div class="page bp">
      ${pageHead(page.title, `${plural(PROCESSES.length, "шаблон", "шаблона", "шаблонов")} из Битрикс24, ${plural(actions, "действие", "действия", "действий")}`, "", page.icon)}
      <div class="grid g-4">
        ${Object.entries(BP_KINDS).map(([key, kind]) => stat({ label: kind.label, value: number(PROCESSES.filter((one) => one.kind === key).length), sub: html`<span>${auto(key)}</span>` }))}
      </div>
      ${toolbar({ search: { placeholder: "Название шаблона", value: query.get("q") ?? "" }, tabs: segments("kind", "Виды", tabs, tab), cls: "bp-bar" })}
      ${listCard({ some: true, table: listTable({ id: "bp-table", cls: "bp-table", label: page.title, columns: COLUMNS, rows: list.map(row) }), empty: "" })}
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
      on(host, "tabs:change", '[data-segments="kind"]', (event) => ctx.setQuery({ kind: event.detail.trigger.dataset.value === "all" ? null : event.detail.trigger.dataset.value })),
    ];
    return () => { clearTimeout(timer); offs.forEach((off) => off()); };
  },
};
