/* Сердечко «в избранное» (.ui-fav): переключает aria-pressed по нажатию и шлёт
   fav:change (detail: pressed). Вид — fav.css. Отметку, поставленную из кода,
   модуль читает в момент нажатия. */

import { defineComponent } from "../../core/component.js";
import { snapshot, restore } from "../../core/dom.js";

function create(host, ctx) {
  if (host.localName !== "button") return null;
  const saved = snapshot(host, ["aria-pressed"]);
  ctx.on(host, "click", () => {
    if (host.disabled) return;
    const pressed = host.getAttribute("aria-pressed") !== "true";
    host.setAttribute("aria-pressed", String(pressed));
    ctx.emit("fav:change", { pressed });
  });
  return { destroy: () => restore(host, saved) };
}

export default defineComponent({ name: "fav", selector: "button.ui-fav[aria-pressed]", create });
