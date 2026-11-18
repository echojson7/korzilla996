/* Селект: свой список поверх нативного `<select class="ui-select">`. Нативный
   контрол остаётся источником значения и формы: выбор пишет select.value и шлёт
   на нём input и change.

     <select class="ui-select" data-size="sm">…</select>    малое поле, список обычный
     <select class="ui-select" data-size="sm" data-menu-size="sm"> и плотный список
     <select class="ui-select ui-select--row">…</select>   строка настроек
     <select class="ui-select ui-select--inline">…</select> значение внутри фразы
     <select class="ui-select ui-select--inline" data-size="lg"> пилюля высотой с малую кнопку
     <select class="ui-select" data-placement="over">…</select> список поверх поля
     <select class="ui-select" data-native>…</select>      остаётся нативным
     <select class="ui-select" data-placeholder="Значение"> подпись, пока не выбрано
     <option value="b2b" data-ui-icon="layers">B2B-кабинет</option>

   Селект с optgroup остаётся нативным, с data-native — тоже. «Не выбрано» —
   selectedIndex −1 из кода: кнопка показывает data-placeholder серым. Значение,
   пункты или disabled, изменённые из кода без change, покажет
   kit("select").refresh(select).

   Пункты строятся при первом открытии, а не при монтировании: форма с десятками
   селектов не платит за тысячи узлов, которые никто не откроет. Активная строка
   — классом на двух узлах, без перерисовки списка: на 2000 пунктах это цена
   каждого нажатия стрелки и каждого движения указателя.

   Открытый список уходит в body (в окне — в его слой [data-ui-layer]): его не
   режут overflow поповера, карточки и тела окна. Закрытый возвращается в обёртку. */

import { defineComponent } from "../../core/component.js";
import { el, isRtl, labelOf, restore, setAttr, setData, setText, setVar, snapshot, uid } from "../../core/dom.js";
import { autoUpdate, place } from "../../core/floating.js";
import { focus } from "../../core/focus.js";
import { icon } from "../../core/icons.js";
import { moveIndex, typeahead } from "../../core/keys.js";
import { openLayer, portal } from "../../core/layer.js";
import { presence } from "../../core/presence.js";
import { readPx } from "../../core/tokens.js";

const SELECTOR = "select.ui-select";
const ENHANCED = "ui-select--enhanced";
const ACTIVE = "ui-select__option--active";
const SELECT_ATTRS = ["tabindex", "aria-hidden"];

/* Галочка видна только у выбранного пункта: глиф стоит только там, остальные
   держат пустую коробку того же размера — тысячи невидимых svg были бы главной
   ценой первого открытия длинного списка. */
const slot = () => el("span", { class: "ui-icon ui-select__check", "aria-hidden": "true" });

function create(select, ctx) {
  if (select.hasAttribute("data-native") || select.querySelector("optgroup") || !select.parentNode) return null;

  const saved = snapshot(select, SELECT_ATTRS);
  const panelId = uid("ui-select-panel");
  const value = el("span", { class: "ui-select__value" });
  const trigger = el(
    "button",
    { class: "ui-select__trigger", type: "button", role: "combobox", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": panelId },
    value,
    el("span", { class: "ui-select__chevron" }, icon(select.classList.contains("ui-select--row") ? "chevrons-up-down" : "chevron-down")),
  );
  const panel = el("div", { class: "ui-select__panel", id: panelId, role: "listbox", hidden: true, data: { state: "closed" } });
  const wrap = el("div", { class: "ui-select__wrap" });
  /* Размер и вид — атрибутами обёртки и панели: панель в body правило «обёртка →
     панель» не достанет. */
  const size = select.classList.contains("ui-select--sm") ? "sm" : ["sm", "lg"].includes(select.dataset.size) ? select.dataset.size : null;
  setData(wrap, "size", size);
  /* Список — одного размера со всеми меню кита, какое бы ни было поле: малое поле
     в строке настроек не делает мелкими пункты. Плотный — только по просьбе. */
  setData(panel, "size", select.dataset.menuSize === "sm" ? "sm" : null);
  const variant = ["row", "inline", "secondary"].find((name) => select.classList.contains(`ui-select--${name}`)) ?? null;
  setData(wrap, "variant", variant);
  /* Список у значения во фразе — по своим пунктам, а не по ширине слова; у серого
     поля и список серый. */
  setData(panel, "variant", variant === "inline" || variant === "secondary" ? variant : null);
  select.before(wrap);
  /* Нативный select — первым ребёнком: CSS прячет его абсолютным позиционированием. */
  wrap.append(select, trigger, panel);
  select.classList.add(ENHANCED);
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const life = presence(panel, { closed: "closed" });
  /* Галочка — одна на селект и только с первого открытия списка. */
  let check = null;
  let options = [];
  let rows = null;
  let selected = -1;
  let active = -1;
  let activeRow = null;
  let lead = null;
  let layer = null;
  let home = null;
  let stopAuto = null;
  let rtl = false;
  let pointer = "";
  /* Недоступные пункты в поиске по буквам не находятся. */
  const find = typeahead(() => options.map((option) => (option.disabled ? "" : option.label)));

  function read() {
    if (layer) {
      close();
      settle();
    }
    options = [...select.options].map((option) => ({ value: option.value, label: option.label, icon: option.dataset.uiIcon ?? "", disabled: option.disabled }));
    trigger.disabled = select.disabled;
    setAttr(trigger, "aria-label", labelOf(select) || null);
    /* Пункты сменились — строки построятся заново при открытии. */
    rows = null;
    activeRow = null;
    panel.replaceChildren();
    /* Не −1: «не выбрано» — тоже состояние, которое sync должен нарисовать. */
    selected = null;
    sync();
  }

  /* Выбранное — из нативного select: его могли сменить из кода или формы. */
  function sync() {
    const index = select.selectedIndex;
    if (index === selected) return;
    mark(selected, false);
    mark(index, true);
    selected = index;
    const option = options[index];
    setText(value, option?.label ?? select.dataset.placeholder ?? "");
    value.classList.toggle("ui-select__value--placeholder", !option);
    const glyph = option?.icon ?? "";
    if (glyph !== (lead?.dataset.uiIcon ?? "")) {
      lead?.remove();
      lead = glyph ? icon(glyph, { className: "ui-icon ui-select__lead" }) : null;
      if (lead) value.before(lead);
    }
  }

  function mark(index, on) {
    const row = rows?.[index];
    if (!row) return;
    setAttr(row, "aria-selected", String(on));
    if (on) row.lastChild.replaceWith((check ??= icon("check", { className: "ui-icon ui-select__check" })));
    else if (check && row.lastChild === check) check.replaceWith(slot());
  }

  function build() {
    rows = options.map((option, index) =>
      el(
        "div",
        { id: `${panelId}-option-${index}`, class: "ui-select__option", role: "option", "aria-selected": "false", "aria-disabled": option.disabled && "true", "data-value": option.value },
        option.icon && icon(option.icon, { className: "ui-icon ui-select__option-icon" }),
        el("span", { class: "ui-select__label", text: option.label }),
        slot(),
      ),
    );
    panel.replaceChildren(...rows);
    mark(selected, true);
  }

  function setActive(index, reveal = true) {
    if (index < 0 || index >= options.length) return;
    active = index;
    const row = rows[index];
    if (row !== activeRow) {
      activeRow?.classList.remove(ACTIVE);
      row.classList.add(ACTIVE);
      activeRow = row;
    }
    setAttr(trigger, "aria-activedescendant", row.id);
    /* Указатель строку не прокручивает: список под курсором не уезжает. */
    if (!reveal) return;
    const top = row.offsetTop;
    const view = panel.clientHeight;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (top + row.offsetHeight > panel.scrollTop + view) panel.scrollTop = top + row.offsetHeight - view;
  }

  /* Ширина поля — нижний предел панели (CSS берёт ещё минимум размера и длину
     строк); пишется до place: он меряет панель. */
  const position = (width = trigger.getBoundingClientRect().width) => {
    setVar(panel, "--ui-select-anchor-w", `${width}px`);
    place(panel, trigger, { prefix: "--ui-select", side: "bottom", align: "start", flip: "opposite", rtl });
  };

  /* Поверх поля (data-placement="over", как список в macOS): выбранная строка
     встаёт на место поля, её текст — вровень с текстом поля. У кромки окна панель
     прижимается к ней, а строку к полю подводит прокрутка списка; не хватает
     прокрутки — строка остаётся выше или ниже поля. Дальше панель идёт за полем на
     том же сдвиге: прокрутка списка и страницы её не перекладывает. */
  const over = select.dataset.placement === "over";
  let shift = 0;
  /* Панель шире поля на 4 px с каждой стороны — кольцо фокуса поля не выглядывает
     из-под неё; отступ строк поверх поля на те же 4 px больше (select.css). */
  const OUTSET = 4;
  const snap = (value) => `${Math.round(value * devicePixelRatio) / devicePixelRatio}px`;

  function cover(row, box) {
    const edge = readPx(getComputedStyle(panel), "--ui-select-edge", 8);
    const root = document.documentElement;
    setVar(panel, "--ui-select-anchor-w", `${box.width + OUTSET * 2}px`);
    setVar(panel, "--ui-select-space", `${root.clientHeight - edge * 2}px`);
    const height = panel.offsetHeight;
    const width = panel.offsetWidth;
    const rowTop = row?.offsetTop ?? 0;
    const rowHeight = row?.offsetHeight ?? box.height;
    const want = box.top + (box.height - rowHeight) / 2;
    const top = Math.max(edge, Math.min(want - rowTop, root.clientHeight - edge - height));
    panel.scrollTop = top - (want - rowTop);
    /* Строка, которую не подвела прокрутка, — там, где она встала на деле. */
    const rowAt = top + rowTop - panel.scrollTop;
    const left = Math.max(edge, Math.min(rtl ? box.right + OUTSET - width : box.left - OUTSET, root.clientWidth - edge - width));
    shift = top - box.top;
    setData(panel, "side", "over");
    setVar(panel, "--ui-origin", `center ${Math.round(rowAt - top + rowHeight / 2)}px`);
    setVar(panel, "--ui-select-x", snap(left));
    setVar(panel, "--ui-select-y", snap(top));
  }

  function follow() {
    const box = trigger.getBoundingClientRect();
    setVar(panel, "--ui-select-anchor-w", `${box.width + OUTSET * 2}px`);
    setVar(panel, "--ui-select-x", snap(rtl ? box.right + OUTSET - panel.offsetWidth : box.left - OUTSET));
    setVar(panel, "--ui-select-y", snap(box.top + shift));
  }

  function open() {
    if (layer || select.disabled) return;
    /* Чтения — до первой записи: поле меряется в готовой раскладке. */
    const width = trigger.getBoundingClientRect().width;
    rtl = isRtl(trigger);
    sync();
    if (!rows) build();
    /* Уход ещё играет — панель так и стоит в body: отменяем уход без переноса. */
    home ??= portal(panel, trigger);
    layer = openLayer({
      elements: () => [wrap, panel],
      trigger,
      exclusive: true,
      onDismiss: () => close(),
    });
    /* Высота — своя, без потолка прошлого открытия: по ней выбирается сторона. */
    setVar(panel, "--ui-select-space", null);
    panel.hidden = false;
    const index = Math.max(0, selected);
    const row = rows[index];
    if (over) cover(row, trigger.getBoundingClientRect());
    else {
      position(width);
      /* Выбранная строка — посередине видимой части. */
      if (row) {
        const view = panel.clientHeight;
        panel.scrollTop = Math.min(Math.max(row.offsetTop - (view - row.offsetHeight) / 2, 0), panel.scrollHeight - view);
      }
    }
    /* Выбранный недоступен — активен первый доступный. */
    setActive(options[index]?.disabled ? options.findIndex((option) => !option.disabled) : index, false);
    life.show();
    stopAuto = autoUpdate(trigger, panel, over ? follow : position, { onDetach: () => close() });
    setAttr(trigger, "aria-expanded", "true");
  }

  function close() {
    if (!layer) return;
    const current = layer;
    layer = null;
    current.close();
    stopAuto();
    stopAuto = null;
    setAttr(trigger, "aria-expanded", "false");
    setAttr(trigger, "aria-activedescendant", null);
    life.hide().then((done) => done && goHome());
  }

  function goHome() {
    home?.();
    home = null;
  }

  /* Доиграть уход сразу: снятие, новые пункты. */
  function settle() {
    life.settle();
    goHome();
  }

  function commit(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    close();
    focus(trigger);
    if (select.value === option.value) return;
    select.value = option.value;
    sync();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const toggle = () => (layer ? close() : open());

  /* Мышь открывает на нажатии, как нативный список; палец и перо — на click (иначе
     касание для прокрутки открыло бы список); клавиатура — Enter и пробел ниже. */
  ctx.on(trigger, "pointerdown", (event) => {
    pointer = event.pointerType;
    if (pointer === "mouse" && event.button === 0 && !event.ctrlKey) toggle();
  });
  ctx.on(trigger, "click", (event) => {
    if (event.detail === 0 || pointer !== "mouse") toggle();
  });

  ctx.on(trigger, "keydown", (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey) return;
    const { key } = event;
    if (!layer) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        open();
      } else if (key === "Home" || key === "End" || (key.length === 1 && !event.altKey)) {
        open();
        if (layer) onListKey(event);
      }
      return;
    }
    onListKey(event);
  });

  function onListKey(event) {
    const { key } = event;
    if (key === "Tab") {
      close();
      return;
    }
    /* Пробел посреди набора — часть запроса («Заказы по почте»), иначе — выбор. */
    const typed = key.length === 1 && !event.altKey ? find(key, active) : -1;
    if (typed >= 0) {
      event.preventDefault();
      setActive(typed);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      commit(active);
      return;
    }
    const next = moveIndex(event, active, options.length, { skip: (at) => options[at].disabled });
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  const rowIndex = (event) => {
    const row = event.target.closest?.(".ui-select__option");
    return row ? rows.indexOf(row) : -1;
  };
  /* Нажатие в списке не уводит фокус с поля: стрелки, Esc и Tab остаются у него. */
  ctx.on(panel, "mousedown", (event) => event.preventDefault());
  ctx.on(panel, "click", (event) => commit(rowIndex(event)));
  ctx.on(panel, "pointermove", (event) => {
    const index = rowIndex(event);
    if (index >= 0 && index !== active && !options[index].disabled) setActive(index, false);
  });

  ctx.on(select, "change", sync);
  /* Щелчок по <label for> фокусирует спрятанный select — фокус уходит на кнопку. */
  ctx.on(select, "focus", () => focus(trigger));

  read();

  return {
    refresh: read,
    destroy() {
      close();
      settle();
      wrap.before(select);
      wrap.remove();
      select.classList.remove(ENHANCED);
      restore(select, saved);
    },
  };
}

export default defineComponent({
  name: "select",
  selector: SELECTOR,
  create,
  api: ({ get }) => ({
    refresh: (select) => void get(select)?.refresh(),
  }),
});
