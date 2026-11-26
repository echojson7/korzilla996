/* Внешний вид: светлая или тёмная тема и фон-фотография, как в Битрикс24.
   Фото лежат в public/bg (выбраны пользователем, с wallhaven.cc): 2560 px для
   больших экранов, 1280 px для остальных (AVIF и WebP) и маленькая миниатюра для выбора. Пока фото
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
  { id: "lake", name: "Озеро в горах", color: "rgb(123 132 131)" },
  { id: "campfire", name: "Костёр у реки", color: "rgb(80 106 108)" },
  { id: "cloudpeak", name: "Гора в облаках", color: "rgb(44 60 36)" },
  { id: "evening", name: "Вечерний город", color: "rgb(73 67 72)" },
  { id: "meadow", name: "Зелёный холм", color: "rgb(58 97 113)" },
  { id: "race", name: "Гонка", color: "rgb(121 116 100)" },
];
export const DEFAULT_BACKDROP = "lake";

export type Theme = "light" | "dark" | "system";
export const theme = local<Theme>("theme", "system");
export const backdrop = local<string>("bg", DEFAULT_BACKDROP);
/* Лента мессенджера: свои сообщения справа или все слева общим списком. */
export type MessageLayout = "split" | "left";
export const messageLayout = local<MessageLayout>("msgLayout", "split");

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
  root.style.setProperty("--bg-image", photo(`./bg/${one.id}${size}`));
}

/* AVIF втрое легче WebP; image-set с type() сам берёт первый формат, который
   браузер умеет. Старым браузерам без type() — просто WebP. */
const typed = CSS.supports("background-image", 'image-set(url("a.avif") type("image/avif"))');
function photo(base: string) {
  const url = (ext: string) => `url("${new URL(`${base}.${ext}`, location.href).href}")`;
  return typed ? `image-set(${url("avif")} type("image/avif"), ${url("webp")} type("image/webp"))` : url("webp");
}

export function startLook() {
  apply();
  watch([theme, backdrop], apply);
  dark.addEventListener("change", apply);
}
