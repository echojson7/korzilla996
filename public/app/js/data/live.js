/* Данные сайта вместо демо.

   Админка лежит на сайте korzillaX, и если администратор вошёл (экран входа
   admin2 или /admin-old — сессия одна), движок отдаёт данные сайта:
     /admin-old/live       — разделы, записи компонентов, медиатека, команда;
     /admin-old/shop/live  — заказы и покупатели (если у сайта включён магазин).
   Пришедшее встаёт на место демо: разделы — useLiveSections, записи и
   медиатека — useLiveContent, заказы и покупатели — useLive; «сейчас» админки
   становится настоящим. Чего у сайта нет, остаётся демо.

   Экраны, переехавшие на API движка (/admin/api/v1, js/data/api.js),
   читают и пишут через него сами; bootstrap отсюда даёт им токен формы,
   а админке — права вошедшего. Сессия у API и у /admin-old одна, поэтому
   bootstrap идёт после чтений /admin-old: их ответ ставит куку и на путь API.

   Не вошли, другой хост, ошибка сети — всё демо, без сообщений: это обычный
   режим витрины. */

import { NOW, ME, useLiveSections } from "./fixtures.js";
import { useLiveContent } from "./content.js";
import { useLive } from "./orders.js";
import { bootstrap } from "./api.js";
import { legacyGet } from "./source.js";

/* Отпечаток данных сайта: сколько чего и когда менялось последний раз. Правки
   в браузере хранятся под ним, отдельно от демо, и начинаются заново, когда
   данные сайта поменялись. */
function fingerprint(core, shop) {
  const stamps = [...core.objects.map((object) => object.values.updated_at ?? ""), ...core.media.map((file) => file.created_at ?? ""), ...(shop?.orders ?? []).map((order) => order.events.at(-1)?.at ?? "")];
  const last = stamps.sort().at(-1) ?? "";
  return `${core.sections.length}-${core.objects.length}-${core.media.length}-${shop?.orders.length ?? 0}-${last.replace(/\D/g, "").slice(0, 14)}`;
}

/* null — данных сайта нет, админка на демо. */
export async function loadLive() {
  const [core, shop] = await Promise.all([legacyGet("/admin-old/live"), legacyGet("/admin-old/shop/live")]);
  if (!core) return null;
  const engine = await bootstrap();

  NOW.setTime(Date.now());
  useLiveSections(core.sections);
  useLiveContent(core);
  if (shop) useLive(shop);
  if (core.me) {
    ME.name = core.me.name;
    ME.initials = core.me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
  }
  /* Права — с сервера: роль «администратор» не видит того, что сервер ей
     всё равно не дал бы сделать. */
  if (engine) ME.permissions = engine.me.permissions;

  return { site: core.site, key: `live.${core.site.login}.${fingerprint(core, shop)}` };
}
