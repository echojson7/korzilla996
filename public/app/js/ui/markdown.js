/* Markdown ответа → разметка для .ui-prose (кит). Безопасно: исходник сначала
   экранируется целиком, разметку ставит только сам разбор; ссылки — только
   относительные, #, http(s) и mailto, без javascript:.

   Блоки: абзац (строки подряд), # — ### заголовки (в панели h3 и h4),
   - * • и 1. списки с одним уровнем вложенности (отступ 2+), > цитата,
   ``` блок кода с языком, | таблица | с линией |---|, --- черта.
   Строкой: **жирный**, *курсив*, `код`, ==метка==, [текст](адрес).

   md(text) — блоки, inline(text) — одна строка без абзаца (строка шага). */

import { raw } from "./html.js";
import { icon } from "./icons.js";
import { t } from "../core/i18n.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (char) => ESC[char]);
const SAFE = /^(https?:\/\/|mailto:|\/|#|\.{0,2}\/)/i;

/* Строка уже экранирована: & < > " ' стоят сущностями, ссылки разбираются по ним. */
function spans(text) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (match, code) => `\u0000${codes.push(code) - 1}\u0000`);
  out = out
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
      const url = href.replace(/&amp;/g, "&");
      return SAFE.test(url) ? `<a href="${esc(url)}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>` : label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (match, at) => `<code>${codes[at]}</code>`);
}

export const inline = (text) => raw(spans(esc(text)));

const LIST = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const ROW = /^\s*\|.*\|\s*$/;
const RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

function list(lines) {
  const ordered = /\d/.test(LIST.exec(lines[0])[2]);
  let out = "";
  let open = false;
  let nested = "";
  let nestedOrdered = false;
  const flushNested = () => {
    if (!nested) return;
    out += `<${nestedOrdered ? "ol" : "ul"}>${nested}</${nestedOrdered ? "ol" : "ul"}>`;
    nested = "";
  };
  for (const line of lines) {
    const [, indent, mark, body] = LIST.exec(line) ?? [null, "", "", line.trim()];
    if (indent.length >= 2 && open) {
      if (!nested) nestedOrdered = /\d/.test(mark);
      nested += `<li>${spans(esc(body))}</li>`;
      continue;
    }
    flushNested();
    if (open) out += "</li>";
    out += `<li>${spans(esc(body))}`;
    open = true;
  }
  flushNested();
  if (open) out += "</li>";
  return `<${ordered ? "ol" : "ul"}>${out}</${ordered ? "ol" : "ul"}>`;
}

function table(lines) {
  const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const [head, rule, ...rows] = lines;
  const align = cells(rule).map((cell) => (/-:$/.test(cell) ? ' data-align="end"' : ""));
  const th = cells(head).map((cell, at) => `<th${align[at] ?? ""}>${spans(esc(cell))}</th>`).join("");
  const body = rows.map((row) => `<tr>${cells(row).map((cell, at) => `<td${align[at] ?? ""}>${spans(esc(cell))}</td>`).join("")}</tr>`).join("");
  return `<div class="ui-prose__table"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const codeblock = (lang, code) => `<div class="ui-codeblock">
  <div class="ui-codeblock__head"><span class="ui-codeblock__lang">${esc(lang || t("Code"))}</span><button class="ui-btn ui-btn--ghost ui-btn--icon-xs ui-codeblock__copy" type="button" aria-label="${esc(t("Copy"))}" data-ui-tooltip="${esc(t("Copy"))}">${icon("copy")}${icon("check")}</button></div>
  <pre><code>${esc(code)}</code></pre>
</div>`;

export function md(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let at = 0;
  while (at < lines.length) {
    const line = lines[at];
    if (!line.trim()) { at += 1; continue; }
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      at += 1;
      while (at < lines.length && !/^\s*```\s*$/.test(lines[at])) body.push(lines[at++]);
      at += 1;
      out.push(codeblock(fence[1], body.join("\n")));
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(`<h${heading[1].length <= 2 ? 3 : 4}>${spans(esc(heading[2]))}</h${heading[1].length <= 2 ? 3 : 4}>`);
      at += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr>"); at += 1; continue; }
    if (ROW.test(line) && RULE.test(lines[at + 1] ?? "")) {
      const rows = [];
      while (at < lines.length && ROW.test(lines[at])) rows.push(lines[at++]);
      out.push(table(rows));
      continue;
    }
    if (LIST.test(line)) {
      const items = [];
      while (at < lines.length && (LIST.test(lines[at]) || (/^\s{2,}\S/.test(lines[at]) && items.length))) items.push(lines[at++]);
      out.push(list(items));
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (at < lines.length && /^\s*>/.test(lines[at])) quote.push(lines[at++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${md(quote.join("\n"))}</blockquote>`);
      continue;
    }
    const para = [];
    while (at < lines.length && lines[at].trim() && !LIST.test(lines[at]) && !/^(#{1,4}\s|\s*```|\s*>)/.test(lines[at]) && !(ROW.test(lines[at]) && RULE.test(lines[at + 1] ?? ""))) para.push(lines[at++].trim());
    out.push(`<p>${para.map((one) => spans(esc(one))).join("<br>")}</p>`);
  }
  return raw(out.join(""));
}
