/* Панель помощника — серая колонка справа, как сайдбар слева: страница
   становится уже (плавно), у её листа скругляется верхний правый угол. Уже
   1600 px — та же панель поверх страницы: страницы раскладываются по ширине
   окна, и в узком остатке им тесно. Вид и движение — styles/assistant.css.
   Шапка 40: «Помощник», «Новый разговор», «Закрыть». Разговор без пузырей:
   вопрос строкой 14/20 полужирным, под ним ход работы, потом ответ. Пока
   помощник работает — сделанные шаги лентой кита (activity) и внизу живая
   строка «думает» (thinking): знак помощника в бегущем кольце, текущий шаг с
   бликом, секунды. Готово — шаги сворачиваются в строку «Готово за 0,9 с ·
   3 шага», её можно раскрыть. Ответ — markdown в .ui-prose, строки записей,
   кнопки и черновик — на белой панели всё это серое. Внизу — поле запроса кита
   (prompt) в две строки с чипом того, что открыто на странице, и строка о демо.

   Открывают её кнопка в шапке, ⌘J / Ctrl+J, строка «Спросить» в палитре и
   data-ai-ask="вопрос" на любой кнопке — тогда сразу с вопросом. Открытая панель
   остаётся открытой после перезагрузки; разговор у каждого сайта свой и живёт до
   перезагрузки. Ссылка в ответе открывает запись, панель остаётся (поверх
   страницы — закрывается, чтобы запись было видно). */

import { html, on, raw } from "../ui/html.js";
import { icon, e3d } from "../ui/icons.js";
import { ME } from "../data/fixtures.js";
import { brandMark } from "../shell/logo.js";
import { kit, mount, unmount, toast, loadKit } from "../ui/kit.js";
import { read, write } from "../core/store.js";
import { t, tn, lang } from "../core/i18n.js";
import { fixed } from "../ui/format.js";
import { md, inline } from "../ui/markdown.js";
import { answer, isOn, promptsOf, skills, subjectOf, subscribe } from "./assistant.js";

const overlay = () => matchMedia("(max-width: 1599px)").matches;
/* Уход панели длится как уход поверхностей кита; при «уменьшить движение» — сразу. */
const outMs = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : parseFloat(getComputedStyle(app).getPropertyValue("--ui-duration-surface-out")) || 0);

let admin = null;
let app = null;
let aside = null;
let opened = false;
let ready = null;
let leaving = 0;
let opener = null;
/* Чип убрали — вопросы без него, пока на странице не откроют другое. */
let dropped = null;
let queue = Promise.resolve();
const talks = new Map();

const talk = () => {
  const id = admin?.site?.id ?? "";
  if (!talks.has(id)) talks.set(id, []);
  return talks.get(id);
};
const subject = () => {
  const current = subjectOf();
  return current && dropped && current.kind === dropped.kind && current.id === dropped.id ? null : current;
};
const tip = (text) => html`data-ui-tooltip="${text}" data-side="bottom" aria-label="${text}"`;

/* ---- Разметка ------------------------------------------------------------------ */

const chip = (about) => html`<span class="ui-badge ui-badge--xs assist__chip"><span class="ui-badge__label">${about.label}</span><button class="ui-prompt__drop" type="button" aria-label="${t("Ask without it")}">${icon("x")}</button></span>`;

function frame() {
  const about = subject();
  return html`
    <header class="assist__head">
      <h2 class="assist__title ui-ai-brand"><span class="ui-ai-brand__name">${t("Assistant")} Korzilla</span></h2>
      <button class="ui-btn ui-btn--ghost ui-btn--icon-sm" type="button" data-assist="new" ${tip(t("New conversation"))}>${icon("square-pen")}</button>
      <button class="ui-close ui-close--sm" type="button" data-assist="close" ${tip(t("Close"))}>${icon("x")}</button>
    </header>
    <div class="assist__log" data-assist-log data-ui-inset="secondary">${logView()}</div>
    <footer class="assist__foot">
      <form class="ui-prompt ui-prompt--ai" data-ui-prompt data-assist-prompt>
        <textarea class="ui-prompt__area" rows="1" placeholder="${t("Ask about orders, products, customers…")}" aria-label="${t("Question to the assistant")}"></textarea>
        <div class="ui-prompt__bar">${about ? chip(about) : ""}<button class="ui-btn ui-btn--primary ui-btn--icon-sm ui-prompt__send" type="submit" aria-label="${t("Send")}">${icon("arrow-up")}</button></div>
      </form>
      <p class="assist__demo">${t("Answers come from demo data. Nothing changes without you.")}</p>
    </footer>`;
}

const logView = () => {
  const turns = talk();
  return turns.length ? turns.map(turnView) : startView();
};

/* Пустая панель: зелёная искра, фраза с именем и что помощник знает; под ней
   вопросы к открытой странице строками. Внизу, у поля, — темы навыков плитками
   (about у навыка: название, о чём спросить, объёмная иконка art, вес weight —
   тяжёлые первыми). Кит: ai. */
const TOPICS = 4;

function startView() {
  const name = String(ME.name ?? "").split(/\s+/)[0];
  const topics = skills.map((skill) => skill.about).filter((about) => about?.ask?.length).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, TOPICS);
  const asked = new Set(topics.map((about) => about.ask[0]));
  const asks = promptsOf().filter((question) => !asked.has(question) && question !== t("What can you do?")).slice(0, 2);
  return html`<div class="assist__start">
    <header class="ui-ai-intro">
      <span class="ui-ai-intro__art">${e3d("sparkles-ai", 40)}</span>
      <h3 class="ui-ai-intro__title">${name ? t("{name}, where shall we start?", { name }) : t("Where shall we start?")}</h3>
      <p class="ui-ai-intro__text">${t("I know this site's orders, products, customers, revenue and content. I don't change anything myself.")}</p>
    </header>
    ${asks.length ? html`<div class="ui-message__suggest">${asks.map(suggestion)}</div>` : ""}
    ${topics.length ? html`<div class="ui-ai-topics assist__topics">${topics.map((about) => html`<button class="ui-ai-topic" type="button" data-ai-ask="${about.ask[0]}">
      <span class="ui-ai-topic__art">${e3d(about.art ?? "circle-help")}</span><span class="ui-ai-topic__title">${about.title}</span><span class="ui-ai-topic__sub">${about.ask[0]}</span>
    </button>`)}</div>` : ""}
  </div>`;
}

const suggestion = (question) => html`<button class="ui-message__suggestion" type="button" data-ai-ask="${question}">${icon("corner-down-right")}<span>${question}</span></button>`;

/* ---- Ход работы ------------------------------------------------------------------ */

const took = (ms) => t("{s} s", { s: fixed(ms / 1000) });
const plain = (title) => String(title ?? "").replaceAll("**", "");

const stepView = (step, enter = false) => html`<li class="ui-activity__item"${enter ? raw(" data-enter") : ""}>
  <span class="ui-activity__mark">${icon(step.icon ?? "check")}</span>
  <div class="ui-activity__body"><p class="ui-activity__head"><span>${inline(step.title)}</span></p></div>
</li>`;

const stepsView = (steps) => html`<ol class="ui-activity ui-activity--sm" data-assist-steps>${steps.map((step) => stepView(step))}</ol>`;

/* Живая строка: знак помощника в кольце, текущий шаг с бликом, секунды. */
const thinkingView = (turn) => html`<div class="ui-thinking ui-thinking--sm" role="status">
  <span class="ui-thinking__mark">${brandMark("ai")}</span>
  ${labelView(turn.now)}
  <span class="ui-thinking__meta" data-assist-clock>${took(performance.now() - turn.started)}</span>
</div>`;
const labelView = (now) => html`<span class="ui-thinking__label" data-assist-now>${now ? plain(now) : t("Thinking")}</span>`;

function workView(turn) {
  const done = turn.steps.filter((step) => step.state === "done");
  if (!turn.reply) return html`<div class="assist__work">${stepsView(done)}${thinkingView(turn)}</div>`;
  if (!done.length) return "";
  return html`<details class="ui-activity__group assist__work"${turn.fresh ? raw(" open") : ""}>
    <summary class="ui-activity__toggle">
      <span class="ui-activity__toggle-icon assist__done" data-tone="green">${icon("check")}</span>
      <span class="ui-activity__toggle-label">${t("Done in {time}", { time: took(turn.took) })} · ${tn(done.length, "step")}</span>
      ${icon("chevron-down", "", { cls: "ui-activity__chevron" })}
    </summary>
    ${stepsView(done)}
  </details>`;
}

function turnView(turn, at) {
  return html`<section class="assist__turn" data-turn="${at}">
    <div class="ui-message ui-message--user">
      ${turn.about ? html`<span class="ui-message__context">${turn.about.label}</span>` : ""}
      <p class="ui-message__bubble">${turn.q}</p>
    </div>
    <div class="ui-message">
      ${workView(turn)}
      ${turn.reply ? replyView(turn.reply, at) : ""}
    </div>
  </section>`;
}

const itemView = (item) => {
  const body = html`${item.lead ?? ""}<span class="ui-list__text"><span class="ui-list__title">${item.title}</span>${item.sub ? html`<span class="ui-list__sub">${item.sub}</span>` : ""}</span>${item.end ? html`<span class="ui-list__end">${item.end}</span>` : ""}`;
  return item.href ? html`<a class="ui-list__row" href="${item.href}">${body}</a>` : html`<div class="ui-list__row">${body}</div>`;
};

function actionView(action, at, index) {
  const cls = `ui-btn ui-btn--sm${action.primary ? " ui-btn--primary" : ""}`;
  const body = html`${action.icon ? icon(action.icon) : ""}<span class="ui-btn__label">${action.label}</span>`;
  return action.href ? html`<a class="${cls}" href="${action.href}">${body}</a>` : html`<button class="${cls}" type="button" data-assist-run="${at}:${index}">${body}</button>`;
}

const draftView = (draft, at) => html`<div class="ui-draft">
  <div class="ui-draft__head">
    <span class="ui-draft__label">${draft.label ?? t("Assistant's draft")}</span>
    <span class="ui-draft__actions">
      ${draft.again ? html`<button class="ui-btn ui-btn--ghost ui-btn--icon-xs" type="button" data-assist-again="${at}" ${tip(t("Another version"))}>${icon("refresh-cw")}</button>` : ""}
      <button class="ui-btn ui-btn--ghost ui-btn--icon-xs" type="button" data-assist-copy="${at}" ${tip(t("Copy"))}>${icon("copy")}</button>
    </span>
  </div>
  <textarea class="ui-draft__area" rows="6" data-assist-draft="${at}" aria-label="${draft.label ?? t("Assistant's draft")}">${draft.text}</textarea>
</div>`;

function replyView(reply, at) {
  const text = [].concat(reply.text ?? []).filter(Boolean);
  return html`<div class="assist__a">
    ${text.length ? html`<div class="ui-prose">${md(text.join("\n\n"))}</div>` : ""}
    ${reply.items?.length ? html`<div class="ui-list ui-list--sm assist__list">${reply.items.map(itemView)}</div>` : ""}
    ${reply.draft ? draftView(reply.draft, at) : ""}
    ${reply.actions?.length ? html`<div class="assist__row">${reply.actions.map((action, index) => actionView(action, at, index))}</div>` : ""}
    ${reply.note ? html`<p class="assist__note">${reply.note}</p>` : ""}
    <div class="ui-message__tools">
      <button class="ui-btn ui-btn--ghost ui-btn--icon-xs" type="button" data-assist-copy-answer="${at}" ${tip(t("Copy answer"))}>${icon("copy")}</button>
      <button class="ui-btn ui-btn--ghost ui-btn--icon-xs" type="button" data-assist-retry="${at}" ${tip(t("Ask again"))}>${icon("refresh-cw")}</button>
    </div>
    ${reply.followups?.length ? html`<div class="ui-message__suggest">
      <p class="ui-message__suggest-label">${t("Ask next")}</p>
      ${reply.followups.map((question) => suggestion(question))}
    </div>` : ""}
  </div>`;
}

/* ---- Отрисовка ----------------------------------------------------------------- */

const log = () => aside.querySelector("[data-assist-log]");
const prompt = () => aside.querySelector("[data-assist-prompt]");

function paint(node, markup) {
  unmount(node);
  node.innerHTML = String(markup);
  mount(node);
}

function paintLog() {
  if (opened) paint(log(), logView());
}

function paintTurn(at) {
  const node = log().querySelector(`[data-turn="${at}"]`);
  if (!node) return paintLog();
  const box = document.createElement("div");
  box.innerHTML = String(turnView(talk()[at], at));
  unmount(node);
  const fresh = box.firstElementChild;
  node.replaceWith(fresh);
  mount(fresh);
  return fresh;
}

/* Чип — то, что открыто сейчас; поле при этом не трогаем. */
function paintChip() {
  if (!opened) return;
  const form = prompt();
  const bar = form.querySelector(".ui-prompt__bar");
  bar.querySelector(".assist__chip")?.remove();
  const about = subject();
  if (about) bar.insertAdjacentHTML("afterbegin", String(chip(about)));
  kit("prompt")?.refresh(form);
}

function syncButtons() {
  document.querySelectorAll('[data-action="assistant"]').forEach((button) => {
    button.hidden = !isOn();
    button.setAttribute("aria-expanded", String(opened));
  });
}

/* ---- Открыть, закрыть, спросить ------------------------------------------------ */

export const isOpen = () => opened;

/* still — без перехода: панель была открыта до перезагрузки или смены сайта. */
export async function open({ focus = true, still = false } = {}) {
  if (!isOn()) return;
  if (!opened) {
    const focused = document.activeElement;
    opener = focused instanceof HTMLElement && focused !== document.body && !aside.contains(focused) ? focused : null;
    ready ??= loadKit(["prompt", "prose"]);
    await ready;
    opened = true;
    write("assistant.open", true);
    clearTimeout(leaving);
    aside.classList.remove("is-closing");
    aside.inert = false;
    aside.setAttribute("aria-label", t("Assistant"));
    paint(aside, frame());
    aside.hidden = false;
    show(still);
    syncButtons();
    scrollToEnd();
  }
  if (focus) kit("prompt")?.focus(prompt());
}

export function close() {
  if (!opened) return;
  opened = false;
  write("assistant.open", false);
  const back = aside.contains(document.activeElement) ? opener ?? document.querySelector('[data-action="assistant"]:not([hidden])') : null;
  /* Колонка убывает (поверх страницы — панель уезжает), разметка уходит после. */
  app.removeAttribute("data-assist");
  aside.classList.add("is-closing");
  aside.inert = true;
  syncButtons();
  back?.focus?.({ preventScroll: true });
  clearTimeout(leaving);
  leaving = setTimeout(() => {
    aside.classList.remove("is-closing");
    unmount(aside);
    aside.hidden = true;
    aside.innerHTML = "";
  }, outMs());
}

/* Колонка растёт от нуля: сначала посчитана раскладка с закрытой панелью, переход
   идёт от неё. still — сразу в конечном виде, без перехода. */
function show(still) {
  const main = app.querySelector(".main");
  const moving = [main, main.querySelector(".view")].filter(Boolean);
  if (still) for (const node of moving) node.style.transition = "none";
  void main.offsetWidth;
  app.toggleAttribute("data-assist", true);
  if (!still) return;
  void main.offsetWidth;
  for (const node of moving) node.style.transition = "";
}

export const toggle = () => (opened ? close() : open());

function scrollToEnd() {
  const box = log();
  if (box) box.scrollTop = box.scrollHeight;
}

/* Ответ длиннее экрана — читается с начала: вопрос встаёт к верху ленты. */
function reveal(node) {
  const box = log();
  if (!box || !node) return;
  const top = node.offsetTop - box.offsetTop - 8;
  if (top < box.scrollTop || node.offsetHeight > box.clientHeight) box.scrollTop = top;
  else box.scrollTop = box.scrollHeight;
}

/* Вопросы идут по очереди: второй ждёт, пока ответят на первый. */
export function ask(question, { about } = {}) {
  const text = String(question ?? "").trim();
  if (!text || !isOn()) return queue;
  const topic = about === undefined ? subject() : about;
  queue = queue.then(() => run(text, topic)).catch((error) => console.error(error));
  return queue;
}

async function run(question, about) {
  await open({ focus: false });
  const turns = talk();
  if (!turns.length) paint(log(), "");
  const turn = { q: question, about, reply: null, steps: [], now: "", started: performance.now() };
  turns.push(turn);
  const at = turns.length - 1;
  log().insertAdjacentHTML("beforeend", String(turnView(turn, at)));
  /* Вопрос вылетает пузырём, как отправленное сообщение (message кита). */
  const asked = log().querySelector(`[data-turn="${at}"] > .ui-message--user`);
  if (asked) {
    asked.classList.add("is-entering");
    asked.querySelector(".ui-message__bubble")?.addEventListener("animationend", () => asked.classList.remove("is-entering"), { once: true });
  }
  scrollToEnd();
  const form = prompt();
  form.setAttribute("aria-busy", "true");
  const live = () => (opened && talk() === turns ? log()?.querySelector(`[data-turn="${at}"] .assist__work`) : null);
  const clock = setInterval(() => {
    const node = live()?.querySelector("[data-assist-clock]");
    if (node) node.textContent = took(performance.now() - turn.started);
  }, 100);
  const onStep = (step) => {
    turn.steps[step.at] = step;
    turn.now = step.state === "running" ? step.title : "";
    const work = live();
    if (!work) return;
    if (step.state === "running") {
      const label = work.querySelector("[data-assist-now]");
      label?.insertAdjacentHTML("afterend", String(labelView(step.title)));
      label?.remove();
    } else {
      work.querySelector("[data-assist-steps]")?.insertAdjacentHTML("beforeend", String(stepView(step, true)));
      stick();
    }
  };
  let reply;
  try {
    reply = await answer(question, { subject: about, admin, onStep });
  } finally {
    clearInterval(clock);
  }
  turn.reply = reply;
  turn.took = performance.now() - turn.started;
  turn.fresh = true;
  if (!opened || talk() !== turns || !log().querySelector(`[data-turn="${at}"]`)) return;
  const fresh = paintTurn(at);
  turn.fresh = false;
  fresh?.classList.add("is-new");
  /* Шаги сворачиваются в строку «Готово» у всех на глазах: открытой она
     рисуется, закрывается следующим кадром. */
  const work = fresh?.querySelector("details.assist__work");
  if (work) requestAnimationFrame(() => { work.open = false; });
  reveal(fresh);
  prompt()?.removeAttribute("aria-busy");
}

/* Лента у нижнего края следит за шагами; пролистали вверх — не дёргаем. */
function stick() {
  const box = log();
  if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 80) box.scrollTop = box.scrollHeight;
}

/* ---- Связка с оболочкой ---------------------------------------------------------- */

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("Copied"));
  } catch {
    toast(t("Couldn't copy. Select the text and copy it by hand."), { type: "neutral" });
  }
}

function onClick(event) {
  const target = event.target;
  const control = target.closest("[data-assist]");
  if (control?.dataset.assist === "close") return close();
  if (control?.dataset.assist === "new") {
    talk().length = 0;
    paintLog();
    kit("prompt")?.focus(prompt());
    return;
  }
  const runner = target.closest("[data-assist-run]");
  if (runner) {
    const [at, index] = runner.dataset.assistRun.split(":").map(Number);
    talk()[at]?.reply?.actions?.[index]?.run?.({ admin, close });
    return;
  }
  const whole = target.closest("[data-assist-copy-answer]");
  if (whole) return copy(plainAnswer(talk()[Number(whole.dataset.assistCopyAnswer)]?.reply));
  const retry = target.closest("[data-assist-retry]");
  if (retry) {
    const turn = talk()[Number(retry.dataset.assistRetry)];
    if (turn) ask(turn.q, { about: turn.about ?? null });
    return;
  }
  const copier = target.closest("[data-assist-copy]");
  if (copier) return copy(aside.querySelector(`[data-assist-draft="${copier.dataset.assistCopy}"]`)?.value ?? "");
  const again = target.closest("[data-assist-again]");
  if (again) {
    const at = Number(again.dataset.assistAgain);
    const draft = talk()[at]?.reply?.draft;
    if (!draft?.again) return;
    draft.text = draft.again();
    const field = aside.querySelector(`[data-assist-draft="${at}"]`);
    if (field) field.value = draft.text;
    return;
  }
  /* Запись из ответа открыта поверх страницы — панель уступает ей место. */
  if (target.closest("a[href]") && overlay()) close();
}

/* Ответ простым текстом для буфера: абзацы без разметки, строки записей, черновик. */
function plainAnswer(reply) {
  if (!reply) return "";
  const text = [].concat(reply.text ?? []).filter(Boolean).map((line) => line.replace(/\*\*|==|`/g, "").replace(/^> /gm, ""));
  const items = (reply.items ?? []).map((item) => `— ${[item.title, item.sub].filter(Boolean).join(", ")}`);
  return [...text, items.join("\n"), reply.draft?.text ?? "", reply.note ?? ""].filter(Boolean).join("\n\n");
}

/* boot.js: панель знает admin (сайт, индекс, переход) и место в разметке. */
export function initAssistant(options) {
  ({ admin, app, aside } = options);
  aside.addEventListener("click", onClick);
  /* Лента прокручена — под шапкой появляется черта. */
  aside.addEventListener("scroll", (event) => {
    if (event.target.matches?.("[data-assist-log]")) aside.toggleAttribute("data-scrolled", event.target.scrollTop > 0);
  }, true);
  aside.addEventListener("prompt:submit", (event) => ask(event.detail.value));
  aside.addEventListener("prompt:drop", () => { dropped = subjectOf(); });
  /* Правки черновика остаются в разговоре, пока его не начнут заново. */
  aside.addEventListener("input", (event) => {
    const field = event.target.closest?.("[data-assist-draft]");
    const draft = field && talk()[Number(field.dataset.assistDraft)]?.reply?.draft;
    if (draft) draft.text = field.value;
  });
  aside.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  });
  on(document, "click", "[data-ai-ask]", (event, button) => {
    event.preventDefault();
    ask(button.dataset.aiAsk);
  });
  subscribe((what) => {
    if (what === "settings") {
      if (!isOn()) close();
      syncButtons();
    }
    if (what === "route") {
      if (dropped && !sameSubject(subjectOf(), dropped)) dropped = null;
      paintChip();
      if (opened && !talk().length) paintLog();
    }
  });
}

const sameSubject = (a, b) => Boolean(a && b && a.kind === b.kind && a.id === b.id);

/* Сайт сменился: разговор и подсказки — этого сайта; открытая панель остаётся. */
export function onSite() {
  dropped = null;
  if (opened) {
    if (!isOn()) return close();
    paint(aside, frame());
  } else if (read("assistant.open", false) && isOn() && !overlay()) open({ focus: false, still: true });
  syncButtons();
}

/* Кавычки строки «Спросить» в палитре — по языку. */
export const quotes = () => (lang === "ru" ? ["«", "»"] : ["“", "”"]);
