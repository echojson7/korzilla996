/* Наборы иконок на замену глифам кита — icon-sets/*.json.

     node eokit/tools/icon-sets.mjs <папка @iconify-json>

   Папка — node_modules/@iconify-json с пакетами lucide, hugeicons, tabler, ph,
   iconoir, solar (npm i @iconify-json/…; в репозиторий пакеты не кладутся, только
   то, что из них взято). Для каждого глифа кита из SLOTS берётся первое имя
   из списка кандидатов, которое есть в наборе; нет ни одного — в наборе этого
   глифа нет, и выбрать его на замену нельзя.

   Набор kit — сами глифы кита (core/glyphs.js): им сервер рисует иконку, которую
   никто не менял, и ими кит возвращает глиф, когда замену сняли.

   Тело глифа — как в наборе, со своей толщиной линии. Tabler рисует линией 2 —
   она сводится к 1.75, как у глифов кита (icons.css): рядом с ними двойка
   выглядит жирной. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { glyphs } from "../core/glyphs.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "icon-sets");
const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("Нужна папка @iconify-json: node eokit/tools/icon-sets.mjs node_modules/@iconify-json");
  process.exit(1);
}

/* Наборы по порядку на экране. pack — пакет @iconify-json, suffix — вариант
   начертания в имени (у Solar линейный — «-linear»). */
const SETS = [
  { id: "kit", name: "Lucide", note: "Набор кита", author: "Lucide Contributors", license: "ISC", url: "https://lucide.dev" },
  { id: "hugeicons", pack: "hugeicons", name: "Hugeicons", note: "Stroke Rounded", author: "Hugeicons", license: "MIT", url: "https://hugeicons.com" },
  { id: "tabler", pack: "tabler", name: "Tabler", note: "Outline", author: "Paweł Kuna", license: "MIT", url: "https://tabler.io/icons", stroke: ["2", "1.75"] },
  { id: "phosphor", pack: "ph", name: "Phosphor", note: "Regular", author: "Phosphor Icons", license: "MIT", url: "https://phosphoricons.com" },
  { id: "iconoir", pack: "iconoir", name: "Iconoir", note: "Regular", author: "Luca Burgio", license: "MIT", url: "https://iconoir.com" },
  { id: "solar", pack: "solar", name: "Solar", note: "Linear", author: "480 Design", license: "CC BY 4.0", url: "https://www.figma.com/community/file/1166831539721848736", suffix: "-linear" },
];

/* Глиф кита → кандидаты: [hugeicons, tabler, phosphor, iconoir, solar].
   Строка — одно имя, массив — по порядку предпочтения. */
const SLOTS = {
  /* Магазин */
  "shopping-cart": ["shopping-cart-01", "shopping-cart", "shopping-cart-simple", "cart", "cart-large-2"],
  "shopping-bag": ["shopping-bag-01", "shopping-bag", "bag-simple", "shopping-bag", ["bag-4", "bag"]],
  heart: ["favourite", "heart", "heart", "heart", "heart"],
  star: ["star", "star", "star", "star", "star"],
  tag: ["tag-01", "tag", "tag", "label", ["tag-horizontal", "tag"]],
  truck: ["delivery-truck-01", "truck", "truck", "delivery-truck", ["delivery", "bus"]],
  package: ["package", "package", "package", ["package", "box-iso"], "box"],
  store: ["store-01", "building-store", "storefront", "shop", ["shop", "shop-2"]],
  "credit-card": ["credit-card", "credit-card", "credit-card", "credit-card", "card"],
  banknote: ["money-02", "cash-banknote", "money", ["cash", "money-square"], ["banknote", "banknote-2", "wad-of-money"]],
  warehouse: ["warehouse", "building-warehouse", "warehouse", "building", "garage"],

  /* Навигация */
  "chevron-down": ["arrow-down-01", "chevron-down", "caret-down", "nav-arrow-down", "alt-arrow-down"],
  "chevron-up": ["arrow-up-01", "chevron-up", "caret-up", "nav-arrow-up", "alt-arrow-up"],
  "chevron-left": ["arrow-left-01", "chevron-left", "caret-left", "nav-arrow-left", "alt-arrow-left"],
  "chevron-right": ["arrow-right-01", "chevron-right", "caret-right", "nav-arrow-right", "alt-arrow-right"],
  "chevrons-up-down": ["unfold-more", "selector", "caret-up-down", ["sort", "data-transfer-both"], ["sort-vertical", "round-sort-vertical"]],
  "arrow-left": ["arrow-left-02", "arrow-left", "arrow-left", "arrow-left", "arrow-left"],
  "arrow-right": ["arrow-right-02", "arrow-right", "arrow-right", "arrow-right", "arrow-right"],
  "arrow-up-right": ["arrow-up-right-01", "arrow-up-right", "arrow-up-right", "arrow-up-right", "arrow-right-up"],
  "external-link": ["link-square-02", "external-link", "arrow-square-out", "open-new-window", "square-arrow-right-up"],
  menu: ["menu-01", "menu-2", "list", "menu", "hamburger-menu"],
  house: ["home-01", "home", "house", "home-simple", ["home-2", "home"]],

  /* Действия */
  plus: ["plus-sign", "plus", "plus", "plus", ["add", "add-circle"]],
  minus: ["minus-sign", "minus", "minus", "minus", ["minus", "minus-circle"]],
  x: ["cancel-01", "x", "x", "xmark", ["close", "close-circle"]],
  check: ["tick-02", "check", "check", "check", ["check", "check-circle"]],
  search: ["search-01", "search", "magnifying-glass", "search", "magnifer"],
  pencil: ["pencil-edit-02", "pencil", "pencil-simple", "edit-pencil", ["pen", "pen-2"]],
  copy: ["copy-01", "copy", "copy", "copy", "copy"],
  trash: ["delete-02", "trash", "trash", "trash", "trash-bin-trash"],
  download: ["download-04", "download", "download-simple", "download", "download-minimalistic"],
  upload: ["upload-04", "upload", "upload-simple", "upload", "upload-minimalistic"],
  "refresh-cw": ["refresh", "refresh", "arrows-clockwise", "refresh", "refresh"],
  link: ["link-01", "link", "link", "link", ["link", "link-minimalistic"]],
  printer: ["printer", "printer", "printer", "printing-page", ["printer", "printer-minimalistic"]],
  send: ["sent", "send", "paper-plane-tilt", "send", "plain"],

  /* Интерфейс */
  settings: ["settings-01", "settings", "gear", "settings", "settings"],
  ellipsis: ["more-horizontal", "dots", "dots-three", "more-horiz", "menu-dots"],
  filter: ["filter", "filter", "funnel", "filter", "filter"],
  eye: ["view", "eye", "eye", "eye", "eye"],
  "eye-off": ["view-off", "eye-off", "eye-slash", "eye-closed", "eye-closed"],
  bell: ["notification-03", "bell", "bell", "bell", "bell"],
  lock: ["square-lock-02", "lock", "lock", "lock", ["lock-keyhole", "lock"]],
  sun: ["sun-03", "sun", "sun", "sun-light", ["sun-2", "sun"]],
  moon: ["moon-02", "moon", "moon", "half-moon", "moon"],

  /* Люди и связь */
  user: ["user", "user", "user", "user", ["user-rounded", "user"]],
  users: ["user-group", "users", "users", "group", "users-group-rounded"],
  phone: ["call", "phone", "phone", "phone", ["phone", "phone-rounded"]],
  mail: ["mail-01", "mail", "envelope-simple", "mail", "letter"],
  "map-pin": ["location-01", "map-pin", "map-pin", "map-pin", "map-point"],
  "message-circle-more": ["bubble-chat", "message-circle", "chat-circle-dots", "chat-bubble", "chat-round-dots"],
  calendar: ["calendar-03", "calendar", "calendar-blank", "calendar", "calendar"],
  clock: ["clock-01", "clock", "clock", "clock", "clock-circle"],

  /* Статусы */
  info: ["information-circle", "info-circle", "info", "info-circle", "info-circle"],
  "circle-alert": ["alert-circle", "alert-circle", "warning-circle", "warning-circle", "danger-circle"],
  "circle-check": ["checkmark-circle-02", "circle-check", "check-circle", "check-circle", "check-circle"],
  "circle-x": ["cancel-circle", "circle-x", "x-circle", "xmark-circle", "close-circle"],
  "triangle-alert": ["alert-02", "alert-triangle", "warning", "warning-triangle", "danger-triangle"],
  "circle-help": ["help-circle", "help-circle", "question", "help-circle", "question-circle"],

  /* Файлы */
  file: ["file-01", "file", "file", "page", ["file", "document"]],
  "file-text": ["file-02", "file-text", "file-text", "page", ["document-text", "file-text"]],
  folder: ["folder-01", "folder", "folder", "folder", "folder"],
  image: ["image-01", "photo", "image", "media-image", "gallery"],
  camera: ["camera-01", "camera", "camera", "camera", ["camera", "camera-minimalistic"]],
};

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
mkdirSync(OUT, { recursive: true });

/* Иконка набора по имени; алиас без поворотов и отражений — тело родителя. */
function lookup(data, name) {
  if (data.icons[name]) return data.icons[name];
  const alias = data.aliases?.[name];
  if (alias && !alias.rotate && !alias.hFlip && !alias.vFlip) return lookup(data, alias.parent);
  return null;
}

const index = [];
const report = [];
for (const [at, set] of SETS.entries()) {
  const icons = {};
  let viewBox = "0 0 24 24";
  if (set.id === "kit") {
    for (const name of Object.keys(SLOTS)) {
      const glyph = glyphs[name];
      if (glyph == null) throw new Error(`В ките нет глифа ${name}`);
      icons[name] = Array.isArray(glyph) ? glyph[0] : glyph;
    }
  } else {
    const data = read(join(SOURCE, set.pack, "icons.json"));
    const size = [data.width ?? 16, data.height ?? 16];
    viewBox = `0 0 ${size[0]} ${size[1]}`;
    for (const [name, choices] of Object.entries(SLOTS)) {
      const list = [choices[at - 1]].flat();
      const found = list.map((one) => [one, lookup(data, one + (set.suffix ?? ""))]).find(([, icon]) => icon);
      if (!found) {
        report.push(`${set.id}: нет ${name} (${list.join(", ")})`);
        continue;
      }
      const [, icon] = found;
      if ((icon.width ?? size[0]) !== size[0] || (icon.height ?? size[1]) !== size[1]) {
        report.push(`${set.id}: ${name} другого размера, пропущен`);
        continue;
      }
      let body = icon.body;
      if (set.stroke) body = body.replaceAll(`stroke-width="${set.stroke[0]}"`, `stroke-width="${set.stroke[1]}"`);
      icons[name] = body;
    }
  }
  /* Корень svg: тело несёт свою заливку и обводку; залитому знаку (Phosphor)
     обводка кита по контуру только утолщает линии. */
  const attrs = viewBox === "0 0 24 24" ? {} : { viewBox };
  if (set.id === "phosphor") attrs.stroke = "none";
  const { pack, suffix, stroke, ...meta } = set;
  writeFileSync(join(OUT, `${set.id}.json`), `${JSON.stringify({ ...meta, attrs, icons })}\n`);
  index.push({ ...meta, count: Object.keys(icons).length });
}
writeFileSync(join(OUT, "index.json"), `${JSON.stringify({ slots: Object.keys(SLOTS), sets: index }, null, 2)}\n`);
console.log(index.map((set) => `${set.id}: ${set.count}`).join("\n"));
if (report.length) console.log(`\n${report.join("\n")}`);
