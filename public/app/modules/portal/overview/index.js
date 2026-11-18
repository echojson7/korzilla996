/* Обзор: показатели дня, мои задачи, воронка «Сайты» по стадиям и лента
   событий компании. */

import { html } from "../../../js/ui/html.js";
import { avatar } from "../../../js/ui/icons.js";
import { pageHead, card, stat, status } from "../../../js/ui/blocks.js";
import { money, shortDate, time, number } from "../../../js/ui/format.js";
import { DEALS, TASKS, TASK_STATES, FUNNELS, FEED, WHO, ME, STAFF, TODAY, day, plural } from "../data.js";
import { overdue, open } from "../module.js";

const sum = (list) => list.reduce((total, deal) => total + deal.sum, 0);
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
};
const when = (date) => (date >= TODAY ? time(date) : date >= day(-1) ? `вчера, ${time(date)}` : `${shortDate(date)}, ${time(date)}`);

export default {
  render({ index, page }) {
    const mine = TASKS.filter((task) => task.owner === ME.id && open(task));
    const late = TASKS.filter(overdue);
    const active = DEALS.filter((deal) => deal.funnel === "sites");
    const fresh = DEALS.filter((deal) => deal.created >= day(-6));
    const away = STAFF.filter((one) => one.away);
    const funnel = FUNNELS.sites;

    return html`<div class="page ov">
      ${pageHead(`${greeting()}, ${ME.name.split(" ")[0]}`, new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(TODAY), "", page.icon)}
      <div class="grid g-4">
        ${stat({ label: "Сделки в работе", value: number(DEALS.length), sub: html`<span>на ${money(sum(DEALS))}</span>` })}
        ${stat({ label: "Новые за неделю", value: number(fresh.length), sub: html`<span>на ${money(sum(fresh))}</span>` })}
        ${stat({ label: "Мои задачи", value: number(mine.length), sub: html`<span>${late.length ? `просрочено в компании: ${late.length}` : "всё в срок"}</span>` })}
        ${stat({ label: "Сотрудники", value: number(STAFF.length), sub: html`<span>${away.length ? `в отпуске: ${away.length}` : "все на месте"}</span>` })}
      </div>
      <div class="grid g-main">
        <div class="stack">
          ${card({
            title: "Мои задачи", end: html`<a class="ui-link" href="${index.href("tasks")}">Все задачи</a>`, flush: true,
            body: html`<div class="ui-list">${mine.map((task) => html`<a class="ui-list__row" href="${index.href("tasks", { query: { open: task.id } })}">
              ${avatar(WHO[task.author], "sm")}
              <span class="ui-list__text"><span class="ui-list__title">${task.title}</span><span class="ui-list__sub">от ${WHO[task.author].name}${task.deadline ? ` · до ${shortDate(task.deadline)}` : ""}</span></span>
              <span class="ui-list__end">${overdue(task) ? status("Просрочена", "red") : status(TASK_STATES[task.state].label, TASK_STATES[task.state].tone)}</span>
            </a>`)}</div>`,
          })}
          ${card({
            title: `Воронка «${funnel.name}»`, sub: `${plural(active.length, "сделка", "сделки", "сделок")} на ${money(sum(active))}`, end: html`<a class="ui-link" href="${index.href("deals")}">Канбан</a>`, flush: true,
            body: html`<div class="ui-list ui-list--sm">${funnel.stages.map(([id, label, tone]) => {
              const list = active.filter((deal) => deal.stage === id);
              return html`<a class="ui-list__row" href="${index.href("deals", { query: { funnel: "sites" } })}">
                <span class="ov-dot" style="--ov-tone: var(--ui-${tone})"></span>
                <span class="ui-list__text"><span class="ui-list__title">${label}</span></span>
                <span class="ui-list__end"><span class="faint">${plural(list.length, "сделка", "сделки", "сделок")}</span><span class="ov-sum">${money(sum(list))}</span></span>
              </a>`;
            })}</div>`,
          })}
        </div>
        ${card({
          title: "Лента",
          body: html`<ol class="ui-timeline">${FEED.map((entry) => html`<li class="ui-timeline__item">
            <span class="ui-timeline__mark">${avatar(WHO[entry.who])}</span>
            <div class="ui-timeline__body"><p class="ui-timeline__title">${WHO[entry.who].name}</p><p class="ui-timeline__text">${entry.text}</p></div>
            <time class="ui-timeline__time">${when(entry.at)}</time>
          </li>`)}</ol>`,
        })}
      </div>
    </div>`;
  },
};


