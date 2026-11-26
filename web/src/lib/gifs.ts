/* GIF и стикеры для чатов: поиск через сервер портала (ключ сервиса только
   там) и избранное сотрудника. Избранное грузится один раз и живёт в памяти. */
import { ref } from "vue";
import { api, ApiError } from "./api";
import { toast } from "./toast";

export type GifType = "gif" | "sticker";
export interface GifMedia {
  url: string;
  mp4?: string;
  width: number | null;
  height: number | null;
}
export interface GifItem {
  key: string;
  provider: "klipy" | "giphy";
  type: GifType;
  title: string;
  preview: GifMedia;
  full: GifMedia;
}
export interface GifPage {
  items: GifItem[];
  next: number | null;
  provider: "klipy" | "giphy";
}

export const PROVIDER_NAME = { klipy: "KLIPY", giphy: "GIPHY" } as const;

/* Какой сервис ответил последним — для подписи «Powered by …». */
export const provider = ref<GifPage["provider"] | null>(null);

export async function searchGifs(type: GifType, q: string, page: number): Promise<GifPage> {
  const params = new URLSearchParams({ type, page: String(page) });
  if (q.trim()) params.set("q", q.trim());
  const res = await api<GifPage>("GET", `gifs?${params}`);
  provider.value = res.provider;
  return res;
}

export const favorites = ref<GifItem[]>([]);
let loaded: Promise<void> | null = null;
export function loadFavorites(force = false) {
  if (!loaded || force) {
    loaded = api<GifItem[]>("GET", "gifs/favorites")
      .then((rows) => void (favorites.value = rows ?? []))
      .catch(() => void (loaded = null));
  }
  return loaded;
}
export const isFavorite = (key: string) => favorites.value.some((one) => one.key === key);

export async function toggleFavorite(item: GifItem) {
  const was = isFavorite(item.key);
  const before = favorites.value;
  favorites.value = was ? before.filter((one) => one.key !== item.key) : [item, ...before];
  try {
    if (was) await api("DELETE", "gifs/favorites", { key: item.key });
    else await api("POST", "gifs/favorites", { item });
    toast(was ? "Убрано из избранного" : (item.type === "sticker" ? "Стикер в избранном" : "GIF в избранном"));
  } catch (error) {
    favorites.value = before;
    toast(error instanceof ApiError ? error.first : "Не получилось", "danger");
  }
}
