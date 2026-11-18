/* Сборка кита для выкладки: node eokit/tools/build.mjs [--out <папка>]

   В репозитории кит работает без сборки: kit.css подключает стили компонентов
   через @import, kit.js грузит модули по имени. Сборка нужна только для
   выкладки на сервер и делает две вещи:
     1. kit.css — один файл вместо списка @import, без комментариев; пути url()
        переписаны от папки kit.css;
     2. в kit.js вместо `const DEPS = null` — для каждого модуля каталога список
        файлов, которые он импортирует (с вложенными): kit.load ставит им
        <link rel="modulepreload"> разом, и браузер не узнаёт зависимости по
        одной за круг по сети.
   Остальное (JS, шрифты, vendor) копируется как есть. По умолчанию — в eokit/dist/
   (она в .gitignore): её содержимое выкладывается на место папки eokit/. */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const OUT = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : join(KIT, "dist");
const posix = (path) => path.split(sep).join("/");

/* --- CSS ------------------------------------------------------------------- */

/* Комментарии вне строк: «/*» внутри кавычек или url(...) — часть значения. */
export function stripComments(css) {
  let out = "";
  for (let at = 0; at < css.length; ) {
    const ch = css[at];
    if (ch === '"' || ch === "'") {
      let end = at + 1;
      while (end < css.length && css[end] !== ch) end += css[end] === "\\" ? 2 : 1;
      out += css.slice(at, end + 1);
      at = end + 1;
    } else if (ch === "/" && css[at + 1] === "*") {
      const end = css.indexOf("*/", at + 2);
      at = end < 0 ? css.length : end + 2;
    } else {
      out += ch;
      at += 1;
    }
  }
  return out;
}

const IMPORT = /^@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*(layer\(([^)]+)\))?\s*;\s*$/;
const URL_REF = /url\(\s*(["']?)(?!data:|https?:|\/|#)([^"')]+)\1\s*\)/g;

/* Файл стилей с путями url(), переписанными от папки вывода. */
async function inline(file, outDir) {
  const css = await readFile(file, "utf8");
  const from = dirname(file);
  return css.replace(URL_REF, (_, quote, path) => `url("${posix(relative(outDir, resolve(from, path)))}")`);
}

async function bundleCss() {
  const entry = join(KIT, "kit.css");
  const lines = stripComments(await readFile(entry, "utf8")).split("\n");
  const parts = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(IMPORT);
    if (!match) {
      parts.push(line);
      continue;
    }
    const body = await inline(join(KIT, match[1]), KIT);
    parts.push(match[2] ? `@layer ${match[3]} {\n${body}\n}` : body);
  }
  const css = stripComments(parts.join("\n"))
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .join("\n");
  const { version } = await import(pathToFileURL(join(KIT, "kit.js")).href);
  return `/* EOKIT ${version} · собрано tools/build.mjs из kit.css */\n${css}\n`;
}

/* --- JS: зависимости модулей ----------------------------------------------- */

const STATIC_IMPORT = /^\s*(?:import|export)\s[^;]*?\sfrom\s+["'](\.{1,2}\/[^"']+)["']/gm;
const BARE_IMPORT = /^\s*import\s+["'](\.{1,2}\/[^"']+)["']/gm;

async function importsOf(file, seen = new Set()) {
  const source = await readFile(file, "utf8");
  for (const pattern of [STATIC_IMPORT, BARE_IMPORT]) {
    for (const [, spec] of source.matchAll(pattern)) {
      const target = resolve(dirname(file), spec);
      if (seen.has(target)) continue;
      seen.add(target);
      await importsOf(target, seen);
    }
  }
  return seen;
}

async function depsMap() {
  const { catalog } = await import(pathToFileURL(join(KIT, "kit.js")).href);
  const source = await readFile(join(KIT, "kit.js"), "utf8");
  const map = {};
  for (const name of Object.keys(catalog)) {
    const match = source.match(new RegExp(`\\b${name}: \\(\\) => import\\("(\\./[^"]+)"\\)`));
    if (!match) throw new Error(`build: не найден путь модуля «${name}» в kit.js`);
    const file = resolve(KIT, match[1]);
    const files = [file, ...(await importsOf(file))];
    map[name] = [...new Set(files)].map((path) => posix(relative(KIT, path))).sort();
  }
  return map;
}

/* --- Вывод ----------------------------------------------------------------- */

const COPY = ["kit.js", "core", "components", "fonts", "icons3d", "vendor"];

async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const item of COPY) {
    await cp(join(KIT, item), join(OUT, item), {
      recursive: true,
      filter: (path) => !path.endsWith(".css") && !path.endsWith(".md"),
    });
  }
  await writeFile(join(OUT, "kit.css"), await bundleCss());
  const kit = await readFile(join(KIT, "kit.js"), "utf8");
  const marker = "const DEPS = null;";
  if (kit.split(marker).length !== 2) throw new Error(`build: в kit.js нет ровно одной строки «${marker}»`);
  await writeFile(join(OUT, "kit.js"), kit.replace(marker, `const DEPS = ${JSON.stringify(await depsMap())};`));
  const files = (await readdir(OUT, { recursive: true })).length;
  console.log(`eokit/dist: ${files} файлов → ${posix(relative(process.cwd(), OUT)) || "."}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await build();
