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
  { id: "cloudpeak", name: "Гора в облаках", color: "rgb(44 60 36)" },
  { id: "evening", name: "Вечерний город", color: "rgb(73 67 72)" },
  { id: "race", name: "Гонка", color: "rgb(121 116 100)" },
  { id: "crystals", name: "Кристаллы", color: "rgb(50 91 123)" },
  { id: "overpass", name: "Эстакада и небо", color: "rgb(106 141 175)" },
  { id: "fjord", name: "Фьорд в тучах", color: "rgb(53 47 58)" },
  { id: "pinewood", name: "Хвойный лес", color: "rgb(23 27 18)" },
  { id: "ivy", name: "Бетон и плющ", color: "rgb(68 72 64)" },
];
export const DEFAULT_BACKDROP = "cloudpeak";

export type Theme = "light" | "dark" | "system";
export const theme = local<Theme>("theme", "system");
export const backdrop = local<string>("bg", DEFAULT_BACKDROP);

/* Свой фон: картинка сотрудника, ужатая в браузере до 2560×1600 WebP и
   сохранённая в localStorage (k996.bgCustom) — только на этом устройстве.
   Выбран, когда backdrop = "custom". */
export const CUSTOM = "custom";
export interface CustomBackdrop {
  src: string;
  color: string;
}
export const customBackdrop = local<CustomBackdrop | null>("bgCustom", null);

/* Ужимает файл, кладёт его в localStorage и выбирает фоном. Большие
   картинки, которые не влезли, пробует меньше и сильнее сжатыми. */
export async function setCustomBackdrop(file: File) {
  const bitmap = await createImageBitmap(file);
  const tries: [number, number][] = [[2560, 0.82], [1920, 0.75], [1600, 0.65], [1280, 0.6]];
  for (const [width, quality] of tries) {
    const one = encode(bitmap, width, quality);
    try {
      localStorage.setItem("k996.bgCustom", JSON.stringify(one));
    } catch {
      continue;
    }
    customBackdrop.value = one;
    backdrop.value = CUSTOM;
    return;
  }
  throw new Error("Картинка слишком большая для хранения в браузере");
}

export function removeCustomBackdrop() {
  customBackdrop.value = null;
  if (backdrop.value === CUSTOM) backdrop.value = DEFAULT_BACKDROP;
}

function encode(bitmap: ImageBitmap, width: number, quality: number): CustomBackdrop {
  const height = Math.round(width / 1.6);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  /* Обрезка по центру, как background-size: cover. */
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  const src = canvas.toDataURL("image/webp", quality);
  const tiny = document.createElement("canvas");
  tiny.width = tiny.height = 1;
  tiny.getContext("2d")!.drawImage(canvas, 0, 0, 1, 1);
  const [r, g, b] = tiny.getContext("2d")!.getImageData(0, 0, 1, 1).data;
  return { src: src.startsWith("data:image/webp") ? src : canvas.toDataURL("image/jpeg", quality), color: `rgb(${r} ${g} ${b})` };
}

function custom() {
  const one = backdrop.value === CUSTOM ? customBackdrop.value : null;
  return one ? { color: one.color, image: `url("${one.src}")` } : null;
}
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
  const own = custom();
  if (own) {
    root.style.setProperty("--bg-color", own.color);
    root.style.setProperty("--bg-image", own.image);
    return;
  }
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

/* Фото во весь размер (2560 px) — для экрана входа, где фон главный. */
export function fullPhoto(id: string) {
  if (id === CUSTOM) {
    const own = custom();
    if (own) return own;
  }
  const one = BACKDROPS.find((item) => item.id === id) ?? BACKDROPS[0];
  return { color: one.color, image: photo(`./bg/${one.id}`) };
}

export function startLook() {
  apply();
  watch([theme, backdrop, customBackdrop], apply);
  dark.addEventListener("change", apply);
}
