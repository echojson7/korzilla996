/* Внешний вид: светлая или тёмная тема и фон-картинка, как в Битрикс24.
   Фоны лежат в public/bg — свои, из web/scripts/backgrounds.py (без чужих
   лицензий): 2560 px для больших экранов, 1280 px для остальных и миниатюра. Пока фото
   грузится, виден его средний цвет. Тот же выбор до первого кадра делает
   скрипт в index.html — держать их одинаковыми. */

import { watch } from "vue";
import { local } from "./prefs";

export interface Backdrop {
  id: string;
  name: string;
  color: string;
}
export const BACKDROPS: Backdrop[] = [
  { id: "synthwave", name: "Ретро-закат", color: "rgb(110 39 101)" },
  { id: "dusk", name: "Горы на закате", color: "rgb(116 69 114)" },
  { id: "aurora", name: "Северное сияние", color: "rgb(15 44 65)" },
  { id: "waves", name: "Волны", color: "rgb(148 164 159)" },
  { id: "dunes", name: "Дюны", color: "rgb(221 140 132)" },
  { id: "nightforest", name: "Ночной лес", color: "rgb(37 51 97)" },
  { id: "candy", name: "Конфетный градиент", color: "rgb(210 152 192)" },
  { id: "lagoon", name: "Лагуна", color: "rgb(75 182 210)" },
];
export const DEFAULT_BACKDROP = "dusk";

export type Theme = "light" | "dark" | "system";
export const theme = local<Theme>("theme", "system");
export const backdrop = local<string>("bg", DEFAULT_BACKDROP);

const dark = matchMedia("(prefers-color-scheme: dark)");
const isDark = () => theme.value === "dark" || (theme.value === "system" && dark.matches);

export const thumb = (id: string) => `./bg/${id}-thumb.webp`;

function apply() {
  const root = document.documentElement;
  const on = isDark();
  root.classList.toggle("dark", on);
  root.dataset.theme = on ? "dark" : "light";
  const one = BACKDROPS.find((item) => item.id === backdrop.value) ?? BACKDROPS[0];
  const size = Math.max(screen.width, screen.height) * devicePixelRatio > 1600 ? "" : "-1280";
  root.style.setProperty("--bg-color", one.color);
  root.style.setProperty("--bg-image", `url("${new URL(`./bg/${one.id}${size}.webp`, location.href).href}")`);
}

export function startLook() {
  apply();
  watch([theme, backdrop], apply);
  dark.addEventListener("change", apply);
}
