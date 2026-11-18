/* Иконки кита. Глиф хранится телом контура; готовый <svg> собирается один раз и
   дальше клонируется — ни DOMParser, ни наблюдателя за документом.

     icon("check")                         → <svg class="ui-icon" aria-hidden="true">
     icon("x", { className: "ui-icon ui-icon--xs", label: "Закрыть" })
     iconHTML("check")                     → строка для шаблонов
     hydrate(root)                         — span[data-ui-icon] из разметки → <svg>
     register("brand", "<path d='…'/>", { viewBox: "0 0 32 32" })
     e3d("house", { px: 24 })              → <img class="ui-e3d"> объёмной иконки
     e3dHTML("house")                      → строка для шаблонов
     hydrate(root)                         — span[data-ui-e3d] из разметки → <img>

   Залитый знак (заливка не none и не currentColor) получает ui-icon--art и
   stroke none: обводка currentColor его портит. id и url(#…) внутри глифа на
   каждой иконке свои. */

import { glyphs } from "./glyphs.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const NAME = /^[a-z][a-z0-9-]*$/;
const SHELL = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" };
/* Атрибуты хоста, которые на <svg> не переносятся. */
const SKIP = new Set(["width", "height", "size"]);

const sources = new Map(Object.entries(glyphs));
const prepared = new Map();
/* Готовые <svg>: hydrate их не трогает, иначе класс удвоится, а тело пересоберётся. */
const done = new WeakSet();
let seq = 0;

function prepare(name) {
  let glyph = prepared.get(name);
  if (glyph) return glyph;
  const source = sources.get(name);
  if (source == null) return null;
  const [body, own] = Array.isArray(source) ? source : [source, null];
  const attrs = { ...SHELL, ...own };
  const template = document.createElement("template");
  template.innerHTML = `<svg xmlns="${SVG_NS}" ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(" ")}>${body}</svg>`;
  const svg = template.content.firstElementChild;
  const art = !!svg.querySelector("[fill]:not([fill='none']):not([fill='currentColor'])");
  if (art) {
    svg.setAttribute("stroke", "none");
    svg.setAttribute("stroke-width", "0");
  }
  glyph = { svg, art, refs: /\bid=|url\(#/.test(body), html: null };
  prepared.set(name, glyph);
  return glyph;
}

function uniqueRefs(node, prefix) {
  const id = node.getAttribute("id");
  if (id) node.setAttribute("id", prefix + id);
  for (const attr of node.attributes) {
    if (attr.value.includes("url(#")) attr.value = attr.value.replace(/url\(#([^)]+)\)/g, (_, ref) => `url(#${prefix}${ref})`);
  }
  for (const child of node.children) uniqueRefs(child, prefix);
}

function label(svg, text) {
  if (text) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", text);
    svg.removeAttribute("aria-hidden");
  } else if (!svg.hasAttribute("aria-label") && !svg.hasAttribute("aria-labelledby") && svg.getAttribute("role") !== "img") {
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
  } else {
    svg.setAttribute("role", "img");
    svg.removeAttribute("aria-hidden");
  }
}

export const has = (name) => sources.has(name);
export const names = () => [...sources.keys()].sort();

export function register(name, body, attrs = null) {
  if (!NAME.test(name) || typeof body !== "string") return false;
  sources.set(name, attrs ? [body, attrs] : body);
  prepared.delete(name);
  return true;
}

export function icon(name, { className = "ui-icon", label: text = "" } = {}) {
  const glyph = prepare(name);
  if (!glyph) return null;
  const svg = glyph.svg.cloneNode(true);
  if (glyph.refs) uniqueRefs(svg, `ui-icon-${(seq += 1)}-`);
  svg.setAttribute("class", glyph.art ? `${className} ui-icon--art` : className);
  svg.dataset.uiIcon = name;
  label(svg, text);
  done.add(svg);
  return svg;
}

/* Строка для шаблонов (innerHTML): глифы с id сюда не годятся — им нужен icon(). */
export function iconHTML(name, className = "ui-icon") {
  const glyph = prepare(name);
  if (!glyph) return "";
  glyph.html ??= glyph.svg.outerHTML.replace(/^<svg /, '<svg aria-hidden="true" focusable="false" data-ui-icon="__name__" ');
  return glyph.html.replace("__name__", name).replace(/^<svg /, `<svg class="${glyph.art ? `${className} ui-icon--art` : className}" `);
}

/* Объёмные иконки лежат в ките, в icons3d/, и ставятся по имени, как линейные.
   Путь и формат файлов знает только этот модуль: заменили файл в icons3d/ —
   новый подхватят и админка, и витрина. */
const E3D_DIR = new URL("../icons3d/", import.meta.url);
const E3D_EXT = "webp";
export const e3dSrc = (name) => new URL(`${name}.${E3D_EXT}`, E3D_DIR).href;

export function e3d(name, { className = "ui-e3d", px } = {}) {
  const img = document.createElement("img");
  img.className = className;
  img.src = e3dSrc(name);
  img.alt = "";
  img.decoding = "async";
  img.dataset.uiE3d = name;
  if (px) img.style.setProperty("--ui-e3d", `${px}px`);
  done.add(img);
  return img;
}

export const e3dHTML = (name, className = "ui-e3d") => `<img class="${className}" src="${e3dSrc(name)}" alt="" decoding="async" data-ui-e3d="${name}">`;

/* span[data-ui-e3d] заменяется на <img> с его атрибутами (класс ui-e3d добавляется);
   у <img data-ui-e3d> без src src ставится на месте. */
function hydrate3d(root) {
  const hosts = root.nodeType === 1 && root.matches("[data-ui-e3d]") ? [root] : [...(root.querySelectorAll?.("[data-ui-e3d]") ?? [])];
  for (const host of hosts) {
    if (done.has(host)) continue;
    const name = host.getAttribute("data-ui-e3d").trim();
    if (host.tagName === "IMG") {
      if (!host.getAttribute("src")) host.src = e3dSrc(name);
      done.add(host);
      continue;
    }
    const img = e3d(name);
    for (const attr of host.attributes) {
      if (SKIP.has(attr.name)) continue;
      if (attr.name === "class") img.className = ["ui-e3d", ...attr.value.split(/\s+/)].filter((c, at, all) => c && all.indexOf(c) === at).join(" ");
      else img.setAttribute(attr.name, attr.value);
    }
    host.replaceWith(img);
  }
}

/* Хост из разметки — span (или любой не-svg) с data-ui-icon: заменяется на <svg> с
   его атрибутами. Хост-<svg> заполняется на месте. <option> несёт имя как данные
   для селекта — не трогаем. */
export function hydrate(root = document) {
  hydrate3d(root);
  const hosts = root.nodeType === 1 && root.matches("[data-ui-icon]") ? [root] : [...(root.querySelectorAll?.("[data-ui-icon]") ?? [])];
  for (const host of hosts) {
    if (done.has(host) || host.tagName === "OPTION") continue;
    /* <svg> из iconHTML уже собран — только отметить. */
    if (host instanceof SVGSVGElement && host.firstElementChild) {
      done.add(host);
      continue;
    }
    const name = host.getAttribute("data-ui-icon").trim();
    const svg = icon(name);
    if (!svg) continue;
    if (host instanceof SVGSVGElement) {
      for (const attr of svg.attributes) if (!host.hasAttribute(attr.name) || attr.name === "class") host.setAttribute(attr.name, attr.name === "class" ? `${host.getAttribute("class") ?? ""} ${attr.value}`.trim() : attr.value);
      host.replaceChildren(...svg.childNodes);
      label(host);
      done.add(host);
      continue;
    }
    for (const attr of host.attributes) {
      if (SKIP.has(attr.name)) continue;
      if (attr.name === "class") svg.setAttribute("class", `${attr.value} ${svg.getAttribute("class")}`.split(/\s+/).filter((c, at, all) => c && all.indexOf(c) === at).join(" "));
      else svg.setAttribute(attr.name, attr.value);
    }
    label(svg);
    done.add(svg);
    host.replaceWith(svg);
  }
}
