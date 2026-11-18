/* Текст ответа (.ui-prose): кнопка «Скопировать» у блока кода. Хост —
   .ui-codeblock; нажатие на .ui-codeblock__copy кладёт текст <pre> в буфер,
   на 1,5 с ставит кнопке data-copied (вид — prose.css) и шлёт prose:copy
   (detail: { text, ok }). Не скопировалось (нет доступа к буферу) — ok: false,
   сообщить об этом — дело приложения. */
import { defineComponent } from "../../core/component.js";

const SHOWN = 1500;

function create(host, ctx) {
  let timer = 0;
  ctx.on(host, "click", async (event) => {
    const button = event.target.closest?.(".ui-codeblock__copy");
    if (!button || !host.contains(button)) return;
    const text = host.querySelector("pre")?.textContent ?? "";
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    if (ok) {
      clearTimeout(timer);
      button.setAttribute("data-copied", "");
      timer = setTimeout(() => button.removeAttribute("data-copied"), SHOWN);
    }
    ctx.emit("prose:copy", { text, ok });
  });
  ctx.cleanup(() => clearTimeout(timer));
  return { destroy() {} };
}

export default defineComponent({ name: "prose", selector: ".ui-codeblock", create });
