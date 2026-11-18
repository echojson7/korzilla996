/* Загрузка файлов: зона принимает файлы, модуль ведёт очередь. Нативный
   <input type="file"> несёт имя, accept, multiple и участие в форме: после каждой
   правки очереди его files — сама очередь. Модуль добавляет то, чего платформа не
   рисует: цель сброса, очередь с удалением файла и отказ, который называет файл и
   причину.

     <div class="ui-file-upload" data-ui-file-upload data-multiple data-max-size="5000000">
       <div class="ui-file-upload__zone">…</div>
       <input class="ui-file-upload__input" type="file" accept="image/*" multiple>
       <p class="ui-file-upload__status" role="status" aria-live="polite"></p>
       <ul class="ui-file-upload__list"></ul>
     </div>

   Список очереди нужен лотку и кнопке; у data-variant="input" его может не быть.

   Зона без своей кнопки — role="button": она может держать подпись, «Выбрать» и
   «Убрать», а кнопка в кнопке — разметка, которую парсер вправе вынести. Enter и
   пробел поэтому — модуля. data-variant="input" — выбранное пишется в саму зону
   (.ui-file-upload__title, «Убрать» — .ui-file-upload__clear), "button" — зона —
   кнопка, очередь чипами (data-list="chips" на списке). data-multiple,
   data-max-size (байты), data-paste — вставка файлов из буфера, пока фокус в
   загрузке; data-loading="true" — выбор, сброс и вставка закрыты (идёт
   отправка). Строки — из словаря кита; data-text-count ("файл|файла|файлов"),
   -empty, -remove, -rejected, -oversized ({limit}) на хосте важнее.

   Хост несёт data-state="filled|empty" и data-status="error|notice" (строка под
   зоной, гаснет через 6 с). file-upload:change { files } — на каждую правку
   очереди; kit("fileUpload").files(host) — очередь, clear(host) — очистить.

   Картинка в очереди показывается собой (адрес у платформы, возвращается вместе со
   строкой), документ — значком. Строки большой пачки строятся кусками
   между кадрами, а рисуются, только когда видны (content-visibility в CSS). */

import { defineComponent } from "../../core/component.js";
import { el, ensureId, labelOf, restore, setAttr, setData, setText, snapshot } from "../../core/dom.js";
import { icon, iconHTML } from "../../core/icons.js";
import { moveIndex } from "../../core/keys.js";
import { messages, numberFormat, plural } from "../../core/locale.js";
import { slice, yieldToMain } from "../../core/schedule.js";
import { readNumber } from "../../core/tokens.js";

const SELECTOR = "[data-ui-file-upload]";
const ROW = "ui-file-upload__row";
const REMOVE = "ui-file-upload__remove";
const CLEAR = ".ui-file-upload__clear";
const STATUS_TIME = 6000;

/* Превью — только растровые картинки. SVG нет намеренно: браузер рисует его вместе
   с чужими скриптами, в списке загрузки это поверхность атаки. */
const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico"]);

const t = messages("fileUpload", {
  ru: {
    count: "файл|файла|файлов",
    empty: "Файл не выбран",
    remove: "Убрать файл",
    rejected: "Файл не подошёл по формату и не был добавлен.",
    oversized: "Файл больше {limit} и не был добавлен.",
    single: "Можно выбрать один файл — добавлен первый",
    pasted: "вставка",
    b: "{n} Б",
    kb: "{n} КБ",
    mb: "{n} МБ",
    gb: "{n} ГБ",
  },
  en: {
    count: "file|files",
    empty: "No file chosen",
    remove: "Remove file",
    rejected: "The file type is not accepted, the file was not added.",
    oversized: "The file is larger than {limit} and was not added.",
    single: "Only one file can be chosen — the first one was added",
    pasted: "pasted",
    b: "{n} B",
    kb: "{n} KB",
    mb: "{n} MB",
    gb: "{n} GB",
  },
});

/* Вставка без фокуса в загрузке идёт сюда, только если такая загрузка одна. */
let pasteHosts = 0;

/* Размеры десятичные, как в файловом менеджере: «1,5 МБ». */
function sizeOf(bytes) {
  if (bytes < 1e3) return t("b", { n: bytes });
  const [value, unit] = bytes < 1e6 ? [bytes / 1e3, "kb"] : bytes < 1e9 ? [bytes / 1e6, "mb"] : [bytes / 1e9, "gb"];
  return t(unit, { n: numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) });
}

/* Плашка — по расширению, а не по MIME: .zip с сетевого диска часто приходит как
   application/octet-stream, а имя не врёт. */
function extOf(name) {
  const at = name.lastIndexOf(".");
  return at > 0 ? name.slice(at + 1).toLowerCase() : "";
}

function accepts(tokens, file) {
  if (!tokens) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/* Снимок из буфера бывает без имени: «вставка-<время>[-n].<тип>». */
function named(file, index) {
  if (file.name) return file;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const ext = (file.type.split("/")[1] || "png").toLowerCase();
  return new File([file], `${t("pasted")}-${stamp}${index ? `-${index + 1}` : ""}.${ext}`, { type: file.type });
}

/* Разметка строки одна на модуль: разбирается раз, дальше клонируется. */
let rowTemplate = null;
function rowClone() {
  if (!rowTemplate) {
    rowTemplate = document.createElement("template");
    rowTemplate.innerHTML = `<li class="${ROW}"><span class="ui-file-upload__media"></span><span class="ui-file-upload__text"><span class="ui-file-upload__name"></span><span class="ui-file-upload__meta"></span></span><button type="button" class="ui-btn ui-btn--ghost ui-btn--icon-sm ${REMOVE}" tabindex="-1">${iconHTML("x")}</button></li>`;
  }
  return rowTemplate.content.firstElementChild.cloneNode(true);
}

function create(host, ctx) {
  const zone = host.querySelector(".ui-file-upload__zone");
  const list = host.querySelector(".ui-file-upload__list");
  const input = host.querySelector("input[type='file']");
  const { dataset } = host;
  /* Вариант «поле» пишет выбранное в саму зону, очереди под ней нет — и списка
     можно не ставить. */
  const field = dataset.variant === "input";
  if (!zone || !input || (!list && !field)) return null;

  const native = zone instanceof HTMLButtonElement;
  const title = field ? zone.querySelector(".ui-file-upload__title") : null;
  const clear = zone.querySelector(CLEAR);
  const hint = host.querySelector(".ui-file-upload__hint");
  const status = host.querySelector(".ui-file-upload__status");
  const saved = {
    host: snapshot(host, ["data-state", "data-status"]),
    zone: snapshot(zone, ["role", "tabindex", "aria-label", "aria-describedby", "aria-invalid", "data-drag"]),
    input: snapshot(input, ["class"]),
    hint: hint && snapshot(hint, ["id"]),
    title: title && [title.textContent, snapshot(title, ["data-empty"])],
    clear: clear && snapshot(clear, ["data-show"]),
    status: status?.textContent,
  };

  input.classList.add("ui-file-upload__input");
  if (!native) {
    if (!zone.hasAttribute("role")) zone.setAttribute("role", "button");
    if (!zone.hasAttribute("tabindex")) zone.tabIndex = 0;
    /* Имя коробки — подпись поля; её длинный текст — не имя. */
    const name = !zone.hasAttribute("aria-label") && labelOf(zone);
    if (name) zone.setAttribute("aria-label", name);
  }
  /* Строка ограничений — описание зоны: инпут браузер не фокусирует. */
  if (hint && !zone.hasAttribute("aria-describedby")) zone.setAttribute("aria-describedby", ensureId(hint, "ui-file-upload-hint"));

  const multiple = input.multiple || "multiple" in dataset;
  const limit = readNumber(dataset.maxSize, 0);
  const maxSize = limit > 0 ? limit : Infinity;
  /* data-text-<ключ> на хосте важнее словаря; пустое значение поля — текст автора. */
  const say = (key, vars) => dataset[`text${key[0].toUpperCase()}${key.slice(1)}`]?.replace("{limit}", vars?.limit) ?? t(key, vars);
  /* Пустое поле — текст автора, иначе словарь на каждой отрисовке (за <html lang>). */
  const authoredEmpty = title?.textContent.trim();
  const emptyText = () => dataset.textEmpty ?? (authoredEmpty || t("empty"));
  const countOf = (count) => `${numberFormat().format(count)} ${plural(count, dataset.textCount || t("count"))}`;
  /* Закрыта — и для нажатия, и для сброса и вставки: во время отправки
     (data-loading) очередь, которую уже шлёт форма, не меняется. */
  const shut = () => dataset.loading === "true" || input.matches(":disabled") || zone.matches(":disabled, [aria-disabled='true']");

  /* Выбранное до старта модуля (форма, вернувшаяся назад) — уже очередь. Форма
     отправляет files инпута — их держит перенос в лад с очередью. Правится он по
     месту: собрать заново на тысячу файлов — десятки миллисекунд. */
  let files = [...input.files];
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  const rows = new Map();
  const owners = new WeakMap();
  const previews = new Map();
  let tabStop = null;
  let building = false;
  let timer = 0;

  const changed = () => ctx.emit("file-upload:change", { files: [...files] });

  /* Одна строка на пачку, а не на файл: статус на каждый файл перебивал бы чтение.
     Гаснет сама вместе с отметкой ошибки: отказ — о той пачке, а не о поле. */
  function announce(text, error = false) {
    clearTimeout(timer);
    if (status) setText(status, text);
    setData(host, "status", text ? (error ? "error" : "notice") : null);
    setAttr(zone, "aria-invalid", error && "true");
    if (text) timer = setTimeout(() => announce(""), STATUS_TIME);
  }

  /* Картинка — собой; документ — значком: тип уже назван расширением в имени,
     цвет по типу был бы шестым тоном на экране. */
  function mediaOf(file) {
    const ext = extOf(file.name);
    if (!IMAGE_TYPES.has(ext)) return icon(ext ? "file-text" : "file");
    const src = URL.createObjectURL(file);
    previews.set(file, src);
    /* Имя несёт соседняя строка; адрес страницы загрузке не нужен. */
    return el("img", { class: "ui-file-upload__preview", src, alt: "", "aria-hidden": "true", referrerpolicy: "no-referrer", decoding: "async", loading: "lazy" });
  }

  function buildRow(file) {
    const row = rowClone();
    const [media, text, remove] = row.children;
    const [name, meta] = text.children;
    name.textContent = file.name;
    /* Многоточие прячет хвост имени — вернуть его можно только подсказкой. */
    name.title = file.name;
    meta.textContent = sizeOf(file.size);
    remove.setAttribute("aria-label", `${say("remove")}: ${file.name}`);
    media.append(mediaOf(file));
    rows.set(file, row);
    owners.set(row, file);
    return row;
  }

  function drop(file, row) {
    row.remove();
    rows.delete(file);
    if (previews.has(file)) URL.revokeObjectURL(previews.get(file));
    previews.delete(file);
  }

  /* Кнопки «убрать» — одна остановка табуляции на очередь, по строкам — стрелки. */
  function keepStop() {
    if (tabStop?.isConnected) return;
    tabStop = list.querySelector(`.${REMOVE}`);
    if (tabStop) tabStop.tabIndex = 0;
  }

  /* Строки — кусками между кадрами: дроп на тысячи файлов не держит поток.
     Построенные строки — всегда начало очереди в её порядке, поэтому новая встаёт
     в конец; после паузы очередь могла измениться — проход заново. */
  async function build() {
    if (building) return;
    building = true;
    const spent = slice();
    for (let at = 0; at < files.length; at += 1) {
      if (rows.has(files[at])) continue;
      list.append(buildRow(files[at]));
      if (!spent()) continue;
      keepStop();
      await yieldToMain();
      if (ctx.signal.aborted) return;
      at = -1;
    }
    keepStop();
    building = false;
  }

  function render() {
    setData(host, "state", files.length ? "filled" : "empty");
    input.files = transfer.files;
    if (field) {
      if (title) {
        setText(title, !files.length ? emptyText() : files.length === 1 ? files[0].name : countOf(files.length));
        setData(title, "empty", !files.length && "true");
      }
      /* До выбора очищать нечего: «Убрать» появляется вместе со значением. */
      if (clear) setAttr(clear, "data-show", files.length > 0);
      return;
    }
    const queued = new Set(files);
    for (const [file, row] of rows) if (!queued.has(file)) drop(file, row);
    build();
  }

  function add(incoming) {
    if (!incoming.length) return render();
    /* accept — на каждую пачку: автор мог сменить его после старта. Фильтр
       совещательный, в окне выбора его держит сам инпут. */
    const accept = input.getAttribute("accept");
    const tokens = accept ? accept.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean) : null;
    const accepted = [];
    const rejected = [];
    const oversized = [];
    for (const file of incoming) {
      if (file.size > maxSize) oversized.push(file);
      else if (accepts(tokens, file)) accepted.push(file);
      else rejected.push(file);
    }
    /* Без multiple файл один: новый заменяет прежний, лишние из пачки — не берём. */
    if (accepted.length) {
      const fresh = multiple ? accepted : accepted.slice(0, 1);
      if (!multiple) transfer.items.clear();
      for (const file of fresh) transfer.items.add(file);
      files = multiple ? [...files, ...fresh] : fresh;
    }
    render();
    if (accepted.length) changed();
    const parts = [];
    if (accepted.length) parts.push(countOf(multiple ? accepted.length : 1));
    if (rejected.length) parts.push(`${say("rejected")} ${rejected[0].name}`);
    if (oversized.length) parts.push(`${say("oversized", { limit: sizeOf(maxSize) })} ${oversized[0].name}`);
    if (!multiple && accepted.length > 1) parts.push(t("single"));
    announce(parts.join(". "), !accepted.length);
  }

  function remove(file) {
    transfer.items.remove(files.indexOf(file));
    files = files.filter((item) => item !== file);
    render();
    changed();
  }

  function clearAll() {
    if (!files.length) return;
    transfer.items.clear();
    files = [];
    render();
    changed();
  }

  const activate = () => shut() || input.click();

  if (!native) {
    ctx.on(zone, "keydown", (event) => {
      /* Enter и пробел — как у нативной кнопки; пробел ещё и прокрутил бы страницу.
         Клавиши вложенной кнопки «Убрать» — её. */
      if (event.target !== zone || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      activate();
    });
  }
  ctx.on(zone, "click", (event) => {
    if (!clear?.contains(event.target)) return activate();
    /* Спрятанная кнопка теряет фокус — он остаётся на зоне. */
    const focused = clear.contains(document.activeElement);
    clearAll();
    if (focused) zone.focus();
  });
  ctx.on(input, "change", () => add([...input.files]));

  /* Перетаскивание: сброс в любом месте загрузки браузер не исполняет (иначе открыл
     бы файл вместо страницы), принимает его только зона. */
  const carries = (event) => !!event.dataTransfer?.types.includes("Files");
  const drag = (on) => setData(zone, "drag", on && "over");
  const over = (event) => {
    if (!carries(event)) return;
    event.preventDefault();
    const inside = zone.contains(event.target) && !shut();
    event.dataTransfer.dropEffect = inside ? "copy" : "none";
    drag(inside);
  };
  ctx.on(host, "dragenter", over);
  ctx.on(host, "dragover", over);
  /* enter и leave приходят на каждого потомка зоны: переход между детьми — не
     уход. Куда ушёл файл, говорит relatedTarget у dragleave, но WebKit его не
     даёт (и никто — при уходе из окна). Тогда решает счёт входов: вход в нового
     потомка приходит раньше ухода из прежнего, и до нуля счёт падает, только
     когда файл покинул зону. */
  let depth = 0;
  const leave = () => {
    depth = 0;
    drag(false);
  };
  ctx.on(zone, "dragenter", (event) => {
    if (carries(event)) depth += 1;
  });
  ctx.on(zone, "dragleave", (event) => {
    if (!carries(event)) return;
    depth -= 1;
    if (event.relatedTarget ? !zone.contains(event.relatedTarget) : depth <= 0) leave();
  });
  ctx.on(host, "drop", (event) => {
    if (!carries(event)) return;
    event.preventDefault();
    leave();
    if (zone.contains(event.target) && !shut()) add([...event.dataTransfer.files]);
  });

  /* Очередь и её кнопки — только там, где есть список. */
  if (list) {
    ctx.on(list, "click", (event) => {
      const row = event.target.closest(`.${REMOVE}`)?.closest(`.${ROW}`);
      const file = row && owners.get(row);
      if (!file) return;
      const focused = row.contains(document.activeElement);
      const next = (row.nextElementSibling ?? row.previousElementSibling)?.querySelector(`.${REMOVE}`);
      remove(file);
      /* Фокус не пропадает с убранной строкой: соседняя или зона. */
      if (focused) (next ?? zone).focus();
    });
    ctx.on(list, "focusin", (event) => {
      const button = event.target.closest(`.${REMOVE}`);
      if (!button || button === tabStop) return;
      if (tabStop) tabStop.tabIndex = -1;
      button.tabIndex = 0;
      tabStop = button;
    });
    ctx.on(list, "keydown", (event) => {
      const buttons = [...list.querySelectorAll(`.${REMOVE}`)];
      const at = buttons.indexOf(event.target);
      if (at === -1) return;
      const next = moveIndex(event, at, buttons.length, { orientation: "both", rtl: list.matches(":dir(rtl)") });
      if (next === null) return;
      event.preventDefault();
      buttons[next].focus();
    });
  }

  if ("paste" in dataset) {
    pasteHosts += 1;
    ctx.cleanup(() => (pasteHosts -= 1));
    ctx.on(document, "paste", (event) => {
      /* Вставка — в загрузку, где фокус; без фокуса — если загрузка со вставкой
         одна. Вставка в поле ввода принадлежит полю. */
      const active = document.activeElement;
      const mine = host.contains(active) || ((!active || active === document.body) && pasteHosts === 1);
      const picked = mine && !shut() ? [...(event.clipboardData?.files ?? [])] : [];
      if (!picked.length) return;
      event.preventDefault();
      add(picked.map(named));
    });
  }
  /* Сброс формы очищает и инпут, и очередь. */
  if (input.form) {
    ctx.on(input.form, "reset", () => {
      clearAll();
      announce("");
    });
  }
  render();

  return {
    host,
    get files() {
      return [...files];
    },
    clear: clearAll,
    destroy() {
      clearTimeout(timer);
      for (const [file, row] of rows) drop(file, row);
      restore(host, saved.host);
      restore(zone, saved.zone);
      restore(input, saved.input);
      if (hint) restore(hint, saved.hint);
      if (title) {
        title.textContent = saved.title[0];
        restore(title, saved.title[1]);
      }
      if (clear) restore(clear, saved.clear);
      if (status) status.textContent = saved.status;
    },
  };
}

export default defineComponent({
  name: "fileUpload",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    files: (host) => get(host)?.files ?? [],
    clear: (host) => void get(host)?.clear(),
  }),
});
