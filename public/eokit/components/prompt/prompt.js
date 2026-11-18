/* Поле запроса: вопрос помощнику, поиск словами, короткое поручение. Поле растёт
   с текстом до --ui-prompt-rows строк, Enter отправляет, Shift+Enter переносит
   строку, ↑ в пустом поле возвращает прошлый запрос. Под полем строка: слева —
   то, о чём запрос (чипы), справа — отправка.

     <form class="ui-prompt ui-prompt--secondary" data-ui-prompt>
       <textarea class="ui-prompt__area" rows="1" placeholder="Спросите о заказах"></textarea>
       <div class="ui-prompt__bar">
         <span class="ui-badge ui-badge--xs"><span class="ui-badge__label">Заказ №1041</span>
           <button class="ui-prompt__drop" type="button" aria-label="Убрать">…</button></span>
         <button class="ui-btn ui-btn--primary ui-btn--icon-sm ui-prompt__send" type="submit" aria-label="Отправить">…</button>
       </div>
     </form>

   Отправка — событие prompt:submit { value } с хоста; preventDefault оставляет
   текст в поле (запрос не принят), иначе поле пустеет. Хост — <form> или любой
   блок: отправку формы модуль перехватывает сам. Кнопка недоступна, пока поле
   пустое или у хоста aria-busy="true" (ответ ещё готовится). Крестик
   .ui-prompt__drop убирает свой чип: событие prompt:drop { item },
   preventDefault оставляет чип на месте.

   kit("prompt").set(host, text) кладёт текст и ставит каретку в конец,
   value(host) — текст поля, focus(host), refresh(host) — после правки поля из кода. */

import { defineComponent } from "../../core/component.js";
import { restore, snapshot } from "../../core/dom.js";
import { focus } from "../../core/focus.js";
import { messages } from "../../core/locale.js";

const SELECTOR = "[data-ui-prompt]";
const ACTIVE = "button, a[href], input, select, textarea, label, [tabindex], [contenteditable]";

const t = messages("prompt", {
  ru: { area: "Запрос", send: "Отправить", drop: "Убрать" },
  en: { area: "Prompt", send: "Send", drop: "Remove" },
});

/* field-sizing растит поле без модуля; где его нет, высоту ставит модуль. */
const sizing = globalThis.CSS?.supports?.("field-sizing", "content") ?? false;

function create(host, ctx) {
  const area = host.querySelector(".ui-prompt__area");
  if (!area) return null;
  const send = host.querySelector(".ui-prompt__send");
  const form = host instanceof HTMLFormElement ? host : null;

  const saved = [[area, snapshot(area, ["aria-label", "enterkeyhint", "style"])]];
  if (send) saved.push([send, snapshot(send, ["aria-label", "disabled"])]);
  if (!area.hasAttribute("aria-label") && !area.hasAttribute("aria-labelledby") && !area.labels?.length) area.setAttribute("aria-label", host.dataset.label || t("area"));
  if (!area.hasAttribute("enterkeyhint")) area.setAttribute("enterkeyhint", "send");
  if (send && !send.hasAttribute("aria-label") && !send.textContent.trim()) send.setAttribute("aria-label", t("send"));

  /* Крестики чипов приложение добавляет и после монтирования — подпись по месту. */
  const label = () => {
    for (const drop of host.querySelectorAll(".ui-prompt__drop:not([aria-label])")) drop.setAttribute("aria-label", t("drop"));
  };

  const busy = () => host.getAttribute("aria-busy") === "true";
  const typed = () => area.value.trim();

  function fit() {
    if (sizing) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }

  function sync() {
    fit();
    if (send) send.disabled = !typed() || busy();
  }

  function caretToEnd() {
    focus(area);
    const end = area.value.length;
    area.setSelectionRange(end, end);
  }

  function put(value, { focus: take = true } = {}) {
    area.value = value;
    sync();
    if (take) caretToEnd();
  }

  /* Прошлый принятый запрос — для ↑ в пустом поле. */
  let last = "";
  function submit() {
    const value = typed();
    if (!value || busy()) return;
    if (!ctx.emit("prompt:submit", { value }, { cancelable: true })) return;
    last = value;
    area.value = "";
    sync();
  }

  ctx.on(area, "input", sync);
  ctx.on(area, "keydown", (event) => {
    /* Enter, которым подтверждают набор в IME, — не отправка (229 — Safari). */
    if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "ArrowUp" && !area.value && last && !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      put(last);
    }
  });
  if (form) {
    ctx.on(form, "submit", (event) => {
      event.preventDefault();
      submit();
    });
    ctx.on(form, "reset", () => setTimeout(() => ctx.signal.aborted || sync()));
  } else if (send) {
    ctx.on(send, "click", (event) => {
      event.preventDefault();
      submit();
    });
  }
  ctx.on(host, "click", (event) => {
    const drop = event.target.closest(".ui-prompt__drop");
    if (!drop || !host.contains(drop)) return;
    const item = drop.closest(".ui-badge") ?? drop.parentElement;
    if (ctx.emit("prompt:drop", { item }, { cancelable: true })) item.remove();
    focus(area);
  });
  /* Вся рамка — поле: нажатие по пустому месту ставит каретку в конец текста. */
  ctx.on(host, "pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(ACTIVE)) return;
    event.preventDefault();
    caretToEnd();
  });

  const watch = new MutationObserver(sync);
  watch.observe(host, { attributes: true, attributeFilter: ["aria-busy"] });
  ctx.cleanup(() => watch.disconnect());

  label();
  sync();

  return {
    value: () => area.value,
    set: put,
    focus: caretToEnd,
    refresh() {
      label();
      sync();
    },
    destroy() {
      for (const [node, attrs] of saved) restore(node, attrs);
    },
  };
}

export default defineComponent({
  name: "prompt",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    set: (host, value, options) => void get(host)?.set(String(value ?? ""), options),
    value: (host) => get(host)?.value() ?? "",
    focus: (host) => void get(host)?.focus(),
    refresh: (host) => void get(host)?.refresh(),
  }),
});
