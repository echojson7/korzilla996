/* Конструктор фильтра: поле с условиями-чипами над описанием полей, как строка
   фильтров заказов в админке. Чип — «поле | оператор | значение | ×»: поле,
   оператор и значение списка — селекты кита (ui-select--inline, панель — общий
   список селекта), текст и число — поле ввода прямо в чипе. Значение каждого
   селекта держит его нативный <select>: change от него и ведёт модель.

     const filter = kit("filterBuilder");
     const builder = filter.create(host, {
       fields: [{ id: "status", label: "Статус", type: "enum", icon: "circle-dot", options: [{ value, label, icon }] },
                { id: "sum", label: "Сумма", type: "number" }, { id: "client", label: "Покупатель" }],
       value: { conditions: [{ field: "sum", operator: "gte", value: 5000 }] },
       onChange: (value) => …,          // после правки; текст и число — с паузой debounce (300 мс);
                                        // то же значение — в событии filter-builder:change (detail.value)
       disabled: false,
     });
     builder.getValue(); builder.setValue(value); builder.clear();
     filter.matches(value.conditions, (field) => row[field]);   // подходит ли строка

   <div class="ui-filter-builder ui-filter-builder--secondary"> — серое пустое поле.
   С условиями поле в рамке акцента (без data-empty): видно, что список отфильтрован.

   Семантика — живого EOKit: условия одного поля — ИЛИ, разных полей — И; «или»
   рисуется между соседними условиями одного поля. Условие без значения
   пропускается (его ещё заполняют). Числовое условие несёт число, значение
   списка — один из его вариантов, иначе ''. logic в значении — всегда "and". */

import { defineComponent } from "../../core/component.js";
import { el, restore, setAttr, setData, snapshot, uid } from "../../core/dom.js";
import { icon } from "../../core/icons.js";
import { messages } from "../../core/locale.js";
import select from "../select/select.js";

const t = messages("filterBuilder", {
  ru: {
    add: "Добавить условие",
    clear: "Очистить",
    value: "Значение",
    or: "или",
    contains: "содержит",
    eq: "равно",
    neq: "не равно",
    gt: "больше",
    gte: "не меньше",
    lt: "меньше",
    lte: "не больше",
    field: "Поле условия {n}",
    fieldOr: "Или, поле условия {n}",
    operator: "Оператор условия {n}",
    valueOf: "Значение условия {n}",
    remove: "Удалить условие {n}: {text}",
    count: "Условий: {n}",
  },
  en: {
    add: "Add condition",
    clear: "Clear",
    value: "Value",
    or: "or",
    contains: "contains",
    eq: "is",
    neq: "is not",
    gt: "greater than",
    gte: "at least",
    lt: "less than",
    lte: "at most",
    field: "Condition {n} field",
    fieldOr: "Or, condition {n} field",
    operator: "Condition {n} operator",
    valueOf: "Condition {n} value",
    remove: "Remove condition {n}: {text}",
    count: "Conditions: {n}",
  },
});

/* Операторы по типу поля — живого кита дословно; первый — по умолчанию. */
const OPERATORS = { text: ["contains", "eq", "neq"], enum: ["eq", "neq"], number: ["eq", "gt", "gte", "lt", "lte"] };
const DEBOUNCE = 300;

/* ---- Модель ------------------------------------------------------------------ */

/* Плохое описание полей — ошибка программы: бросаем до того, как тронут хост. */
function fieldsOf(input) {
  if (!Array.isArray(input) || !input.length) throw new TypeError("[EOKIT] filterBuilder: fields — непустой массив");
  const seen = new Set();
  return input.map((source, index) => {
    const field = source ?? {};
    const id = field.id == null || field.id === "" ? `field-${index}` : String(field.id);
    if (seen.has(id)) throw new TypeError(`[EOKIT] filterBuilder: повторяющийся field.id: ${id}`);
    seen.add(id);
    const type = field.type in OPERATORS ? field.type : "text";
    const options = (Array.isArray(field.options) ? field.options : [])
      .filter((option) => option?.value != null)
      .map((option) => ({ value: String(option.value), label: String(option.label ?? option.value), icon: option.icon ? String(option.icon) : "", disabled: option.disabled === true }));
    /* Список без вариантов — неработающий контрол. */
    if (type === "enum" && !options.length) throw new TypeError(`[EOKIT] filterBuilder: у enum-поля нет options: ${id}`);
    const operators = OPERATORS[type];
    return {
      id,
      label: String(field.label ?? id),
      icon: field.icon ? String(field.icon) : "",
      type,
      operators,
      operator: operators.includes(field.defaultOperator) ? field.defaultOperator : operators[0],
      options,
    };
  });
}

/* Число или '' (не числовая строка и не NaN); вариант списка — только свой. */
function valueFor(field, raw) {
  if (raw === "" || raw == null) return "";
  if (field.type === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : "";
  }
  const text = String(raw);
  if (field.type === "enum") return field.options.some((option) => option.value === text) ? text : "";
  return text;
}

/* Условие на исчезнувшее поле отбрасывается, как в живом ките. Повторный id
   получает новый: иначе правка второй строки попала бы в первую. */
function conditionsOf(value, fields) {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const ids = new Set();
  const list = Array.isArray(value?.conditions) ? value.conditions : [];
  return list.flatMap((condition) => {
    const field = condition ? byId.get(String(condition.field)) : null;
    if (!field) return [];
    let id = condition.id ? String(condition.id) : "";
    if (!id || ids.has(id)) id = uid("ui-fb");
    ids.add(id);
    const operator = field.operators.includes(condition.operator) ? condition.operator : field.operator;
    return [{ id, field: field.id, operator, value: valueFor(field, condition.value) }];
  });
}

const copy = (conditions) => ({ logic: "and", conditions: conditions.map((condition) => ({ ...condition })) });

/* ---- matches: предикат без модели полей и без DOM ---------------------------- */

const isActive = (value) => value !== "" && value != null && (typeof value !== "number" || Number.isFinite(value));

/* Сравнение по типу значения: число — строго числом (5 и «5.0» равны), иначе
   текст без учёта регистра, обрезанный с обеих сторон. */
function predicate({ operator, value }) {
  if (typeof value === "number") {
    const test = { eq: (x) => x === value, neq: (x) => x !== value, gt: (x) => x > value, gte: (x) => x >= value, lt: (x) => x < value, lte: (x) => x <= value }[operator];
    if (!test) return () => false;
    return (raw) => {
      const number = raw === "" || raw == null ? Number.NaN : Number(raw);
      return Number.isFinite(number) && test(number);
    };
  }
  const wanted = String(value).trim().toLocaleLowerCase();
  const test = { contains: (x) => x.includes(wanted), eq: (x) => x === wanted, neq: (x) => x !== wanted }[operator];
  if (!test) return () => false;
  return (raw) => test(raw == null ? "" : String(raw).trim().toLocaleLowerCase());
}

/* Разбор условий — один на массив: витрина зовёт matches на каждую из тысяч
   строк с одним и тем же списком. Условия, поменянные на месте, разбор
   пересобирают. */
const compiled = new WeakMap();

function compile(conditions) {
  const seen = conditions.map((condition) => [condition, condition?.field, condition?.operator, condition?.value]);
  const cached = compiled.get(conditions);
  if (cached && cached.seen.length === seen.length && cached.seen.every((entry, at) => entry.every((part, k) => part === seen[at][k]))) return cached.groups;
  const groups = new Map();
  for (const condition of conditions) {
    if (condition?.field == null || !isActive(condition.value)) continue;
    const field = String(condition.field);
    if (!groups.has(field)) groups.set(field, []);
    groups.get(field).push(predicate(condition));
  }
  compiled.set(conditions, { seen, groups });
  return groups;
}

function matches(conditions, read) {
  if (!Array.isArray(conditions) || typeof read !== "function") return false;
  for (const [field, tests] of compile(conditions)) {
    const raw = read(field);
    if (!tests.some((test) => test(raw))) return false;
  }
  return true;
}

/* ---- Компонент ---------------------------------------------------------------- */

/* Селекты чипов ставит модуль select кита: тот же реестр, что у kit("select"),
   поэтому mount по предку их не обернёт второй раз. */
let selectApi = null;
const selects = () => (selectApi ??= select.setup());

const option = (value, label, { disabled = false, glyph = "" } = {}) => el("option", { value, disabled, "data-ui-icon": glyph || null, text: label });

/* Сначала сброс: селект сохранил бы выбор варианта, которого больше нет. Значения
   нет среди вариантов (пустое) — selectedIndex −1, кнопка покажет подсказку. */
function fill(node, options, selected) {
  node.value = "";
  node.replaceChildren(...options);
  node.value = selected;
}

function create(host, ctx, options = {}) {
  const fields = fieldsOf(options.fields);
  const byId = new Map(fields.map((field) => [field.id, field]));
  const disabled = options.disabled === true;
  const debounce = Number.isFinite(options.debounce) ? Math.max(0, options.debounce) : DEBOUNCE;
  const onChange = typeof options.onChange === "function" ? options.onChange : null;
  let conditions = conditionsOf(options.value, fields);
  const saved = { attrs: snapshot(host, ["class", "data-empty"]), children: [...host.childNodes] };
  /* Строка списка → её условие и контролы. */
  const records = new WeakMap();
  let rows = [];
  let timer = 0;

  const addLabel = el("span", { class: "ui-btn__label", text: t("add") });
  const add = el("button", { class: "ui-btn ui-btn--ghost ui-btn--sm ui-filter-builder__add", type: "button", disabled }, icon("plus"), addLabel);
  const clear = el("button", { class: "ui-btn ui-btn--ghost ui-btn--sm ui-filter-builder__clear", type: "button", disabled }, el("span", { class: "ui-btn__label", text: t("clear") }));
  /* Список без своей коробки (display: contents): чипы, «или» и кнопки переносятся
     одним потоком. Связка «или» — aria-hidden, поэтому у списка только пункты. */
  const list = el("div", { class: "ui-filter-builder__list", role: "list" });
  /* Живой регион есть всегда: он должен существовать до обновления. */
  const status = el("p", { class: "ui-filter-builder__status ui-sr-only", role: "status" });
  host.classList.add("ui-filter-builder");
  host.replaceChildren(icon("list-filter", { className: "ui-icon ui-filter-builder__icon" }), list, add, clear, status);

  /* Колбэк и событие на хосте — одно и то же значение. */
  const emit = () => {
    const value = copy(conditions);
    onChange?.(value);
    ctx.emit("filter-builder:change", { value });
  };
  const conditionOf = (row) => conditions.find((condition) => condition.id === records.get(row)?.id) ?? null;

  function cancelEdit() {
    clearTimeout(timer);
    timer = 0;
  }

  function describe(condition) {
    const field = byId.get(condition.field);
    const choice = field.type === "enum" ? field.options.find((item) => item.value === condition.value) : null;
    const value = choice ? choice.label : condition.value === "" ? t("value") : String(condition.value);
    return `${field.label} ${t(condition.operator)} ${value}`;
  }

  /* Имя селекта читает его кнопка: пишем в обе — нативный select остаётся
     источником для refresh. */
  function name(control, text) {
    setAttr(control, "aria-label", text);
    if (control.localName === "select") setAttr(control.parentNode?.querySelector(":scope > .ui-select__trigger"), "aria-label", text);
  }

  /* Подписи называют номер условия, иначе все строки читались бы одинаково.
     «или» скрыта от диктора — она входит в имя поля следующего условия. */
  function label(row, index) {
    const { controls } = records.get(row);
    const n = index + 1;
    const joined = row.previousElementSibling?.classList.contains("ui-filter-builder__join");
    name(controls.field, t(joined ? "fieldOr" : "field", { n }));
    name(controls.operator, t("operator", { n }));
    name(controls.value, t("valueOf", { n }));
    setAttr(controls.remove, "aria-label", t("remove", { n, text: describe(conditionOf(row)) }));
  }

  const labelAll = () => rows.forEach(label);

  /* Вид поля и кнопок — по числу условий: после чипов «Добавить» — один плюс,
     подпись уходит в aria-label. */
  function paint() {
    const empty = !conditions.length;
    clear.hidden = empty;
    setData(host, "empty", empty);
    addLabel.hidden = !empty;
    add.classList.toggle("ui-btn--icon-sm", !empty);
    setAttr(add, "aria-label", empty ? null : t("add"));
    status.textContent = t("count", { n: conditions.length });
  }

  /* Часть чипа со списком: нативный select, который модуль select сразу обернёт. */
  function picker(part, items, selected, placeholder) {
    const node = el("select", { class: `ui-select ui-select--inline ui-filter-builder__${part}`, "data-size": "sm", "data-placeholder": placeholder, disabled });
    fill(node, items, selected);
    return node;
  }

  /* Вид значения — по типу поля: список вариантов или поле ввода. */
  function valueControl(field, condition) {
    if (field.type === "enum") return picker("value", field.options.map((item) => option(item.value, item.label, { disabled: item.disabled, glyph: item.icon })), String(condition.value), t("value"));
    const number = field.type === "number";
    return el("input", {
      class: "ui-filter-builder__value ui-filter-builder__input",
      type: number ? "number" : "text",
      step: number && "any",
      inputmode: number && "decimal",
      placeholder: t("value"),
      value: condition.value === "" ? null : String(condition.value),
      autocomplete: "off",
      disabled,
    });
  }

  const operatorOptions = (field) => field.operators.map((value) => option(value, t(value)));
  const enhance = (control) => control.localName === "select" && selects().create(control);
  /* Снять селект до того, как узел уйдёт: обёртка уходит, select встаёт на её место. */
  const release = (control) => control.localName === "select" && selects().unmount(control);

  function buildRow(condition) {
    const field = byId.get(condition.field);
    const controls = {
      field: picker("field", fields.map((item) => option(item.id, item.label, { glyph: item.icon })), field.id),
      operator: picker("operator", operatorOptions(field), condition.operator),
      value: valueControl(field, condition),
      remove: el("button", { class: "ui-filter-builder__remove", type: "button", disabled }, icon("x", { className: "ui-icon ui-icon--xs" })),
    };
    const row = el("div", { class: "ui-filter-builder__item", role: "listitem" }, controls.field, controls.operator, controls.value, controls.remove);
    enhance(controls.field);
    enhance(controls.operator);
    enhance(controls.value);
    records.set(row, { id: condition.id, controls });
    return row;
  }

  const join = () => el("span", { class: "ui-filter-builder__join", "aria-hidden": "true", text: t("or") });

  function render() {
    selects().unmount(list);
    const nodes = [];
    rows = conditions.map((condition, index) => {
      /* «или» — только между условиями одного поля. */
      if (index > 0 && conditions[index - 1].field === condition.field) nodes.push(join());
      const row = buildRow(condition);
      nodes.push(row);
      return row;
    });
    list.replaceChildren(...nodes);
    labelAll();
    paint();
  }

  /* «или» — свойство пары строк: вставка и удаление узла без перерисовки строк. */
  function syncJoins() {
    rows.forEach((row, index) => {
      const wanted = index > 0 && conditions[index - 1].field === conditions[index].field;
      const existing = row.previousElementSibling?.classList.contains("ui-filter-builder__join") ? row.previousElementSibling : null;
      if (wanted && !existing) row.before(join());
      else if (!wanted && existing) existing.remove();
    });
  }

  /* Правка значения переписывает только подписи: фокус и каретка остаются. */
  function writeValue(row, raw) {
    const condition = conditionOf(row);
    if (!condition) return;
    const next = valueFor(byId.get(condition.field), raw);
    if (condition.value === next) return;
    condition.value = next;
    labelAll();
    emit();
  }

  function changeField(row, id) {
    const condition = conditionOf(row);
    const field = byId.get(id);
    if (!condition || !field || field.id === condition.field) return;
    /* Новое поле — новые операторы и часто новый вид значения. */
    const { controls } = records.get(row);
    condition.field = field.id;
    condition.operator = field.operator;
    condition.value = "";
    fill(controls.operator, operatorOptions(field), field.operator);
    selects().refresh(controls.operator);
    const value = valueControl(field, condition);
    release(controls.value);
    controls.value.replaceWith(value);
    enhance(value);
    controls.value = value;
    syncJoins();
    labelAll();
    emit();
  }

  function changeOperator(row, operator) {
    const condition = conditionOf(row);
    if (!condition || condition.operator === operator || !byId.get(condition.field).operators.includes(operator)) return;
    condition.operator = operator;
    labelAll();
    emit();
  }

  /* Добавление и удаление трогают одну строку: чипы рядом не пересобираются. */
  function addCondition() {
    const field = fields[0];
    cancelEdit();
    const condition = { id: uid("ui-fb"), field: field.id, operator: field.operator, value: "" };
    conditions.push(condition);
    const row = buildRow(condition);
    rows.push(row);
    list.append(row);
    syncJoins();
    labelAll();
    paint();
    emit();
    records.get(row).controls.field.focus();
  }

  function removeCondition(row) {
    cancelEdit();
    const index = rows.indexOf(row);
    const { id } = records.get(row);
    conditions = conditions.filter((condition) => condition.id !== id);
    rows.splice(index, 1);
    selects().unmount(row);
    if (row.previousElementSibling?.classList.contains("ui-filter-builder__join")) row.previousElementSibling.remove();
    row.remove();
    syncJoins();
    labelAll();
    paint();
    emit();
    /* Как в живом ките: фокус на следующую строку, на предыдущую, иначе на «Добавить». */
    const target = rows[Math.min(index, rows.length - 1)];
    (target ? records.get(target).controls.field : add).focus();
  }

  /* Кнопка «Очистить» и clear() — одно действие; кнопка ещё и возвращает фокус. */
  function clearAll(focus) {
    cancelEdit();
    if (!conditions.length) return;
    conditions = [];
    render();
    emit();
    if (focus) add.focus();
  }

  ctx.on(add, "click", addCondition);
  ctx.on(clear, "click", () => clearAll(true));

  const rowOf = (target) => {
    const row = target.closest?.(".ui-filter-builder__item");
    return row && records.has(row) ? row : null;
  };
  const isValue = (row, target) => records.get(row).controls.value === target;

  ctx.on(list, "click", (event) => {
    const row = rowOf(event.target);
    if (row && records.get(row).controls.remove.contains(event.target)) removeCondition(row);
  });
  /* change шлёт и нативный select под селектом кита, и поле ввода. */
  ctx.on(list, "change", (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    const { controls } = records.get(row);
    if (event.target === controls.field) changeField(row, event.target.value);
    else if (event.target === controls.operator) changeOperator(row, event.target.value);
    else if (event.target === controls.value) {
      cancelEdit();
      writeValue(row, event.target.value);
    }
  });
  /* Текст и число — с паузой; потеря фокуса и Enter применяют сразу. */
  ctx.on(list, "input", (event) => {
    const row = rowOf(event.target);
    if (!row || !isValue(row, event.target) || event.target.localName !== "input") return;
    cancelEdit();
    const { value } = event.target;
    timer = setTimeout(() => {
      timer = 0;
      writeValue(row, value);
    }, debounce);
  });
  ctx.on(list, "focusout", (event) => {
    const row = rowOf(event.target);
    if (!row || !isValue(row, event.target)) return;
    cancelEdit();
    writeValue(row, event.target.value);
  });
  ctx.on(list, "keydown", (event) => {
    const row = event.key === "Enter" ? rowOf(event.target) : null;
    if (!row || !isValue(row, event.target)) return;
    event.preventDefault();
    cancelEdit();
    writeValue(row, event.target.value);
  });

  render();

  return {
    getValue: () => copy(conditions),
    setValue(value) {
      cancelEdit();
      conditions = conditionsOf(value, fields);
      render();
    },
    clear: () => clearAll(false),
    destroy() {
      cancelEdit();
      selects().unmount(list);
      host.replaceChildren(...saved.children);
      restore(host, saved.attrs);
    },
  };
}

export default defineComponent({ name: "filterBuilder", create, api: () => ({ matches }) });
