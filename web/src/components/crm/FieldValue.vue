<!-- Значение своего поля CRM в карточке: показ и правка по типу поля.
     Строки, числа, ссылки и даты правятся прямо в строке (Enter или уход
     с поля — сохранить, Esc — вернуть), список и сотрудник — из всплывающей
     панели, да/нет — флажком. Файлы пока только смотрятся (этап 2). -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, ExternalLink, FileText, Plus, X } from "@lucide/vue";
import Popover from "../Popover.vue";
import UiDate from "../UiDate.vue";
import Checkbox from "../Checkbox.vue";
import ChatFace from "../messenger/ChatFace.vue";
import UserPick from "../tasks/UserPick.vue";
import { person } from "../../lib/messenger";
import type { Field, FieldValue } from "../../lib/crm";

const props = defineProps<{ field: Field; value: FieldValue | undefined; editable: boolean }>();
const emit = defineEmits<{ save: [value: FieldValue] }>();

const list = computed<(string | number)[]>(() => (Array.isArray(props.value) ? (props.value as (string | number)[]) : props.value == null || props.value === "" ? [] : [props.value as string | number]));
const label = (id: string | number) => props.field.options.find((one) => one.id === String(id))?.label ?? String(id);
const files = computed(() => (Array.isArray(props.value) ? (props.value as { name?: string; url?: string }[]).filter((one) => one && typeof one === "object") : []));

/* Поле ввода: черновик, пока фокус в поле. */
const inputType = computed(() => ({ number: "text", url: "url" } as Record<string, string>)[props.field.type] ?? "text");
const asInput = (value: FieldValue | undefined) => {
  if (value == null) return "";
  if (props.field.type === "datetime" && typeof value === "string") {
    const at = new Date(value);
    if (Number.isNaN(+at)) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  }
  if (props.field.type === "number" && typeof value === "number") return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 }).replace(/ /g, " ");
  return String(value);
};
const draft = ref(asInput(props.value));
watch(() => props.value, (next) => (draft.value = asInput(next)));
function commit() {
  const text = draft.value.trim();
  if (text === asInput(props.value)) return;
  if (props.field.type === "datetime" && text) return emit("save", new Date(text).toISOString());
  emit("save", text === "" ? null : text);
}
function reset(event: Event) {
  draft.value = asInput(props.value);
  (event.target as HTMLElement).blur();
}

const picker = ref<InstanceType<typeof Popover> | null>(null);
function pickOption(id: string) {
  if (!props.field.multiple) {
    emit("save", id);
    picker.value?.close();
    return;
  }
  const set = new Set(list.value.map(String));
  if (set.has(id)) set.delete(id);
  else set.add(id);
  emit("save", [...set]);
}
function pickUsers(ids: number[]) {
  emit("save", ids);
}
function pickUser(id: number) {
  emit("save", id);
  picker.value?.close();
}
const shownDate = computed(() => {
  if (typeof props.value !== "string" || !props.value) return "";
  const at = new Date(props.field.type === "date" ? `${props.value}T00:00:00` : props.value);
  if (Number.isNaN(+at)) return props.value;
  return props.field.type === "date" ? at.toLocaleDateString("ru-RU") : at.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
});
</script>

<template>
  <!-- Да / нет -->
  <Checkbox v-if="field.type === 'boolean'" :model-value="!!value" :disabled="!editable" :label="field.title" @update:model-value="(on) => emit('save', on)" />

  <!-- Список -->
  <div v-else-if="field.type === 'list'" class="flex min-w-0 flex-wrap items-center gap-1">
    <template v-if="!editable">
      <span v-if="!list.length" class="text-muted">—</span>
      <span v-for="id in list" :key="id" class="fv-chip">{{ label(id) }}</span>
    </template>
    <Popover v-else ref="picker" align="left" width="w-72">
      <template #trigger="{ toggle }">
        <button type="button" class="fv-value" @click="toggle">
          <template v-if="list.length">
            <span v-if="!field.multiple">{{ label(list[0]) }}</span>
            <span v-for="id in field.multiple ? list : []" :key="id" class="fv-chip">{{ label(id) }}</span>
          </template>
          <span v-else class="text-muted">Выбрать</span>
        </button>
      </template>
      <div class="max-h-72 overflow-y-auto p-1 thin-scroll">
        <button v-for="one in field.options" :key="one.id" type="button" class="menu-row" @click="pickOption(one.id)">
          <span class="min-w-0 flex-1 truncate text-left">{{ one.label }}</span><Check v-if="list.map(String).includes(one.id)" class="size-4 text-accent" />
        </button>
        <button v-if="list.length && !field.multiple && !field.required" type="button" class="menu-row text-muted" @click="emit('save', null); picker?.close()"><X class="size-4" />Очистить</button>
      </div>
    </Popover>
  </div>

  <!-- Сотрудник -->
  <div v-else-if="field.type === 'user'" class="flex min-w-0 flex-wrap items-center gap-1">
    <span v-for="id in list" :key="id" class="inline-flex min-w-0 items-center gap-1.5 pr-1">
      <ChatFace :user="person(Number(id))" size="xs" /><span class="truncate">{{ person(Number(id))?.name ?? `№${id}` }}</span>
      <button v-if="editable && field.multiple" type="button" class="text-muted hover:text-danger" aria-label="Убрать" @click="emit('save', list.filter((one) => one !== id))"><X class="size-3.5" /></button>
    </span>
    <span v-if="!list.length && !editable" class="text-muted">—</span>
    <Popover v-if="editable" ref="picker" align="left" width="w-80">
      <template #trigger="{ toggle }">
        <button type="button" class="fv-value text-muted" @click="toggle"><Plus v-if="field.multiple || !list.length" class="size-3.5" />{{ list.length ? (field.multiple ? "" : "Сменить") : "Выбрать" }}</button>
      </template>
      <UserPick v-if="field.multiple" :model-value="list.map(Number)" @update:model-value="pickUsers" />
      <UserPick v-else single :model-value="list.map(Number)" @pick="(one) => pickUser(one.id)" />
    </Popover>
  </div>

  <!-- Файлы: пока только ссылки из Битрикса -->
  <div v-else-if="field.type === 'file'" class="flex min-w-0 flex-col gap-1">
    <span v-if="!files.length" class="text-muted">—</span>
    <a v-for="(one, i) in files" :key="i" :href="one.url" target="_blank" rel="noopener" class="link inline-flex min-w-0 items-center gap-1.5 text-sm"><FileText class="size-3.5 shrink-0 text-muted" /><span class="truncate">{{ one.name || "Файл" }}</span></a>
  </div>

  <!-- Многострочный текст -->
  <textarea
    v-else-if="field.type === 'text' && editable"
    v-model="draft"
    rows="2"
    class="fv-input min-h-8 w-full resize-y py-1.5"
    placeholder="Не заполнено"
    @blur="commit"
    @keydown.esc.prevent="reset"
    @keydown.enter.ctrl.prevent="($event.target as HTMLElement).blur()"
  />

  <!-- Дата, дата со временем -->
  <UiDate
    v-else-if="editable && (field.type === 'date' || field.type === 'datetime')"
    :model-value="asInput(value)"
    :type="field.type === 'datetime' ? 'datetime' : 'date'"
    :clearable="!field.required"
    :aria-label="field.title"
    @change="(v) => emit('save', !v ? null : field.type === 'datetime' ? new Date(v).toISOString() : v)"
  >
    <template #trigger="{ toggle }">
      <button type="button" class="fv-value" @click="toggle"><span v-if="value">{{ shownDate }}</span><span v-else class="text-muted">Не заполнено</span></button>
    </template>
  </UiDate>

  <!-- Строка, число, ссылка -->
  <div v-else-if="editable" class="flex min-w-0 flex-1 items-center gap-1">
    <input
      v-model="draft"
      :type="inputType"
      :inputmode="field.type === 'number' ? 'decimal' : undefined"
      class="fv-input w-full"
      placeholder="Не заполнено"
      @blur="commit"
      @keydown.enter.prevent="($event.target as HTMLElement).blur()"
      @keydown.esc.prevent="reset"
    />
    <a v-if="field.type === 'url' && value" :href="String(value)" target="_blank" rel="noopener" class="button button--ghost button--sm button--icon-only shrink-0" aria-label="Открыть ссылку"><ExternalLink class="size-3.5" /></a>
  </div>
  <template v-else>
    <span v-if="value == null || value === ''" class="text-muted">—</span>
    <a v-else-if="field.type === 'url'" :href="String(value)" target="_blank" rel="noopener" class="link truncate">{{ value }}</a>
    <span v-else-if="field.type === 'date' || field.type === 'datetime'">{{ shownDate }}</span>
    <span v-else-if="field.type === 'number'" class="tabular-nums">{{ Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) }}</span>
    <span v-else class="whitespace-pre-line break-words">{{ value }}</span>
  </template>
</template>

<style scoped>
.fv-value {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.375rem;
  min-height: 2rem;
  max-width: 100%;
  margin-left: -0.5rem;
  padding: 0 0.5rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  text-align: left;
  transition: background-color 120ms;
}
.fv-value:hover {
  background: var(--default);
}
.fv-input {
  min-width: 0;
  height: 2rem;
  margin-left: -0.5rem;
  padding: 0 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.625rem;
  background: transparent;
  font-size: 0.875rem;
  outline: none;
  transition: background-color 120ms, border-color 120ms;
}
textarea.fv-input {
  height: auto;
}
.fv-input:hover {
  background: var(--default);
}
.fv-input:focus {
  background: var(--field-background, var(--surface));
  border-color: var(--accent);
}
.fv-chip {
  display: inline-flex;
  align-items: center;
  height: 1.5rem;
  max-width: 100%;
  padding: 0 0.5rem;
  border-radius: 0.5rem;
  background: var(--surface-secondary);
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.6rem;
  font-size: 0.875rem;
  text-align: left;
}
.menu-row:hover {
  background: var(--default);
}
.fv-input::placeholder {
  color: var(--muted);
}
</style>
