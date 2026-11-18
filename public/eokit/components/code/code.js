/* Редактор кода поверх <textarea>: подсветка, номера строк, автодополнение,
   поиск и замена, парные скобки, отступы Tab. Движок — CodeMirror 6
   (vendor/codemirror, грузится только когда на странице есть поле кода).

     <textarea class="ui-textarea ui-textarea--secondary ui-textarea--code"
               name="css" rows="16" aria-label="CSS сайта" placeholder="…"
               data-ui-code="css"></textarea>

   Поле остаётся в форме и хранит значение: form.elements, FormData, reset и
   defaultValue работают как с обычным textarea. Правка в редакторе пишется в
   поле и шлёт ему input (всплывает), плюс code:change { value } на поле. До
   загрузки движка и без JS пользователь правит само поле — класс --code уже
   делает его моноширинным.

   Язык — значение data-ui-code (сейчас css; пусто — без подсветки). rows —
   высота в строках, data-max-rows — до скольких строк растёт (по умолчанию 40),
   дальше прокрутка. disabled / readonly на поле — только чтение.

   Клавиши: Tab / Shift+Tab — отступ (Esc, затем Tab — уйти из поля),
   Ctrl/Cmd+F — поиск, Ctrl/Cmd+H — замена, Ctrl/Cmd+/ — комментарий,
   Ctrl/Cmd+Space — подсказки, Ctrl/Cmd+Z / Shift+Z — отмена и повтор.

   kit("code").refresh(field) — показать значение, записанное в поле из кода;
   kit("code").focus(field); kit("code").preload() — загрузить движок заранее
   (страница ждёт его вместе с данными, и поле не мигает обычным textarea). */

import { defineComponent } from "../../core/component.js";
import { afterReset, el, labelOf } from "../../core/dom.js";
import { lang } from "../../core/locale.js";

const SELECTOR = "textarea[data-ui-code]";

/* Движок — один на страницу, промис запоминается; неудачная загрузка — нет. */
let engine = null;
function loadEngine() {
  engine ??= import("../../vendor/codemirror/codemirror.esm.js").catch((error) => {
    engine = null;
    throw error;
  });
  return engine;
}

/* Подписи CodeMirror: поиск, замена, подсказки, переход к строке. */
const PHRASES_RU = {
  Find: "Найти",
  Replace: "Заменить на",
  next: "далее",
  previous: "назад",
  all: "все",
  "match case": "с учётом регистра",
  "by word": "слово целиком",
  regexp: "регулярное выражение",
  replace: "заменить",
  "replace all": "заменить все",
  close: "закрыть",
  "current match": "текущее совпадение",
  "replaced $ matches": "заменено совпадений: $",
  "replaced match on line $": "заменено в строке $",
  "on line": "в строке",
  "Go to line": "Перейти к строке",
  go: "перейти",
  Completions: "Подсказки",
  "Control character": "Управляющий символ",
  "Selection deleted": "Выделение удалено",
  "Folded lines": "Строки свёрнуты",
  "Unfolded lines": "Строки развёрнуты",
  to: "до",
  "folded code": "свёрнутый код",
  unfold: "развернуть",
  "Fold line": "Свернуть",
  "Unfold line": "Развернуть",
};

function build(field, ctx, cm) {
  const { EditorState, EditorView, keymap } = cm;
  const language = field.dataset.uiCode?.trim();
  const rows = Math.max(2, Number(field.getAttribute("rows")) || 8);
  const maxRows = Math.max(rows, Number(field.dataset.maxRows) || 40);
  const locked = field.disabled || field.readOnly;
  const describedBy = field.getAttribute("aria-describedby");

  const host = el("div", { class: "ui-code" });
  if (field.classList.contains("ui-textarea--secondary")) host.classList.add("ui-code--secondary");
  if (field.disabled) host.dataset.disabled = "";
  if (field.getAttribute("aria-invalid") === "true") host.setAttribute("aria-invalid", "true");
  host.style.setProperty("--ui-code-rows", rows);
  host.style.setProperty("--ui-code-max-rows", maxRows);

  /* Своя запись в поле не должна прийти обратно в редактор. */
  let writing = false;
  const toField = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const value = update.state.doc.toString();
    writing = true;
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    writing = false;
    ctx.emit("code:change", { value });
  });

  const extensions = [
    cm.lineNumbers(),
    cm.foldGutter({ markerDOM: (open) => el("span", { class: `ui-code__fold${open ? "" : " is-closed"}` }) }),
    cm.highlightSpecialChars(),
    cm.history(),
    cm.dropCursor(),
    cm.indentOnInput(),
    cm.indentUnit.of("  "),
    EditorState.tabSize.of(2),
    cm.syntaxHighlighting(cm.classHighlighter),
    cm.bracketMatching(),
    cm.closeBrackets(),
    cm.autocompletion({ icons: false }),
    cm.highlightSelectionMatches(),
    cm.search({ top: true }),
    keymap.of([...cm.closeBracketsKeymap, ...cm.defaultKeymap, ...cm.searchKeymap, ...cm.historyKeymap, ...cm.foldKeymap, ...cm.completionKeymap, cm.indentWithTab]),
    toField,
    EditorView.contentAttributes.of({
      "aria-label": labelOf(field) || "Код",
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
      translate: "no",
    }),
  ];
  if (language === "css") extensions.push(cm.css());
  if (field.placeholder) extensions.push(cm.placeholder(field.placeholder));
  if (locked) extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(!field.disabled));
  if (lang() === "ru") extensions.push(EditorState.phrases.of(PHRASES_RU));

  const view = new EditorView({ doc: field.value, extensions, parent: host });
  field.after(host);
  field.hidden = true;

  /* Метка <label for> ведёт к спрятанному полю — клик по ней ставит каретку в редактор. */
  for (const label of field.labels ?? []) ctx.on(label, "click", (event) => {
    event.preventDefault();
    view.focus();
  });

  function refresh() {
    const value = field.value;
    if (value === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }
  /* Сброс формы и запись в поле из кода (value + input) возвращаются в редактор. */
  afterReset(ctx, field, () => {
    writing = true;
    refresh();
    writing = false;
  });
  ctx.on(field, "input", () => writing || refresh());

  return {
    view,
    refresh,
    focus: () => view.focus(),
    destroy() {
      field.value = view.state.doc.toString();
      view.destroy();
      host.remove();
      field.hidden = false;
    },
  };
}

function create(field, ctx) {
  let editor = null;
  let gone = false;
  loadEngine().then(
    (cm) => {
      if (!gone && field.isConnected) editor = build(field, ctx, cm);
    },
    (error) => console.error("[EOKIT] code: редактор не загрузился, остаётся обычное поле", error),
  );
  return {
    refresh: () => editor?.refresh(),
    focus: () => (editor ? editor.focus() : field.focus()),
    destroy() {
      gone = true;
      editor?.destroy();
    },
  };
}

export default defineComponent({
  name: "code",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (field) => get(field)?.refresh(),
    focus: (field) => get(field)?.focus(),
    preload: () => loadEngine().then(() => true, () => false),
  }),
});
