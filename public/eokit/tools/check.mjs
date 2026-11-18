/* Проверка витрины EOKIT в настоящем браузере: каждый блок отрисован и
   откликается на настройки, поверхности открываются и закрываются, консоль
   чистая. С --shots <папка> — снимки: каждый блок в светлой и тёмной теме,
   открытые панели, телефон. С --compare <папка> — сравнение с прошлыми снимками
   попиксельно (для правок без изменения вида).

     node eokit/tools/check.mjs [--only слово] [--shots after [--compare before]]

   Playwright — локальный или глобальный (npm root -g); браузер — CHROME=<путь>. */

import { createServer } from "node:http";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import(pathToFileURL(join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs")).href)); }

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? resolve(args[args.indexOf(name) + 1]) : null);
const SHOTS = option("--shots");
const COMPARE = option("--compare");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  const path = join(REPO, normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)));
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const URL_ = `http://127.0.0.1:${server.address().port}/showcase/index.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function open({ w = 1280, h = 860, theme = "light", motion = "reduce" } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion, hasTouch: w < 768 });
  await context.addInitScript((value) => localStorage.setItem("eokit-new.theme", value), theme);
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  /* favicon.ico у витрины нет, и браузер спрашивает его сам — это не ошибка страницы. */
  page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !m.location().url?.endsWith("/favicon.ico")) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForFunction(() => "ready" in document.documentElement.dataset);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors, close: () => context.close() };
}

const section = (id) => `[data-section='${id}']`;
const stage = (id) => `${section(id)} [data-stage]`;
/* Снимок окна целиком захватывает оглавление, а оно прокручивает себя за текущим
   разделом от того места, где стояло. После прохода по блокам и снимка всей
   страницы это место зависит от того, какие отметки «текущего» успели прийти, —
   перед снимком оглавление в начало, и снимок один на любой прогон. */
async function screen(page, path) {
  await page.$eval("#nav", (nav) => (nav.scrollTop = 0));
  await page.screenshot({ path });
}
/* Протянуть ручку вбок. Координаты — после того как ручка встала в кадр и не
   двигается (hover ждёт этого): клик по меню прокручивает страницу, и снятые
   раньше координаты попадали мимо ручки. */
async function dragBy(page, selector, dx) {
  const handle = page.locator(selector);
  await handle.hover();
  const box = await handle.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}
/* Выбор в настройке по значению: вкладка и строка списка — по data-value,
   флаг — щелчком. */
async function pick(page, id, prop, value) {
  const control = page.locator(`${section(id)} [data-prop='${prop}']`);
  const kind = await control.evaluate((node) => node.localName);
  if (kind === "select") {
    await control.locator("xpath=..").locator(".ui-select__trigger").click();
    await page.locator(`.ui-select__panel[data-state='open'] .ui-select__option[data-value="${value}"]`).click();
  } else if (kind === "input") await control.locator("xpath=..").click();
  else await control.locator(`.ui-tabs__trigger[data-value="${value}"]`).click();
  await page.waitForTimeout(60);
}

const CHECKS = [
  ["все блоки отрисованы, иконки поднялись", async (page, expect) => {
    expect(await page.locator(".sc-cfg").count(), await page.evaluate(() => document.querySelectorAll("#nav a[href^='#']").length), "конфигуратор на каждый пункт оглавления");
    expect(await page.locator("[data-stage]:empty").count(), 0, "пустых сцен нет");
    expect(await page.locator("span[data-ui-icon]").count(), 0, "все хосты иконок стали svg");
    expect(await page.locator("span[data-ui-e3d]").count(), 0, "все хосты 3D-иконок стали img");
    expect(await page.locator("img.ui-e3d").evaluateAll((list) => list.filter((img) => !img.naturalWidth).map((img) => img.getAttribute("src")).join(" ")), "", "3D-иконки загрузились");
    expect(await page.locator(".ui-select__wrap").count() >= 4, true, "селекты улучшены");
    expect(await page.locator(".ui-tabs__list.is-indicator-ready").count() >= 10, true, "пилюли вкладок поставлены");
  }],
  ["кнопка: вариант, размер, иконка, загрузка", async (page, expect) => {
    await pick(page, "button", "variant", "primary");
    await pick(page, "button", "size", "lg");
    await pick(page, "button", "icon", "only");
    const cls = await page.getAttribute(`${stage("button")} button`, "class");
    expect(cls, "ui-btn ui-btn--primary ui-btn--icon-lg", "классы собраны");
    expect((await page.locator(`${stage("button")} button`).boundingBox()).height, 36, "lg — 36 px");
    await pick(page, "button", "loading", true);
    expect(await page.locator(`${stage("button")} .ui-spinner`).count(), 1, "спиннер на месте иконки");
    expect(await page.textContent(`${section("button")} [data-code]`).then((code) => code.includes("is-loading")), true, "сниппет совпадает со сценой");
  }],
  ["бейдж: по сетке кнопок — md 32 и sm 28, точка тона, статус с иконкой", async (page, expect) => {
    await pick(page, "tones", "size", "md");
    const size = (selector) => page.$eval(selector, (node) => { const box = node.getBoundingClientRect(); const css = getComputedStyle(node); return [box.height, css.paddingInlineStart, css.fontSize, getComputedStyle(node, "::before").width].join(); });
    expect(await size(`${stage("tones")} .ui-badge[data-tone="green"]`), "32,12px,14px,6px", "md: 32, отступ 12, текст 14, точка 6 — как кнопка");
    expect(await page.$eval(`${stage("tones")} .ui-badge:has(> .ui-icon)`, (node) => getComputedStyle(node, "::before").content), "none", "у статуса вместо точки иконка");
    const accent = () => page.$eval(`${stage("tones")} .ui-badge--count[data-tone="accent"]`, (node) => {
      const probe = document.createElement("i"); probe.style.color = "var(--ui-accent)"; node.parentElement.append(probe);
      const same = getComputedStyle(probe).color === getComputedStyle(node).color; probe.remove(); return same;
    });
    expect(await accent(), true, "счётчик с data-tone=accent — цвет акцента");
    await page.click("[data-accent] [data-value='plum']");
    expect(await accent(), true, "и после смены акцента на сливу");
    await page.click("[data-accent] [data-value='terracotta']");
    await pick(page, "tones", "size", "sm");
    expect(await size(`${stage("tones")} .ui-badge[data-tone="green"]`), "28,10px,13px,6px", "sm: 28, отступ 10, текст 13 — как кнопка");
  }],
  ["чип-выбор: нажатие переключает aria-pressed, галочка и badge:change", async (page, expect) => {
    const chip = page.locator(`${stage("chips")} button.ui-badge:not(.ui-badge--outline):not(.ui-badge--soft)`).first();
    const events = page.evaluate(() => new Promise((done) => document.addEventListener("badge:change", (event) => done(event.detail.pressed), { once: true })));
    expect(await chip.getAttribute("aria-pressed"), "false", "сначала не отмечен");
    await chip.click();
    expect(await chip.getAttribute("aria-pressed"), "true", "отмечен по нажатию");
    expect(await events, true, "badge:change { pressed: true }");
    expect(await chip.evaluate((node) => getComputedStyle(node, "::before").width), "14px", "галочка 14 на месте точки");
    const heart = page.locator(`${stage("chips")} button.ui-badge:has(> .ui-icon--fill)`).first();
    expect(await heart.evaluate((node) => getComputedStyle(node.querySelector("svg")).fill !== "none"), true, "сердце залито");
    await chip.click();
    expect(await chip.getAttribute("aria-pressed"), "false", "второе нажатие снимает");
  }],
  ["поле: слоты, ошибка, показ пароля", async (page, expect) => {
    await pick(page, "input", "slot", "action");
    await page.click(`${stage("input")} .ui-input__action`);
    expect(await page.getAttribute(`${stage("input")} input`, "type"), "text", "пароль показан");
    await pick(page, "input", "state", "invalid");
    expect(await page.getAttribute(`${stage("input")} input`, "aria-invalid"), "true", "aria-invalid");
    const pad = await page.$eval(`${stage("input")} input`, (node) => getComputedStyle(node).paddingRight);
    expect(pad, "32px", "место под действие справа (высота поля)");
  }],
  ["выбор: флажок, радио, переключатель", async (page, expect) => {
    const at = (text) => `${stage("choice")} label:has-text("${text}")`;
    expect(await page.locator(`${stage("choice")} fieldset > legend`).count(), 3, "три группы с подписью");
    await page.click(at("Новые заказы"));
    expect(await page.isChecked(`${at("Новые заказы")} input`), false, "флажок снят щелчком по подписи");
    await page.click(at("Раз в неделю"));
    expect(await page.isChecked(`${at("Каждый день")} input`), false, "радио: выбран один пункт");
    const x = await page.$eval(`${at("Самовывоз")} .ui-switch__glyph`, (node) => getComputedStyle(node).transform);
    expect(x.endsWith(", 16, 0)"), true, "включённый бегунок сдвинут на 16 px");
    const glyphs = (text) => page.$eval(`${at(text)} .ui-switch__track`, (node) => ["::before", "::after"].map((part) => getComputedStyle(node, part).opacity).join());
    await page.waitForTimeout(400);
    expect(await glyphs("Самовывоз"), "0,1", "включён: видна полоска");
    expect(await glyphs("Доставка"), "1,0", "выключен: видно кольцо");
    expect(await page.isDisabled(`${at("Предзаказ ко времени")} input`), true, "последний пункт недоступен");
  }],
  ["селект: открыть, выбрать, закрыть", async (page, expect) => {
    /* Открытый список живёт в body: панель — по aria-controls кнопки. */
    const trigger = `${stage("select")} .ui-field:first-child .ui-select__trigger`;
    const panel = `#${await page.getAttribute(trigger, "aria-controls")}`;
    await page.click(trigger);
    expect(await page.getAttribute(panel, "data-state"), "open", "панель открыта");
    await page.click(`${panel} .ui-select__option:has-text("B2B-кабинет")`);
    expect(await page.textContent(`${stage("select")} .ui-field:first-child .ui-select__value`), "B2B-кабинет", "значение выбрано");
    expect(await page.$eval(`${stage("select")} #f-select`, (node) => node.selectedOptions[0].label), "B2B-кабинет", "нативный select синхронен");
    await page.waitForTimeout(150);
    expect(await page.$eval(`${stage("select")} .ui-field:first-child .ui-select__panel`, (node) => node.hidden), true, "панель скрыта и вернулась в обёртку");
    /* Длинный список рядом: 15 строк с иконками, прокрутка, выбранная строка видна. */
    const long = `${stage("select")} .ui-field:last-child .ui-select__trigger`;
    await page.click(long);
    const list = `#${await page.getAttribute(long, "aria-controls")}`;
    expect(await page.locator(`${list} .ui-select__option-icon`).count(), 15, "15 строк с иконками");
    expect(await page.$eval(list, (node) => node.scrollHeight > node.clientHeight), true, "длинный список прокручивается");
    expect(await page.$eval(list, (node) => { const row = node.querySelector("[aria-selected='true']"); return row.offsetTop >= node.scrollTop && row.offsetTop + row.offsetHeight <= node.scrollTop + node.clientHeight; }), true, "выбранная строка в видимой части");
  }],
  ["селект поверх поля: выбранная строка на месте поля, текст вровень, у кромки окна прижата", async (page, expect) => {
    await pick(page, "select", "placement", "over");
    const trigger = `${stage("select")} .ui-field:first-child .ui-select__trigger`;
    /* Мерить — после входа: пока он играет, панель масштабирована от выбранной строки. */
    const settled = (panel) => page.$eval(panel, (node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.click(trigger);
    const panel = `#${await page.getAttribute(trigger, "aria-controls")}`;
    await settled(panel);
    const at = await page.evaluate(([t, p]) => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      return { field: box(t), row: box(`${p} [aria-selected="true"]`), value: box(`${t} .ui-select__value`), label: box(`${p} [aria-selected="true"] .ui-select__label`) };
    }, [trigger, panel]);
    expect(Math.abs(at.row.top - at.field.top) <= 0.5, true, "строка на месте поля");
    expect(Math.round(at.label.left - at.value.left), 0, "текст строки вровень с текстом поля");
    await page.keyboard.press("Escape");
    await page.evaluate((t) => scrollTo({ top: scrollY + document.querySelector(t).getBoundingClientRect().bottom - innerHeight + 16, behavior: "instant" }), trigger);
    await page.click(trigger);
    await settled(panel);
    expect(await page.$eval(panel, (node) => Math.round(innerHeight - node.getBoundingClientRect().bottom)), 8, "у нижней кромки панель прижата с отступом 8");
  }],
  ["список в тексте: пилюля вокруг слова, строка не растёт, список по пунктам, выбор меняет слово", async (page, expect) => {
    const root = stage("inline-select");
    const trigger = `${root} .sc-inline__text .ui-select__trigger >> nth=0`;
    const [line, para, word, css] = await Promise.all([
      page.$eval(`${root} .sc-inline__text`, (node) => parseFloat(getComputedStyle(node).lineHeight)),
      page.locator(`${root} .sc-inline__text`).boundingBox(),
      page.locator(trigger).boundingBox(),
      page.$eval(`${root} .sc-inline__text .ui-select__trigger`, (node) => { const c = getComputedStyle(node); return [c.paddingInlineStart, c.paddingInlineEnd, c.marginInlineStart, c.marginInlineEnd].join(); }),
    ]);
    expect(word.height, line + 4, "пилюля на 2 px выше и ниже строки текста");
    expect(para.height, line, "строка фразы не выросла");
    expect(css, "8px,6px,4px,4px", "внутри 8 и 6, снаружи по 4");
    await page.click(trigger);
    const panel = `#${await page.locator(trigger).getAttribute("aria-controls")}`;
    expect(await page.$eval(panel, (node) => node.getBoundingClientRect().width > 160), true, "список шире слова");
    await page.click(`${panel} .ui-select__option:has-text("по понедельникам")`);
    expect(await page.locator(`${root} .sc-inline__text .ui-select__value >> nth=0`).textContent(), "по понедельникам", "слово сменилось");
  }],
  ["выпадашка: вариант на кнопке, флажки считаются, меню флажков не закрывается", async (page, expect) => {
    const root = stage("dropdown");
    const trigger = (n) => `${root} [data-popover-trigger] >> nth=${n}`;
    await page.click(trigger(0));
    await page.click(".ui-popover__panel[data-state='open'] [data-pick='sum-desc']");
    expect(await page.textContent(`${root} [data-dropdown-value]`), "Сумма по убыванию", "вариант на кнопке");
    await page.click(trigger(0));
    expect(await page.locator(".ui-popover__panel[data-state='open'] [role='menuitemradio'][aria-checked='true']").count(), 1, "отмечен один вариант");
    await page.keyboard.press("Escape");
    await page.click(trigger(1));
    await page.click(".ui-popover__panel[data-state='open'] [data-pick='pay']");
    expect(await page.textContent(`${root} [data-dropdown-count]`), "5", "счётчик флажков");
    expect(await page.locator(".ui-popover__panel[data-state='open']").count(), 1, "меню флажков открыто");
    await page.keyboard.press("Escape");
    const [left, right] = await Promise.all([page.locator(`${root} .ui-dropdown-split > .ui-btn`).boundingBox(), page.locator(trigger(3)).boundingBox()]);
    expect(right.x - (left.x + left.width), 1, "сплит: шов 1 px");
  }],
  ["меню: открыть, подменю, выбор пункта", async (page, expect) => {
    await page.click(`${stage("popover")} [data-popover-trigger]`);
    const panel = page.locator(".ui-popover__panel[data-state='open']");
    expect(await panel.count(), 1, "панель открыта");
    await page.hover(".ui-popover__panel[data-state='open'] [data-popover-trigger]");
    await page.waitForTimeout(80);
    expect(await page.locator(".ui-popover__panel[data-nested][data-state='open']").count(), 1, "подменю по наведению");
    const row = await page.locator(".ui-popover__panel[data-state='open'] .ui-btn").first().boundingBox();
    expect(row.height, 32, "строка меню 32 px");
    await page.click(".ui-popover__panel[data-nested] [data-pick='Пригласить']");
    await page.waitForTimeout(150);
    expect(await page.locator(".ui-popover__panel[data-state='open']").count(), 0, "все панели закрыты");
    expect(await page.locator(".ui-alert-region .ui-alert").count() >= 1, true, "тост о выборе");
  }],
  ["подсказка: показ и пересадка", async (page, expect) => {
    await page.hover(`${stage("tooltip")} button:nth-child(1)`);
    await page.waitForSelector(".ui-tooltip[data-state='open']");
    expect(await page.textContent(".ui-tooltip[role='tooltip'] .ui-tooltip__text"), "Копировать ссылку на заказ", "текст первой");
    await page.hover(`${stage("tooltip")} button:nth-child(3)`);
    await page.waitForTimeout(80);
    expect(await page.textContent(".ui-tooltip[role='tooltip'] .ui-tooltip__text").then((text) => text.includes("Изменить")), true, "сразу у соседа");
  }],
  ["вкладки: переключение панели", async (page, expect) => {
    await page.click(`${stage("tabs")} .ui-tabs__trigger:has-text("Покупатели")`);
    expect(await page.locator(`${stage("tabs")} .ui-tabs__panel:not([hidden])`).innerText().then((text) => text.startsWith("1 284")), true, "панель сменилась");
    await pick(page, "tabs", "variant", "line");
    expect(await page.locator(`${stage("tabs")} .ui-tabs--line`).count(), 1, "вариант line");
  }],
  ["график: вертикаль за мышью, стрелки по дням, вкладка показателя рисует свой", async (page, expect) => {
    const plot = `${stage("chart")} .ui-tabs__panel:not([hidden]) .ui-chart__plot`;
    await page.locator(stage("chart")).scrollIntoViewIfNeeded();
    expect(await page.locator(`${plot} .ui-chart__line`).count(), 2, "линия периода и пунктир прошлого");
    expect(await page.locator(`${stage("chart")} .ui-tabs__panel:not([hidden]) .ui-chart__y > span`).allTextContents().then((list) => list.at(0)), "0\u00a0₽", "ось от нуля");
    const box = await page.locator(plot).boundingBox();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
    await page.waitForSelector(`${plot}.is-active`);
    expect(await page.textContent(`${plot} .ui-chart__tip-head`), "вт, 13 октября", "у правого края — последний день");
    expect(await page.getAttribute(`${plot} .ui-chart__tip`, "data-side"), "left", "подсказка слева от вертикали");
    await page.mouse.move(box.x + box.width / 2, box.y - 120);
    expect(await page.locator(`${plot}.is-active`).count(), 0, "мышь ушла — подсказки нет");
    await page.focus(plot);
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    expect(await page.textContent(`${plot} .ui-chart__tip-head`), "вт, 15 сентября", "Home и шаг вправо");
    await page.click(`${stage("chart")} .ui-tabs__trigger:has-text("Средний чек")`);
    /* График вкладки рисуется в следующем кадре после показа панели: под нагрузкой
       полного прогона чтение сразу после щелчка видело пустой путь. */
    await page.waitForFunction((root) => document.querySelector(`${root} .ui-tabs__panel:not([hidden]) .ui-chart__line:last-of-type`)?.getAttribute("d")?.startsWith("M"), stage("chart")).catch(() => {});
    const path = await page.getAttribute(`${stage("chart")} .ui-tabs__panel:not([hidden]) .ui-chart__line >> nth=-1`, "d");
    expect(Boolean(path && path.startsWith("M")), true, "открытая вкладка нарисовала свой график");
    expect(await page.locator(`${stage("chart")} .ui-tabs__panel:not([hidden]) .ui-chart__area`).count(), 0, "без нуля на оси — без заливки");
  }],
  ["маска: телефон собран в формат", async (page, expect) => {
    expect(await page.inputValue(`${stage("masks")} input`), "+7 (916) 123-45-67", "89161234567 → +7 (916) 123-45-67");
    await pick(page, "masks", "mask", "password");
    await page.click(`${stage("masks")} .ui-input__action`);
    expect(await page.getAttribute(`${stage("masks")} input`, "type"), "text", "глазок модуля показывает пароль");
  }],
  ["аккордеон: открыт один раздел, сцена не растёт", async (page, expect) => {
    const stageHeight = () => page.$eval(stage("accordion"), (node) => node.getBoundingClientRect().height);
    const before = await stageHeight();
    await pick(page, "accordion", "mode", "multiple");
    for (const at of [2, 3, 4]) await page.click(`${stage("accordion")} .ui-accordion__item:nth-child(${at}) .ui-accordion__trigger`);
    await page.waitForTimeout(350);
    expect(await stageHeight(), before, "все разделы открыты — высота сцены та же");
    await pick(page, "accordion", "mode", "single");
    await page.click(`${stage("accordion")} .ui-accordion__item:nth-child(2) .ui-accordion__trigger`);
    await page.waitForTimeout(350);
    expect(await page.locator(`${stage("accordion")} .ui-accordion__item.is-open`).count(), 1, "открыт один");
    expect(await page.getAttribute(`${stage("accordion")} .ui-accordion__item:nth-child(2) .ui-accordion__trigger`, "aria-expanded"), "true", "второй раскрыт");
    const shut = await page.locator(`${stage("accordion")} .ui-accordion__item:first-child .ui-accordion__panel`).boundingBox();
    expect(shut === null || shut.height < 1, true, "первый свернулся");
  }],
  ["крошки: узкая колонка сворачивает середину", async (page, expect) => {
    expect(await page.locator(`${stage("breadcrumb")} [data-ui-breadcrumb-more]:not([hidden])`).count(), 0, "в широкой путь целиком");
    await pick(page, "breadcrumb", "width", "narrow");
    await page.waitForTimeout(60);
    expect(await page.locator(`${stage("breadcrumb")} [data-ui-breadcrumb-more]:not([hidden])`).count(), 1, "«…» на месте середины");
    const rows = await page.$eval(`${stage("breadcrumb")} .ui-breadcrumb`, (node) => Math.round(node.offsetHeight / parseFloat(getComputedStyle(node).lineHeight)));
    expect(rows, 1, "путь в одну строку");
  }],
  ["пагинация: шаг вперёд и счётчик", async (page, expect) => {
    await pick(page, "pagination", "pages", "48");
    await page.click(`${stage("pagination")} [data-ui-pagination-nav=next]`);
    expect(await page.textContent(`${stage("pagination")} [aria-current=page]`), "2", "текущая — 2");
    expect(await page.textContent(`${stage("pagination")} [data-count]`), "Заказы 21–40 из 956", "счётчик обновился");
  }],
  ["окно: дата и интервал выбираются, «Сохранить» закрывает", async (page, expect) => {
    await page.click(`${stage("modal")} [data-modal-template]`);
    await page.waitForSelector(".ui-modal-layer[data-state='open']");
    expect(await page.textContent(".ui-modal-layer .ui-modal__title"), "Доставка заказа №1042", "заголовок из шаблона");
    expect(await page.$eval(".ui-modal-layer .ui-modal__title", (node) => `${getComputedStyle(node).fontSize} ${getComputedStyle(node).fontWeight}`), "18px 600", "заголовок 18/600");
    expect(await page.locator(".ui-modal-layer .ui-modal [name=dl-slot]:disabled").count(), 1, "занятый интервал не выбирается");
    await page.click(".ui-modal-layer .ui-modal .sc-m-slot:nth-child(2)");
    await page.click(".ui-modal-layer .ui-modal .ui-datepicker__trigger");
    /* Открытая панель — в слое окна, рядом с ним. */
    await page.waitForSelector(".ui-modal-layer .ui-datepicker__panel[data-state='open']");
    /* Послезавтра есть в сетке всегда: даже из соседнего месяца. */
    const [label, value] = await page.evaluate(() => {
      const day = new Date(Date.now() + 2 * 864e5);
      const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
      return [`${day.getDate()} ${months[day.getMonth()]} ${day.getFullYear()}`, day.toLocaleDateString("ru-RU")];
    });
    await page.click(`.ui-modal-layer .ui-datepicker__day[aria-label="${label}"]`);
    expect(await page.inputValue("#dl-date"), value, "дата вписана в поле");
    await page.click(".ui-modal-layer .ui-modal [data-modal-close='delivery']");
    await page.waitForSelector(".ui-modal-layer", { state: "detached" });
    expect(await page.locator(".ui-alert-region .ui-alert").innerText().then((text) => text.includes(`${value}, 14:00–18:00`)), true, "тост с новой датой и интервалом");
  }],
  ["панель: прилегает к краю с зазором, Esc закрывает", async (page, expect) => {
    await page.click(`${stage("sheet")} [data-modal-template]`);
    await page.waitForSelector(".ui-modal-layer[data-type='side'][data-state='open']");
    await page.waitForTimeout(100);
    const box = await page.locator(".ui-modal-layer .ui-modal").boundingBox();
    expect(Math.round(1280 - box.x - box.width), 8, "справа зазор 8 px");
    expect(Math.round(box.width), 416, "ширина 416 px");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".ui-modal-layer", { state: "detached" });
  }],
  ["тур: вырез у элемента, стрелки листают, Tab в карточке, щелчок мимо не закрывает, Esc закрывает и прогресс сохранён", async (page, expect) => {
    await page.evaluate(() => localStorage.removeItem("ui-tour:showcase"));
    await page.click(`${stage("tour")} [data-act="tourReset"]`);
    await page.click(`${stage("tour")} [data-act="tour"]`);
    await page.waitForSelector(".ui-tour[data-state='open'] .ui-tour__card");
    expect(await page.$eval(".ui-tour .ui-tour__card", (card) => card.dataset.side), "center", "первый шаг без элемента — по центру");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => !document.querySelector(".ui-tour")?.hasAttribute("data-moving"));
    const [spot, target] = await page.evaluate(() => [document.querySelector(".ui-tour__spot"), document.querySelector(".sc-tour__search")].map((node) => node.getBoundingClientRect().toJSON()));
    expect(Math.round(target.x - spot.x), 4, "вырез на 4 px шире элемента");
    expect(await page.textContent(".ui-tour .ui-tour__title"), "Поиск по всему", "второй шаг");
    for (let k = 0; k < 4; k += 1) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement.closest(".ui-tour .ui-tour__card")), true, "Tab не уходит из карточки");
    await page.mouse.click(8, 8);
    expect(await page.locator(".ui-tour").count(), 1, "щелчок мимо тур не закрыл");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".ui-tour", { state: "detached" });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ui-tour:showcase")));
    expect(saved.at, 1, "сохранён шаг, где остановились");
    expect(saved.seen.join(), "hello,search", "пройденные шаги");
    expect((await page.textContent(`${stage("tour")} [data-act="tour"]`)).trim(), "Продолжить тур", "запуск предлагает продолжить");
  }],
  ["палитра: Ctrl K, поиск сужает список, Enter выполняет", async (page, expect) => {
    await page.keyboard.press("Control+k");
    await page.waitForSelector(".ui-command__dialog[data-state='open']");
    /* Только в окне палитры: на витрине есть и строки палитры для показа (знак помощника). */
    expect(await page.locator(".ui-command__dialog .ui-command__item[data-command-query]:not([hidden])").count(), 0, "без запроса строки «Спросить» нет");
    await page.keyboard.type("10");
    expect(await page.locator(".ui-command__dialog .ui-command__item:not([hidden], [data-command-query])").count(), 4, "остались четыре заказа");
    expect(await page.locator(".ui-command__dialog .ui-command__group:not([hidden])").count(), 2, "заказы и строка «Спросить»");
    expect(await page.textContent(".ui-command__query"), "10", "строка «Спросить» повторяет запрос");
    await page.waitForTimeout(50);
    expect(await page.$eval(".ui-command__dialog .ui-command__group:not([hidden])", (node) => getComputedStyle(node).boxShadow), "none", "над первой видимой группой нет черты");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".ui-command__layer[hidden]", { state: "attached" });
    await page.waitForSelector(".ui-alert-region .ui-alert:has-text('№1042')");
  }],
  ["палитра: ничего не нашлось — Enter спрашивает помощника", async (page, expect) => {
    await page.keyboard.press("Control+k");
    await page.waitForSelector(".ui-command__dialog[data-state='open']");
    await page.keyboard.type("когда приедет курьер");
    expect(await page.locator(".ui-command__dialog .ui-command__item:not([hidden])").count(), 1, "видна только строка «Спросить»");
    expect(await page.locator(".ui-command__dialog .ui-command__item.is-active[data-command-query]").count(), 1, "и она подсвечена");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".ui-alert-region .ui-alert:has-text('Вопрос помощнику: когда приедет курьер')");
  }],
  ["таблица: меню прячет столбец, соседи на своих местах", async (page, expect) => {
    const width = () => page.$eval("#latest-orders thead th:nth-child(7)", (node) => Math.round(node.getBoundingClientRect().width));
    const before = await width();
    await page.click(`${stage("table")} .ui-table-columns__trigger`);
    await page.click(".ui-table-columns__item:has-text('Канал')");
    expect(await page.locator("#latest-orders thead th[hidden]").count(), 1, "«Канал» скрыт");
    expect(await width(), before, "«Оплата» не заняла его место");
    expect(await page.getAttribute(".ui-table-columns__item:has-text('Канал')", "aria-checked"), "false", "в меню снята галочка");
    const rows = await page.$$eval("#latest-orders tbody tr", (list) => [...new Set(list.map((row) => row.getBoundingClientRect().height))]);
    expect(rows.join(), "36", "строки по 36 px");
  }],
  ["таблица: шапка сортирует, «Сбросить» возвращает порядок, край тянет ширину", async (page, expect) => {
    const ids = () => page.$$eval("#latest-orders tbody tr", (rows) => rows.map((row) => row.cells[1].textContent.trim()).join());
    const before = await ids();
    /* Панель — по aria-controls своей кнопки: прошлое меню ещё может доигрывать уход. */
    const sortBy = async (label, item) => {
      const trigger = `#latest-orders thead .ui-table-view__sort:has-text('${label}')`;
      await page.click(trigger);
      const panel = `#${await page.getAttribute(trigger, "aria-controls")}`;
      await page.waitForSelector(`${panel}[data-state='open']`);
      await page.click(`${panel} .ui-btn:has-text('${item}')`);
      await page.waitForSelector(`${panel}:not([data-state='open'])`, { state: "attached" });
    };
    await sortBy("Сумма", "9 → 1");
    const sums = await page.$$eval("#latest-orders tbody tr", (rows) => rows.map((row) => Number(row.cells[6].dataset.sortValue)));
    expect(sums.every((sum, at) => at === 0 || sums[at - 1] >= sum), true, `суммы по убыванию: ${sums}`);
    expect(await page.getAttribute("#latest-orders thead th:nth-child(7)", "aria-sort"), "descending", "aria-sort у «Суммы»");
    await sortBy("Дата", "Сначала старые");
    const dates = await page.$$eval("#latest-orders tbody tr", (rows) => rows.map((row) => row.cells[3].dataset.sortValue));
    expect(dates.join() === [...dates].sort().join(), true, "даты по возрастанию");
    await sortBy("Дата", "Сбросить");
    expect(await ids(), before, "исходный порядок");
    const width = () => page.$eval("#latest-orders thead th:nth-child(4)", (node) => Math.round(node.getBoundingClientRect().width));
    const start = await width();
    await dragBy(page, "#latest-orders thead th:nth-child(4) .ui-table__resize", 40);
    expect(await width(), start + 40, "«Дата» шире на 40 px");
  }],
  ["таблица с рендером строк: шапка сортирует все строки, край тянет ширину", async (page, expect) => {
    const host = "#receipts";
    const trigger = `${host} .ui-table-view__sort:has-text('Сумма')`;
    await page.click(trigger);
    const panel = `#${await page.getAttribute(trigger, "aria-controls")}`;
    await page.waitForSelector(`${panel}[data-state='open']`);
    await page.click(`${panel} .ui-btn:has-text('9 → 1')`);
    await page.waitForFunction((sel) => document.querySelector(`${sel} th[data-column='sum']`)?.getAttribute("aria-sort") === "descending", host);
    /* Полмиллиона ключей сортирует воркер: ждём, пока таблица не снимет занятость. */
    await page.waitForFunction((sel) => !document.querySelector(sel).matches(".is-busy, .is-sorting"), host, { timeout: 15000 });
    await page.waitForTimeout(100);
    const top = await page.$$eval(`${host} .ui-table-view__rows tr`, (rows) => rows.slice(0, 5).map((row) => row.querySelector("td[data-column='sum'], td:nth-child(6)")?.textContent.replace(/\D/g, "")).map(Number));
    expect(top.every((sum, at) => at === 0 || top[at - 1] >= sum) && top[0] === 890, true, `сверху самые крупные чеки: ${top}`);
    /* Меню «Суммы» вернуло фокус в шапку и прокрутило кадр вбок: «Кофейню» — обратно в кадр. */
    await page.$eval(`${host} .ui-table-view__frame`, (node) => (node.scrollLeft = 120));
    const edges = await page.$eval(host, (node) => [node.querySelector("th[data-column='shop']"), node.querySelector(".ui-table-view__rows tr td:nth-child(4)")].map((cell) => Math.round(cell.getBoundingClientRect().left)).join());
    expect(edges.split(",")[0], edges.split(",")[1], "шапка едет вбок вместе со строками");
    await page.$eval(`${host} .ui-table-view__frame`, (node) => (node.scrollLeft = 0));
    const cell = `${host} th[data-column='shop']`;
    const width = () => page.$eval(cell, (node) => Math.round(node.getBoundingClientRect().width));
    const start = await width();
    await dragBy(page, `${cell} .ui-table__resize`, 40);
    expect(await width(), start + 40, "«Кофейня» шире на 40 px");
  }],
  ["таблица с рендером строк: окно строк закрывает рамку на любой глубине", async (page, expect) => {
    const frame = "#receipts .ui-table-view__port > .ui-table-view__frame";
    await page.$eval(frame, (node) => (node.scrollTop = node.scrollHeight / 2));
    await page.waitForTimeout(200);
    const gap = await page.$eval(frame, (node) => {
      const box = node.getBoundingClientRect();
      const rows = [...node.querySelectorAll(".ui-table-view__rows tr")].map((row) => row.getBoundingClientRect());
      const heights = new Set(rows.map((row) => row.height));
      const top = Math.min(...rows.map((row) => row.top));
      const bottom = Math.max(...rows.map((row) => row.bottom));
      return { heights: [...heights].join(), covered: top <= box.top && bottom >= box.top + node.clientHeight };
    });
    /* scrollend мгновенной прокрутки приходит раньше кадра прокрутки: флаг не залипает. */
    expect(await page.$eval("#receipts", (node) => node.classList.contains("is-scrolling")), false, "после мгновенной прокрутки нет is-scrolling");
    expect(gap.heights, "36", "строки по 36 px");
    expect(gap.covered, true, "строки покрывают рамку");
    expect((await page.textContent("#receipts .ui-table-view__count")).replace(/\s/g, " "), "Показано 500 000", "счётчик");
  }],
  ["дерево разделов: группа сворачивается в ноль, Tab ведёт в текущий раздел", async (page, expect) => {
    const group = `${stage("tree")} .ui-tree-menu__node:has(> button:has-text('Заказы'))`;
    expect(await page.getAttribute(`${stage("tree")} [aria-current='page']`, "tabindex"), "0", "точка входа — текущий раздел");
    const height = () => page.$eval(stage("tree"), (node) => node.offsetHeight);
    const before = await height();
    await page.click(`${group} > button`);
    await page.waitForTimeout(100);
    expect(await height(), before, "сцена не меняет высоту: раскрытие не двигает страницу");
    expect(await page.$eval(`${group} > .ui-tree-menu__list`, (node) => [node.getBoundingClientRect().height, node.inert].join()), "0,true", "закрытый список нулевой и inert");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    expect(await page.getAttribute(`${group} > button`, "aria-expanded"), "true", "стрелка вправо раскрыла группу");
  }],
  ["сегменты: щелчок и стрелка выбирают, выбранный на белой пилюле", async (page, expect) => {
    const group = `${stage("segmented")} .ui-segmented`;
    const checked = () => page.$eval(group, (row) => row.querySelector("input:checked").value);
    expect(await checked(), "takeaway", "выбран «С собой»");
    await page.click(`${group} .ui-segmented__item:has-text("Доставка")`);
    expect(await checked(), "delivery", "щелчок выбрал «Доставку»");
    await page.keyboard.press("ArrowLeft");
    expect(await checked(), "takeaway", "стрелка влево вернула «С собой»");
    const [pill, track] = await page.$eval(group, (row) => [getComputedStyle(row.querySelector(".ui-segmented__item:has(> input:checked)")).backgroundColor, getComputedStyle(row).backgroundColor]);
    expect(pill !== track, true, "у выбранного своя подложка");
  }],
  ["группа флажков: часть — черта, общий отмечает всех", async (page, expect) => {
    const tree = page.locator(`${stage("checktree")} .ui-checkbox-tree`).first();
    const parent = tree.locator("[data-ui-checkbox-parent]");
    expect(await parent.evaluate((input) => input.indeterminate), true, "две из трёх — черта");
    /* Акцент витрины выбирается в шапке — сверяем с текущим, а не с синим кита. */
    const [fill, accent] = await tree.locator(".ui-check__box").first().evaluate((box) => {
      const before = getComputedStyle(box, "::before");
      const probe = document.body.appendChild(document.createElement("i"));
      probe.style.color = "var(--ui-accent)";
      const color = getComputedStyle(probe).color;
      probe.remove();
      return [before.opacity === "1" ? before.backgroundColor : "нет заливки", color];
    });
    expect(fill, accent, "черта на акцентной заливке");
    await tree.locator(".ui-check").first().click();
    expect(await tree.locator("[data-ui-checkbox-child]:checked").count(), 3, "общий отметил всех");
    expect(await parent.evaluate((input) => input.checked && !input.indeterminate), true, "общий отмечен");
  }],
  ["перетаскивание: мышь и клавиатура переставляют, порядок приходит событием", async (page, expect) => {
    const list = `${stage("sortable")} .ui-sortable`;
    await page.locator(list).scrollIntoViewIfNeeded();
    await page.$eval(list, (node) => node.addEventListener("sortable:change", (event) => { window.order = event.detail.order.join(); }));
    const box = await page.locator(`${list} [data-value='coffee'] .ui-sortable__handle`).boundingBox();
    await page.mouse.move(box.x + 11, box.y + 11);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) await page.mouse.move(box.x + 11, box.y + 11 + step * 7);
    expect(await page.locator(".ui-sortable__ghost").count(), 1, "призрак в body");
    expect(await page.$eval(`${list} .is-dragging-source`, (node) => getComputedStyle(node).position), "absolute", "исходный пункт вне потока");
    await page.mouse.up();
    expect(await page.evaluate(() => window.order), "season,breakfast,coffee,desserts,beans", "«Кофе» опустился на две строки");
    expect(await page.locator(".ui-sortable__ghost, .ui-sortable__placeholder").count(), 0, "призрак и слот убраны");
    await page.focus(`${list} [data-value='desserts'] .ui-sortable__handle`);
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.order), "season,breakfast,desserts,coffee,beans", "«Десерты» поднялись с клавиатуры");
  }],
  ["перетаскивание: за краем карточки — сопротивление, отпущенный пункт пружинит в слот", async (page, expect) => {
    /* За край карточки призрак тянется с сопротивлением: на 100 px вниз — меньше предела 32 px. */
    const list = `${stage("sortable")} .ui-sortable`;
    await page.locator(list).scrollIntoViewIfNeeded();
    const card = await page.locator(list).boundingBox();
    const last = await page.locator(`${list} [data-value='beans'] .ui-sortable__handle`).boundingBox();
    await page.mouse.move(last.x + 11, last.y + 11);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) await page.mouse.move(last.x + 11, card.y + card.height + step * 10);
    const ghost = await page.locator(".ui-sortable__ghost").boundingBox();
    const over = ghost.y + ghost.height - (card.y + card.height);
    expect(over > 8 && over < 32, true, `призрак за краем на ${over.toFixed(1)} px — с сопротивлением`);
    await page.mouse.up();
    expect(await page.$eval(`${list} [data-value='beans']`, (node) => node.classList.contains("is-settling")), true, "отпущенный пункт летит в слот");
    await page.waitForTimeout(400);
    expect(await page.$eval(`${list} [data-value='beans']`, (node) => node.classList.contains("is-settling") || node.getAnimations().length > 0), false, "пружина успокоилась");
  }, { motion: "no-preference" }],
  ["фильтр: итог по условиям, «Очистить» прячется, новое условие в одну высоту", async (page, expect) => {
    const root = stage("filters");
    const foot = async () => (await page.textContent(`${root} [data-result]`)).replace(/\s/g, " ");
    expect(await foot(), "Подходят 202 заказа из 2 400 на 4 080 350 ₽", "итог по трём условиям");
    /* mount по предку — как перерисовка куска страницы: селекты чипов уже свои, второй обёртки нет. */
    await page.evaluate(async (host) => (await import("../eokit/kit.js")).mount(document.querySelector(host)), section("filters"));
    expect(await page.locator(`${root} .ui-select__wrap`).count(), await page.locator(`${root} .ui-filter-builder__item select`).count(), "каждый список чипа — селект кита, один раз");
    expect(await page.locator(`${root} .ui-select__wrap .ui-select__wrap`).count(), 0, "без вложенных обёрток после mount предка");
    await page.click(`${root} .ui-filter-builder__clear`);
    expect(await page.locator(`${root} .ui-filter-builder__clear`).isHidden(), true, "без условий «Очистить» скрыта");
    expect((await foot()).startsWith("Все 2 400 заказов"), true, "без условий — все заказы");
    await page.click(`${root} .ui-filter-builder__add`);
    const heights = await page.$$eval(`${root} .ui-filter-builder__item > *`, (list) => [...new Set(list.map((node) => node.getBoundingClientRect().height))].join());
    expect(heights, "28", "части условия по 28 px");
    expect(await page.evaluate(() => document.activeElement.matches(".ui-filter-builder__field + .ui-select__trigger")), true, "фокус в новом условии");
    expect(await page.textContent(`${root} .ui-filter-builder__value + .ui-select__trigger`), "Значение", "пустое значение — подсказка");
    await page.click(`${root} .ui-filter-builder__value + .ui-select__trigger`);
    await page.click(".ui-select__panel[data-state='open'] .ui-select__option[data-value='pending']");
    expect((await foot()).startsWith("Подходит") || (await foot()).startsWith("Подходят"), true, "значение из списка кита применилось");
    await page.click(`${root} .ui-filter-builder__field + .ui-select__trigger`);
    await page.click(".ui-select__panel[data-state='open'] .ui-select__option[data-value='sum']");
    expect(await page.locator(`${root} input.ui-filter-builder__value`).count(), 1, "у числового поля значение — поле ввода");
    expect(await page.textContent(`${root} .ui-filter-builder__operator + .ui-select__trigger`), "равно", "оператор — первый у чисел");
    await page.click(`${root} .ui-filter-builder__remove`);
    expect(await page.locator(`${root} .ui-filter-builder__item`).count(), 0, "условие удалено");
    expect(await page.locator(`${root} .ui-select__panel`).count(), 0, "списки удалённого чипа сняты");
  }],
  ["число: кнопка шага меняет значение, недоступное не нажимается", async (page, expect) => {
    await page.click(`${stage("number")} .ui-number-field__step--inc`);
    expect(await page.inputValue(`${stage("number")} input`), "3", "2 + шаг 1");
    await pick(page, "number", "step", "pack");
    await page.click(`${stage("number")} .ui-number-field__step--dec`);
    expect(await page.inputValue(`${stage("number")} input`), "750", "1000 − шаг 250");
    await pick(page, "number", "disabled", true);
    expect(await page.$eval(`${stage("number")} .ui-number-field__step`, (node) => getComputedStyle(node).pointerEvents), "none", "кнопки шага выключены");
    expect(await page.isDisabled(`${stage("number")} input`), true, "поле недоступно");
  }],
  ["редактор: жирный по выделению, подзаголовок, ссылка, вставка простым текстом", async (page, expect) => {
    const area = `${stage("editor")} .ui-editor__area`;
    const value = () => page.inputValue(`${stage("editor")} .ui-editor__value`);
    await page.click(`${area} p`);
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Home");
    await page.click(`${stage("editor")} [data-ui-editor-cmd='italic']`);
    expect(await page.getAttribute(`${stage("editor")} [data-ui-editor-cmd='italic']`, "aria-pressed"), "true", "курсив отмечен");
    expect((await value()).includes("<i>") || (await value()).includes("<em>"), true, "курсив в значении поля");
    await page.click(`${area} li`);
    await page.click(`${stage("editor")} [data-ui-editor-cmd='ul']`);
    await page.click(`${stage("editor")} [data-ui-editor-cmd='h2']`);
    expect(await page.locator(`${area} h2`).count(), 2, "абзац стал подзаголовком");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("ControlOrMeta+k");
    await page.fill(`${stage("editor")} .ui-editor__link input`, "zerno.ru");
    await page.keyboard.press("Enter");
    expect(await page.getAttribute(`${area} a`, "href"), "https://zerno.ru", "ссылка со схемой");
    await page.evaluate((selector) => {
      const target = document.querySelector(selector);
      const data = new DataTransfer();
      data.setData("text/html", "<b style='color:red'>чужое</b>");
      data.setData("text/plain", "чужое");
      target.focus();
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, area);
    expect(await page.locator(`${area} [style]`).count(), 0, "вставка без чужого оформления");
    await pick(page, "editor", "disabled", true);
    expect(await page.getAttribute(area, "contenteditable"), "false", "только чтение");
  }],
  ["поле запроса: растёт с текстом, Enter отправляет, ↑ возвращает, крестик убирает чип", async (page, expect) => {
    const form = `${stage("prompt")} .ui-prompt`;
    const area = `${form} .ui-prompt__area`;
    const height = async () => Math.round((await page.locator(form).boundingBox()).height);
    await page.locator(form).scrollIntoViewIfNeeded();
    expect(await height(), 64, "пустое поле — 64 px");
    expect(await page.$eval(`${form} .ui-prompt__send`, (node) => node.disabled), true, "пустое не отправить");
    await page.click(area);
    await page.keyboard.type("Что с заказом?");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("И когда его оплатят");
    expect(await height(), 84, "вторая строка — на 20 px выше");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".ui-alert-region .ui-alert:has-text('Вопрос: Что с заказом?')");
    expect(await page.inputValue(area), "", "после отправки поле пустое");
    expect(await height(), 64, "и снова в одну строку");
    await page.keyboard.press("ArrowUp");
    expect(await page.inputValue(area), "Что с заказом?\nИ когда его оплатят", "↑ вернул прошлый вопрос");
    await page.click(`${form} .ui-prompt__drop`);
    expect(await page.locator(`${form} .ui-badge`).count(), 0, "чип убран");
    expect(await page.evaluate(() => document.activeElement?.classList.contains("ui-prompt__area")), true, "фокус в поле");
    await pick(page, "prompt", "busy", true);
    expect(await page.$eval(`${form} .ui-prompt__send`, (node) => node.disabled), true, "пока ждёт ответа — не отправить");
  }],
  ["шкала: стрелка двигает на шаг, значение в подписи; в поле — внутри, полоска гаснет у значения", async (page, expect) => {
    const plain = `${stage("slider")} .ui-scale-slider:not(.ui-scale-slider--input)`;
    const field = `${stage("slider")} .ui-scale-slider--input`;
    await page.focus(`${plain} input`);
    await page.keyboard.press("ArrowRight");
    expect(await page.inputValue(`${plain} input`), "15", "10 + шаг 5");
    expect(await page.textContent(`${stage("slider")} .sc-slider__value`), "15 %", "подпись обновилась");
    expect(await page.locator(`${stage("slider")} .ui-scale-slider__tick`).count(), 5, "риски на каждом шаге между концами, у поля — нет");
    expect(await page.$eval(`${field}`, (node) => node.getBoundingClientRect().height), 32, "поле высотой с инпут");
    await page.focus(`${field} input`);
    await page.keyboard.press("End");
    expect(await page.textContent(`${field} .ui-scale-slider__value`), "10 %", "значение в поле");
    /* Сторону значения шкала решает в ближайшем кадре, до его отрисовки. */
    const frame = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done())));
    await frame();
    expect(await page.getAttribute(field, "data-covered"), "", "у полоски значение уходит влево");
    /* Смена стороны — короткое появление: место читаем после него. */
    await page.$eval(`${field} .ui-scale-slider__value`, (node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    expect(await page.$eval(field, (node) => node.querySelector(".ui-scale-slider__value").getBoundingClientRect().right < node.getBoundingClientRect().right - 16), true, "значение слева от полоски, полоска видна");
    await page.keyboard.press("Home");
    await frame();
    expect(await page.getAttribute(field, "data-covered"), null, "в начале значение у правого края");
    await page.evaluate(() => document.activeElement.blur());
    await page.click(field);
    expect(await page.$eval(field, (node) => getComputedStyle(node).boxShadow.includes(" 3px")), false, "щелчок поле не обводит");
  }],
  ["шкала: за краем — растяжение с сопротивлением, отпущенная пружинит назад (оба вида)", async (page, expect) => {
    const scale = (selector) => page.$eval(selector, (node) => new DOMMatrix(getComputedStyle(node).transform).a);
    for (const [kind, selector, side] of [["обычная", `${stage("slider")} .ui-scale-slider:not(.ui-scale-slider--input)`, -1], ["поле", `${stage("slider")} .ui-scale-slider--input`, 1]]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const box = await page.locator(selector).boundingBox();
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      for (let step = 1; step <= 10; step += 1) await page.mouse.move(box.x + box.width / 2 + side * (box.width / 2 + step * 12), y);
      const pulled = await scale(selector);
      expect(pulled > 1.01 && pulled < 1.06, true, `${kind}: растянута на ${((pulled - 1) * 100).toFixed(1)} % — с сопротивлением`);
      expect(await page.getAttribute(selector, "data-stretch"), side < 0 ? "start" : "end", `${kind}: тянется в сторону указателя`);
      await page.mouse.up();
      await page.waitForTimeout(450);
      expect(await scale(selector), 1, `${kind}: пружина вернула размер`);
    }
  }, { motion: "no-preference" }],
  ["загрузка: файлы в списке, значок документа, отказ по размеру", async (page, expect) => {
    const root = stage("upload");
    await page.waitForFunction((root) => document.querySelectorAll(`${root} .ui-file-upload__row`).length === 2, root);
    expect(await page.locator(`${root} .ui-file-upload__preview`).count(), 2, "у фото — превью");
    await page.setInputFiles(`${root} input[type=file]`, { name: "витрина.webp", mimeType: "image/webp", buffer: Buffer.alloc(6e6) });
    expect(await page.getAttribute(`${root} .ui-file-upload`, "data-status"), "error", "отказ помечен");
    expect((await page.textContent(`${root} .ui-file-upload__status`)).includes("больше 5,0 МБ"), true, "причина отказа в строке");
    expect(await page.locator(`${root} .ui-file-upload__row`).count(), 2, "большой файл не добавлен");
    await pick(page, "upload", "variant", "button");
    await page.waitForFunction((root) => document.querySelectorAll(`${root} .ui-file-upload__row`).length === 3, root);
    expect(await page.getAttribute(`${root} .ui-file-upload__media > .ui-icon`, "data-ui-icon"), "file-text", "у документа — значок файла");
  }],
  ["карусель: стрелка листает, просмотр открывается и закрывается Esc", async (page, expect) => {
    const root = stage("carousel");
    await page.hover(`${root} .ui-carousel__viewport`);
    await page.click(`${root} .ui-carousel__next`);
    expect(await page.getAttribute(`${root} .ui-carousel__dot:nth-child(2)`, "aria-current"), "true", "вторая точка текущая");
    expect(await page.locator(`${root} .ui-carousel__slide:nth-child(3) img[src]`).count(), 1, "следующий кадр подгружен заранее");
    await page.click(`${root} .ui-carousel__viewport`, { position: { x: 120, y: 80 } });
    await page.waitForSelector(".ui-carousel-lightbox");
    expect(await page.textContent(".ui-carousel-lightbox__count"), "2 из 6", "просмотр с того же кадра");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".ui-carousel-lightbox", { state: "detached" });
    expect(await page.evaluate(() => document.activeElement.matches(".ui-carousel__viewport")), true, "фокус вернулся к ленте");
  }],
  ["прогресс и скелетон: доля в полосе и кольце, заглушки той же высоты", async (page, expect) => {
    const share = await page.$eval(`${stage("progress")} .ui-progress__bar[aria-valuenow="64"]`, (node) => {
      /* Заливка во всю ширину сдвинута трансформом: видна ширина плюс сдвиг. */
      const fill = getComputedStyle(node, "::before");
      return Math.round((parseFloat(fill.width) + new DOMMatrix(fill.transform).m41) / node.clientWidth * 100);
    });
    expect(share, 64, "полоса закрашена на 64 %");
    expect(await page.$eval(`${stage("progress")} .ui-progress-ring__fill`, (node) => getComputedStyle(node).strokeDasharray.startsWith("82")), true, "кольцо — 82 из 100");
    const height = () => page.$eval(`${stage("skeleton")} .ui-list`, (node) => node.getBoundingClientRect().height);
    const loading = await height();
    expect(await page.locator(`${stage("skeleton")} .ui-skeleton`).count() > 0, true, "заглушки на месте");
    await pick(page, "skeleton", "loading", "false");
    expect(await page.locator(`${stage("skeleton")} .ui-skeleton`).count(), 0, "данные заменили заглушки");
    expect(Math.abs(await height() - loading) < 1, true, "высота списка не изменилась");
  }],
  ["список: строка переключает", async (page, expect) => {
    const row = `${stage("list")} label.ui-list__row:has-text("Сводка за день")`;
    await page.click(row);
    expect(await page.isChecked(`${row} input`), true, "щелчок по строке включил переключатель");
  }],
  ["лента событий: линия между знаками, комментарий и время по настройке", async (page, expect) => {
    const feed = `${stage("timeline")} .ui-timeline`;
    const lines = () => page.locator(`${feed} > .ui-timeline__item`).evaluateAll((items) => items.map((item) => getComputedStyle(item, "::before").content !== "none").join());
    expect(await lines(), "true,true,true,true,false", "линия у всех знаков, кроме последнего");
    expect(await page.locator(`${feed} .ui-timeline__mark:empty`).evaluate((mark) => getComputedStyle(mark, "::before").width), "8px", "пустой знак — точка 8");
    expect(await page.locator(`${feed} .ui-timeline__note`).count(), 1, "комментарий под событием");
    const body = () => page.locator(`${feed} .ui-timeline__body`).first().evaluate((node) => node.getBoundingClientRect().width);
    const narrow = await body();
    await pick(page, "timeline", "notes", false);
    await pick(page, "timeline", "time", false);
    expect(await page.locator(`${feed} :is(.ui-timeline__note, .ui-timeline__time)`).count(), 0, "без комментариев и времени");
    expect(await body() > narrow + 40, true, "без времени текст во всю ширину");
  }],
  ["тосты: показ, прогресс, бар", async (page, expect) => {
    await page.click(`${stage("toast")} [data-act=toast]`);
    await page.waitForSelector(".ui-alert-region .ui-alert--neutral");
    await pick(page, "toast", "type", "progress");
    expect(await page.locator(`${stage("toast")} .ui-alert__spinner`).count(), 1, "спиннер в превью");
    await page.click(`${stage("toast")} [data-act=status]`);
    await page.waitForSelector(".ui-alert-bar[data-state='visible']");
  }],
  ["тема: переключение", async (page, expect) => {
    await page.click("#theme");
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark")), true, "тёмная");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg, "rgb(11, 11, 12)", "холст тёмной темы");
  }],
  ["оглавление: идёт за страницей, полоса разделов, место после перезагрузки", async (page, expect) => {
    const at = (id) => page.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().top), id);
    await page.evaluate(() => scrollTo({ top: scrollY + document.getElementById("tree").getBoundingClientRect().top - 100, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector("#nav [aria-current]")?.hash === "#tree");
    /* Текущая ссылка — в окне оглавления, полоса отмечает тот же раздел. */
    const inside = await page.evaluate(() => { const nav = document.querySelector("#nav").getBoundingClientRect(); const own = document.querySelector("#nav [aria-current]").getBoundingClientRect(); return own.top >= nav.top && own.bottom <= nav.bottom; });
    expect(inside, true, "текущая ссылка видна в оглавлении");
    expect(await page.evaluate(() => document.querySelector(".sc-toc__card a.is-current")?.hash), "#tree", "полоса: текущий раздел");
    await page.hover(".sc-toc__rail");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".sc-toc__card")).visibility === "visible");
    const before = await at("tree");
    await page.mouse.move(700, 400);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => "ready" in document.documentElement.dataset);
    expect(await at("tree"), before, "после перезагрузки раздел на том же месте");
    expect(await page.evaluate(() => document.documentElement.classList.contains("sc-restoring")), false, "страница показана");
  }],
];

let failed = 0;
/* --only <слово> — только сценарии, в названии которых есть слово (для правки
   одного компонента); --shots снимает всё, сценарии с ним можно пропустить: --only -. */
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
for (const [name, run, options] of CHECKS.filter(([name]) => !ONLY || name.includes(ONLY))) {
  const { page, errors, close } = await open(options);
  const problems = [];
  const expect = (actual, wanted, label) => { if (actual !== wanted) problems.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(wanted)}`); };
  try { await run(page, expect); } catch (error) { problems.push(error.message.split("\n").slice(0, process.env.VERBOSE ? 12 : 1).join("\n    ")); }
  problems.push(...errors.map((text) => `console: ${text}`));
  failed += problems.length > 0;
  console.log(`${problems.length ? "✗" : "✓"} ${name}${problems.map((text) => `\n    ${text}`).join("")}`);
  await close();
}

/* Узкий экран: без горизонтальной прокрутки. */
{
  const { page, errors, close } = await open({ w: 390, h: 844 });
  /* Шире окна не должна быть ни страница, ни карточка конфигуратора. */
  const wide = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll(".sc-cfg")].map((node) => node.scrollWidth - node.clientWidth)));
  const ok = wide <= 0 && !errors.length;
  failed += !ok;
  console.log(`${ok ? "✓" : "✗"} телефон: нет горизонтальной прокрутки${ok ? "" : ` (${wide}px) ${errors.join(" ")}`}`);
  await close();
}

if (SHOTS) {
  await mkdir(SHOTS, { recursive: true });
  for (const theme of ["light", "dark"]) {
    const { page, close } = await open({ w: 1360, h: 900, theme });
    /* Снимок всей страницы под нагрузкой дольше 4 с — ему свой запас. */
    page.setDefaultTimeout(30000);
    /* Каждый блок отдельным снимком: отличие сразу видно по имени файла. */
    await page.mouse.move(0, 0);
    for (const id of await page.$$eval("[data-section]", (nodes) => nodes.map((node) => node.dataset.section))) {
      const block = page.locator(section(id));
      await block.scrollIntoViewIfNeeded();
      /* Блок мог дорисоваться асинхронно (файлы-образцы, картинки): ждём сеть и
         декодирование, иначе снимки одного кода разные. */
      await page.waitForLoadState("networkidle");
      await block.evaluate((node) => Promise.all([...node.querySelectorAll("img")].map((img) => img.decode().catch(() => {}))));
      await page.waitForTimeout(120);
      await block.screenshot({ path: join(SHOTS, `${theme}-${id}.png`), animations: "disabled" });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS, `eokit-new-${theme}.png`), fullPage: true });
    await page.locator("#popover").scrollIntoViewIfNeeded();
    await pick(page, "popover", "content", "3d menu");
    await page.click(`${stage("popover")} [data-popover-trigger]`);
    await page.hover(".ui-popover__panel[data-state='open'] [data-popover-trigger]");
    await page.waitForTimeout(150);
    await screen(page, join(SHOTS, `eokit-new-menu-${theme}.png`));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.locator("#select").scrollIntoViewIfNeeded();
    await page.click(`${stage("select")} .ui-field:first-child .ui-select__trigger`);
    await page.waitForTimeout(150);
    await screen(page, join(SHOTS, `eokit-new-select-${theme}.png`));
    await close();
  }
  const { page, close } = await open({ w: 390, h: 844 });
  await page.screenshot({ path: join(SHOTS, "eokit-new-mobile.png"), fullPage: true });
  await close();
}

/* Сравнение в браузере: оба снимка в canvas, отличие канала больше 8 — пиксель
   отличается. Полностраничные снимки зависят от высоты всех блоков сразу —
   их сравнивают по блокам, а сами пропускают. */
if (SHOTS && COMPARE) {
  const page = await browser.newPage();
  const files = (await readdir(COMPARE)).filter((file) => file.endsWith(".png") && !/^eokit-new-(light|dark|mobile)\.png$/.test(file));
  let changed = 0;
  for (const file of files) {
    const next = await readFile(join(SHOTS, file)).catch(() => null);
    if (!next) {
      console.log(`? ${file}: нового снимка нет`);
      continue;
    }
    const prev = await readFile(join(COMPARE, file));
    const result = await page.evaluate(async ([a, b]) => {
      const load = async (base64) => createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const [one, two] = await Promise.all([load(a), load(b)]);
      if (one.width !== two.width || one.height !== two.height) return { size: `${one.width}×${one.height} → ${two.width}×${two.height}` };
      const pixels = (image) => {
        const context = new OffscreenCanvas(image.width, image.height).getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [p, q] = [pixels(one), pixels(two)];
      let count = 0;
      const box = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < p.length; i += 4) {
        if (Math.abs(p[i] - q[i]) <= 8 && Math.abs(p[i + 1] - q[i + 1]) <= 8 && Math.abs(p[i + 2] - q[i + 2]) <= 8) continue;
        count += 1;
        const x = (i / 4) % one.width;
        const y = Math.floor(i / 4 / one.width);
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      }
      return { count, box };
    }, [prev.toString("base64"), next.toString("base64")]);
    if (result.size) console.log(`✗ снимок ${file}: другой размер ${result.size}`);
    else if (result.count) console.log(`✗ снимок ${file}: ${result.count} px, область ${result.box.join(",")}`);
    if (result.size || result.count) changed += 1;
  }
  console.log(changed ? `снимки: отличаются ${changed} из ${files.length}` : `снимки: все ${files.length} совпадают`);
  failed += changed;
  await page.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} проверок не прошло` : "\nвсе проверки прошли");
process.exit(failed ? 1 : 0);
