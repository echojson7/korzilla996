/* Модалка: диалог по центру, боковая панель и лист снизу — один модуль.

     <button type="button" class="ui-btn" data-modal="#order">Заказ</button>
     <a href="/orders/42" data-modal data-modal-select="form">Изменить</a>
     <button type="button" class="ui-btn" data-modal-template="auth-modal">Войти</button>

     const dialog = kit("modal").open("#order", { type: "side", resize: true });
     const result = await dialog.closed;

   Кнопка — экземпляр модуля (aria-haspopup и свой click): кнопки в разметке,
   пришедшей позже, ставит mount(root), как и всё в ките. Закрытая авторская
   модалка ([data-ui-modal]) — hidden на своём месте. Слой с затемнением строится
   на открытии и снимается на закрытии; в стеке слоёв кита он модальный: Esc
   закрывает верхнее окно (сперва — меню и списки, открытые из него), нажатие под
   окном никого не закрывает. Прокрутку страницы окно не запирает: под затемнением
   страница листается.

   Стопка: окно из окна встаёт сверху и уходит вместе с нижним. Фокус ходит по
   кругу внутри верхнего и возвращается на открывшую кнопку — или на кнопку меню,
   если пункт уже спрятан. Слои поверх окна (палитра, тост, просмотр) фокус
   держат сами: отбирается только ушедший на страницу или в окно ниже.

   Настройки — data-modal-* на кнопке, на модалке и в <template
   data-ui-modal-template>, или опции open(): type (dialog | side | sheet), role,
   side, size, width, height, animation, mobile, dismissible, close-button, drag,
   resize, replace, title, description, badge, badge-tone, select, class, template.
   badge — статус рядом с заголовком собранной шапки (мягкий бейдж, тон — badge-tone).

   kit("modal").open(target, options) → ручка { element, closed, close, update };
   close(target?, value), closeAll(). События на хосте: modal:open и modal:close
   отменяемые, modal:opened и modal:closed — по концу анимации, modal:load и
   modal:error — у загрузки. */

import { defineComponent } from "../../core/component.js";
import { el, emit, ensureId, restore, setData, setVar, snapshot } from "../../core/dom.js";
import { focus, focusInitial, returnFocus, tabbables, trapTab } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { layerOf, openLayer, topLayer } from "../../core/layer.js";
import { settled } from "../../core/motion.js";
import { observeSize } from "../../core/observe.js";
import { presence } from "../../core/presence.js";
import { readMs, readVar, reducedMotion } from "../../core/tokens.js";
import { ANATOMY_SELECTOR, HOST_SELECTOR, RETRY_ATTR, attach, fill, put, setHeader, sourceOf, status, t } from "./modal-content.js";
import { GRIPS, contain, describeSplitter, interactive, measureFrame, move, resize, resizeByKey, scrolls, setOffset, swipe } from "./modal-gesture.js";

const SELECTOR = `[data-modal], [data-modal-template], ${HOST_SELECTOR}`;
const CLOSE_ATTR = "data-modal-close";
const LAYER_CLASS = "ui-modal-layer";
/* Что модуль ставит хосту на время показа и возвращает на закрытии. */
const HOST_ATTRS = ["role", "aria-modal", "aria-labelledby", "aria-describedby", "aria-label", "tabindex"];

/* --- Настройки -------------------------------------------------------------- */

/* Одна схема — источник правды: имя атрибута (data-modal-<имя>), разбор значения
   и умолчание. Атрибут называется одинаково на кнопке, на модалке и в шаблоне —
   набор копируется между ними без переименования. Слияние — от общего к
   частному: умолчания → шаблон → модалка или источник → кнопка → опции JS; шаг в
   том же окне (replace) и update ложатся поверх настроек окна. */

/* Разборщики: строка → значение, undefined — «не задано» (слой пропускается). */
const oneOf = (...values) => (raw) => (values.includes(raw) ? raw : undefined);
const flag = (raw) => (raw === "false" ? false : raw === "" || raw === "true" ? true : undefined);
const text = (raw) => raw || undefined;
/* Число без единицы — пиксели: data-modal-width="560". */
const length = (raw) => (raw ? (/^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw) : undefined);

/* Первое значение списка — умолчание; attr — когда атрибут назван не по ключу. */
const SCHEMA = {
  type: { parse: oneOf("dialog", "side", "sheet"), fallback: "dialog" },
  /* alertdialog — подтверждение и предупреждение: скринридер читает его сразу. */
  role: { parse: oneOf("dialog", "alertdialog"), fallback: "dialog" },
  side: { parse: oneOf("right", "left"), fallback: "right" },
  size: { parse: oneOf("md", "sm", "lg", "xl", "full"), fallback: "md" },
  width: { parse: length },
  height: { parse: length },
  animation: { parse: oneOf("zoom", "slide-down", "slide-up", "fade", "spring"), fallback: "zoom" },
  mobile: { parse: oneOf("sheet") },
  dismissible: { parse: flag, fallback: true },
  closeButton: { parse: flag, fallback: true },
  drag: { parse: flag, fallback: false },
  resize: { parse: flag, fallback: false },
  replace: { parse: flag, fallback: false },
  title: { parse: text },
  description: { parse: text },
  badge: { parse: text },
  badgeTone: { parse: text },
  select: { parse: text },
  className: { parse: text, attr: "class" },
  template: { parse: text },
};

/* data-modal-close-button → dataset.modalCloseButton. */
const FIELDS = Object.entries(SCHEMA).map(([key, field]) => {
  const name = field.attr ?? key;
  return { key, parse: field.parse, dataset: `modal${name[0].toUpperCase()}${name.slice(1)}` };
});

const DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(SCHEMA).filter(([, field]) => "fallback" in field).map(([key, field]) => [key, field.fallback])));

/* Заданные на элементе настройки — только они, без умолчаний: иначе нижний слой
   затирал бы верхний своими умолчаниями. */
function readOptions(element) {
  const options = {};
  if (!element?.dataset) return options;
  for (const { key, parse, dataset } of FIELDS) {
    const raw = element.dataset[dataset];
    const value = raw === undefined ? undefined : parse(raw.trim());
    if (value !== undefined) options[key] = value;
  }
  return options;
}

/* Опции JS проходят ту же проверку, что и атрибуты: неизвестное значение и
   неизвестный ключ не доходят до разметки слоя. */
function cleanOptions(options) {
  const clean = {};
  for (const { key, parse } of FIELDS) {
    const value = options?.[key];
    const parsed = value == null ? undefined : parse(String(value).trim());
    if (parsed !== undefined) clean[key] = parsed;
  }
  return clean;
}

/* undefined в слое не перекрывает значение ниже. */
function merge(...layers) {
  const result = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer ?? {})) if (value !== undefined) result[key] = value;
  }
  return result;
}

/* Шаблон ищется в момент открытия: <template>, добавленный позже, работает без
   повторного mount. Его содержимое — источник по умолчанию. */
function templateOf(name) {
  if (!name) return null;
  const node = document.querySelector(`template[data-ui-modal-template="${CSS.escape(name)}"]`);
  if (!node) {
    console.warn(`[modal] шаблон «${name}» не найден.`);
    return null;
  }
  const filled = !!(node.content.firstElementChild || node.content.textContent.trim());
  return { options: readOptions(node), node: filled ? node : null };
}

/* Перелом «телефон» живёт в CSS (--ui-modal-mobile на :root), JS читает его один
   раз. Без стилей модуля перелома нет: «not all» не совпадает никогда. */
let mobile = null;
function mobileQuery() {
  mobile ??= matchMedia(readVar(document.documentElement, "--ui-modal-mobile") || "not all");
  return mobile;
}

const resolveType = (options) => (options.mobile === "sheet" && mobileQuery().matches ? "sheet" : options.type);

/* --- Стопка ----------------------------------------------------------------- */

/* Открытые снизу вверх: порядок открытия — порядок наложения. */
const stack = [];
/* Окно по хосту и по одолженному узлу: повторное открытие возвращает открытое. */
const owners = new WeakMap();
const byLayer = new WeakMap();
let engaged = false;

const top = () => stack[stack.length - 1] ?? null;

/* Закрытое окно — уже никому не владелец. */
const live = (session) => (session && session.state !== "closed" ? session : null);

function sessionOf(node) {
  const layer = node instanceof Element ? node.closest(`.${LAYER_CLASS}`) : null;
  return (layer && byLayer.get(layer)) ?? null;
}

const childrenOf = (session) => stack.slice(stack.indexOf(session) + 1).reverse();

/* Узел позже слоя по документу и не в нём — открыт поверх окна, а не страница. */
const above = (layer, node) => !!(layer.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) && !layer.contains(node);

/* Окно ведёт фокус, пока поверх него нет чужого модального слоя (палитры):
   слои его ветки (поповер из окна) и немодальные не мешают. */
function inCharge(session) {
  for (let layer = topLayer(); layer; layer = layer.parent) {
    if (layer === session.core) return true;
    if (layer.options.modal) return false;
  }
  return true;
}

/* --- Фокус ------------------------------------------------------------------ */

/* С клавиатуры — на [autofocus] или первое поле, мышью и пальцем — на само окно
   (без кольца, на телефоне не выскакивает клавиатура). Выбранное запоминается:
   пришло содержимое по адресу, а фокус там же — выбор повторяется уже по нему. */
function enter(session) {
  session.initial = focusInitial(session.host, { keyboard: session.keyboard });
}

/* Куда вернуть фокус: открывшая кнопка, за ней — кнопки слоёв, внутри которых
   она была (пункт закрывшегося меню отдаёт фокус кнопке меню). Цепочка — на
   открытии: к закрытию слоя меню уже нет. Каждый адрес помнит свой слой: пункт
   меню, которое закрылось, не адрес, даже пока его панель ещё доигрывает уход. */
function chainOf(opener) {
  const chain = [];
  let node = opener;
  let layer = layerOf(opener);
  while (node) {
    chain.push({ node, layer });
    if (!layer) break;
    node = layer.options.trigger;
    layer = layer.parent;
  }
  return chain;
}

/* Адрес — только в окне, которое теперь сверху (или на странице, если окон нет):
   кнопка в уходящем окне или под окном ниже фокус не получит. */
const targetsOf = (session, below) =>
  session.chain.filter(({ node, layer }) => (!layer || layer.open) && sessionOf(node) === below).map(({ node }) => node);

/* Фокус ушёл на страницу или в окно ниже — назад в верхнее. Слой поверх окна
   (свой у стека кита, [data-ui-layer] тостов или узел позже окна по документу) —
   не наш. */
function stray(session, node) {
  if (!(node instanceof Element) || session.layer.contains(node)) return false;
  const home = node.closest(`.${LAYER_CLASS}`);
  if (home) return home !== session.layer;
  if (layerOf(node) || node.closest("[data-ui-layer]")) return false;
  return !above(session.layer, node);
}

function onFocusIn(event) {
  const session = top();
  if (!session || !inCharge(session) || !stray(session, event.target)) return;
  focus(tabbables(session.host)[0]) || focus(session.host);
}

/* Фокус потерян в body (сфокусированный узел убрали или спрятали) — назад на
   выбранный при открытии. Уход фокуса из окна браузера активный узел не
   меняет: его не трогаем. */
function onFocusOut(event) {
  const session = top();
  if (event.relatedTarget || !session?.layer.contains(event.target)) return;
  queueMicrotask(() => {
    const active = document.activeElement;
    if (top() !== session || (active && active !== document.body) || !inCharge(session)) return;
    focus(session.initial) || focus(session.host);
  });
}

/* Tab по кругу внутри верхнего окна — по всему слою: панель поповера из окна
   живёт в слое рядом с хостом. Фокус в слое поверх (позже по документу) — не наш. */
function onTab(event) {
  const session = top();
  if (event.key !== "Tab" || event.defaultPrevented || !session || !inCharge(session)) return;
  trapTab(event, session.layer, session.host);
}

/* Поворот экрана при открытом окне: тип по перелому перестраивается. */
function onMobileChange() {
  for (const session of stack) if (resolveType(session.options) !== session.type) reframe(session);
}

const ENGAGED = [
  ["focusin", onFocusIn],
  ["focusout", onFocusOut],
  ["keydown", onTab],
];

/* Слушатели документа — пока открыто хоть одно окно. */
function engage(on) {
  if (on === engaged) return;
  engaged = on;
  const method = on ? "addEventListener" : "removeEventListener";
  for (const [type, listener] of ENGAGED) document[method](type, listener);
  mobileQuery()[method]("change", onMobileChange);
}

/* --- Хост и слой ------------------------------------------------------------ */

/* Роль — из настройки, если автор не задал alertdialog сам. Имя окна: заголовок,
   иначе первый заголовок в содержимом, иначе подпись кнопки. Считается заново при
   каждой смене содержимого — от атрибутов автора. */
function label(session) {
  const { host, opener } = session;
  restore(host, session.attrs);
  if (host.getAttribute("role") !== "alertdialog") host.setAttribute("role", session.options.role);
  host.setAttribute("aria-modal", "true");
  if (!host.hasAttribute("tabindex")) host.tabIndex = -1;
  if (!host.hasAttribute("aria-labelledby") && !host.hasAttribute("aria-label")) {
    const title = host.querySelector(".ui-modal__title, h1, h2, h3, h4, h5, h6");
    const name = opener?.getAttribute("aria-label") || opener?.textContent.trim();
    if (title) host.setAttribute("aria-labelledby", ensureId(title, "ui-modal"));
    else if (name) host.setAttribute("aria-label", name);
  }
  const description = host.querySelector(".ui-modal__description");
  if (description && !host.hasAttribute("aria-describedby")) host.setAttribute("aria-describedby", ensureId(description, "ui-modal"));
}

const closer = (className, ...children) => el("button", { type: "button", class: className, [CLOSE_ATTR]: true, "aria-label": t("close") }, ...children);
const grip = (direction) => el("div", { class: "ui-modal__grip", data: { grip: direction }, "aria-hidden": "true" });

/* Хром модуля: крестик (у листа — полоска), ручки размера. Авторский крестик
   остаётся авторским. Фокус, стоявший на снятом хроме, переходит на его замену. */
function dress(session) {
  const { host, options, type } = session;
  const focused = session.chrome.includes(document.activeElement) ? document.activeElement.className : null;
  for (const node of session.chrome) node.remove();
  session.chrome = [];
  session.splitter = null;
  const add = (node) => {
    host.append(node);
    session.chrome.push(node);
    return node;
  };

  if (type === "sheet") {
    if (options.dismissible) add(closer("ui-modal__handle"));
  } else if (options.closeButton && !host.querySelector(":scope > .ui-modal__close")) {
    add(closer("ui-close ui-modal__close", icon("x")));
  }

  if (options.resize && type === "dialog") GRIPS.forEach((direction) => add(grip(direction)));
  if (options.resize && type === "side") {
    /* Ручка боковой панели — разделитель окна (APG Window Splitter). */
    session.splitter = add(
      el("div", {
        class: "ui-modal__grip",
        data: { grip: options.side === "right" ? "w" : "e" },
        tabindex: "0",
        role: "separator",
        "aria-orientation": "vertical",
        "aria-label": t("width"),
        "aria-controls": ensureId(host, "ui-modal"),
      }),
    );
  }
  if (focused !== null) focus(session.chrome.find((node) => node.className === focused) ?? host);
}

/* Решённые настройки — на слой: хост автора остаётся нетронутым. Хром
   переставляется, только когда меняется то, от чего он зависит. */
function apply(session) {
  const { layer, host, options } = session;
  const type = (session.type = resolveType(options));
  setData(layer, "type", type);
  setData(layer, "size", options.size);
  setData(layer, "side", type === "side" && options.side);
  setData(layer, "animation", type === "dialog" && options.animation);
  setData(layer, "drag", type === "dialog" && options.drag);

  /* Размер, заданный рукой, сильнее настройки — до явного сброса. */
  if (!session.size) {
    setVar(layer, "--ui-modal-w", options.width);
    setVar(layer, "--ui-modal-h", options.height);
    setData(layer, "height", !!options.height);
  }

  /* Классы из настройки — свои: снимаются только они, авторские остаются. */
  const wanted = options.className?.split(/\s+/).filter(Boolean) ?? [];
  const kept = session.classes.filter((name) => wanted.includes(name));
  host.classList.remove(...session.classes.filter((name) => !wanted.includes(name)));
  for (const name of wanted) {
    if (host.classList.contains(name)) continue;
    host.classList.add(name);
    kept.push(name);
  }
  session.classes = kept;

  const look = [type, options.side, options.dismissible, options.closeButton, options.resize].join(" ");
  if (session.look === look) return;
  session.look = look;
  dress(session);
}

/* Сброс места и размера (двойной щелчок по шапке, смена типа). */
function reframe(session) {
  session.size = null;
  setOffset(session, 0, 0);
  apply(session);
}

/* Хост — автору: без хрома, своих классов, атрибутов и смещения, на своё место;
   одолженное — хозяину. Собранный хост остаётся в слое и уходит вместе с ним. */
function strip(session) {
  const { host } = session;
  session.loading?.abort();
  for (const node of session.chrome) node.remove();
  session.chrome = [];
  session.splitter = null;
  session.look = null;
  host.classList.remove(...session.classes);
  session.classes = [];
  restore(host, session.attrs);
  setVar(host, "--ui-modal-x", null);
  setVar(host, "--ui-modal-y", null);
  scrollStop(session, null);
  session.release();
}

/* Прокручиваемое тело без полей — остановка Tab, как у браузера для прокрутки
   без фокусируемого внутри: иначе с клавиатуры текст за краем не прочесть. Своё
   tabindex автора не трогаем. */
function scrollStop(session, body) {
  if (session.stopFor === body) return;
  session.stopFor = body;
  session.stop?.removeAttribute("tabindex");
  session.stop = body && !body.hasAttribute("tabindex") && !tabbables(body).length ? body : null;
  session.stop?.setAttribute("tabindex", "0");
}

/* Низ содержимого тела с нижним полем — в пикселях раскладки. Пока тело не
   прокручивается, scrollHeight поля не учитывает, и содержимое съедало бы его
   до появления прокрутки. Масштаб входа делится: прямоугольники с ним, поля — без. */
function overflows(body) {
  const box = body.getBoundingClientRect();
  const scale = box.height / body.offsetHeight || 1;
  const range = document.createRange();
  range.selectNodeContents(body);
  const bottom = (range.getBoundingClientRect().bottom - box.top) / scale + body.scrollTop;
  return bottom + Number.parseFloat(getComputedStyle(body).paddingBlockEnd) > body.clientHeight + 1;
}

function setOverflow(session, overflow) {
  setData(session.layer, "overflow", overflow);
  scrollStop(session, overflow ? session.body : null);
}

/* Тело прокручивается, только когда содержимому в нём тесно: иначе край тела
   резал бы список селекта и календарь у последнего поля. Тело растёт с
   содержимым до предела окна (или до высоты, заданной окну), поэтому следим за
   его размером общим наблюдателем кита: и рост содержимого, и окно браузера
   меняют его. Тело сменилось (загрузка, замена) — наблюдение переходит на новое.
   Посреди смены высоты тело сжато анимацией, а не содержимым: замер ждёт её конца. */
function watchBody(session) {
  const body = session.host.querySelector(":scope > .ui-modal__body");
  if (body === session.body) return;
  session.unbody?.();
  session.body = body;
  session.unbody = body
    ? observeSize(body, {
        read: () => (session.morphing || session.body !== body ? null : overflows(body)),
        write: (overflow) => overflow !== null && setOverflow(session, overflow),
      })
    : null;
  if (!body) setOverflow(session, false);
}

function measure(session) {
  if (!session.morphing) setOverflow(session, !!session.body && overflows(session.body));
}

const sizeOf = (node) => ({ width: node.offsetWidth, height: node.offsetHeight });

/* Высота (и ширина) окна доезжают при смене содержимого, как раскрытие: темп —
   --ui-modal-morph, кривая листа. Проявляются только новые части — шапка,
   оставшаяся на месте, не мигает. */
function morph(session, mutate) {
  const animate = session.state === "open" && !reducedMotion();
  const parts = () => session.host.querySelectorAll(`:scope > ${ANATOMY_SELECTOR}`);
  const kept = animate ? new Set(parts()) : null;
  const from = animate ? sizeOf(session.host) : null;
  mutate();
  watchBody(session);
  if (!animate) return;
  const { host, layer } = session;
  const to = sizeOf(host);
  measure(session);
  const styles = getComputedStyle(layer);
  const easing = readVar(styles, "--ui-ease", "ease-out");
  if (Math.abs(to.width - from.width) > 0.5 || Math.abs(to.height - from.height) > 0.5) {
    session.morphing += 1;
    host.classList.add("is-morphing");
    const done = () => {
      session.morphing -= 1;
      if (session.morphing) return;
      host.classList.remove("is-morphing");
      if (session.state === "open") measure(session);
    };
    host
      .animate(
        [
          { width: `${from.width}px`, height: `${from.height}px` },
          { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: readMs(styles, "--ui-modal-morph", 180), easing },
      )
      .finished.then(done, done);
  }
  const fade = { duration: readMs(styles, "--ui-modal-fade", 120), easing };
  for (const part of parts()) if (!kept.has(part)) part.animate([{ opacity: 0 }, { opacity: 1 }], fade);
}

/* Окно не закрывается (запрет) — короткое «вздрагивание» вместо закрытия. */
function nudge(session) {
  if (reducedMotion()) return;
  session.host.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }], {
    duration: readMs(session.layer, "--ui-modal-morph", 180),
    easing: "ease-in-out",
    composite: "add",
  });
}

/* --- Открытие --------------------------------------------------------------- */

/* Содержимое в опциях JS — источник, остальное — настройки. Строка без «#» —
   текст, не адрес: адрес передают явно, в url. */
function split(options) {
  const { content, html, url, ...rest } = options ?? {};
  let source = null;
  if (typeof content === "string" && !content.trim().startsWith("#")) source = sourceOf(document.createTextNode(content));
  else if (content != null) source = sourceOf(content);
  else if (html != null) source = { kind: "html", html: String(html) };
  else if (url) source = { kind: "url", url: String(url) };
  return { source, options: cleanOptions(rest) };
}

/* Источник на кнопке: data-modal="#id" или адрес; пустой на ссылке — её href. */
function triggerSource(trigger) {
  const value = trigger.getAttribute("data-modal");
  if (value === null) return null;
  if (value.trim()) return sourceOf(value);
  return trigger.localName === "a" ? sourceOf(trigger.getAttribute("href")) : null;
}

/* Настройки слоями, позднее сильнее: шаблон → источник → кнопка → JS. Без
   источника показывается содержимое шаблона. */
function prepare(source, triggerOptions, jsOptions) {
  const sourceOptions = source?.node instanceof Element ? readOptions(source.node) : {};
  const template = templateOf(jsOptions.template ?? triggerOptions.template ?? sourceOptions.template);
  return {
    source: source ?? (template?.node ? sourceOf(template.node) : null),
    options: merge(template?.options, sourceOptions, triggerOptions, jsOptions),
  };
}

function own(session) {
  owners.set(session.host, session);
  if (session.source.kind === "element") owners.set(session.source.node, session);
}

function disown(session) {
  owners.delete(session.host);
  if (session.source.kind === "element") owners.delete(session.source.node);
}

/* Вход и уход — переходы между data-state слоя (placing → open → closing): их
   ждёт presence, по окну и подложке. Хост сменился (replace) — новый presence. */
const lifeOf = (session) => presence(session.layer, { hidden: false, closed: "placing", also: [session.backdrop, session.host] });

function createSession(source, options, opener, keyboard) {
  const { host, generated, release } = attach(source, options);
  const backdrop = el("div", { class: `${LAYER_CLASS}__backdrop` });
  /* [data-ui-layer] — корень переноса для панелей, открытых изнутри (поповер):
     иначе они ушли бы в body под затемнение. */
  const layer = el("div", { class: LAYER_CLASS, "data-ui-layer": true, data: { state: "placing" } }, backdrop, host);

  const session = {
    host,
    generated,
    release,
    layer,
    backdrop,
    source,
    options,
    type: options.type,
    opener,
    keyboard,
    chain: [],
    state: "new",
    turn: 0,
    life: null,
    core: null,
    gesture: null,
    value: undefined,
    reason: "",
    attrs: snapshot(host, HOST_ATTRS),
    classes: [],
    chrome: [],
    look: null,
    splitter: null,
    offset: { x: 0, y: 0 },
    size: null,
    body: null,
    unbody: null,
    unsize: null,
    stop: null,
    stopFor: null,
    initial: null,
    morphing: 0,
    loading: null,
    done: null,
    listeners: new AbortController(),
  };
  session.life = lifeOf(session);
  session.handle = Object.freeze({
    /* После замены содержимого окно то же, хост — новый. */
    get element() {
      return session.host;
    },
    closed: new Promise((resolve) => {
      session.done = resolve;
    }),
    close: (value) => close(session, value, "api"),
    update: (patch) => update(session, patch),
  });

  /* Слушатели окна — на его слое, до конца ухода: клики, жесты и формы панелей,
     перенесённых в слой, сюда тоже всплывают. */
  const { signal } = session.listeners;
  for (const [type, handler] of LAYER_EVENTS) layer.addEventListener(type, (event) => handler(session, event), { signal });
  byLayer.set(layer, session);
  return session;
}

/* Окно встаёт наверх стопки и въезжает (или разворачивается посреди ухода). */
function present(session) {
  const below = top();
  if (below) setData(below.layer, "covered", true);
  setData(session.layer, "nested", !!below);
  session.state = "open";
  session.turn += 1;
  /* До openLayer: исключительный слой закроет меню, из которого окно открыли. */
  session.chain = chainOf(session.opener);
  stack.push(session);
  engage(true);
  session.core = openLayer({
    elements: () => [session.layer],
    parent: below?.core ?? null,
    trigger: session.opener,
    modal: true,
    exclusive: true,
    outside: false,
    focus: false,
    /* Esc — закрытие пользователем (с запретом и вздрагиванием); ушёл родитель —
       сразу. Нажатие и фокус снаружи окно не закрывают: подложка — своя. */
    onDismiss: (reason) => (reason === "escape" ? dismiss(session, "escape") : closeNow(session)),
  });
  watchBody(session);
  /* Окно браузера изменилось — сдвинутое окно возвращается в поле, разделитель
     называет новые пределы. Без перетаскивания и размера мерить нечего. */
  session.unsize ??= observeSize(session.layer, {
    read: () => (session.options.drag || session.splitter ? measureFrame(session) : null),
    write: (box) => {
      if (!box) return;
      contain(session, box);
      describeSplitter(session, box);
    },
  });
  /* Кадр «откуда» (placing) должен лечь до перехода: стиль считается сейчас, без
     раскладки. */
  void getComputedStyle(session.host).opacity;
  session.life.show();
  enter(session);
  const { turn } = session;
  settled(session.host, session.backdrop).then(() => {
    if (session.turn !== turn) return;
    describeSplitter(session);
    emit(session.host, "modal:opened", { opener: session.opener });
  });
}

function show({ source, options }, { opener = null, keyboard = false } = {}) {
  if (!source) {
    console.warn("[modal] нечего показать: нет источника и содержимого шаблона.");
    return null;
  }
  let owner = live(owners.get(source.node));
  if (owner?.state === "closing") {
    /* Посреди ухода окно разворачивается, если поверх никто не открылся. */
    if (!top() || above(top().layer, owner.layer)) return revive(owner, merge(DEFAULTS, options), opener, keyboard);
    closeNow(owner);
    /* Обработчик modal:closed мог уже открыть его заново. */
    owner = live(owners.get(source.node));
  }
  if (owner) return owner.handle;
  const current = top();
  if (options.replace && current && opener && current.host.contains(opener)) {
    return replace(current, source, merge(current.options, options), opener, keyboard);
  }

  const session = createSession(source, merge(DEFAULTS, options), opener, keyboard);
  apply(session);
  label(session);
  document.body.append(session.layer);
  /* Событие — когда хост уже в документе: собранный иначе всплыл бы в никуда. */
  if (!emit(session.host, "modal:open", { opener }, { cancelable: true })) {
    session.listeners.abort();
    strip(session);
    session.layer.remove();
    return null;
  }
  own(session);
  present(session);
  if (source.kind === "url") load(session);
  return session.handle;
}

/* Новые настройки живого окна. Смена типа сбрасывает место и размер: смещение
   диалога ничего не значит для боковой панели. */
function retune(session, options) {
  const { type } = session;
  session.options = options;
  if (resolveType(options) === type) apply(session);
  else reframe(session);
}

/* Бросок не состоялся (окно вернули, закрытие запретили): уход — снова свой,
   смахнутое окно — на месте. Смещение диалога — перетаскивание, его не трогаем. */
function unfling(session) {
  setVar(session.layer, "--ui-modal-exit", null);
  if (session.type !== "dialog") setOffset(session, 0, 0);
}

/* Окно посреди ухода разворачивается — с настройками и кнопкой нового открытия. */
function revive(session, options, opener, keyboard) {
  if (!emit(session.host, "modal:open", { opener: opener ?? session.opener }, { cancelable: true })) return null;
  Object.assign(session, { opener: opener ?? session.opener, keyboard });
  unfling(session);
  retune(session, options);
  label(session);
  present(session);
  return session.handle;
}

/* Хост, так и не вставший в окно (открытие отменили): всё на места. */
function letGo({ host, generated, release }) {
  release();
  if (generated) host.remove();
}

/* Замена содержимого в том же окне (data-modal-replace): прежний хост уходит
   домой, новый встаёт на его место, высота доезжает. Окно то же — и настройки
   его, шаг перекрывает только заданное: размер, заголовок, тип. События шага —
   с его кнопкой: modal:close (отменяемое) и modal:closed уходящему, modal:open
   (отменяемое) и modal:opened новому. */
function replace(session, source, options, opener, keyboard) {
  const previous = session.host;
  if (!emit(previous, "modal:close", { value: undefined, reason: "replace", opener }, { cancelable: true })) return session.handle;
  const next = attach(source, options);
  /* В документ — ради события, но вне раскладки, пока решается отмена. */
  next.host.hidden = true;
  previous.after(next.host);
  if (!emit(next.host, "modal:open", { opener }, { cancelable: true })) {
    letGo(next);
    return session.handle;
  }
  emit(previous, "modal:closed", { value: undefined, reason: "replace", opener });
  morph(session, () => {
    const { generated } = session;
    strip(session);
    disown(session);
    if (generated) previous.remove();
    next.host.hidden = false;
    Object.assign(session, {
      host: next.host,
      generated: next.generated,
      release: next.release,
      source,
      options,
      keyboard,
      attrs: snapshot(next.host, HOST_ATTRS),
      size: null,
    });
    session.life = lifeOf(session);
    own(session);
    setOffset(session, 0, 0);
    apply(session);
    label(session);
  });
  enter(session);
  const { turn } = session;
  settled(session.host, session.backdrop).then(() => session.turn === turn && emit(session.host, "modal:opened", { opener }));
  if (source.kind === "url") load(session);
  return session.handle;
}

/* Настройки на лету; у собранного окна — и шапка с содержимым. */
function update(session, patch) {
  if (session.state !== "open") return false;
  const { source, options } = split(patch);
  morph(session, () => {
    retune(session, merge(session.options, options));
    if (!session.generated) return;
    setHeader(session.host, session.options);
    /* Авторская модалка в чужое окно не переносится: её открывают сами. */
    if (!source || source.kind === "host") return;
    /* Новое содержимое сильнее ответа, который ещё не пришёл. */
    session.loading?.abort();
    session.loading = null;
    if (source.kind === "url") session.source = source;
    const giveBack = put(session.host, source);
    if (!giveBack) return;
    const { release } = session;
    session.release = () => {
      giveBack();
      release();
    };
  });
  label(session);
  if (source?.kind === "url" && session.generated) load(session);
  return true;
}

/* --- Загрузка по адресу ------------------------------------------------------ */

async function load(session) {
  session.loading?.abort();
  const loading = (session.loading = new AbortController());
  const { host, source, options } = session;
  if (host.getAttribute("aria-busy") !== "true") morph(session, () => status(host, "loading"));
  try {
    const { fetchContent } = await import("./modal-remote.js");
    const content = await fetchContent(source.url, options.select, loading.signal);
    if (loading.signal.aborted) return;
    morph(session, () => fill(host, content));
    label(session);
    const focused = document.activeElement;
    if (focused === session.initial || !host.contains(focused)) enter(session);
    emit(host, "modal:load", { url: source.url });
  } catch (error) {
    if (loading.signal.aborted) return;
    morph(session, () => status(host, "error"));
    emit(host, "modal:error", { url: source.url, error });
  }
}

/* --- Закрытие --------------------------------------------------------------- */

/* Окно уходит из стопки и из стека слоёв, фокус — назад, слой играет уход. */
function leave(session, value, reason) {
  session.state = "closing";
  session.turn += 1;
  session.value = value;
  session.reason = reason;
  session.loading?.abort();
  session.gesture?.cancel();
  stack.splice(stack.indexOf(session), 1);
  const below = top();
  if (below) setData(below.layer, "covered", false);
  else engage(false);
  const { core } = session;
  session.core = null;
  core?.close();
  returnFocus(session.layer, ...targetsOf(session, below), below?.host);
  session.life.hide().then((done) => done && finish(session));
}

function close(session, value, reason) {
  if (session?.state !== "open") return false;
  /* Окна выше по стопке уходят вместе с нижним. */
  for (const child of childrenOf(session)) close(child, undefined, reason);
  if (session !== top() || !emit(session.host, "modal:close", { value, reason, opener: session.opener }, { cancelable: true })) return false;
  /* Обработчик modal:close мог закрыть окно сам — со своим результатом. */
  if (session.state === "open") leave(session, value, reason);
  return true;
}

function finish(session) {
  if (session.state !== "closing") return;
  session.state = "closed";
  session.turn += 1;
  session.listeners.abort();
  session.unbody?.();
  session.unsize?.();
  Object.assign(session, { unbody: null, unsize: null, body: null });
  /* Всё на место до события: обработчик modal:closed может тут же открыть то же
     окно снова. Собранный хост ещё в слое — событие всплывает до документа. */
  strip(session);
  disown(session);
  emit(session.host, "modal:closed", { value: session.value, reason: session.reason, opener: session.opener });
  session.layer.remove();
  session.done(session.value);
}

/* Сразу, без анимации и без отмены: снятие хоста, уход родительского слоя. */
function closeNow(session) {
  if (session.state === "open") {
    for (const child of childrenOf(session)) closeNow(child);
    leave(session, undefined, "api");
  }
  session.life.settle();
  finish(session);
}

/* Закрытие пользователем: фон, Esc, смахивание. Под запретом окно вздрагивает.
   Подтверждение (alertdialog) нажатием мимо не закрывается: промах по фону — не
   ответ; Esc и жест — осознанные, они закрывают. */
function dismiss(session, reason, fling = null) {
  const alert = session.host.getAttribute("role") === "alertdialog";
  if (!session.options.dismissible || (reason === "backdrop" && alert)) {
    nudge(session);
    return;
  }
  /* Брошенное окно уходит со скоростью пальца: быстрый бросок короче обычного
     ухода. Без движения оно гаснет, где отпустили. */
  if (fling && !reducedMotion()) {
    const styles = getComputedStyle(session.layer);
    const base = readMs(styles, "--ui-modal-exit", 200);
    const least = readMs(styles, "--ui-duration-fast", 100);
    const duration = Math.min(Math.max(fling.remaining / Math.max(fling.speed, 0.001), least), base);
    setVar(session.layer, "--ui-modal-exit", `${Math.round(duration)}ms`);
    setOffset(session, 0, 0);
  }
  if (!close(session, undefined, reason) && fling) unfling(session);
}

/* --- События слоя ------------------------------------------------------------ */

function onPointerDown(session, event) {
  if (event.button !== 0 || !event.isPrimary || session !== top()) return;
  const { host, backdrop, type, options } = session;
  const { target } = event;
  /* Нажатие по фону не уводит фокус из окна: закрытие могут и запретить. */
  if (target === backdrop) {
    event.preventDefault();
    return;
  }
  const handle = target.closest(".ui-modal__grip");
  if (handle && host.contains(handle)) {
    resize(event, session, handle.dataset.grip);
    return;
  }
  if (!host.contains(target)) return;

  if (type === "dialog") {
    if (options.drag && target.closest(".ui-modal__header") && !interactive(target, session)) move(event, session);
    return;
  }
  if (!options.dismissible) return;
  /* Лист тянется за полоску и шапку, а пальцем — за любое место вне контролов и
     вне прокрутки по оси жеста (прокручиваемое тело листа отдано прокрутке);
     боковая смахивается пальцем (мышью её закрывают крестиком и фоном). */
  const touch = event.pointerType !== "mouse";
  const free = touch && !interactive(target, session) && !scrolls(target, host, type === "sheet" ? "y" : "x");
  const sheet = type === "sheet" && (target.closest(".ui-modal__handle, .ui-modal__header") || free);
  if (sheet || (type === "side" && free)) swipe(event, session, { onClose: (fling) => dismiss(session, "swipe", fling) });
}

function onClick(session, event) {
  if (event.defaultPrevented || event.button !== 0 || session.state !== "open") return;
  const { target } = event;
  if (target === session.backdrop) {
    if (session === top()) dismiss(session, "backdrop");
    return;
  }
  /* Слой, а не хост: панель поповера из окна живёт в слое рядом с хостом. */
  const button = target.closest(`[${CLOSE_ATTR}]`);
  if (button && session.layer.contains(button)) {
    event.preventDefault();
    close(session, button.getAttribute(CLOSE_ATTR) || undefined, "button");
    return;
  }
  if (target.closest(`[${RETRY_ATTR}]`)) load(session);
}

function onDoubleClick(session, event) {
  if (session.type !== "dialog" || !session.options.drag) return;
  const header = event.target.closest(".ui-modal__header");
  if (header && session.host.contains(header) && !interactive(event.target, session)) reframe(session);
}

/* <form method="dialog"> закрывает окно, результат — value нажатой кнопки. */
function onSubmit(session, event) {
  if (event.defaultPrevented) return;
  const method = event.submitter?.getAttribute("formmethod") ?? event.target.getAttribute("method");
  if (method?.toLowerCase() !== "dialog") return;
  event.preventDefault();
  close(session, event.submitter?.value ?? "", "submit");
}

function onKeyDown(session, event) {
  if (!event.defaultPrevented && session.splitter && event.target === session.splitter) resizeByKey(event, session);
}

function onLayerFocus(session, event) {
  if (event.target === session.splitter) describeSplitter(session);
}

const LAYER_EVENTS = [
  ["pointerdown", onPointerDown],
  ["click", onClick],
  ["dblclick", onDoubleClick],
  ["submit", onSubmit],
  ["keydown", onKeyDown],
  ["focusin", onLayerFocus],
];

/* --- Контракт модуля --------------------------------------------------------- */

/* Кнопка: ссылка с модификатором — новая вкладка или окно, как обычно. */
function onTrigger(trigger, event) {
  if (event.defaultPrevented || event.button !== 0 || trigger.matches(":disabled, [aria-disabled='true']")) return;
  if (trigger.localName === "a" && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
  const request = prepare(triggerSource(trigger), readOptions(trigger), {});
  if (!request.source) return;
  event.preventDefault();
  show(request, { opener: trigger, keyboard: event.detail === 0 });
}

/* Хост сам по себе не кнопка, даже если берёт настройки из шаблона. */
function create(element, ctx) {
  if (element.matches(HOST_SELECTOR)) {
    const saved = snapshot(element, ["hidden"]);
    /* Закрытая модалка спрятана на месте; открытую (open() до монтирования) не трогаем. */
    if (!element.closest(`.${LAYER_CLASS}`)) element.hidden = true;
    return {
      open: (options) => open(element, options),
      close: (value) => close(live(owners.get(element)), value, "api"),
      destroy() {
        const session = live(owners.get(element));
        if (session?.host === element) closeNow(session);
        restore(element, saved);
      },
    };
  }
  const saved = snapshot(element, ["aria-haspopup"]);
  if (!element.hasAttribute("aria-haspopup")) element.setAttribute("aria-haspopup", "dialog");
  ctx.on(element, "click", (event) => onTrigger(element, event));
  return { destroy: () => restore(element, saved) };
}

/* open("#id" | узел, опции) или open({ content | html | url, ...опции }). */
function open(target, options) {
  if (target && typeof target === "object" && !(target instanceof Node)) {
    options = target;
    target = null;
  }
  const { source, options: js } = split(options);
  const active = document.activeElement;
  const opener = active instanceof HTMLElement && active !== document.body ? active : null;
  /* Открыли с клавиатуры — фокус на первое поле, как у кнопки. */
  const keyboard = !!opener?.matches(":focus-visible");
  return show(prepare(target == null ? source : sourceOf(target), {}, js), { opener, keyboard });
}

/* close() — верхнее; close(хост | узел внутри | ручка | "#id", результат). */
function closeTop(target, value) {
  if (target == null) return close(top(), value, "api");
  const node = typeof target === "string" ? document.querySelector(target) : target instanceof Element ? target : target.element;
  return close(node ? (live(owners.get(node)) ?? sessionOf(node)) : null, value, "api");
}

function closeAll() {
  const count = stack.length;
  if (count) close(stack[0], undefined, "api");
  return count;
}

export default defineComponent({
  name: "modal",
  selector: SELECTOR,
  create,
  api: () => ({ open, close: closeTop, closeAll }),
});
