/* Внешний вид: светлая или тёмная тема и фон-фотография, как в Битрикс24.
   Фото лежат в public/bg (Unsplash License): 1920 px для больших экранов,
   1280 px для остальных и маленькая миниатюра для выбора. Пока фото
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
  { id: "fjord", name: "Горная долина", color: "rgb(85 105 111)" },
  { id: "peaks", name: "Пики над облаками", color: "rgb(114 112 124)" },
  { id: "forest", name: "Сосновый лес", color: "rgb(66 65 48)" },
  { id: "alpine", name: "Скалы и луг", color: "rgb(78 78 62)" },
  { id: "valley", name: "Зелёные холмы", color: "rgb(88 110 54)" },
  { id: "hills", name: "Шотландия", color: "rgb(118 118 102)" },
  { id: "coast", name: "Океан", color: "rgb(160 179 178)" },
];
export const DEFAULT_BACKDROP = "fjord";

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
