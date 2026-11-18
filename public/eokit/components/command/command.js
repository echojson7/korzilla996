/* Палитра команд: combobox + listbox (APG), не меню кнопок. Стрелки двигают
   выбранную строку, Enter запускает, Esc закрывает. Tab остаётся на поле: строки
   не в порядке табуляции, их называет aria-activedescendant.

     <div class="ui-command" data-ui-command data-command-hotkey>
       <button type="button" data-command-trigger>Поиск</button>
       <div class="ui-command__layer" hidden>
         <div class="ui-command__backdrop"></div>
         <div class="ui-command__dialog">… .ui-command__input … .ui-command__list …</div>
       </div>
     </div>

   Фильтр — вхождение слов в текст строки и data-command-value; группа без
   совпадений скрывается. От cmdk сознательно отличается: нет галочки выбранного
   (конец строки занят счётчиком или клавишей) и нет scale у диалога.

   Строка с data-command-query — запрос как есть («Спросить помощника: «…»»):
   фильтр её не прячет, пока в поле есть текст, а .ui-command__query в ней
   повторяет этот текст. Порядок строк — авторский: такую строку ставят в конец,
   и Enter достаётся ей, только когда больше ничего не нашлось.

   Открытый слой переносится в body (предок с overflow или content-visibility
   обрезал бы fixed; в окне — в его слой) и на закрытии возвращается на место. В
   стеке слоёв кита палитра модальная: Esc и нажатие мимо карточки закрывают её,
   окно под ней их не видит. data-command-hotkey включает Ctrl/⌘ K — у последней
   смонтированной такой палитры. Событие command:select (detail: item, value,
   query — текст поля) всплывает с хоста; preventDefault оставляет палитру
   открытой.

   kit("command").open(host) / close(host) / toggle(host). */

import { defineComponent } from "../../core/component.js";
import { ensureId, ownPart, ownParts, restore, setAttr, setData, snapshot } from "../../core/dom.js";
import { focus, returnFocus } from "../../core/focus.js";
import { moveIndex } from "../../core/keys.js";
import { openLayer, portal } from "../../core/layer.js";
import { presence } from "../../core/presence.js";

const SELECTOR = "[data-ui-command]";
const ITEM = ".ui-command__item";
const ACTIVE_CLASS = "is-active";

const norm = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();

const disabled = (item) => item.getAttribute("aria-disabled") === "true";

/* Ctrl/⌘ K — один слушатель документа на модуль, пока смонтирована хоть одна
   палитра с data-command-hotkey; открывает последнюю. На русской раскладке key —
   «л»: тогда смотрим физическую клавишу. */
const hotkeyed = [];

function onHotkey(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat || event.defaultPrevented) return;
  const key = event.key.toLowerCase();
  if (key !== "k" && (/^[a-z]$/.test(key) || event.code !== "KeyK")) return;
  event.preventDefault();
  hotkeyed[hotkeyed.length - 1].toggle();
}

function useHotkey(instance) {
  hotkeyed.push(instance);
  if (hotkeyed.length === 1) document.addEventListener("keydown", onHotkey);
  return () => {
    hotkeyed.splice(hotkeyed.indexOf(instance), 1);
    if (!hotkeyed.length) document.removeEventListener("keydown", onHotkey);
  };
}

/* Строка в зоне видимости списка: прокручивается только список, не страница. */
function scrollIntoList(list, item) {
  const listRect = list.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  if (rect.top < listRect.top) list.scrollTop -= listRect.top - rect.top;
  else if (rect.bottom > listRect.bottom) list.scrollTop += rect.bottom - listRect.bottom;
}

function create(host, ctx) {
  const layer = ownPart(host, ".ui-command__layer", SELECTOR);
  const dialog = layer?.querySelector(".ui-command__dialog");
  const input = dialog?.querySelector(".ui-command__input");
  const list = dialog?.querySelector(".ui-command__list");
  if (!layer || !dialog || !input || !list) return null;

  const backdrop = layer.querySelector(".ui-command__backdrop");
  const empty = dialog.querySelector(".ui-command__empty");
  const title = dialog.querySelector(".ui-command__title");
  const trigger = ownParts(host, "[data-command-trigger]", SELECTOR).find((node) => !layer.contains(node)) ?? null;
  const groups = ownParts(host, ".ui-command__group", SELECTOR);
  const items = ownParts(host, ITEM, SELECTOR);
  const headings = groups.map((group) => [...group.children].find((node) => node.classList.contains("ui-command__heading")) ?? null);
  /* Повтор запроса в строках data-command-query: текст автора — на снятие. */
  const echoes = items.flatMap((item) => (item.hasAttribute("data-command-query") ? [...item.querySelectorAll(".ui-command__query")] : []));
  const echoText = echoes.map((node) => node.textContent);

  /* Разметка автора — до модуля: на снятии возвращается как была. */
  const saved = [];
  const keep = (node, names) => node && saved.push([node, snapshot(node, names)]);
  keep(layer, ["hidden", "data-open"]);
  keep(dialog, ["id", "role", "aria-modal", "aria-labelledby", "data-state"]);
  keep(title, ["id", "class"]);
  keep(input, ["role", "aria-autocomplete", "aria-expanded", "aria-controls", "aria-activedescendant"]);
  keep(list, ["id", "role", "hidden"]);
  keep(empty, ["hidden"]);
  keep(trigger, ["aria-haspopup", "aria-expanded", "aria-controls"]);
  groups.forEach((group, at) => {
    keep(group, ["role", "aria-labelledby", "hidden"]);
    keep(headings[at], ["id"]);
  });
  for (const item of items) keep(item, ["id", "class", "role", "aria-selected", "hidden"]);

  ensureId(dialog, "ui-command-dialog");
  ensureId(list, "ui-command-list");
  /* Заголовок называет окно для диктора; в раскладке его нет. */
  title?.classList.add("ui-sr-only");
  if (title) dialog.setAttribute("aria-labelledby", ensureId(title, "ui-command-title"));
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);
  list.setAttribute("role", "listbox");
  for (const item of items) {
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.classList.remove(ACTIVE_CLASS);
  }
  groups.forEach((group, at) => {
    if (!headings[at]) return;
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", ensureId(headings[at], "ui-command-heading"));
  });
  if (trigger) {
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", dialog.id);
  }

  /* Вход и уход карточки — анимации по data-state (open | closing); подложка
     гаснет по data-open слоя, её переход тоже ждём. */
  const life = presence(dialog, { hidden: false, also: backdrop ? [backdrop] : [] });
  let current = null;
  let home = null;
  let opener = null;
  let active = null;
  /* Текст строк и их группы — на первом открытии: строки палитры не меняются. */
  let index = null;

  function indexOf() {
    index ??= items.map((item) => ({
      item,
      text: norm(`${item.getAttribute("data-command-value") ?? ""} ${item.textContent ?? ""}`),
      group: groups.find((group) => group.contains(item)) ?? null,
      query: item.hasAttribute("data-command-query"),
    }));
    return index;
  }

  const choices = () => items.filter((item) => !item.hidden && !disabled(item));

  /* Выбранная строка одна: перекрашиваются прежняя и новая, а не весь список. */
  function setActive(item, scroll = false) {
    if (active && active !== item) {
      active.classList.remove(ACTIVE_CLASS);
      setAttr(active, "aria-selected", "false");
    }
    active = item;
    if (!item) {
      input.removeAttribute("aria-activedescendant");
      return;
    }
    item.classList.add(ACTIVE_CLASS);
    setAttr(item, "aria-selected", "true");
    setAttr(input, "aria-activedescendant", ensureId(item, "ui-command-option"));
    if (scroll) scrollIntoList(list, item);
  }

  /* Пишем только изменившееся: на каждой букве — один проход по строкам. Совпали
     только недоступные строки — список виден, «ничего не нашлось» нет. */
  function filter() {
    const typed = input.value.trim();
    const words = norm(typed).split(" ").filter(Boolean);
    const shown = new Set();
    for (const echo of echoes) if (echo.textContent !== typed) echo.textContent = typed;
    for (const { item, text, group, query } of indexOf()) {
      const hit = query ? words.length > 0 : words.every((word) => text.includes(word));
      if (item.hidden === hit) item.hidden = !hit;
      if (hit) shown.add(group);
    }
    for (const group of groups) {
      const hide = !shown.has(group);
      if (group.hidden !== hide) group.hidden = hide;
    }
    const none = shown.size === 0;
    if (list.hidden !== none) list.hidden = none;
    if (empty && empty.hidden === none) empty.hidden = !none;
    const ready = choices();
    setActive(ready.includes(active) ? active : (ready[0] ?? null));
  }

  function choose(item) {
    if (!item || item.hidden || disabled(item)) return;
    const value = item.getAttribute("data-command-value") ?? (item.querySelector(".ui-command__label") ?? item).textContent.trim();
    if (ctx.emit("command:select", { item, value, query: input.value.trim() }, { cancelable: true })) close();
  }

  function open() {
    if (current) return;
    const focused = document.activeElement;
    opener = focused instanceof HTMLElement && focused !== document.body ? focused : null;
    /* Уход ещё играет — слой так и стоит в body: отменяем уход без переноса. Список
       при этом помнит прокрутку (из скрытого слоя он возвращается в начало). */
    if (home) list.scrollTop = 0;
    home ??= portal(layer, host);
    layer.hidden = false;
    setData(layer, "open", true);
    input.value = "";
    /* Пустой запрос — список с начала и подсветка на первой строке: прошлый выбор
       остался бы за кромкой списка, и Enter запустил бы невидимую строку. */
    setActive(null);
    filter();
    current = openLayer({
      elements: () => [dialog],
      trigger: trigger ?? host,
      modal: true,
      exclusive: true,
      onDismiss(reason, event) {
        /* Нажатие по тосту — по своему слою поверх всего, не «мимо палитры». Слой
           окна, в который палитру перенесли, — её предок: он не в счёт. */
        const other = event?.target instanceof Element ? event.target.closest("[data-ui-layer]") : null;
        if ((reason === "outside" || reason === "focus") && other && !other.contains(layer)) return;
        close();
      },
    });
    life.show();
    setAttr(trigger, "aria-expanded", "true");
    setAttr(input, "aria-expanded", "true");
    focus(input);
  }

  function close() {
    if (!current) return;
    const closing = current;
    current = null;
    closing.close();
    setData(layer, "open", false);
    if (trigger) setAttr(trigger, "aria-expanded", "false");
    setAttr(input, "aria-expanded", "false");
    /* Фокус — назад, только если он был в палитре: тост поверх его не отдаёт. */
    returnFocus(dialog, opener, trigger);
    opener = null;
    life.hide().then((done) => {
      if (!done) return;
      layer.hidden = true;
      home?.();
      home = null;
    });
  }

  const toggle = () => (current ? close() : open());

  if (trigger) ctx.on(trigger, "click", toggle);
  ctx.on(input, "input", filter);
  ctx.on(input, "keydown", (event) => {
    if (event.isComposing || event.defaultPrevented) return;
    if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
      return;
    }
    const ready = choices();
    const at = ready.indexOf(active);
    let next;
    if (at === -1 && (event.key === "ArrowDown" || event.key === "ArrowUp")) next = event.key === "ArrowDown" ? 0 : ready.length - 1;
    else next = moveIndex(event, at, ready.length);
    if (next === null || next < 0) return;
    event.preventDefault();
    setActive(ready[next], true);
  });
  /* Нажатие мимо карточки закрывает палитру (стек слоёв) и уже вернуло фокус:
     браузер не должен тут же унести его в body. */
  ctx.on(layer, "pointerdown", (event) => {
    if (!dialog.contains(event.target)) event.preventDefault();
  });
  /* Tab остаётся на поле: кроме него в палитре фокусироваться нечему. */
  ctx.on(dialog, "keydown", (event) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    focus(input);
  });
  /* Нажатие по строке не уводит фокус с поля: при отменённом command:select
     палитра остаётся открытой, и печатать можно дальше. */
  ctx.on(list, "pointerdown", (event) => {
    if (event.target.closest(ITEM)) event.preventDefault();
  });
  ctx.on(list, "click", (event) => {
    const item = event.target.closest(ITEM);
    if (item && list.contains(item)) choose(item);
  });
  ctx.on(list, "pointermove", (event) => {
    const item = event.target.closest(ITEM);
    if (item && item !== active && list.contains(item) && !item.hidden && !disabled(item)) setActive(item);
  });

  const instance = {
    get isOpen() {
      return !!current;
    },
    open,
    close,
    toggle,
    destroy() {
      close();
      life.settle();
      home?.();
      home = null;
      setActive(null);
      for (const [node, attrs] of saved) restore(node, attrs);
      echoes.forEach((node, at) => {
        node.textContent = echoText[at];
      });
    },
  };
  if (host.hasAttribute("data-command-hotkey")) ctx.cleanup(useHotkey(instance));
  return instance;
}

export default defineComponent({
  name: "command",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    open: (host) => void get(host)?.open(),
    close: (host) => void get(host)?.close(),
    toggle: (host) => void get(host)?.toggle(),
    isOpen: (host) => !!get(host)?.isOpen,
  }),
});
