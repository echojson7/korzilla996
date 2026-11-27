<!-- Выпадающий список на стилях HeroUI (select, list-box) вместо нативного
     <select>. Варианты — как у <select>: <option> и <optgroup> в слоте
     (с v-for, :value любого типа, disabled) или массив options.
     v-model отдаёт значение варианта как есть (число остаётся числом,
     модификатор .number тоже работает). Клавиатура: стрелки, Home/End,
     Enter/пробел, Esc, поиск по первым буквам; в длинном списке (больше
     12 вариантов) сверху поле поиска. -->
<script setup lang="ts">
import { Comment, Fragment, computed, nextTick, ref, useSlots, watch, type VNode, type VNodeArrayChildren } from "vue";
import { Check, ChevronDown } from "@lucide/vue";
import Popover from "./Popover.vue";

export type SelectOption = { value: unknown; label: string; disabled?: boolean; group?: string };
type Row = { header: string; opt?: undefined } | { header?: undefined; opt: SelectOption };

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    size?: "sm" | "md" | "lg";
    search?: boolean | "auto";
  }>(),
  { placeholder: "Не выбрано", size: "md", search: "auto" },
);
const emit = defineEmits<{ "update:modelValue": [value: any]; change: [value: any] }>();
const slots = useSlots();

const same = (a: unknown, b: unknown) => a === b || (a != null && b != null && String(a) === String(b));

function textOf(children: unknown): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((one) => textOf(typeof one === "object" && one && "children" in one ? (one as VNode).children : one)).join("");
  return "";
}
const flag = (v: unknown) => v === "" || v === true || v === "true";

function collect(nodes: VNodeArrayChildren, out: SelectOption[], group?: string) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) { collect(node, out, group); continue; }
    const vnode = node as VNode;
    if (vnode.type === Comment) continue;
    if (vnode.type === Fragment && Array.isArray(vnode.children)) collect(vnode.children, out, group);
    else if (vnode.type === "optgroup" && Array.isArray(vnode.children)) collect(vnode.children, out, String(vnode.props?.label ?? ""));
    else if (vnode.type === "option") {
      const label = textOf(vnode.children).trim();
      const p = vnode.props ?? {};
      out.push({ value: "value" in p ? p.value : label, label, disabled: flag(p.disabled), group });
    }
  }
}

/* Варианты читаются из слота при каждой отрисовке (так слот следит за
   своими данными), обработчики клавиш берут последний снимок. */
let snapshot: SelectOption[] = [];
function read(): SelectOption[] {
  const out: SelectOption[] = [];
  if (props.options) out.push(...props.options);
  else if (slots.default) collect(slots.default(), out);
  snapshot = out;
  return out;
}

const pop = ref<InstanceType<typeof Popover> | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const searchBox = ref<HTMLInputElement | null>(null);
const isOpen = computed(() => !!pop.value?.open);
const query = ref("");
const active = ref(-1);

const searchable = (all: SelectOption[]) => props.search === true || (props.search === "auto" && all.length > 12);
const visible = (all: SelectOption[]) => {
  const q = query.value.trim().toLowerCase();
  return q ? all.filter((one) => one.label.toLowerCase().includes(q) || (one.group ?? "").toLowerCase().includes(q)) : all;
};
function rowsOf(all: SelectOption[]): Row[] {
  const rows: Row[] = [];
  let group: string | undefined;
  for (const one of visible(all)) {
    if (one.group && one.group !== group) rows.push({ header: one.group });
    group = one.group;
    rows.push({ opt: one });
  }
  return rows;
}
const currentOf = (all: SelectOption[]) => all.find((one) => same(one.value, props.modelValue));

function scrollToActive() {
  nextTick(() => pop.value?.panel?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" }));
}
function open() {
  if (props.disabled) return;
  pop.value?.show();
}
function close(focus = true) {
  pop.value?.close();
  if (focus) trigger.value?.focus();
}
watch(isOpen, (on) => {
  if (!on) { query.value = ""; return; }
  const list = visible(snapshot);
  active.value = Math.max(0, list.findIndex((one) => same(one.value, props.modelValue)));
  scrollToActive();
  if (searchable(snapshot)) nextTick(() => searchBox.value?.focus());
});
watch(query, () => { active.value = visible(snapshot).findIndex((one) => !one.disabled); });

function pick(one: SelectOption) {
  if (one.disabled) return;
  close();
  if (same(one.value, props.modelValue)) return;
  emit("update:modelValue", one.value);
  emit("change", one.value);
}
function move(step: number, from = active.value) {
  const list = visible(snapshot);
  if (!list.length) return;
  let i = from;
  for (let n = 0; n < list.length; n++) {
    i = (i + step + list.length) % list.length;
    if (!list[i].disabled) break;
  }
  active.value = i;
  scrollToActive();
}

let typed = "";
let typedAt = 0;
function onKey(event: KeyboardEvent) {
  if (props.disabled) return;
  const list = visible(snapshot);
  if (!isOpen.value) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); open(); }
    return;
  }
  switch (event.key) {
    case "ArrowDown": event.preventDefault(); move(1); return;
    case "ArrowUp": event.preventDefault(); move(-1); return;
    case "Home": if (event.target === trigger.value) { event.preventDefault(); move(1, -1); } return;
    case "End": if (event.target === trigger.value) { event.preventDefault(); move(-1, list.length); } return;
    case "Enter": event.preventDefault(); if (list[active.value]) pick(list[active.value]); return;
    case "Tab": close(false); return;
    case " ": if (event.target === trigger.value) { event.preventDefault(); if (list[active.value]) pick(list[active.value]); } return;
  }
  /* Поиск по первым буквам, когда поля поиска нет. */
  if (event.target === trigger.value && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const now = Date.now();
    typed = now - typedAt > 700 ? event.key.toLowerCase() : typed + event.key.toLowerCase();
    typedAt = now;
    const i = list.findIndex((one) => !one.disabled && one.label.toLowerCase().startsWith(typed));
    if (i >= 0) { active.value = i; scrollToActive(); }
  }
}
const indexOf = (one: SelectOption) => visible(snapshot).indexOf(one);
const height = computed(() => ({ sm: "h-8 min-h-8", md: "h-9", lg: "h-10" })[props.size]);
</script>

<template>
  <Popover ref="pop" align="left" width="w-max max-w-sm" match-width="min" :class="['min-w-0', $attrs.class]" :style="$attrs.style as any">
    <template #trigger="{ toggle }">
      <button
        ref="trigger"
        type="button"
        class="select__trigger w-full items-center py-0 text-left"
        :class="height"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :title="title"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        @click="toggle"
        @keydown="onKey"
      >
        <span class="select__value min-w-0 truncate" :data-placeholder="!currentOf(read()) || undefined">{{ currentOf(snapshot)?.label ?? placeholder }}</span>
        <ChevronDown class="select__indicator size-4" :data-open="isOpen || undefined" aria-hidden="true" />
      </button>
    </template>
    <div v-if="searchable(snapshot)" class="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 bg-overlay p-1.5 pb-0">
      <input ref="searchBox" v-model="query" class="input h-8 w-full py-0 text-sm" placeholder="Поиск…" aria-label="Поиск по списку" @keydown="onKey" />
    </div>
    <div role="listbox" class="flex flex-col gap-0.5" :aria-label="ariaLabel">
      <template v-for="(row, i) in rowsOf(read())" :key="i">
        <div v-if="row.header !== undefined" class="px-2.5 pt-2 pb-1 text-xs font-medium text-muted">{{ row.header }}</div>
        <div
          v-else-if="row.opt"
          role="option"
          class="list-box-item min-h-8 py-1 text-sm"
          :class="row.opt.group ? 'ps-4' : 'px-2.5'"
          :aria-selected="same(row.opt.value, modelValue)"
          :aria-disabled="row.opt.disabled || undefined"
          :data-disabled="row.opt.disabled || undefined"
          :data-hovered="indexOf(row.opt) === active || undefined"
          :data-active="indexOf(row.opt) === active || undefined"
          @mousedown.prevent
          @pointermove="!row.opt.disabled && (active = indexOf(row.opt))"
          @click="pick(row.opt)"
        >
          <span class="min-w-0 flex-1">{{ row.opt.label }}</span>
          <span v-if="same(row.opt.value, modelValue)" class="list-box-item__indicator text-accent"><Check class="size-3.5" /></span>
        </div>
      </template>
      <div v-if="!visible(snapshot).length" class="px-2.5 py-2 text-sm text-muted">Ничего не найдено</div>
    </div>
  </Popover>
</template>
