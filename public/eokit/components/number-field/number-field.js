/* Числовое поле: нативный <input type="number"> и две кнопки шага, которых
   платформа не рисует. Значение, клавиатура, форма и доступность — у инпута;
   кнопки шагают его же stepUp/stepDown, поэтому границы, база шага и дробная
   точность у них те же, что у стрелок. PageUp и PageDown — десять шагов.

     <div class="ui-field">
       <span class="ui-field__label">Количество</span>
       <div data-ui-number-field data-name="qty" data-min="1" data-max="42" data-step="1" data-value="2"></div>
     </div>

   data-name/min/max/step/value переходят на инпут, data-size="sm" — малое,
   data-layout="end" — обе кнопки справа, data-disabled — недоступно, data-label —
   имя, если у поля нет подписи. Свои инпут и кнопки (.ui-number-field__input,
   .ui-number-field__step--dec/--inc) модуль берёт как есть. Кнопка, которой шагать
   некуда (граница, поле недоступно или только для чтения), — aria-disabled;
   disabled и readOnly, поставленные из кода, модуль видит сам.
   Введённое за границей прижимается к ней, когда поле отдаёт значение (change).

   Значение показывает слой бегущих цифр: шаг читается как прокрутка изменившихся
   разрядов. Слой — только показ (внутри <input> часть текста не анимировать);
   каретка, выделение и ввод — у инпута под ним, его текст на время показа
   прозрачен. Слой пишет value — с точкой. Браузер с запятой в локали показывает
   в самом поле «3,5»; слой закрывает её точкой — знаков столько же, и каретка
   стоит под тем же разрядом.

   Значение, записанное в поле из кода без события input, покажет
   kit("numberField").refresh(host). */

import { defineComponent } from "../../core/component.js";
import { afterReset, el, ensureId, isPress, labelOf, restore, setAttr, snapshot } from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";
import { observeSize } from "../../core/observe.js";

const SELECTOR = "[data-ui-number-field]";

/* Полоса разряда — двенадцать слотов [9, 0…9, 0]: крайние дают 9→0 и 0→9 одним
   шагом, а не прокруткой через девять цифр. Канонический слот цифры d — d + 1;
   крайние временные и сбрасываются перед следующей сменой цифры (сброс невидим). */
const DIGIT_SLOTS = 12;
const SLOT_PITCH = 100 / DIGIT_SLOTS;

const VALUE_CLASS = "ui-number-field__value";
const VALUE_DIGITS_CLASS = "ui-number-field__value--digits";
const DIGITS_CLASS = "ui-number-field__digits";
const DIGITS_INSTANT_CLASS = "ui-number-field__digits--instant";
const DIGIT_CLASS = "ui-number-field__digit";

/* Удержание: шаг, затем повтор с задержкой и частотой. */
const HOLD_DELAY = 400;
const HOLD_INTERVAL = 60;
const PAGE_STEPS = 10;

const INPUT_ATTRS = ["class", "id", "aria-label", "name", "min", "max", "step", "disabled"];
const STEP_ATTRS = ["tabindex", "aria-controls", "aria-disabled"];

const t = messages("numberField", {
  ru: { dec: "Уменьшить", inc: "Увеличить" },
  en: { dec: "Decrease", inc: "Increase" },
});

const isDigit = (char) => char >= "0" && char <= "9";
/* Слот 0 — «9»: полоса начинается на цифру назад, чтобы 0 → 9 шёл одним шагом. */
const canonicalOf = (slot) => ((slot + 9) % 10) + 1;
const bound = (text, fallback) => (text === "" ? fallback : Number(text));

/* Ближайшее к текущему слоту представление цифры (слот ±10 — та же цифра): 9 → 0
   идёт шагом вперёд. При равном пути — в сторону шага, одометр не крутится назад. */
function targetSlot(current, digit, direction) {
  let best = digit + 1;
  for (const candidate of [best - 10, best + 10]) {
    if (candidate < 0 || candidate >= DIGIT_SLOTS) continue;
    const distance = Math.abs(candidate - current);
    const bestDistance = Math.abs(best - current);
    if (distance < bestDistance || (distance === bestDistance && Math.sign(candidate - current) === direction)) {
      best = candidate;
    }
  }
  return best;
}

/* Разряды выравниваем по разделителю (ключ — смещение от него), иначе на 99 → 100
   прокрутился бы не тот разряд. */
function splitDigits(text) {
  const at = text.search(/[.,]/);
  const dot = at === -1 ? text.length : at;
  const parts = new Map();
  for (let index = 0; index < text.length; index += 1) parts.set(index - dot, text[index]);
  return parts;
}

const place = (record) => {
  record.strip.style.transform = `translateY(${(-record.slot * SLOT_PITCH).toFixed(4)}%)`;
};

/* Полоса разряда одна на модуль: собирается раз, дальше клонируется. */
let stripTemplate = null;

/* Новая ячейка: у цифры — полоса на каноническом слоте; знак и разделитель не
   прокручиваются. Новый узел без прошлого стиля переход не играет. */
function spawnCell(char) {
  const record = { el: el("span", { class: DIGIT_CLASS }), strip: null, slot: 0, char };
  if (!isDigit(char)) {
    record.el.textContent = char;
    return record;
  }
  stripTemplate ??= el("span", { class: "ui-number-field__strip" }, ...Array.from({ length: DIGIT_SLOTS }, (_, slot) => el("span", { text: String((slot + 9) % 10) })));
  record.strip = stripTemplate.cloneNode(true);
  record.slot = Number(char) + 1;
  place(record);
  record.el.append(record.strip);
  return record;
}

function create(host, ctx) {
  const found = host.querySelector(".ui-number-field__input") ?? host.querySelector("input");
  if (found && found.type !== "number") return null;
  const foundSteps = [host.querySelector(".ui-number-field__step--dec"), host.querySelector(".ui-number-field__step--inc")];
  /* Узлы автора модуль переставляет по раскладке — на снятии они встают на места.
     Порядок — документа: возвращаются с конца, и сосед каждого уже на месте. */
  const places = [found, ...foundSteps]
    .filter(Boolean)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((node) => [node, node.parentNode, node.nextSibling]);
  const saved = {
    input: found && snapshot(found, INPUT_ATTRS),
    steps: foundSteps.map((step) => step && snapshot(step, STEP_ATTRS)),
  };
  const { dataset } = host;
  const classes = ["ui-number-field", dataset.size === "sm" && "ui-number-field--sm"].filter((name) => name && !host.classList.contains(name));
  host.classList.add(...classes);

  /* Свой инпут получает значение исходным (сброс формы вернёт его), чужой — текущим. */
  const input = found ?? el("input", { type: "number", inputmode: "decimal", value: dataset.value });
  input.classList.add("ui-number-field__input");
  if (found && dataset.value && !input.value) input.value = dataset.value;
  for (const key of ["name", "min", "max", "step"]) if (dataset[key]) input.setAttribute(key, dataset[key]);
  if ("disabled" in dataset) input.disabled = true;

  const layer = el("span", { class: DIGITS_CLASS, "aria-hidden": "true" });
  const value = el("div", { class: VALUE_CLASS }, input, layer);
  const stepButton = (kind) => el("button", { type: "button", class: `ui-number-field__step ui-number-field__step--${kind}` }, icon(kind === "dec" ? "minus" : "plus"));
  const decrement = foundSteps[0] ?? stepButton("dec");
  const increment = foundSteps[1] ?? stepButton("inc");
  /* Порядок — в DOM, а не через order: табуляция идёт по картинке. */
  if (dataset.layout === "end") host.append(value, decrement, increment);
  else host.append(decrement, value, increment);

  /* Кнопки вне порядка табуляции (значение меняют стрелки в поле), но фокусируемы
     для тач- и голосовых скринридеров — как пример spinbutton из APG. */
  ensureId(input, "ui-number-field-input");
  for (const button of [decrement, increment]) {
    button.tabIndex = -1;
    button.setAttribute("aria-controls", input.id);
  }
  /* Имя — из подписи поля: контрол с кнопками нельзя оборачивать в <label>, браузер
     счёл бы контролом первую кнопку. */
  if (!input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby") && !input.labels.length) {
    const name = dataset.label?.trim() || labelOf(input);
    if (name) input.setAttribute("aria-label", name);
  }

  const cells = new Map();
  let shape = "";

  function syncDigits(roll, direction) {
    const next = splitDigits(input.value);
    const order = [...next.keys()].sort((a, b) => a - b);

    /* Стоящие узлы не трогаем — перестановка отменила бы их переходы. Новый разряд
       встаёт перед ближайшим стоящим. */
    for (const key of order) {
      if (cells.has(key)) continue;
      const fresh = spawnCell(next.get(key));
      cells.set(key, fresh);
      const anchor = order.find((other) => other > key && cells.get(other)?.el.parentNode === layer);
      layer.insertBefore(fresh.el, anchor === undefined ? null : cells.get(anchor).el);
    }

    /* Записи кадром (без перехода) и прокрутки: сначала кадр, потом прокрутка —
       она начинается от уже стоящего слота. */
    const instant = [];
    const rolling = [];
    for (const key of order) {
      const record = cells.get(key);
      const char = next.get(key);
      if (record.char === char) continue;

      if (isDigit(char) && record.strip) {
        /* Полоса на временном слоте (после 9 → 0) — сначала в канонический: по виду
           та же цифра, а недоигранная прокрутка доигрывается скачком вперёд, а не
           крутится назад через девять цифр. */
        const canonical = canonicalOf(record.slot);
        const rebased = canonical !== record.slot;
        const target = targetSlot(canonical, Number(char), direction);
        record.char = char;
        /* Шаг кнопкой прокручивается кратчайшим путём; кадром — ввод с клавиатуры,
           повтор удержания и значение извне. */
        if (roll && rebased) instant.push([record, canonical]);
        (roll ? rolling : instant).push([record, target]);
      } else if (!isDigit(char) && !record.strip) {
        record.char = char;
        record.el.textContent = char;
      } else {
        /* Разряд сменился на знак или обратно — у знака нет полосы, нужен другой узел. */
        const fresh = spawnCell(char);
        cells.set(key, fresh);
        layer.replaceChild(fresh.el, record.el);
      }
    }

    for (const [key, record] of [...cells]) {
      if (next.has(key)) continue;
      cells.delete(key);
      record.el.remove();
    }

    if (instant.length) {
      layer.classList.add(DIGITS_INSTANT_CLASS);
      for (const [record, slot] of instant) {
        record.slot = slot;
        place(record);
      }
      /* Пересчёт стиля, пока переход выключен: новое положение встаёт без него. Одно
         чтение на пачку, и свойство не зависит от раскладки — считается только стиль. */
      void getComputedStyle(instant[0][0].strip).display;
      layer.classList.remove(DIGITS_INSTANT_CLASS);
    }
    for (const [record, slot] of rolling) {
      record.slot = slot;
      place(record);
    }
  }

  /* Слой виден, пока значение есть, влезает и совпадает с текстом поля:
     промежуточный ввод и переполнение остаются инпуту. «-» и «1e» дают пустой
     value, а «3.» — value «3»: разделитель в конце текста value не видит, и, пока
     он там (typing), слой спрятан. Слой разложен всегда (прячет его visibility),
     поэтому замер — одно чтение без переключений. */
  let typing = false;
  let last = input.value;
  const fits = () => layer.scrollWidth <= layer.clientWidth + 1;
  const show = (fit) => value.classList.toggle(VALUE_DIGITS_CLASS, input.value !== "" && !typing && fit);

  /* Подписи своих кнопок — из словаря на каждой отрисовке: смена <html lang>
     дойдёт до них со следующим шагом или вводом. */
  function syncSteps() {
    if (!foundSteps[0]) setAttr(decrement, "aria-label", t("dec"));
    if (!foundSteps[1]) setAttr(increment, "aria-label", t("inc"));
    const off = input.disabled || input.readOnly;
    const current = input.value === "" ? Number.NaN : Number(input.value);
    setAttr(decrement, "aria-disabled", (off || current <= bound(input.min, -Infinity)) && "true");
    setAttr(increment, "aria-disabled", (off || current >= bound(input.max, Infinity)) && "true");
  }

  /* Ширина текста меняется только с его формой (цифры табличные): замер — когда
     сменилась форма, и это всегда действие пользователя или refresh. */
  function render(roll = false, direction = 0, trailing = false) {
    syncDigits(roll, direction);
    const next = input.value.replace(/\d/g, "0");
    if (next !== shape || trailing !== typing) {
      shape = next;
      typing = trailing;
      show(input.value !== "" && fits());
    }
    syncSteps();
    last = input.value;
  }

  function step(direction, { roll = false, count = 1 } = {}) {
    if (input.disabled || input.readOnly) return false;
    const before = input.value;
    /* step="any" stepUp не принимает, а без атрибута он прижал бы значение к сетке
       целых (1.37 → 2). Стрелки в таком поле прибавляют единицу как есть — кнопки
       тоже: 1.37 → 2.37, в пределах min и max и в точности значения. */
    if (input.getAttribute("step")?.trim().toLowerCase() === "any") {
      if (input.validity.badInput) return false;
      const decimals = before.split(".")[1]?.length ?? 0;
      const next = Number(before) + direction * count;
      input.value = String(Math.min(Math.max(Number(next.toFixed(decimals)), bound(input.min, -Infinity)), bound(input.max, Infinity)));
    } else if (direction > 0) input.stepUp(count);
    else input.stepDown(count);
    if (input.value === before) return false;
    /* Слой — до события: иначе обработчик ввода отрисовал бы ту же строку кадром. */
    render(roll, direction);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  /* Мышь шагает на нажатии, палец — на отпускании: касание, с которого началась
     прокрутка страницы, значения не меняет. Удержание повторяет шаг кадром (повтор
     чаще прокрутки) и кончается на границе. */
  let timer = 0;
  let tap = 0;
  const release = () => {
    clearTimeout(timer);
    timer = 0;
    tap = 0;
  };
  function press(event, direction, button) {
    if (!isPress(event) || button.getAttribute("aria-disabled") === "true") return;
    release();
    /* Захват — отпускание за кнопкой тоже кончает удержание. */
    try {
      button.setPointerCapture(event.pointerId);
    } catch {}
    if (event.pointerType === "mouse") step(direction, { roll: true });
    else tap = direction;
    const repeat = () => {
      tap = 0;
      timer = step(direction) ? setTimeout(repeat, HOLD_INTERVAL) : 0;
    };
    timer = setTimeout(repeat, HOLD_DELAY);
  }

  for (const [button, direction] of [[decrement, -1], [increment, 1]]) {
    ctx.on(button, "pointerdown", (event) => press(event, direction, button));
    ctx.on(button, "pointerup", () => {
      if (tap) step(tap, { roll: true });
      release();
    });
    ctx.on(button, "pointercancel", release);
    ctx.on(button, "lostpointercapture", release);
    /* Клавиатура и скринридер дают click с detail 0: указатель отработан выше. */
    ctx.on(button, "click", (event) => isPress(event) && step(direction, { roll: true }));
  }
  ctx.on(input, "keydown", (event) => {
    if ((event.key !== "PageUp" && event.key !== "PageDown") || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    step(event.key === "PageUp" ? 1 : -1, { count: PAGE_STEPS });
  });
  /* Разделитель в конце: его только что набрали, или стёрли дробную часть за ним
     («3.5» → «3.»). Стёртый вместе с ней он даст лишь лишнее скрытие слоя — под
     ним тот же текст инпута. */
  const SEPARATOR = /[.,]/;
  ctx.on(input, "input", (event) => {
    const trailing = SEPARATOR.test(event.data ?? "") || (!!event.inputType?.startsWith("delete") && SEPARATOR.test(last) && !SEPARATOR.test(input.value));
    render(false, 0, trailing);
  });
  /* Введённое за границей — к границе, когда поле отдаёт значение: как у кнопок. */
  ctx.on(input, "change", () => {
    const current = input.value === "" ? Number.NaN : Number(input.value);
    const edge = current < bound(input.min, -Infinity) ? input.min : current > bound(input.max, Infinity) ? input.max : null;
    if (edge === null) return;
    input.value = edge;
    render();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  afterReset(ctx, input, render);

  /* Первый показ — без замера: класс по значению, а влезает ли — скажет первый
     колбэк общего наблюдателя, после раскладки и до отрисовки. Он же перемеряет,
     когда поле меняет ширину. */
  syncDigits(false, 0);
  shape = input.value.replace(/\d/g, "0");
  show(true);
  syncSteps();
  ctx.cleanup(observeSize(value, { read: fits, write: show }));
  /* disabled и readOnly из кода (режим правки) — кнопки шага сразу в лад. */
  const watch = new MutationObserver(syncSteps);
  watch.observe(input, { attributes: true, attributeFilter: ["disabled", "readonly"] });
  ctx.cleanup(() => watch.disconnect());

  return {
    host,
    input,
    refresh: () => render(),
    destroy() {
      release();
      for (const [node, parent, next] of [...places].reverse()) parent.insertBefore(node, next?.parentNode === parent ? next : null);
      value.remove();
      for (const [at, button] of [decrement, increment].entries()) {
        if (saved.steps[at]) restore(button, saved.steps[at]);
        else button.remove();
      }
      if (saved.input) restore(input, saved.input);
      host.classList.remove(...classes);
      /* Пустой class — след модуля, а не разметка автора. */
      if (!host.getAttribute("class")) host.removeAttribute("class");
    },
  };
}

export default defineComponent({
  name: "numberField",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (host) => void get(host)?.refresh(),
  }),
});
