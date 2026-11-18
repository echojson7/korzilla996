/* Правила кита, которые раньше держались на памяти: node eokit/tools/lint.mjs

   Каждое правило — функция над файлами кита; нарушение печатается с файлом и
   строкой, выход с кодом 1. Почему правило такое — в ARCHITECTURE.md. */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const posix = (path) => path.split(sep).join("/");
const SKIP = new Set(["dist", "tests", "tools", "vendor", "fonts"]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) await walk(join(dir, entry.name), out);
    } else out.push(posix(relative(KIT, join(dir, entry.name))));
  }
  return out;
}

const files = (await walk(KIT)).sort();
const text = new Map(await Promise.all(files.map(async (file) => [file, await readFile(join(KIT, file), "utf8")])));
const css = files.filter((file) => file.endsWith(".css"));
const js = files.filter((file) => file.endsWith(".js"));
const problems = [];
const report = (file, line, message) => problems.push(`${file}:${line}  ${message}`);

/* Строки без комментариев: правило не срабатывает на пояснение, где цитируют
   запретный приём. Переводы строк сохраняются — номера строк верные. */
function code(source, kind) {
  const blank = (match) => match.replace(/[^\n]/g, " ");
  return kind === "css" ? source.replace(/\/\*[\s\S]*?\*\//g, blank) : source.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`])\/\/[^\n]*/g, blank);
}
function each(file, kind, pattern, message) {
  code(text.get(file), kind).split("\n").forEach((line, at) => {
    if (pattern.test(line)) report(file, at + 1, message);
  });
}

/* 1. Литералы цвета — только в токенах. Маска берёт альфу, её #000 — не цвет. */
for (const file of css) {
  if (file === "styles/tokens.css") continue;
  code(text.get(file), "css").split("\n").forEach((line, at) => {
    if (/^\s*(-webkit-)?mask(-image)?\s*:/.test(line) || /radial-gradient|linear-gradient/.test(line) && /\bmask/.test(line)) return;
    if (/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|lab)\((?!\s*from\b)/.test(line)) report(file, at + 1, "литерал цвета вне styles/tokens.css — заведите токен");
  });
}

/* 2. Селекторы, которые пересчитывают стиль всей страницы. */
for (const file of css) {
  each(file, "css", /:root:has\(|body:has\(|html:has\(/, "глобальный :has() пересчитывает стиль всей страницы на любую вставку в body");
  if (file !== "styles/base.css") {
    each(file, "css", /\[class\*=/, "[class*=…] — только в base.css");
    each(file, "css", /(^|,)\s*\*(\s|[,{:]|$)/, "глобальный * — только в base.css (внутри компонента — .ui-x > *)");
  }
}

/* 3. Каждый файл стилей подключён в kit.css ровно один раз, и каждая строка kit.css
   ведёт к файлу. */
const entry = text.get("kit.css");
const imported = [...entry.matchAll(/@import url\("([^"]+)"\)/g)].map((match) => match[1]);
for (const file of css.filter((file) => file !== "kit.css")) {
  const count = imported.filter((path) => path === file).length;
  if (count !== 1) report("kit.css", 1, `${file} подключён ${count} раз`);
}
for (const path of imported) if (!text.has(path)) report("kit.css", 1, `нет файла ${path}`);

/* 4. Зависимости идут вниз: ядро не знает о компонентах, компонент берёт ядро,
   vendor и свою папку. Чужой компонент — только через его публичный модуль и
   только там, где это записано здесь. */
const ALLOWED = {
  "components/table/table-shared.js": ["components/popover/popover.js"],
  "components/filter-builder/filter-builder.js": ["components/select/select.js"],
  "components/repeater/repeater.js": ["components/sortable/sortable.js"],
};
for (const file of js) {
  const imports = [...text.get(file).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']|^\s*import\s+["'](\.{1,2}\/[^"']+)["']/gm)];
  for (const match of imports) {
    const target = posix(relative(KIT, resolve(KIT, dirname(file), match[1] ?? match[2])));
    const line = text.get(file).slice(0, match.index).split("\n").length + 1;
    if (!text.has(target) && !target.startsWith("vendor/")) report(file, line, `импорт несуществующего ${target}`);
    if (file.startsWith("core/") && !target.startsWith("core/")) report(file, line, `ядро импортирует ${target}`);
    if (file.startsWith("components/")) {
      const own = file.split("/").slice(0, 2).join("/");
      const fine = target.startsWith("core/") || target.startsWith("vendor/") || target.startsWith(`${own}/`) || ALLOWED[file]?.includes(target);
      if (!fine) report(file, line, `компонент импортирует чужой ${target} — добавьте в ALLOWED в tools/lint.mjs, если это осознанно`);
    }
  }
}

/* 5. Каталог kit.js: путь каждого модуля существует, и каждый модуль компонента
   (export default defineComponent) есть в каталоге. */
const catalogPaths = [...text.get("kit.js").matchAll(/import\("\.\/([^"]+)"\)/g)].map((match) => match[1]);
for (const path of catalogPaths) if (!text.has(path)) report("kit.js", 1, `каталог ссылается на несуществующий ${path}`);
for (const file of js.filter((file) => file.startsWith("components/"))) {
  const source = text.get(file);
  if (/export default (defineComponent\(|\{\s*name:)/.test(source) && !catalogPaths.includes(file)) report(file, 1, "модуль компонента не в каталоге kit.js");
}

/* 6. Отладка не уходит в кит. */
for (const file of js) each(file, "js", /\bconsole\.log\(|\bdebugger\b/, "console.log или debugger");

/* 7. Цель по браузерам (README): Chrome и Edge 117+, Safari 17.5+, Firefox 129+.
   Свойства новее цели — только с запасным видом через @supports. */
const NEWER = [
  [/anchor-name|position-anchor|position-area/, "якорное позиционирование (нет в Safari 17 и Firefox)"],
  [/@scope\b/, "@scope (нет в Firefox 129)"],
  [/\bcalc-size\(/, "calc-size() (только Chromium)"],
  [/(^|[\s:(])if\(/, "if() в CSS (только Chromium)"],
];
for (const file of css) {
  const lines = code(text.get(file), "css").split("\n");
  let guarded = 0;
  lines.forEach((line, at) => {
    if (/@supports/.test(line)) guarded = 1;
    for (const [pattern, message] of NEWER) if (pattern.test(line) && !guarded) report(file, at + 1, message);
    if (guarded && /^\}/.test(line)) guarded = 0;
  });
}

/* 8. Отступы — по шкале (tokens.css, «Отступы»): до 16 шаг 2, дальше шаг 4, плюс
   1 px — компенсация линии. Проверяются padding, margin, gap и переменные
   отступов (--…-pad, -gap, -px, -py, -indent) в ките, admin2 и витрине: шкала
   общая, и заплатка «9px» в приложении ломает ритм так же, как в ките.
   Число, выведенное из размеров, пишется формулой из чисел шкалы. */
const onScale = (n) => n === 1 || (n <= 16 && n % 2 === 0) || n % 4 === 0;
const SPACING = /(?:^|[;{\s])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?|--[a-z0-9-]+-(?:pad|gap|px|py|indent)(?:-[a-z0-9]+)?)\s*:\s*([^;}]+)/g;
async function walkCss(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) { if (!["dist", "node_modules", "vendor", "fonts", "media"].includes(entry.name)) await walkCss(join(dir, entry.name), out); }
    else if (entry.name.endsWith(".css")) out.push(join(dir, entry.name));
  }
  return out;
}
const APPS = [...await walkCss(resolve(KIT, "../admin2")), ...await walkCss(resolve(KIT, "../showcase"))];
const spacingFiles = [...css.map((file) => [file, text.get(file)]), ...await Promise.all(APPS.map(async (path) => [posix(relative(resolve(KIT, ".."), path)), await readFile(path, "utf8")]))];
for (const [file, source] of spacingFiles) {
  code(source, "css").split("\n").forEach((line, at) => {
    for (const match of line.matchAll(SPACING)) {
      const off = [...match[2].matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((value) => Math.abs(Number(value[1]))).filter((n) => !onScale(n));
      if (off.length) report(file, at + 1, `${match[1]}: ${off.join(", ")}px вне шкалы отступов — шаг шкалы или формула (tokens.css, «Отступы»)`);
    }
  });
}

/* 9. Табличных цифр нет нигде — решение владельца (base.css). */
for (const [file, source] of spacingFiles) {
  code(source, "css").split("\n").forEach((line, at) => {
    if (/tabular-nums|["']tnum["']/.test(line)) report(file, at + 1, "табличные цифры (tabular-nums, tnum) не используются — решение владельца");
  });
}

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\nнарушений: ${problems.length}`);
  process.exit(1);
}
console.log(`правила кита соблюдены: ${css.length} файлов стилей, ${js.length} модулей`);
