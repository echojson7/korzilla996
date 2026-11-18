/* Чип-выбор: бейдж-кнопка, которую можно отметить. Вид — badge.css, модуль только
   переключает aria-pressed по нажатию и шлёт badge:change (detail: pressed).

     <button class="ui-badge" type="button" aria-pressed="false">Овсяное</button>
     <button class="ui-badge ui-badge--outline" data-tone="pink" type="button" aria-pressed="true">
       <span class="ui-icon ui-icon--fill" data-ui-icon="heart"></span>Кения АА</button>

   Отметку, поставленную из кода, модулю знать не нужно: он читает aria-pressed в
   момент нажатия. */

import { defineComponent } from "../../core/component.js";
import { snapshot, restore } from "../../core/dom.js";

function create(host, ctx) {
  if (host.localName !== "button") return null;
  const saved = snapshot(host, ["aria-pressed"]);
  ctx.on(host, "click", () => {
    if (host.disabled) return;
    const pressed = host.getAttribute("aria-pressed") !== "true";
    host.setAttribute("aria-pressed", String(pressed));
    ctx.emit("badge:change", { pressed });
  });
  return { destroy: () => restore(host, saved) };
}

export default defineComponent({ name: "badge", selector: "button.ui-badge[aria-pressed]", create });
