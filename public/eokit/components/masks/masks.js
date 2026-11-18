/* Маски полей: значение приводится к формату на вводе, вставке и уходе фокуса.
   phone — +7 (XXX) XXX-XX-XX (8 в начале — это 7), digits — только цифры, email —
   без пробелов, кириллицы и лишних @. Свою маску даёт
   kit("masks").register("inn", (value) => …) до монтирования поля.

     <input class="ui-input" type="tel" data-ui-mask="phone">
     <input class="ui-input" type="password" data-ui-mask="password">

   password — не маска, а действие поля: глазок «показать пароль» справа в
   .ui-input__wrap (своя кнопка .ui-input__action в обёртке берётся как есть).

   Каретка после правки встаёт за ту же цифру, что и до неё: набор подряд,
   удаление через «) » и вставка идут как без маски. Delete перед знаком маски
   («-», «) ») стирает следующую цифру — сам знак маска вернула бы на место. Во
   время набора через IME значение не трогаем — маска сорвала бы композицию.
   События модуль не шлёт: input шлёт само поле.

   Сброс формы маска переформатирует сама; значение, записанное из кода, приведёт
   kit("masks").refresh(input). */

import { defineComponent } from "../../core/component.js";
import { afterReset, el, restore, setAttr, snapshot } from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";

const SELECTOR = "[data-ui-mask]";
const NAME = /^[a-z][a-z0-9-]*$/;
const WRAP = "ui-input__wrap";
const ACTION = "ui-input__action";

const t = messages("masks", {
  ru: { reveal: "Показать пароль" },
  en: { reveal: "Show password" },
});

const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "");

function formatPhone(value) {
  let digits = digitsOnly(value);
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits && !digits.startsWith("7")) digits = `7${digits}`;
  if (!digits) return "";

  digits = digits.slice(0, 11);
  const code = digits.slice(1, 4);
  if (digits.length <= 1) return "+7";
  if (digits.length <= 4) return `+7 (${code}`;
  if (digits.length <= 7) return `+7 (${code}) ${digits.slice(4)}`;
  if (digits.length <= 9) return `+7 (${code}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return `+7 (${code}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function formatEmail(value) {
  const cleaned = String(value ?? "").replace(/[^\w.@%+-]/gi, "");
  const at = cleaned.indexOf("@");
  if (at === -1) return cleaned;
  return `${cleaned.slice(0, at)}@${cleaned.slice(at + 1).replace(/@/g, "")}`;
}

const formats = new Map([
  ["phone", formatPhone],
  ["digits", digitsOnly],
  ["email", formatEmail],
]);

/* Каретка после count-й цифры значения. */
function caretForDigits(value, count) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] >= "0" && value[index] <= "9") seen += 1;
    if (seen === count) return index + 1;
  }
  return value.length;
}

function apply(input, format, kind, keepCaret) {
  const { value } = input;
  /* null — у типов без выделения (email, number): каретку там не ставят. */
  const start = input.selectionStart;
  const next = format(value);
  if (next === value) return;
  input.value = next;
  if (!keepCaret || start === null || document.activeElement !== input) return;

  const prefix = value.slice(0, start);
  let caret;
  if (kind === "phone") {
    /* Без кода страны маска сама допишет «7» впереди: каретка сдвигается на цифру. */
    const digits = digitsOnly(prefix);
    const prefixed = digits.startsWith("7") || digits.startsWith("8");
    caret = caretForDigits(next, digits ? digits.length + (prefixed ? 0 : 1) : 0);
  } else {
    caret = Math.min(format(prefix).length, next.length);
  }
  input.setSelectionRange(caret, caret);
}

/* Глазок: глаз, потом перечёркнутый глаз — CSS прячет лишний по aria-pressed, и
   порядок ему важен. Подпись постоянная, состояние — aria-pressed: иначе
   скринридер прочёл бы «Скрыть пароль, нажата». */
function reveal(input, ctx) {
  const type = input.type;
  let wrap = input.parentElement;
  const ownWrap = !wrap?.classList.contains(WRAP);
  if (ownWrap) {
    wrap = el("div", { class: WRAP });
    input.before(wrap);
    wrap.append(input);
  }
  let toggle = [...wrap.children].find((child) => child.classList.contains(ACTION));
  const ownToggle = !toggle;
  const saved = ownToggle ? null : snapshot(toggle, ["aria-pressed", "aria-label", "disabled"]);
  toggle ??= el("button", { type: "button", class: ACTION });
  const glyphs = [];
  if (!toggle.querySelector("[data-ui-icon='eye']")) glyphs.push(["prepend", icon("eye")]);
  if (!toggle.querySelector("[data-ui-icon='eye-off']")) glyphs.push(["append", icon("eye-off")]);
  for (const [where, glyph] of glyphs) toggle[where](glyph);
  if (ownToggle) wrap.append(toggle);
  /* Своя подпись — из словаря при каждом переключении: за сменой <html lang>. */
  const named = !toggle.hasAttribute("aria-label");
  const sync = () => {
    if (named) setAttr(toggle, "aria-label", t("reveal"));
    setAttr(toggle, "aria-pressed", String(input.type !== "password"));
  };
  sync();
  /* Глазок недоступен вместе с полем — и выходит из табуляции. Поле, включённое
     или выключенное из кода (режим правки), ведёт его за собой. */
  const syncDisabled = () => setAttr(toggle, "disabled", input.disabled);
  syncDisabled();
  const watch = new MutationObserver(syncDisabled);
  watch.observe(input, { attributes: true, attributeFilter: ["disabled"] });
  ctx.cleanup(() => watch.disconnect());

  ctx.on(toggle, "click", () => {
    if (input.disabled) return;
    input.type = input.type === "password" ? "text" : "password";
    sync();
    input.focus();
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
  });

  return {
    input,
    destroy() {
      input.type = type;
      if (ownToggle) toggle.remove();
      else {
        for (const [, glyph] of glyphs) glyph.remove();
        restore(toggle, saved);
      }
      if (ownWrap) {
        wrap.before(input);
        wrap.remove();
      }
    },
  };
}

function create(input, ctx) {
  if (!(input instanceof HTMLInputElement)) return null;
  const kind = input.dataset.uiMask.trim();
  if (kind === "password") return reveal(input, ctx);
  const format = formats.get(kind);
  if (!format) return null;

  let composing = false;
  /* Delete, который снёс бы только знак маски, формат тут же вернул бы — каретка
     стояла бы на месте навсегда. До правки переносим её за такие знаки, к первому
     символу, без которого значение правда меняется. */
  ctx.on(input, "beforeinput", (event) => {
    if (composing || event.inputType !== "deleteContentForward") return;
    const { value, selectionStart: start, selectionEnd: end } = input;
    if (start === null || start !== end) return;
    let at = start;
    while (at < value.length && format(value.slice(0, at) + value.slice(at + 1)) === value) at += 1;
    if (at !== start && at < value.length) input.setSelectionRange(at, at);
  });
  ctx.on(input, "input", () => composing || apply(input, format, kind, true));
  ctx.on(input, "compositionstart", () => (composing = true));
  ctx.on(input, "compositionend", () => {
    composing = false;
    apply(input, format, kind, true);
  });
  ctx.on(input, "blur", () => apply(input, format, kind, false));
  /* reset приходит до того, как форма вернёт значение — а вернёт она атрибут
     value, неформатированный. */
  afterReset(ctx, input, () => apply(input, format, kind, false));
  apply(input, format, kind, false);
  return { input, refresh: () => apply(input, format, kind, false) };
}

export default defineComponent({
  name: "masks",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    /* Значение, записанное в поле из кода, — к формату. */
    refresh: (input) => void get(input)?.refresh?.(),
    /* Своя маска: format(value) → строка; так же заменяется встроенная. password
       занят глазком. */
    register(name, format) {
      if (!NAME.test(name) || name === "password" || typeof format !== "function") return false;
      formats.set(name, format);
      return true;
    },
  }),
});
