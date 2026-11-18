/* Строки и форматы кита. Язык — из <html lang> (ru, если не задан); у каждого
   компонента свой словарь, приложение может переопределить любую строку.

     const t = messages("datepicker", {
       ru: { pick: "Выбрать дату", day: "{d} {month}" },
       en: { pick: "Pick a date", day: "{month} {d}" },
     });
     t("pick");                     // по текущему языку
     t("day", { d: 5, month: "мая" });

     setMessages("en", { "datepicker.pick": "Choose date" });   // из приложения

   Язык читается в момент вызова: переключение <html lang> меняет строки при
   следующей отрисовке, без перезапуска модулей. */

const overrides = new Map();

/* Язык — основной подтег <html lang>: «en-US» и «en_US» → en, «fil» → fil. Тег,
   который Intl не принимает («x-…»), — ru: иначе форматы и формы числа бросали бы
   RangeError внутри компонентов. Разбор — только при смене lang. */
let seenTag = null;
let seenLang = "ru";

export function lang() {
  const tag = document.documentElement.lang || "ru";
  if (tag !== seenTag) {
    seenTag = tag;
    try {
      seenLang = new Intl.Locale(tag.replaceAll("_", "-")).language;
    } catch {
      seenLang = "ru";
    }
  }
  return seenLang;
}

export function setMessages(language, entries) {
  const own = overrides.get(language) ?? {};
  overrides.set(language, Object.assign(own, entries));
}

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : text);

export function messages(component, dictionaries) {
  return (key, vars) => {
    const language = lang();
    const text = overrides.get(language)?.[`${component}.${key}`] ?? dictionaries[language]?.[key] ?? dictionaries.ru?.[key] ?? key;
    return fill(text, vars);
  };
}

/* Формы числа: «файл|файла|файлов» (ru: one|few|many) или «file|files» (en).
   Дробные в ru и uk — категория other, и форма у них та же, что у few:
   «1,5 файла». */
const rules = new Map();
const FRACTION_FEW = new Set(["ru", "uk"]);
export function plural(count, forms) {
  const list = forms.split("|");
  const current = lang();
  let rule = rules.get(current);
  if (!rule) rules.set(current, (rule = new Intl.PluralRules(current)));
  const category = rule.select(count);
  if (list.length >= 3) return list[{ one: 0, few: 1, many: 2 }[category] ?? (FRACTION_FEW.has(current) ? 1 : 2)];
  return list[category === "one" ? 0 : list.length - 1];
}

const cache = new Map();
function cached(kind, options, make) {
  const key = `${kind}:${lang()}:${JSON.stringify(options ?? null)}`;
  let value = cache.get(key);
  if (!value) cache.set(key, (value = make(lang(), options)));
  return value;
}

export const numberFormat = (options) => cached("number", options, (language, o) => new Intl.NumberFormat(language, o));
export const dateFormat = (options) => cached("date", options, (language, o) => new Intl.DateTimeFormat(language, o));
export const collator = (options = { numeric: true, sensitivity: "base" }) => cached("collator", options, (language, o) => new Intl.Collator(language, o));
