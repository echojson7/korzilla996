/* Телефоны, почта, сайты клиента: ссылки и подписи видов, как в Битрикс24. */
import type { Contact } from "../../lib/crm";

export const tel = (value: string) => `tel:${value.replace(/[^\d+]/g, "")}`;
export const mail = (value: string) => `mailto:${value.trim()}`;
export const site = (value: string) => (/^https?:/i.test(value) ? value : `https://${value}`);
export const siteText = (value: string) => value.replace(/^https?:\/\//i, "").replace(/\/$/, "");

const KINDS: Record<string, string> = {
  WORK: "рабочий", MOBILE: "мобильный", HOME: "домашний", FAX: "факс", PAGER: "пейджер", MAILING: "для рассылок",
  OTHER: "другой", TELEGRAM: "Telegram", WHATSAPP: "WhatsApp", VIBER: "Viber", VK: "ВКонтакте", FACEBOOK: "Facebook", INSTAGRAM: "Instagram",
};
export const kindOf = (one: Contact) => KINDS[(one.type ?? "").toUpperCase()] ?? "";

export function copy(text: string, done: () => void) {
  navigator.clipboard?.writeText(text).then(done, () => undefined);
}
