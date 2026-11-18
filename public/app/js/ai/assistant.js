/* Помощник: один на всю админку. Модули учат его своему через admin.assistant,
   как палитру и счётчики (js/core/extensions.js):

     admin.assistant.skills.push({ id, match(q, ctx) → вес 0…1, answer(q, ctx) → ответ, about?, work? });
     admin.assistant.subjects.set("orders", (ctx) => ({ kind: "order", id, label }) | null);
     admin.assistant.prompts.push((ctx, subject) => ctx.page?.id === "orders" ? ["Какие заказы застряли?"] : []);
     admin.assistant.briefs.push((ctx) => [{ lead, title, sub, end, href, weight }]);
     admin.assistant.features.set("content.alt", { group?, groupSub?, label, sub, get?, set? });
     admin.assistant.on("content.alt")    включён ли помощник и эта его функция

   skills — навыки: match оценивает вопрос (q — нижний регистр, ё → е, без
   знаков), лучший по весу отвечает; about { title, sub, href, ask } — строка
   ответа «Что ты умеешь?». work — шаги работы, которые панель показывает,
   пока готовится ответ: [{ icon, title }] или (q, ctx) → такой список;
   в title предмет — **жирным** («Смотрю **заказы**»). subjects — что открыто на странице (заказ, клиент):
   это видно чипом в поле, и «что с ним?» спрашивает про него. prompts —
   подсказки пустой панели по странице. briefs — строки сводки «Что важно
   сегодня» от каждого модуля, важные — с большим weight. features —
   переключатели вкладки «Помощник» в настройках: без group — рядом с общим
   переключателем, с group — своим разделом (groupSub — его подпись); get/set —
   если функция хранит своё состояние сама (как «Контент»), иначе оно здесь.

   Ответ навыка: { text, items, actions, draft, note, followups } — разметку
   строит панель (js/ai/panel.js), у всех ответов один вид:
     text       markdown строкой или массивом строк-абзацев (js/ui/markdown.js);
     items      строки записей { lead, title, sub, end, href };
     actions    кнопки { label, href | run(), icon, primary };
     draft      черновик { text, label, again() → новый текст };
     note       мелкая строка: из чего посчитано;
     followups  2–3 следующих вопроса.

   Сейчас навыки отвечают по демо-данным сайта (js/data). С сервером answer()
   станет запросом к модели с тем же контекстом, а панель и хуки останутся. */

import "./words.js";
import { read, write } from "../core/store.js";
import { t } from "../core/i18n.js";

export const skills = [];
export const subjects = new Map();
export const prompts = [];
export const briefs = [];
export const features = new Map();

/* ---- Состояние сайта ----------------------------------------------------------- */

const DEFAULTS = { on: true, off: [], tone: "warm", signature: "" };
let site = null;
let state = { ...DEFAULTS };
const listeners = new Set();

/* Подписка на перемены: включили и выключили, сменили сайт или страницу. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = (what) => listeners.forEach((listener) => listener(what));

/* Смена сайта: навыки регистрируются заново, состояние — этого сайта. */
export function useSite(next) {
  site = next;
  skills.length = 0;
  briefs.length = 0;
  prompts.length = 0;
  subjects.clear();
  features.clear();
  signer = () => site?.name ?? "";
  state = { ...DEFAULTS, ...read(`assistant.${next.id}`, {}) };
}
const persist = () => write(`assistant.${site.id}`, state);

/* Помощник включён (без id) или включена его функция. */
export function isOn(id) {
  if (!state.on) return false;
  if (!id) return true;
  const feature = features.get(id);
  if (!feature) return false;
  return feature.get ? Boolean(feature.get()) : !state.off.includes(id);
}

/* Переключатель функции без учёта общего: для вкладки настроек. */
export function featureOn(id) {
  const feature = features.get(id);
  return feature?.get ? Boolean(feature.get()) : !state.off.includes(id);
}

export function setOn(id, value) {
  if (!id) state.on = value;
  else {
    const feature = features.get(id);
    if (feature?.set) feature.set(value);
    else state.off = value ? state.off.filter((one) => one !== id) : [...new Set([...state.off, id])];
  }
  persist();
  notify("settings");
}

/* Голос магазина: тон черновиков и подпись в письмах. Без своей подписи — имя
   сайта; ядро подставляет название из настроек (signWith). */
let signer = () => site?.name ?? "";
export const signWith = (fn) => { signer = fn; };
export const voice = () => ({ tone: state.tone, signature: state.signature || signer() });
export const savedVoice = () => ({ tone: state.tone, signature: state.signature, fallback: signer() });
export function setVoice(patch) {
  Object.assign(state, patch);
  persist();
  notify("settings");
}

/* ---- Где сейчас пользователь -------------------------------------------------- */

let route = null;
export function setRoute(ctx) {
  route = ctx;
  notify("route");
}

/* Что открыто на странице: заказ, клиент, запись. */
export function subjectOf(ctx = route) {
  const resolve = ctx?.page && subjects.get(ctx.page.id);
  try { return resolve?.(ctx) ?? null; } catch (error) { console.error(error); return null; }
}

/* Подсказки пустой панели: от модулей по странице и тому, что открыто, потом общие. */
export function promptsOf(ctx = route) {
  const subject = subjectOf(ctx);
  const own = prompts.flatMap((provider) => {
    try { return provider(ctx ?? {}, subject) ?? []; } catch (error) { console.error(error); return []; }
  });
  const general = [t("What needs my attention today?"), t("What can you do?")];
  return [...new Set([...own, ...general])].slice(0, 5);
}

/* Строки сводки «Что важно сегодня» от всех модулей, важные — первыми. */
export function briefOf(ctx) {
  return briefs.flatMap((provider) => {
    try { return provider(ctx) ?? []; } catch (error) { console.error(error); return []; }
  }).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}

/* ---- Вопрос → ответ ----------------------------------------------------------- */

/* Вопрос для сравнения: нижний регистр, ё → е, слова через один пробел. */
export const normalize = (text) =>
  String(text ?? "").toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();

/* Есть ли в вопросе слово с одной из основ: «заказ» ловит «заказы», «заказом».
   Основа из нескольких слов ищется как есть. */
export function has(q, ...stems) {
  const words = q.split(" ");
  return stems.some((stem) => (stem.includes(" ") ? q.includes(stem) : words.some((word) => word.startsWith(stem))));
}

/* Числа из вопроса: номер заказа, количество дней. */
export const numbers = (q) => (q.match(/\d+/g) ?? []).map(Number);

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function fallback(ctx) {
  return {
    text: t("I can't answer that yet. In the demo I know this site's orders, products, customers, revenue, content and settings."),
    followups: promptsOf(ctx.route).filter((question) => question !== ctx.question).slice(0, 3),
  };
}

/* Шаги работы: что открыто на странице, шаги навыка; черновик — свой шаг в конце. */
const STEP_MS = 280;
function workOf(skill, ctx) {
  const steps = [];
  if (ctx.subject?.label) steps.push({ icon: "app-window", title: t("Open on the page: **{label}**", { label: ctx.subject.label }) });
  let own = [];
  try { own = (typeof skill?.work === "function" ? skill.work(ctx.q, ctx) : skill?.work) ?? []; } catch (error) { console.error(error); }
  if (!skill) own = [{ icon: "search", title: t("Looking for **who knows the answer**") }];
  else if (!own.length) own = [{ icon: "search", title: skill.about?.title ? t("Looking into **{topic}**", { topic: skill.about.title.toLocaleLowerCase() }) : t("Looking into **the question**") }];
  return [...steps, ...own];
}

/* Ответ на вопрос: лучший навык по весу, иначе — честное «не знаю» с подсказками.
   onStep({ at, icon, title, state }) — шаг начат (running) и сделан (done):
   панель рисует ход работы. Шаги идут по STEP_MS — чтобы их было видно; с
   сервером их будет присылать сама модель, а панель и хуки останутся. */
export async function answer(question, { subject = null, admin, onStep = () => {} } = {}) {
  const ctx = { question, q: normalize(question), subject, route, admin, site, index: admin?.index, voice: voice() };
  let best = null;
  let weight = 0;
  for (const skill of skills) {
    let score = 0;
    try { score = Number(skill.match(ctx.q, ctx)) || 0; } catch (error) { console.error(error); }
    if (score > weight) { best = skill; weight = score; }
  }
  const skill = best && weight >= 0.2 ? best : null;
  const replying = (async () => {
    try {
      return skill ? await skill.answer(ctx.q, ctx) : fallback(ctx);
    } catch (error) {
      console.error(error);
      return { text: t("Something went wrong while answering. Try asking differently.") };
    }
  })();
  const steps = workOf(skill, ctx);
  const step = async (at, item) => {
    onStep({ ...item, at, state: "running" });
    await pause(STEP_MS);
    onStep({ ...item, at, state: "done" });
  };
  for (const [at, item] of steps.entries()) await step(at, item);
  const reply = (await replying) ?? fallback(ctx);
  if (reply.draft) await step(steps.length, { icon: "pencil", title: reply.draft.label ? t("Writing **{what}**", { what: reply.draft.label.split(" · ")[0].toLocaleLowerCase() }) : t("Writing **a draft**") });
  return reply;
}
