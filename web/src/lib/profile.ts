/* Профиль сотрудника: просмотр, правка, аватар и пароль. */

import { api, apiUrl, upload } from "./api";
import { people, type ChatUser } from "./messenger";
import { auth } from "./session";

export type Status = { emoji: string | null; text: string | null; until: string | null };
export type Messengers = Partial<Record<"telegram" | "whatsapp" | "max" | "vk", string>>;

export interface Profile extends ChatUser {
  roleLabel: string;
  /* Можно менять должность и отдел (право «менять профили»). */
  org?: boolean;
  phone: string | null;
  messengers: Messengers;
  about: string | null;
  /* Полная дата, если год не скрыт. */
  birthdate: string | null;
  since: string | null;
  /* Только тому, кто может править. */
  form: { birthday: string | null; birthdayYearHidden: boolean; status: Status } | null;
}

export interface ProfilePatch {
  name?: string;
  position?: string | null;
  department?: string | null;
  phone?: string | null;
  messengers?: Messengers;
  about?: string | null;
  birthday?: string | null;
  birthdayYearHidden?: boolean;
  status?: Status | null;
}

export const MESSENGERS: { key: keyof Messengers; label: string; placeholder: string; href: (v: string) => string | null }[] = [
  { key: "telegram", label: "Telegram", placeholder: "@ник или ссылка t.me", href: (v) => `https://t.me/${encodeURIComponent(v)}` },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+7 900 000-00-00", href: (v) => `https://wa.me/${v.replace(/\D/g, "")}` },
  { key: "max", label: "MAX", placeholder: "Ник или телефон", href: () => null },
  { key: "vk", label: "ВКонтакте", placeholder: "Ник или ссылка vk.com", href: (v) => `https://vk.com/${encodeURIComponent(v)}` },
];

export const STATUSES: { emoji: string; text: string }[] = [
  { emoji: "🌴", text: "В отпуске" },
  { emoji: "🤒", text: "На больничном" },
  { emoji: "🏠", text: "Работаю из дома" },
  { emoji: "✈️", text: "В командировке" },
  { emoji: "📅", text: "На встречах" },
  { emoji: "🎧", text: "Не беспокоить" },
];

/* Картинка аватара нужного размера: на экранах с плотными пикселями — вдвое крупнее. */
export function avatarSrc(avatar: string | null | undefined, px: number) {
  if (!avatar) return null;
  const need = px * Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const size = [64, 128, 256, 512].find((one) => one >= need) ?? 512;
  return apiUrl(`${avatar}/${size}`);
}

/* Свежий профиль кладём и в общий список людей: аватар сразу везде. */
function remember(profile: Profile) {
  const known = people.get(profile.id);
  const card: ChatUser = { ...(known ?? {}), id: profile.id, name: profile.name, email: profile.email, role: profile.role, initials: profile.initials, position: profile.position, department: profile.department, active: profile.active, fired: profile.fired, hue: profile.hue, avatar: profile.avatar, status: profile.status, birthday: profile.birthday };
  people.set(profile.id, card);
  if (auth.me && auth.me.id === profile.id) Object.assign(auth.me, { name: profile.name, initials: profile.initials, avatar: profile.avatar, position: profile.position });
  return profile;
}

export const fetchProfile = async (id: number) => remember(await api<Profile>("GET", `profiles/${id}`));
export const saveProfile = async (id: number, patch: ProfilePatch) => remember(await api<Profile>("PATCH", `profiles/${id}`, patch));
export async function uploadAvatar(id: number, image: Blob, onProgress?: (part: number) => void) {
  const form = new FormData();
  form.append("avatar", image, image.type === "image/webp" ? "avatar.webp" : image.type === "image/jpeg" ? "avatar.jpg" : "avatar.png");
  return remember(await upload<Profile>(`profiles/${id}/avatar`, form, onProgress));
}
export const removeAvatar = async (id: number) => remember(await api<Profile>("DELETE", `profiles/${id}/avatar`));
export const changePassword = (current: string, password: string) => api<null>("POST", "profile/password", { current, password, password_confirmation: password });

/* «15 марта», «через 3 дня» — день рождения без года. */
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export function birthdayLabel(md: string | null | undefined) {
  if (!md) return "";
  const [m, d] = md.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export function daysToBirthday(md: string | null | undefined) {
  if (!md) return null;
  const [m, d] = md.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}
export function age(date: string | null | undefined) {
  if (!date) return null;
  const born = new Date(date);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years--;
  return years;
}
