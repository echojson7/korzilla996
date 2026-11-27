<!-- Поле даты на стилях HeroUI (date-picker, calendar) вместо нативного
     <input type="date|datetime-local">. Значение в тех же строках, что и у
     нативного поля: "ГГГГ-ММ-ДД" или "ГГГГ-ММ-ДДTчч:мм" (type="datetime"),
     пусто — "". Календарь с понедельника, щелчок по заголовку — выбор
     месяца, потом года. Клавиатура: стрелки — день/неделя, PageUp/PageDown —
     месяц, Enter — выбрать, Esc — закрыть. Свой вид кнопки — слот trigger. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "@lucide/vue";
import Popover from "./Popover.vue";

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    type?: "date" | "datetime";
    min?: string;
    max?: string;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    size?: "sm" | "md" | "lg";
    clearable?: boolean;
    align?: "left" | "right" | "center";
  }>(),
  { type: "date", placeholder: "Выберите дату", size: "md", clearable: true, align: "left" },
);
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [value: string] }>();

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s?: string | null) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  return m ? { date: new Date(+m[1], +m[2] - 1, +m[3]), time: m[4] ? `${m[4]}:${m[5]}` : "" } : null;
};
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const longFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

const value = computed(() => parse(props.modelValue));
const label = computed(() => {
  if (!value.value) return "";
  const text = longFmt.format(value.value.date).replace(/\s?г\.$/, "");
  return props.type === "datetime" && value.value.time ? `${text}, ${value.value.time}` : text;
});

const pop = ref<InstanceType<typeof Popover> | null>(null);
const grid = ref<HTMLElement | null>(null);
const isOpen = computed(() => !!pop.value?.open);
const view = ref<"days" | "months" | "years">("days");
const cursor = ref(new Date());
const draftDay = ref<string>("");
const draftTime = ref("");
const gridFocused = ref(false);
/* Рамка фокуса на дне — только при работе с клавиатуры. */
const byKeys = ref(false);
const today = key(new Date());

watch(isOpen, (on) => {
  if (!on) return;
  view.value = "days";
  byKeys.value = false;
  const v = value.value;
  cursor.value = v ? new Date(v.date) : clamp(new Date());
  draftDay.value = v ? key(v.date) : "";
  const now = new Date();
  draftTime.value = v?.time || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  nextTick(() => grid.value?.focus());
});

const outOfRange = (k: string) => (!!props.min && k < props.min) || (!!props.max && k > props.max);
function clamp(d: Date) {
  const k = key(d);
  if (props.min && k < props.min) return parse(props.min)!.date;
  if (props.max && k > props.max) return parse(props.max)!.date;
  return d;
}

/* Сетка месяца: 6 недель с понедельника. */
const days = computed(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1);
  const shift = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - shift);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: d, key: key(d), outside: d.getMonth() !== first.getMonth() };
  });
});
const yearPage = computed(() => {
  const from = cursor.value.getFullYear() - (cursor.value.getFullYear() % 12);
  return Array.from({ length: 12 }, (_, i) => from + i);
});
const heading = computed(() => {
  const y = cursor.value.getFullYear();
  if (view.value === "days") return `${MONTHS[cursor.value.getMonth()]} ${y}`;
  if (view.value === "months") return String(y);
  return `${yearPage.value[0]}–${yearPage.value[11]}`;
});

function shiftMonth(n: number) {
  const c = cursor.value;
  const day = c.getDate();
  const next = new Date(c.getFullYear(), c.getMonth() + n, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  cursor.value = new Date(next.getFullYear(), next.getMonth(), Math.min(day, last));
}
function nav(dir: number) {
  if (view.value === "days") shiftMonth(dir);
  else if (view.value === "months") shiftMonth(dir * 12);
  else shiftMonth(dir * 144);
}
function zoomOut() {
  view.value = view.value === "days" ? "months" : "years";
}
function pickMonth(m: number) {
  const c = cursor.value;
  cursor.value = new Date(c.getFullYear(), m, Math.min(c.getDate(), new Date(c.getFullYear(), m + 1, 0).getDate()));
  view.value = "days";
  nextTick(() => grid.value?.focus());
}
function pickYear(y: number) {
  const c = cursor.value;
  cursor.value = new Date(y, c.getMonth(), Math.min(c.getDate(), new Date(y, c.getMonth() + 1, 0).getDate()));
  view.value = "months";
}

function commit(next: string) {
  if (next === (props.modelValue ?? "")) return;
  emit("update:modelValue", next);
  emit("change", next);
}
const timeOk = computed(() => /^([01]?\d|2[0-3]):[0-5]\d$/.test(draftTime.value.trim()));
const normTime = () => {
  const [h, m] = draftTime.value.trim().split(":");
  return `${pad(+h)}:${m}`;
};
function pickDay(k: string) {
  if (outOfRange(k)) return;
  cursor.value = parse(k)!.date;
  if (props.type === "date") {
    commit(k);
    pop.value?.close();
  } else draftDay.value = k;
}
function done() {
  if (!draftDay.value || !timeOk.value) return;
  commit(`${draftDay.value}T${normTime()}`);
  pop.value?.close();
}
function setToday() {
  const now = new Date();
  if (props.type === "date") pickDay(key(now));
  else {
    draftDay.value = key(now);
    draftTime.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    cursor.value = now;
  }
}
function clear() {
  commit("");
  pop.value?.close();
}

function onGridKey(event: KeyboardEvent) {
  byKeys.value = true;
  const c = cursor.value;
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (event.key in step) {
    event.preventDefault();
    cursor.value = new Date(c.getFullYear(), c.getMonth(), c.getDate() + step[event.key]);
  } else if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    shiftMonth((event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1));
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const shift = (c.getDay() + 6) % 7;
    cursor.value = new Date(c.getFullYear(), c.getMonth(), c.getDate() + (event.key === "Home" ? -shift : 6 - shift));
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    pickDay(key(c));
  }
}
function onTriggerKey(event: KeyboardEvent) {
  if (!isOpen.value && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    if (!props.disabled) pop.value?.show();
  }
}
const height = computed(() => ({ sm: "h-8 min-h-8", md: "h-9", lg: "h-10" })[props.size]);
const selected = computed(() => (props.type === "date" ? (value.value ? key(value.value.date) : "") : draftDay.value));
</script>

<template>
  <Popover ref="pop" :align="align" width="w-auto" :class="['min-w-0', $attrs.class]" :style="$attrs.style as any">
    <template #trigger="{ toggle, open }">
      <slot name="trigger" :toggle="toggle" :open="open" :label="label">
        <button
          type="button"
          class="select__trigger w-full items-center py-0 text-left"
          :class="height"
          :disabled="disabled"
          :aria-label="ariaLabel"
          :title="title"
          aria-haspopup="dialog"
          :aria-expanded="open"
          @click="toggle"
          @keydown="onTriggerKey"
        >
          <span class="select__value min-w-0 truncate" :data-placeholder="!label || undefined">{{ label || placeholder }}</span>
          <CalendarDays class="select__indicator size-4" aria-hidden="true" />
        </button>
      </slot>
    </template>
    <div class="date-picker-panel p-1.5" role="dialog" :aria-label="ariaLabel || placeholder">
      <div class="calendar">
        <div class="calendar__header">
          <button type="button" class="calendar__heading rounded-lg px-1.5 py-0.5 text-left hover:bg-default" :disabled="view === 'years'" @click="zoomOut">{{ heading }}</button>
          <div class="flex gap-1">
            <button type="button" class="calendar__nav-button" aria-label="Назад" @click="nav(-1)"><ChevronLeft class="calendar__nav-button-icon" /></button>
            <button type="button" class="calendar__nav-button" aria-label="Вперёд" @click="nav(1)"><ChevronRight class="calendar__nav-button-icon" /></button>
          </div>
        </div>

        <div
          v-if="view === 'days'"
          ref="grid"
          class="calendar__grid outline-none"
          role="grid"
          tabindex="0"
          @keydown="onGridKey"
          @focus="gridFocused = true"
          @blur="gridFocused = false"
          @pointerdown="byKeys = false"
        >
          <span v-for="w in WEEK" :key="w" class="calendar__header-cell">{{ w }}</span>
          <button
            v-for="(d, i) in days"
            :key="d.key"
            type="button"
            tabindex="-1"
            class="calendar__cell"
            :class="i < 7 ? 'mt-1' : ''"
            :data-today="d.key === today || undefined"
            :data-selected="d.key === selected || undefined"
            :data-outside-month="d.outside || undefined"
            :data-disabled="outOfRange(d.key) || undefined"
            :data-focus-visible="(byKeys && gridFocused && d.key === key(cursor)) || undefined"
            :aria-label="longFmt.format(d.date)"
            @mousedown.prevent
            @click="pickDay(d.key)"
          >{{ d.date.getDate() }}</button>
        </div>
        <div v-else-if="view === 'months'" class="grid grid-cols-3 gap-1">
          <button v-for="(m, i) in MONTHS_SHORT" :key="m" type="button" class="calendar__cell aspect-auto h-10 capitalize" :data-selected="i === cursor.getMonth() || undefined" @click="pickMonth(i)">{{ m }}</button>
        </div>
        <div v-else class="grid grid-cols-3 gap-1">
          <button v-for="y in yearPage" :key="y" type="button" class="calendar__cell aspect-auto h-10" :data-selected="y === cursor.getFullYear() || undefined" :data-today="y === new Date().getFullYear() || undefined" @click="pickYear(y)">{{ y }}</button>
        </div>
      </div>

      <div v-if="type === 'datetime'" class="mt-3 flex items-center gap-2">
        <input v-model="draftTime" class="input h-8 w-20 py-0 text-center text-sm" :data-invalid="!timeOk || undefined" inputmode="numeric" placeholder="чч:мм" aria-label="Время" maxlength="5" @keydown.enter.prevent="done" />
        <button type="button" class="button button--primary button--sm ml-auto" :disabled="!draftDay || !timeOk" @click="done">Готово</button>
      </div>
      <div class="mt-2 flex items-center gap-1 border-t border-separator pt-2">
        <button type="button" class="button button--ghost button--sm" @click="setToday">Сегодня</button>
        <button v-if="clearable && modelValue" type="button" class="button button--ghost button--sm ml-auto text-muted" @click="clear"><X class="size-3.5" />Очистить</button>
      </div>
    </div>
  </Popover>
</template>
