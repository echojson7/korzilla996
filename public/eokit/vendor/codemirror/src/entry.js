/* Сборка vendor/codemirror/codemirror.esm.js — только то, что берёт components/code.
   Пересобрать (версии пакетов — в ../LICENSE):

     npm i codemirror @codemirror/lang-css @codemirror/language @codemirror/search \
           @codemirror/autocomplete @codemirror/commands @codemirror/state \
           @codemirror/view @lezer/highlight esbuild
     npx esbuild entry.js --bundle --format=esm --minify --legal-comments=none \
           --outfile=../codemirror.esm.js

   Новый язык (html, js) — ещё один export отсюда и строка в LANGS модуля code. */
export { EditorState, Compartment } from "@codemirror/state";
export { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, placeholder } from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
export { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
export { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
export { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
export { css } from "@codemirror/lang-css";
export { classHighlighter } from "@lezer/highlight";
