/* Редактор текста: абзацы, подзаголовок, жирный и курсив, списки, цитата, ссылка.
   Область — contenteditable, кнопки панели — разметка автора: какие команды
   нужны и какими иконками, решает приложение. Модуль отмечает нажатые кнопки
   (aria-pressed) по месту каретки, кладёт HTML в поле формы и шлёт
   editor:change { html, text }. Вставка — простым текстом: форматирование чужих
   страниц и редакторов в запись не попадает.

     <div class="ui-editor" data-ui-editor>
       <div class="ui-editor__bar" role="toolbar" aria-label="Форматирование">
         <button class="ui-btn ui-btn--ghost ui-btn--icon-sm" type="button" data-ui-editor-cmd="bold" aria-label="Жирный">…</button>
         <span class="ui-editor__sep"></span>
         <button … data-ui-editor-cmd="link" aria-label="Ссылка">…</button>
       </div>
       <div class="ui-editor__area" data-placeholder="Текст статьи"><p>…</p></div>
       <input class="ui-editor__value" type="hidden" name="body">
     </div>

   Команды: bold, italic, h2, h3, ul, ol, quote, link, clear. Ссылка — строкой
   адреса под панелью (Ctrl/Cmd+K); пустой адрес снимает ссылку. data-disabled —
   только чтение. HTML, записанный в область из кода, покажет
   kit("editor").refresh(host); kit("editor").html(host) — текущее значение. */

import { defineComponent } from "../../core/component.js";
import { el, setAttr } from "../../core/dom.js";
import { messages } from "../../core/locale.js";

const SELECTOR = "[data-ui-editor]";

const t = messages("editor", {
  ru: { area: "Текст", link: "Адрес ссылки", apply: "Применить", remove: "Убрать ссылку" },
  en: { area: "Text", link: "Link address", apply: "Apply", remove: "Remove link" },
});

/* Команда → блок, в который превращается абзац (повтор возвращает абзац). */
const BLOCKS = { h2: "h2", h3: "h3", quote: "blockquote" };
const INLINE = { bold: "bold", italic: "italic" };
const LISTS = { ul: "insertUnorderedList", ol: "insertOrderedList" };

/* Пустая область браузеры оставляют с <br> или <p><br></p> — это «ничего». */
const blank = (area) => !area.textContent.trim() && !area.querySelector("img, hr");

/* Адрес без схемы — https; mailto:, tel: и относительные пути остаются как есть. */
function normalUrl(text) {
  const url = text.trim();
  if (!url) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(url)) return url;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  return `https://${url}`;
}

function create(host, ctx) {
  const area = host.querySelector(".ui-editor__area");
  if (!area) return null;
  const bar = host.querySelector(".ui-editor__bar");
  const value = host.querySelector(".ui-editor__value");
  const buttons = bar ? [...bar.querySelectorAll("[data-ui-editor-cmd]")] : [];
  const disabled = host.hasAttribute("data-disabled");
  const added = [];

  const saved = { contenteditable: area.getAttribute("contenteditable"), role: area.getAttribute("role"), multiline: area.getAttribute("aria-multiline"), label: area.getAttribute("aria-label") };
  area.setAttribute("contenteditable", disabled ? "false" : "true");
  area.setAttribute("role", "textbox");
  area.setAttribute("aria-multiline", "true");
  if (!area.hasAttribute("aria-label") && !area.hasAttribute("aria-labelledby")) area.setAttribute("aria-label", host.dataset.label || t("area"));
  buttons.forEach((button) => { button.disabled = disabled; });

  /* Пустая область — один абзац: иначе первая строка текста пошла бы без <p>. */
  if (blank(area)) area.innerHTML = "<p><br></p>";
  const html = () => (blank(area) ? "" : area.innerHTML.trim());

  const sync = (emit) => {
    host.classList.toggle("is-empty", blank(area));
    if (value) value.value = html();
    if (emit) ctx.emit("editor:change", { html: html(), text: area.textContent });
  };

  /* Каретка внутри области — иначе команды и подсветка кнопок не про неё. */
  const range = () => {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return null;
    const current = selection.getRangeAt(0);
    return area.contains(current.commonAncestorContainer) ? current : null;
  };
  const inside = (tag) => {
    let node = range()?.startContainer ?? null;
    while (node && node !== area) {
      if (node.nodeName === tag) return node;
      node = node.parentNode;
    }
    return null;
  };

  function mark() {
    if (!range()) return;
    for (const button of buttons) {
      const cmd = button.dataset.uiEditorCmd;
      let on = false;
      if (INLINE[cmd]) on = document.queryCommandState(INLINE[cmd]);
      else if (BLOCKS[cmd]) on = Boolean(inside(BLOCKS[cmd].toUpperCase()));
      else if (cmd === "ul") on = Boolean(inside("UL"));
      else if (cmd === "ol") on = Boolean(inside("OL"));
      else if (cmd === "link") on = Boolean(inside("A"));
      if (cmd !== "clear") setAttr(button, "aria-pressed", on ? "true" : "false");
    }
  }

  /* ---- Ссылка: строка адреса под панелью ---- */
  let linkRow = null;
  let linkRange = null;
  function openLink() {
    linkRange = range()?.cloneRange() ?? null;
    if (!linkRange) return;
    const current = inside("A");
    if (!linkRow) {
      const input = el("input", { class: "ui-input ui-input--sm", type: "url", placeholder: "https://", "aria-label": t("link") });
      const apply = el("button", { class: "ui-btn ui-btn--sm", type: "button", text: t("apply") });
      const remove = el("button", { class: "ui-btn ui-btn--ghost ui-btn--sm", type: "button", text: t("remove") });
      linkRow = el("div", { class: "ui-editor__link" }, input, apply, remove);
      (bar ?? area).after(linkRow);
      added.push(linkRow);
      ctx.on(apply, "click", () => setLink(input.value));
      ctx.on(remove, "click", () => setLink(""));
      ctx.on(input, "keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); setLink(input.value); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeLink(true); }
      });
    }
    const input = linkRow.querySelector("input");
    input.value = current?.getAttribute("href") ?? "";
    linkRow.hidden = false;
    linkRow.lastElementChild.hidden = !current;
    input.focus();
    input.select();
  }
  function closeLink(back) {
    if (!linkRow || linkRow.hidden) return;
    linkRow.hidden = true;
    if (back) restoreRange();
  }
  function restoreRange() {
    area.focus();
    if (!linkRange) return;
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(linkRange);
  }
  function setLink(text) {
    restoreRange();
    const url = normalUrl(text);
    const current = inside("A");
    if (!url) {
      if (current) {
        const selection = document.getSelection();
        const whole = document.createRange();
        whole.selectNodeContents(current);
        selection.removeAllRanges();
        selection.addRange(whole);
      }
      document.execCommand("unlink");
    } else if (current) {
      current.setAttribute("href", url);
    } else if (linkRange && !linkRange.collapsed) {
      document.execCommand("createLink", false, url);
    } else {
      document.execCommand("insertHTML", false, `<a href="${url.replace(/"/g, "&quot;")}">${url.replace(/[<>&]/g, (char) => `&#${char.charCodeAt(0)};`)}</a>`);
    }
    closeLink(false);
    sync(true);
    mark();
  }

  function run(cmd) {
    if (disabled) return;
    if (cmd === "link") { openLink(); return; }
    if (!range()) area.focus();
    if (INLINE[cmd]) document.execCommand(INLINE[cmd]);
    else if (LISTS[cmd]) document.execCommand(LISTS[cmd]);
    else if (BLOCKS[cmd]) document.execCommand("formatBlock", false, inside(BLOCKS[cmd].toUpperCase()) ? "p" : BLOCKS[cmd]);
    else if (cmd === "clear") { document.execCommand("removeFormat"); document.execCommand("formatBlock", false, "p"); }
    sync(true);
    mark();
  }

  /* Кнопка панели не забирает фокус: выделение в области остаётся. */
  for (const button of buttons) {
    ctx.on(button, "mousedown", (event) => event.preventDefault());
    ctx.on(button, "click", () => run(button.dataset.uiEditorCmd));
  }
  ctx.on(area, "focus", () => document.execCommand("defaultParagraphSeparator", false, "p"));
  ctx.on(area, "input", () => sync(true));
  ctx.on(area, "keyup", mark);
  ctx.on(area, "mouseup", mark);
  ctx.on(document, "selectionchange", () => { if (document.activeElement === area) mark(); });
  ctx.on(area, "keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      run("link");
    }
  });
  ctx.on(area, "paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (text == null) return;
    event.preventDefault();
    document.execCommand("insertText", false, text);
  });
  /* Перетаскивание из других окон — тоже простым текстом. */
  ctx.on(area, "drop", (event) => {
    if (!event.dataTransfer?.types.includes("text/html")) return;
    event.preventDefault();
    const text = event.dataTransfer.getData("text/plain");
    if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (caret) document.getSelection().collapse(caret.offsetNode, caret.offset);
    } else if (document.caretRangeFromPoint) {
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (caret) { const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(caret); }
    }
    document.execCommand("insertText", false, text);
  });

  sync(false);

  return {
    html,
    refresh() {
      if (blank(area)) area.innerHTML = "<p><br></p>";
      sync(false);
    },
    focus: () => area.focus(),
    destroy() {
      for (const node of added) node.remove();
      for (const [name, previous] of [["contenteditable", saved.contenteditable], ["role", saved.role], ["aria-multiline", saved.multiline], ["aria-label", saved.label]]) {
        if (previous == null) area.removeAttribute(name);
        else area.setAttribute(name, previous);
      }
      buttons.forEach((button) => { button.removeAttribute("aria-pressed"); button.disabled = false; });
      host.classList.remove("is-empty");
    },
  };
}

export default defineComponent({
  name: "editor",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (host) => get(host)?.refresh(),
    html: (host) => get(host)?.html() ?? "",
    focus: (host) => get(host)?.focus(),
  }),
});
