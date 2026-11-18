/* Пересборка объёмных иконок кита: node eokit/tools/icons3d/render.mjs [имя,имя] [--preview папка [px]]
   Без --preview пишет eokit/icons3d/<имя>.webp 128×128 (в интерфейсе до 48 px на ретине).
   С --preview — PNG нужного размера в указанную папку, набор в ките не трогается.
   Иконки описаны в specs/*.mjs: каждый файл отдаёт { имя: spec }. Рендер — three.js
   (vendor/, MIT) в безголовом Chromium с программным WebGL. */
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import(pathToFileURL(join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs")).href)); }

const DIR = fileURLToPath(new URL(".", import.meta.url));
const KIT_ICONS = fileURLToPath(new URL("../../icons3d/", import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf("--preview");
const preview = at >= 0 ? args[at + 1] : null;
const px = preview ? +(args[at + 2] ?? 320) || 320 : 128;
const only = args.find((arg, i) => !arg.startsWith("--") && (at < 0 || (i !== at + 1 && i !== at + 2)))?.split(",");

const specs = {};
for (const file of (await readdir(join(DIR, "specs"))).filter((f) => f.endsWith(".mjs")).sort()) {
  let part;
  /* Файл с ошибкой не останавливает остальные: пока его правят, другие иконки собираются. */
  try { part = (await import(pathToFileURL(join(DIR, "specs", file)).href + "?" + Date.now())).default; }
  catch (error) { console.warn(`specs/${file}: ${error.message}`); continue; }
  for (const name of Object.keys(part)) if (specs[name]) throw new Error(`иконка «${name}» описана дважды (${file})`);
  Object.assign(specs, part);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const server = createServer(async (request, response) => {
  try {
    const path = join(DIR, decodeURIComponent(request.url.split("?")[0]));
    if (!path.startsWith(DIR)) throw new Error();
    const body = await readFile(path);
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch { response.writeHead(404).end(); }
}).listen(0, "127.0.0.1");
await new Promise((done) => server.on("listening", done));

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);
await page.waitForFunction(() => window.ready, null, { timeout: 30000 });

const out = preview ?? KIT_ICONS;
await mkdir(out, { recursive: true });
let count = 0;
for (const [name, spec] of Object.entries(specs)) {
  if (only && !only.includes(name)) continue;
  try {
    const url = await page.evaluate(([s, size, type]) => window.renderIcon(s, size, type), [spec, px, preview ? "image/png" : "image/webp"]);
    await writeFile(join(out, `${name}.${preview ? "png" : "webp"}`), Buffer.from(url.split(",")[1], "base64"));
    count += 1;
  } catch (error) { errors.push(`${name}: ${error.message}`); }
}
await browser.close();
server.close();
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
console.log(`icons3d: ${count} → ${out}`);
