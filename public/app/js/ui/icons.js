/* Иконки админки. Линейные — глифы кита (data-ui-icon); тех, которых в ките нет,
   админка регистрирует через публичный kit("icons").register (контуры Lucide, ISC).
   Объёмные — набор кита (eokit/icons3d), ставятся по имени через data-ui-e3d:
   у страниц и пунктов панели сайта (одно поле icon манифеста на вкладку, палитру,
   панель и шапку) и акцентом на крупном месте — пустое состояние, тариф.
   Линейные — в кнопках, рейке, действиях палитры, строках, плашках, таблицах. */

import { html, raw } from "./html.js";
import { LINE, LINE_ATTRS } from "./line-icons.js";

/* Глифы, которых нет в ките. */
const GLYPHS = {
  "chart-line": '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  newspaper: '<path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>',
  /* Модуль «Контент»: типы полей, редактор, медиатека. */
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  pilcrow: '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  "toggle-right": '<rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="16" cy="12" r="2"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  component: '<path d="M5.5 8.5 9 12l-3.5 3.5L2 12l3.5-3.5Z"/><path d="m12 2 3.5 3.5L12 9 8.5 5.5 12 2Z"/><path d="M18.5 8.5 22 12l-3.5 3.5L15 12l3.5-3.5Z"/><path d="m12 15 3.5 3.5L12 22l-3.5-3.5L12 15Z"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  "calendar-clock": '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  "folder-plus": '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  /* Помощник: следующий вопрос. */
  "corner-down-right": '<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
  /* Помощник: новый разговор. */
  "square-pen": '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
};

export function registerGlyphs(icons) {
  for (const [name, body] of Object.entries(GLYPHS)) icons.register(name, body);
  for (const [name, body] of Object.entries(LINE)) icons.register(`ln-${name}`, body, LINE_ATTRS);
}

/* Замена иконок («Внешний вид → Иконки»): choice — { глиф кита: набор }.
   Глиф меняется в реестре кита — его берут и разметка, и модули кита. Сайдбар
   и «Товары» рисуют Phosphor под ln-<имя>: выбранная замена ставится и туда,
   без замены там остаётся Phosphor. Уже нарисованные иконки перерисовываются. */
const hgNow = new Map();
export async function applyIcons(icons, choice = {}) {
  await icons.apply(choice);
  const changed = [];
  for (const name of Object.keys(LINE)) {
    const glyph = choice[name] ? await icons.glyphOf(name, choice[name]) : null;
    const now = glyph ? choice[name] : "";
    if (hgNow.has(name) && hgNow.get(name) === now) continue;
    if (glyph) icons.register(`ln-${name}`, glyph[0], glyph[1]);
    else icons.register(`ln-${name}`, LINE[name], LINE_ATTRS);
    hgNow.set(name, now);
    changed.push(`ln-${name}`);
  }
  icons.refresh(changed);
}

/* Линейная иконка кита; size — xs (14) | md (18). turn — шеврон раскрытия кита
   (flip | fold): крутится сам по aria-expanded кнопки вокруг. */
export const icon = (name, size = "", { turn, cls } = {}) => raw(`<span class="ui-icon${size ? ` ui-icon--${size}` : ""}${cls ? ` ${cls}` : ""}" data-ui-icon="${name}"${turn ? ` data-ui-turn="${turn}"` : ""} aria-hidden="true"></span>`);

/* Линейная иконка Phosphor (сайдбар, «Товары»): тот же icon() кита под именем
   ln-<имя>; глифа нет в наборе — остаётся глиф кита. */
export const hicon = (name, size = "", opts) => icon(LINE[name] ? `ln-${name}` : name, size, opts);

/* Цветная плитка кита: глиф Phosphor белым на плашке тона (сайдбар — разделы,
   с которыми работают: товары, записи, медиатека). */
export const tile = (name, tone, cls = "") => html`<span class="ui-icon-tile${cls ? ` ${cls}` : ""}" data-tone="${tone}" aria-hidden="true">${hicon(name)}</span>`;

/* Объёмная иконка, px — сторона. Без px размер даёт кит по месту: 20 по умолчанию,
   24 в строке списка, 20 в плотной строке, 64 % коробки. */
export const e3d = (name, px, cls = "") => raw(`<span class="ui-e3d${cls ? ` ${cls}` : ""}" data-ui-e3d="${name}"${px ? ` style="--ui-e3d: ${px}px"` : ""}></span>`);
/* Товар — объёмный предмет в серой коробке 32, вместо фото товара. */
export const productThumb = (product) => raw(`<span class="ui-e3d-box"><span class="ui-e3d" data-ui-e3d="${product.icon}"></span></span>`);

/* Линейная иконка в серой коробке кита: 32, sm — 24, lg — 40. */
export const iconBox = (name, size = "") => raw(`<span class="ui-icon-box${size ? ` ui-icon-box--${size}` : ""}" aria-hidden="true"><span class="ui-icon" data-ui-icon="${name}"></span></span>`);

/* Логотип сервиса из media/brands: 32, sm — 20. Знак на прозрачном или белом фоне —
   на белой подложке кита с рамкой; иконка-плитка, у которой свой цветной квадрат, —
   во весь аватар, его скругление срезает её углы: плитка в подложке выглядит
   квадратом в квадрате. */
const TILES = new Set(["2gis", "glavred", "google-analytics", "google-pagespeed", "indexnow", "liveinternet", "pr-cy", "schema-org", "vk", "yandex-products", "yandex-speller", "yandex-wordstat"]);
export const isTile = (id) => TILES.has(id);
export const logo = (id, size = "lg") => raw(`<span class="ui-avatar ui-avatar--${size}${TILES.has(id) ? "" : " ui-avatar--logo"}" aria-hidden="true"><img src="./media/brands/${id}.svg" alt="" decoding="async"></span>`);

export const avatar = (person, size = "") =>
  person ? html`<span class="ui-avatar${size ? ` ui-avatar--${size}` : ""}" data-tone="${person.tone}" title="${person.name}">${person.initials}</span>` : "";
