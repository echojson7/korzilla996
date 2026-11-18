/* Сделки: канбан воронки. Вкладки сверху — воронки, колонки — стадии. Карточку
   переносят ручкой между колонками (сортируемые списки кита одной группы), шапка
   колонки пересчитывает число и сумму. Щелчок по карточке открывает сделку
   панелью сбоку. Воронка и открытая сделка — в адресе (?funnel, ?open). */

import { html, on } from "../../../js/ui/html.js";
import { icon, avatar } from "../../../js/ui/icons.js";
import { loadKit, openPanel, toast } from "../../../js/ui/kit.js";
import { pageHead, status } from "../../../js/ui/blocks.js";
import { toolbar, segments } from "../../../js/views/list.js";
import { money, shortDate } from "../../../js/ui/format.js";
import { DEALS, FUNNELS, WHO, TASKS, TASK_STATES, plural } from "../data.js";

const funnelOf = (query) => (FUNNELS[query.get("funnel")] ? query.get("funnel") : "sites");
const stageOf = (deal) => FUNNELS[deal.funnel].stages.find(([id]) => id === deal.stage);
const total = (list) => list.reduce((sum, deal) => sum + deal.sum, 0);

function matches(deal, text) {
  if (!text) return true;
  return `${deal.title} ${deal.company} ${WHO[deal.owner].name} ${deal.id}`.toLowerCase().includes(text.toLowerCase());
}

function next(deal) {
  if (!deal.next) return "";
  const [text, offset] = deal.next;
  const late = offset < 0;
  const when = offset === 0 ? "сегодня" : offset === 1 ? "завтра" : late ? "просрочено" : `через ${plural(offset, "день", "дня", "дней")}`;
  return html`<span class="dl-next${late ? " is-late" : ""}">${icon(late ? "circle-alert" : "clock")}<span>${text} · ${when}</span></span>`;
}

const card = (deal) => html`<li data-ui-sortable-item data-value="${deal.id}" data-label="${deal.title}">
  <button class="dl-card" type="button" data-ui-sortable-label data-open="${deal.id}">
    <span class="dl-card__title">${deal.title}</span>
    <span class="dl-card__company">${deal.company}</span>
    <span class="dl-card__row"><span class="dl-card__sum">${money(deal.sum)}</span>${avatar(WHO[deal.owner], "xs")}</span>
    ${next(deal)}
  </button>
</li>`;

const head = (id, label, list) => html`<header class="dl-col__head">
  <span class="dl-col__title">${label}</span><span class="ui-badge ui-badge--count" data-count="${id}">${list.length}</span>
  <span class="dl-col__sum" data-sum="${id}">${money(total(list))}</span>
</header>`;

function board(funnel) {
  const deals = DEALS.filter((deal) => deal.funnel === funnel);
  return html`<div class="dl-board">${FUNNELS[funnel].stages.map(([id, label, tone]) => {
    const list = deals.filter((deal) => deal.stage === id);
    return html`<section class="dl-col" data-stage="${id}" style="--dl-tone: var(--ui-${tone})">
      ${head(id, label, list)}
      <ol class="ui-sortable dl-col__list" data-ui-sortable data-group="deals" data-stage-list="${id}" aria-label="${label}">${list.map(card)}</ol>
    </section>`;
  })}</div>`;
}

function sheet(deal) {
  const [, stage, tone] = stageOf(deal);
  const tasks = TASKS.filter((task) => task.deal === deal.id);
  const owner = WHO[deal.owner];
  return html`<div class="ui-modal__body dl-sheet">
    <dl class="ui-props ui-props--plate">
      <div><dt>Стадия</dt><dd>${status(stage, tone)}</dd></div>
      <div><dt>Сумма</dt><dd>${money(deal.sum)}</dd></div>
      <div><dt>Компания</dt><dd>${deal.company}</dd></div>
      <div><dt>Ответственный</dt><dd class="dl-person">${avatar(owner, "xs")}${owner.name}</dd></div>
      <div><dt>Воронка</dt><dd>${FUNNELS[deal.funnel].name}</dd></div>
      <div><dt>Создана</dt><dd>${shortDate(deal.created)}</dd></div>
    </dl>
    <section><h3 class="ui-text-heading dl-sheet__head">Задачи по сделке</h3>
      ${tasks.length ? html`<div class="ui-list ui-list--sm">${tasks.map((task) => html`<div class="ui-list__row"><span class="ui-list__text"><span class="ui-list__title">${task.title}</span><span class="ui-list__sub">${WHO[task.owner].name}${task.deadline ? ` · до ${shortDate(task.deadline)}` : ""}</span></span><span class="ui-list__end">${status(TASK_STATES[task.state].label, TASK_STATES[task.state].tone)}</span></div>`)}</div>`
        : html`<p class="ui-text-muted">Задач нет.</p>`}
    </section>
    <section><h3 class="ui-text-heading dl-sheet__head">Бизнес-процесс</h3>
      <p class="ui-text-muted">Сделку ведёт шаблон «Весь процесс (запускается автоматически)» из Битрикс24. Он заработает, когда появится движок процессов.</p>
    </section>
  </div>`;
}

export default {
  crumbs: ({ query }) => [{ label: FUNNELS[funnelOf(query)].name }],
  async render({ query, page }) {
    await loadKit(["sortable", "tabs"]);
    const funnel = funnelOf(query);
    const text = query.get("q") ?? "";
    const deals = DEALS.filter((deal) => deal.funnel === funnel);
    const tabs = Object.entries(FUNNELS).map(([key, one]) => ({ key, label: one.name, count: DEALS.filter((deal) => deal.funnel === key).length }));
    return html`<div class="page dl">
      ${pageHead(page.title, `${plural(deals.length, "сделка", "сделки", "сделок")} на ${money(total(deals))}`, html`
        <button class="ui-btn" type="button" data-new>${icon("plus")}<span class="ui-btn__label">Сделка</span></button>`, page.icon)}
      ${toolbar({ search: { placeholder: "Название, компания или ответственный", value: text }, tabs: segments("funnel", "Воронки", tabs, funnel) })}
      ${board(funnel)}
    </div>`;
  },

  mount(host, ctx) {
    const funnel = funnelOf(ctx.query);
    const find = (id) => DEALS.find((deal) => String(deal.id) === String(id));
    const repaint = (id) => {
      const list = DEALS.filter((deal) => deal.funnel === funnel && deal.stage === id);
      host.querySelector(`[data-count="${id}"]`).textContent = host.querySelectorAll(`[data-stage-list="${id}"] [data-ui-sortable-item]`).length;
      host.querySelector(`[data-sum="${id}"]`).textContent = money(total(list));
    };
    const show = (deal) => {
      const panel = openPanel(sheet(deal), { title: deal.title, description: `№${deal.id} · ${deal.company}`, onClose: () => ctx.setQuery({ open: null }, { render: false }) });
      ctx.setQuery({ open: deal.id }, { render: false });
      return panel;
    };
    /* Поиск прячет карточки на месте: перерисовка сбросила бы фокус поля. */
    const filter = (text) => {
      for (const item of host.querySelectorAll("[data-ui-sortable-item]")) item.hidden = !matches(find(item.dataset.value), text);
      ctx.setQuery({ q: text || null }, { render: false });
    };
    if (ctx.query.get("q")) filter(ctx.query.get("q"));
    const opened = find(ctx.query.get("open"));
    if (opened) show(opened);

    let timer = 0;
    const offs = [
      on(host, "sortable:change", "[data-stage-list]", (event, list) => {
        const { item, from, to } = event.detail;
        if (list !== to?.root && list !== event.detail.root) return;
        const deal = find(item.dataset.value);
        const stage = list.dataset.stageList;
        if (!deal || deal.stage === stage) return repaint(stage);
        const before = deal.stage;
        deal.stage = stage;
        repaint(before);
        repaint(stage);
        ctx.admin.changed();
        toast(`«${deal.title}» → ${stageOf(deal)[1]}`);
      }),
      on(host, "click", "[data-open]", (event, button) => {
        const deal = find(button.dataset.open);
        if (deal) show(deal);
      }),
      on(host, "click", "[data-new]", () => toast("Создание сделки появится вместе с сервером портала", { type: "info" })),
      on(host, "input", "[data-search]", (event, input) => {
        clearTimeout(timer);
        timer = setTimeout(() => filter(input.value.trim()), 120);
      }),
      on(host, "tabs:change", '[data-segments="funnel"]', (event) => ctx.setQuery({ funnel: event.detail.trigger.dataset.value, open: null })),
    ];
    return () => { clearTimeout(timer); offs.forEach((off) => off()); };
  },
};

