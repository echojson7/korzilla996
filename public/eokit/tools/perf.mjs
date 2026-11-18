/* Замер витрины EOKIT и admin2: загрузка (запросы, байты, время до
   готовности, длинные задачи) и отклик на действия. У действия — ввод до кадра
   (Event Timing, худшее событие), сколько стоили пересчёт стиля, раскладка и
   скрипт (Performance.getMetrics до и после) и кадры: худший промежуток между
   кадрами и сколько кадров дольше 34 мс (пропущен хотя бы один).
   Процессор замедлен в 4 раза (CPU=1 — без замедления); кадры честнее при CPU=1:
   в безголовом браузере отрисовка программная, и замедление искажает её сильнее,
   чем живую.

     node eokit/tools/perf.mjs [--runs 3] [--json out.json] [--only showcase|admin2]

   Playwright — локальный или глобальный (npm root -g); браузер — CHROME=<путь>. */

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import(pathToFileURL(join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs")).href)); }

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const RUNS = Number(option("--runs", 3));
const JSON_OUT = option("--json", null);
const ONLY = option("--only", null);
const CPU = Number(process.env.CPU ?? 4);

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  const path = join(REPO, normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)));
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

/* Наблюдатели ставятся до первого скрипта страницы. Счётчик кадров крутится
   только внутри замера действия: постоянный rAF сам будил бы страницу. */
function observe() {
  window.__perf = { long: [], events: [], frames: [] };
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__perf.long.push([entry.startTime, entry.duration]); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.interactionId) window.__perf.events.push([entry.startTime, entry.duration, entry.name]); }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  window.__perf.track = (on) => {
    window.__perf.tracking = on;
    if (!on) return;
    window.__perf.frames = [];
    const tick = (time) => { if (!window.__perf.tracking) return; window.__perf.frames.push(time); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
}

const APPS = {
  showcase: { url: "/showcase/index.html", ready: () => "ready" in document.documentElement.dataset, init: (theme) => localStorage.setItem("eokit-new.theme", theme) },
  admin2: {
    url: "/admin2/index.html#/",
    ready: () => !!document.querySelector("#view > *") && !document.querySelector("span[data-ui-icon]"),
    init: (theme) => { if (sessionStorage.getItem("perf")) return; sessionStorage.setItem("perf", "1"); localStorage.clear(); localStorage.setItem("kza.theme", JSON.stringify(theme)); localStorage.setItem("kza.lang", "en"); },
  },
};

async function open(app, { w = 1280, h = 860 } = {}) {
  const { url, ready, init } = APPS[app];
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  await context.addInitScript(init, "light");
  await context.addInitScript(observe);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const cdp = await context.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Performance.enable");
  const requests = [];
  page.on("response", async (response) => {
    const type = response.request().resourceType();
    const body = await response.body().catch(() => Buffer.alloc(0));
    requests.push({ url: response.url().replace(ORIGIN, ""), type, bytes: body.length });
  });
  await page.goto(ORIGIN + url, { waitUntil: "load" });
  await page.waitForFunction(ready, null, { polling: 16 });
  const readyAt = await page.evaluate(() => performance.now());
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  return { page, cdp, requests, readyAt, close: () => context.close() };
}

const counters = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));

async function loadMetrics(app) {
  const run = await open(app);
  const { page, cdp, requests, readyAt } = run;
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    return { dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp, nodes: document.getElementsByTagName("*").length };
  });
  const long = await page.evaluate((until) => window.__perf.long.filter(([start]) => start < until), readyAt);
  const metrics = await counters(cdp);
  const by = (kind) => requests.filter((r) => r.type === kind);
  const sum = (list) => list.reduce((total, r) => total + r.bytes, 0);
  await run.close();
  return {
    ready: readyAt, dcl: timing.dcl, load: timing.load, fcp: timing.fcp,
    longTasks: long.length, blocking: long.reduce((total, [, d]) => total + Math.max(0, d - 50), 0),
    /* Самая длинная задача — столько страница может не отвечать на ввод. */
    maxTask: long.reduce((max, [, d]) => Math.max(max, d), 0),
    scriptMs: metrics.ScriptDuration * 1000, layoutMs: metrics.LayoutDuration * 1000, styleMs: metrics.RecalcStyleDuration * 1000,
    styleCount: metrics.RecalcStyleCount, layoutCount: metrics.LayoutCount,
    heapMB: metrics.JSHeapUsedSize / 1048576, nodes: timing.nodes,
    requests: requests.length, js: by("script").length, jsKB: sum(by("script")) / 1024, css: by("stylesheet").length, cssKB: sum(by("stylesheet")) / 1024,
    fontKB: sum(by("font")) / 1024, imgKB: sum(by("image")) / 1024,
  };
}

/* Действия: каждое — от ввода до кадра (Event Timing), берём худшее событие
   действия. Меньше 16 мс браузер не сообщает — это «0». Третий элемент —
   подготовка вне замера (прокрутка к месту и т. п.). */
const section = (id) => `[data-section='${id}']`;
const stage = (id) => `${section(id)} [data-stage]`;
const OPEN_MENU = ".ui-popover__panel[data-state='open']";
const near = (page, selector) => page.locator(selector).first().scrollIntoViewIfNeeded();
async function drag(page, selector, dx, dy, steps = 12) {
  await near(page, selector);
  const box = await page.locator(selector).first().boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) await page.mouse.move(x + (dx * step) / steps, y + (dy * step) / steps);
  await page.mouse.up();
}

const ACTIONS = {
  showcase: [
    ["меню: открыть", async (page) => { await near(page, `${stage("popover")} [data-popover-trigger]`); await page.click(`${stage("popover")} [data-popover-trigger]`); await page.waitForSelector(OPEN_MENU); }],
    ["меню: Esc", async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector(OPEN_MENU, { state: "detached" }).catch(() => {}); }],
    ["селект: открыть", async (page) => { await near(page, `${stage("select")} .ui-select__trigger`); await page.click(`${stage("select")} .ui-select__trigger`); }],
    /* Открытый список — в body, не в стенде. */
    ["селект: выбрать", async (page) => { await page.click(".ui-select__panel[data-state='open'] .ui-select__option:nth-child(2)"); }],
    ["подсказка: навести", async (page) => { await near(page, `${stage("tooltip")} button`); await page.hover(`${stage("tooltip")} button:nth-child(1)`); await page.waitForSelector(".ui-tooltip[data-state='open']"); }],
    ["вкладки: сменить", async (page) => { await near(page, `${stage("tabs")} .ui-tabs__trigger`); await page.click(`${stage("tabs")} .ui-tabs__trigger:nth-child(2)`); }],
    ["аккордеон: раскрыть", async (page) => { await near(page, `${stage("accordion")} .ui-accordion__trigger`); await page.click(`${stage("accordion")} .ui-accordion__item:nth-child(2) .ui-accordion__trigger`); }],
    ["дерево: свернуть", async (page) => { await near(page, `${stage("tree")} [aria-expanded='true']`); await page.click(`${stage("tree")} [aria-expanded='true']`); }],
    ["календарь: открыть", async (page) => { await near(page, `${stage("datepicker")} .ui-datepicker__trigger`); await page.click(`${stage("datepicker")} .ui-datepicker__trigger`); await page.waitForSelector(".ui-datepicker__panel[data-state='open']"); }],
    ["календарь: Esc", async (page) => { await page.keyboard.press("Escape"); }],
    ["окно: открыть", async (page) => { await near(page, `${stage("modal")} [data-modal-template]`); await page.click(`${stage("modal")} [data-modal-template]`); await page.waitForSelector(".ui-modal-layer[data-state='open']"); }],
    ["окно: Esc", async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector(".ui-modal-layer", { state: "detached" }); }],
    ["палитра: Ctrl K", async (page) => { await page.keyboard.press("Control+k"); await page.waitForSelector(".ui-command__dialog[data-state='open']"); }],
    ["палитра: ввод", async (page) => { await page.keyboard.type("10"); }],
    ["палитра: Esc", async (page) => { await page.keyboard.press("Escape"); }],
    ["таблица: меню сортировки", async (page) => { await near(page, "#latest-orders"); await page.click("#latest-orders thead .ui-table-view__sort:has-text('Сумма')"); await page.waitForSelector(OPEN_MENU); }],
    ["таблица: по убыванию", async (page) => { await page.click(`${OPEN_MENU} [data-dir='desc']`); }],
    ["таблица: ширина столбца", async (page) => { await drag(page, "#latest-orders thead th:nth-child(4) .ui-table__resize", 60, 0); }],
    ["таблица 500 000: сортировка", async (page) => { await near(page, "#receipts"); await page.click("#receipts .ui-table-view__sort:has-text('Сумма')"); await page.click(`${OPEN_MENU} [data-dir='desc']`); await page.waitForFunction(() => !document.querySelector("#receipts").matches(".is-busy, .is-sorting"), null, { timeout: 60000 }); }],
    ["таблица 500 000: прокрутка", async (page) => { const box = await page.locator("#receipts .ui-table-view__scroll, #receipts").first().boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let step = 0; step < 10; step += 1) { await page.mouse.wheel(0, 800); await page.waitForTimeout(16); } }],
    ["перетаскивание: строка", async (page) => { await drag(page, `${stage("sortable")} .ui-sortable [data-value='beans'] .ui-sortable__handle`, 0, -120); }],
    ["шкала: тянуть", async (page) => { await drag(page, `${stage("slider")} .ui-scale-slider:not(.ui-scale-slider--input)`, 160, 0, 20); }],
    ["тост: показать", async (page) => { await page.click("[data-save]"); await page.waitForSelector(".ui-alert-region .ui-alert"); }, (page) => page.evaluate(() => scrollTo(0, 0))],
    ["тема: сменить", async (page) => { await page.click("#theme"); }],
    ["тема: вернуть", async (page) => { await page.click("#theme"); }],
  ],
  admin2: [
    ["переход: заказы", async (page) => { await page.click(".side [data-nav='orders']"); await page.waitForSelector(".orow"); }],
    ["заказ: открыть панель", async (page) => { await page.click(".orow[data-open='1058'] .orow__title"); await page.waitForSelector(".ui-modal .order-sheet"); }],
    ["заказ: меню статуса", async (page) => { await page.click(".ui-modal [data-sheet='status']"); await page.waitForSelector(OPEN_MENU); }],
    ["заказ: выбрать статус", async (page) => { await page.click(`${OPEN_MENU} [data-pick='hold']`); }],
    ["заказ: Esc", async (page) => { await page.keyboard.press("Escape"); await page.waitForSelector(".ui-modal", { state: "detached" }); }],
    ["заказы: меню фильтра", async (page) => { await page.click("[data-commit='filter']"); await page.waitForSelector(`${OPEN_MENU} [data-menu-search]`); }],
    ["заказы: поиск в меню", async (page) => { await page.keyboard.type("sta"); }],
    ["заказы: закрыть меню", async (page) => { await page.keyboard.press("Escape"); }],
    ["переход: товары", async (page) => { await page.evaluate(() => (location.hash = "#/products")); await page.waitForSelector(".products-table"); }],
    ["товары: выбрать все", async (page) => { await page.click("thead [data-sel='all'] + .ui-check__box"); }],
    ["переход: клиенты", async (page) => { await page.click(".side [data-nav='customers']"); await page.waitForSelector("#view > *"); }],
    ["переход: разделы", async (page) => { await page.evaluate(() => (location.hash = "#/sections")); await page.waitForSelector("#sx-tree .ui-sortable__row"); }],
    ["палитра: Ctrl K", async (page) => { await page.keyboard.press("Control+k"); await page.waitForSelector(".ui-command__dialog[data-state='open']"); }],
    ["палитра: ввод", async (page) => { await page.keyboard.type("skil"); }],
    ["палитра: Esc", async (page) => { await page.keyboard.press("Escape"); }],
    ["переход: обзор", async (page) => { await page.click(".side [data-nav='overview']"); await page.waitForSelector(".kpi"); }],
  ],
};

async function actionMetrics(app) {
  const run = await open(app, app === "admin2" ? { w: 1440, h: 900 } : {});
  const { page, cdp } = run;
  const out = {};
  for (const [name, act, prep] of ACTIONS[app]) {
    if (prep) await prep(page);
    await page.waitForTimeout(150);
    const before = await counters(cdp);
    const from = await page.evaluate(() => { window.__perf.track(true); return performance.now(); });
    try { await act(page); } catch (error) { out[name] = null; await page.evaluate(() => window.__perf.track(false)); continue; }
    await page.waitForTimeout(400);
    const seen = await page.evaluate((since) => {
      window.__perf.track(false);
      const gaps = window.__perf.frames.slice(1).map((time, index) => time - window.__perf.frames[index]);
      return {
        input: Math.max(0, ...window.__perf.events.filter(([start]) => start >= since).map(([, d]) => d)),
        long: window.__perf.long.filter(([start]) => start >= since).reduce((total, [, d]) => total + d, 0),
        worstFrame: Math.max(0, ...gaps),
        janky: gaps.filter((gap) => gap > 34).length,
      };
    }, from);
    const after = await counters(cdp);
    const delta = (key) => (after[key] - before[key]) * 1000;
    out[name] = { ...seen, style: delta("RecalcStyleDuration"), styleN: after.RecalcStyleCount - before.RecalcStyleCount, layout: delta("LayoutDuration"), layoutN: after.LayoutCount - before.LayoutCount, script: delta("ScriptDuration") };
  }
  /* Прокрутка всей страницы колесом: длинные задачи и кадры за время прокрутки. */
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(700, 400);
  const before = await counters(cdp);
  const from = await page.evaluate(() => { window.__perf.track(true); return performance.now(); });
  for (let step = 0; step < 40; step += 1) { await page.mouse.wheel(0, 600); await page.waitForTimeout(16); }
  await page.waitForTimeout(300);
  const seen = await page.evaluate((since) => {
    window.__perf.track(false);
    const gaps = window.__perf.frames.slice(1).map((time, index) => time - window.__perf.frames[index]);
    return { input: 0, long: window.__perf.long.filter(([start]) => start >= since).reduce((total, [, d]) => total + d, 0), worstFrame: Math.max(0, ...gaps), janky: gaps.filter((gap) => gap > 34).length };
  }, from);
  const after = await counters(cdp);
  out["прокрутка страницы"] = { ...seen, style: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, styleN: after.RecalcStyleCount - before.RecalcStyleCount, layout: (after.LayoutDuration - before.LayoutDuration) * 1000, layoutN: after.LayoutCount - before.LayoutCount, script: (after.ScriptDuration - before.ScriptDuration) * 1000 };
  await run.close();
  return out;
}

const median = (list) => { const sorted = [...list].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const mergeFlat = (runs) => Object.fromEntries(Object.keys(runs[0]).map((key) => [key, median(runs.map((r) => r[key] ?? 0))]));
/* Действие, упавшее в каком-то прогоне, — null там; медиана — по удавшимся. */
const mergeActions = (runs) => Object.fromEntries(Object.keys(runs[0]).map((name) => {
  const ok = runs.map((r) => r[name]).filter(Boolean);
  return [name, ok.length ? mergeFlat(ok) : null];
}));

const apps = ONLY ? [ONLY] : Object.keys(APPS);
const summary = { cpu: CPU, runs: RUNS };
for (const app of apps) {
  const loads = [];
  const acts = [];
  for (let run = 0; run < RUNS; run += 1) {
    loads.push(await loadMetrics(app));
    acts.push(await actionMetrics(app));
  }
  summary[app] = { load: mergeFlat(loads), actions: mergeActions(acts) };
}

const fmt = (value) => (value == null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1));
console.log(`CPU ×${CPU}, медиана ${RUNS} прогонов`);
for (const app of apps) {
  console.log(`\n${app}: загрузка`);
  for (const [name, value] of Object.entries(summary[app].load)) console.log(`  ${name.padEnd(12)} ${fmt(value)}`);
  console.log(`\n${app}: действия, мс (ввод — худшее событие, 0 — меньше 16; кадры — худший промежуток / сколько дольше 34 мс)`);
  console.log(`  ${"".padEnd(30)} ${"ввод".padStart(5)} ${"стиль".padStart(6)} ${"×".padStart(3)} ${"раскл".padStart(6)} ${"×".padStart(3)} ${"скрипт".padStart(6)} ${"длин".padStart(5)} ${"кадр".padStart(5)} ${"рывки".padStart(5)}`);
  for (const [name, m] of Object.entries(summary[app].actions)) {
    if (!m) { console.log(`  ${name.padEnd(30)} не удалось`); continue; }
    console.log(`  ${name.padEnd(30)} ${fmt(m.input).padStart(5)} ${fmt(m.style).padStart(6)} ${fmt(m.styleN).padStart(3)} ${fmt(m.layout).padStart(6)} ${fmt(m.layoutN).padStart(3)} ${fmt(m.script).padStart(6)} ${fmt(m.long).padStart(5)} ${fmt(m.worstFrame).padStart(5)} ${fmt(m.janky).padStart(5)}`);
  }
}
if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(summary, null, 2));

await browser.close();
server.close();
