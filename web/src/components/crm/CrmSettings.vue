<!-- Настройки CRM как в Битрикс24: воронки сделок со стадиями и свои поля.
     Вкладка — в адресе (?setup=pipelines|fields). Всё сохраняется сразу;
     коллеги получают новую схему по событию crm. Править может владелец,
     администратор и роль с правом «Настраивать воронки, стадии и поля». -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import UiSelect from "../UiSelect.vue";
import { ArrowDown, ArrowUp, Check, ChevronRight, Plus, Star, Trash2, X } from "@lucide/vue";
import Segmented from "../Segmented.vue";
import Checkbox from "../Checkbox.vue";
import Popover from "../Popover.vue";
import { crm, settings, SEMANTICS, type Field, type FieldType, type Semantic, type Stage } from "../../lib/crm";
import { route, setQuery } from "../../lib/router";
import { plural } from "../../lib/format";
import { toast } from "../../lib/toast";
import { ApiError } from "../../lib/api";

const props = defineProps<{ pipelineId: number }>();
const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");
const run = async (job: () => Promise<unknown>, done?: string) => {
  try {
    await job();
    if (done) toast(done, "success");
  } catch (error) {
    fail(error);
  }
};

const tab = computed(() => (route.value.query.get("setup") === "fields" ? "fields" : "pipelines"));
const TABS = [
  { key: "pipelines", label: "Воронки и стадии" },
  { key: "fields", label: "Поля сделки" },
];

/* ---------- Воронки ---------- */
const selectedId = ref(props.pipelineId);
watch(() => crm.pipelines.map((one) => one.id), (ids) => {
  if (!ids.includes(selectedId.value)) selectedId.value = ids[0] ?? 0;
}, { immediate: true });
const selected = computed(() => crm.pipelines.find((one) => one.id === selectedId.value) ?? null);
const newPipeline = ref("");
async function addPipeline() {
  const title = newPipeline.value.trim();
  if (!title) return;
  await run(async () => {
    const one = await settings.addPipeline(title);
    selectedId.value = one.id;
    newPipeline.value = "";
  }, `Воронка «${title}» добавлена`);
}
function movePipeline(id: number, by: number) {
  const ids = crm.pipelines.map((one) => one.id);
  const at = ids.indexOf(id);
  if (at + by < 0 || at + by >= ids.length) return;
  [ids[at], ids[at + by]] = [ids[at + by], ids[at]];
  run(() => settings.orderPipelines(ids));
}
const pipelineTitle = ref("");
watch(selected, (one) => (pipelineTitle.value = one?.title ?? ""), { immediate: true });
function renamePipeline() {
  const title = pipelineTitle.value.trim();
  if (!selected.value || !title || title === selected.value.title) return;
  run(() => settings.updatePipeline(selected.value!.id, { title }));
}
const askPipelineDelete = ref(false);
watch(selectedId, () => (askPipelineDelete.value = false));

/* ---------- Стадии ---------- */
const newStage = ref("");
function addStage() {
  const title = newStage.value.trim();
  if (!selected.value || !title) return;
  run(async () => {
    await settings.addStage(selected.value!.id, { title });
    newStage.value = "";
  });
}
function moveStage(stage: Stage, by: number) {
  if (!selected.value) return;
  const ids = selected.value.stages.map((one) => one.id);
  const at = ids.indexOf(stage.id);
  if (at + by < 0 || at + by >= ids.length) return;
  [ids[at], ids[at + by]] = [ids[at + by], ids[at]];
  run(() => settings.orderStages(selected.value!.id, ids));
}
function renameStage(stage: Stage, event: Event) {
  const title = (event.target as HTMLInputElement).value.trim();
  if (!title) return void ((event.target as HTMLInputElement).value = stage.title);
  if (title !== stage.title) run(() => settings.updateStage(stage.id, { title }));
}
const colorTimers = new Map<number, number>();
function recolor(stage: Stage, color: string) {
  clearTimeout(colorTimers.get(stage.id));
  colorTimers.set(stage.id, window.setTimeout(() => run(() => settings.updateStage(stage.id, { color })), 400));
}
const moveTo = ref<Record<number, number>>({});
const stagePickers = new Map<number, InstanceType<typeof Popover> | null>();
function deleteStage(stage: Stage) {
  run(async () => {
    await settings.deleteStage(stage.id, moveTo.value[stage.id] ?? null);
    stagePickers.get(stage.id)?.close();
  }, `Стадия «${stage.title}» удалена`);
}
const SEMANTIC_LIST = Object.entries(SEMANTICS) as [Semantic, string][];

/* ---------- Поля ---------- */
const fieldQ = ref("");
type Show = "on" | "off" | "all";
const show = ref<Show>("on");
const SHOW = computed(() => [
  { key: "on", label: "Включённые", count: crm.fields.filter((one) => one.active).length },
  { key: "off", label: "Выключенные", count: crm.fields.filter((one) => !one.active).length },
  { key: "all", label: "Все", count: crm.fields.length },
]);
const fieldList = computed(() => {
  const words = fieldQ.value.trim().toLowerCase();
  return crm.fields.filter((one) => (show.value === "all" || (show.value === "on") === one.active)
    && (!words || `${one.title} ${one.section ?? ""} ${one.externalCode ?? ""}`.toLowerCase().includes(words)));
});
const sectionNames = computed(() => [...new Set(crm.fields.map((one) => one.section).filter((one): one is string => !!one))].sort((a, b) => a.localeCompare(b, "ru")));
const typeList = computed(() => Object.entries(crm.types) as [FieldType, string][]);

const adding = ref(false);
const draft = ref({ title: "", type: "string" as FieldType, multiple: false, section: "", options: "" });
function addField() {
  const d = draft.value;
  if (!d.title.trim()) return;
  const options = d.type === "list" ? d.options.split("\n").map((label) => label.trim()).filter(Boolean).map((label) => ({ label })) : undefined;
  run(async () => {
    const one = await settings.addField({ title: d.title.trim(), type: d.type, multiple: d.multiple, section: d.section.trim() || null, options });
    openField.value = one.id;
    adding.value = false;
    draft.value = { title: "", type: "string", multiple: false, section: "", options: "" };
  }, "Поле добавлено");
}

const openField = ref<number | null>(null);
const toggle = (id: number) => (openField.value = openField.value === id ? null : id);
function patchField(field: Field, input: Parameters<typeof settings.updateField>[1]) {
  run(() => settings.updateField(field.id, input));
}
function renameField(field: Field, event: Event) {
  const title = (event.target as HTMLInputElement).value.trim();
  if (title && title !== field.title) patchField(field, { title });
}
function setSection(field: Field, event: Event) {
  const section = (event.target as HTMLInputElement).value.trim() || null;
  if (section !== field.section) patchField(field, { section });
}
function moveField(field: Field, by: number) {
  const ids = crm.fields.map((one) => one.id);
  const at = ids.indexOf(field.id);
  if (at + by < 0 || at + by >= ids.length) return;
  [ids[at], ids[at + by]] = [ids[at + by], ids[at]];
  run(() => settings.orderFields(ids));
}
/* Варианты списка: правка названия, добавление, удаление. */
const newOption = ref("");
function renameOption(field: Field, id: string, event: Event) {
  const label = (event.target as HTMLInputElement).value.trim();
  if (!label) return;
  patchField(field, { options: field.options.map((one) => (one.id === id ? { id, label } : one)) });
}
function addOption(field: Field) {
  const label = newOption.value.trim();
  if (!label) return;
  patchField(field, { options: [...field.options, { label }] });
  newOption.value = "";
}
function dropOption(field: Field, id: string) {
  if (field.options.length <= 1) return toast("В списке должен остаться хотя бы один вариант", "danger");
  patchField(field, { options: field.options.filter((one) => one.id !== id) });
}
const askFieldDelete = ref<number | null>(null);
function deleteField(field: Field) {
  run(async () => {
    await settings.deleteField(field.id);
    openField.value = null;
  }, `Поле «${field.title}» удалено`);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Segmented label="Раздел настроек" :items="TABS" :model-value="tab" @update:model-value="(key) => setQuery({ setup: key })" />

    <!-- Воронки и стадии -->
    <div v-if="tab === 'pipelines'" class="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <section class="card card--default gap-0 p-2">
        <ul class="flex flex-col">
          <li v-for="(one, i) in crm.pipelines" :key="one.id" class="group flex items-center gap-1 rounded-xl" :class="one.id === selectedId ? 'bg-default' : 'hover:bg-surface-secondary'">
            <button type="button" class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm" @click="selectedId = one.id">
              <Star v-if="one.isDefault" class="size-3.5 shrink-0 fill-current text-warning" />
              <span class="min-w-0 flex-1 truncate">{{ one.title }}</span>
              <span class="text-xs text-muted tabular-nums">{{ one.stages.length }}</span>
            </button>
            <span class="flex shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button type="button" class="icon-btn" :disabled="i === 0" aria-label="Выше" @click="movePipeline(one.id, -1)"><ArrowUp class="size-3.5" /></button>
              <button type="button" class="icon-btn" :disabled="i === crm.pipelines.length - 1" aria-label="Ниже" @click="movePipeline(one.id, 1)"><ArrowDown class="size-3.5" /></button>
            </span>
          </li>
        </ul>
        <form class="mt-2 flex gap-1.5 border-t border-separator px-1 pt-2" @submit.prevent="addPipeline">
          <input v-model="newPipeline" class="input input--full-width h-9 text-sm" placeholder="Новая воронка" maxlength="120" />
          <button type="submit" class="button button--secondary button--sm button--icon-only shrink-0" aria-label="Добавить воронку" :disabled="!newPipeline.trim()"><Plus class="size-4" /></button>
        </form>
      </section>

      <section v-if="selected" class="card card--default gap-4 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <input v-model="pipelineTitle" class="input min-w-0 flex-1 text-base font-semibold" maxlength="120" aria-label="Название воронки" @blur="renamePipeline" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <button v-if="!selected.isDefault" type="button" class="button button--ghost button--sm" @click="run(() => settings.updatePipeline(selected!.id, { is_default: true }), 'Воронка стала основной')"><Star class="size-3.5" />Сделать основной</button>
          <span v-else class="inline-flex items-center gap-1 text-sm text-muted"><Star class="size-3.5 fill-current text-warning" />Основная</span>
          <button type="button" class="button button--ghost button--sm text-danger" @click="askPipelineDelete = true"><Trash2 class="size-3.5" />Удалить</button>
        </div>
        <div v-if="askPipelineDelete" class="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 p-3 text-sm">
          <span class="min-w-0 flex-1">Удалить воронку «{{ selected.title }}»? Воронку со сделками удалить нельзя — сначала перенесите их.</span>
          <button type="button" class="button button--ghost button--sm" @click="askPipelineDelete = false">Отмена</button>
          <button type="button" class="button button--danger button--sm" @click="run(() => settings.deletePipeline(selected!.id), 'Воронка удалена')">Удалить</button>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-semibold">Стадии</h3>
          <ul class="flex flex-col gap-1.5">
            <li v-for="(stage, i) in selected.stages" :key="stage.id" class="flex flex-wrap items-center gap-2 rounded-xl border border-separator p-1.5 pl-2 sm:flex-nowrap">
              <input type="color" :value="stage.color" class="color-dot" :aria-label="`Цвет стадии ${stage.title}`" @input="recolor(stage, ($event.target as HTMLInputElement).value)" />
              <input :value="stage.title" class="value-input min-w-0 flex-1" maxlength="120" :aria-label="`Название стадии ${i + 1}`" @blur="renameStage(stage, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
              <UiSelect :model-value="stage.semantic" class="w-40 shrink-0" size="sm" :aria-label="`Смысл стадии ${stage.title}`" @update:model-value="(v: Semantic) => run(() => settings.updateStage(stage.id, { semantic: v }))">
                <option v-for="[key, label] in SEMANTIC_LIST" :key="key" :value="key">{{ label }}</option>
              </UiSelect>
              <span class="flex shrink-0">
                <button type="button" class="icon-btn" :disabled="i === 0" aria-label="Выше" @click="moveStage(stage, -1)"><ArrowUp class="size-3.5" /></button>
                <button type="button" class="icon-btn" :disabled="i === selected.stages.length - 1" aria-label="Ниже" @click="moveStage(stage, 1)"><ArrowDown class="size-3.5" /></button>
                <Popover :ref="(el) => stagePickers.set(stage.id, el as InstanceType<typeof Popover> | null)" width="w-72">
                  <template #trigger="{ toggle: open }"><button type="button" class="icon-btn hover:text-danger" aria-label="Удалить стадию" @click="open"><Trash2 class="size-3.5" /></button></template>
                  <div class="flex flex-col gap-2 p-2 text-sm">
                    <p>Удалить стадию «{{ stage.title }}»?</p>
                    <label class="flex flex-col gap-1 text-xs text-muted">Сделки с неё перенести на
                      <UiSelect v-model="moveTo[stage.id]" class="w-full" size="sm">
                        <option :value="undefined">— на ней нет сделок —</option>
                        <option v-for="other in selected.stages.filter((one) => one.id !== stage.id)" :key="other.id" :value="other.id">{{ other.title }}</option>
                      </UiSelect>
                    </label>
                    <button type="button" class="button button--danger button--sm self-end" @click="deleteStage(stage)"><Trash2 class="size-3.5" />Удалить</button>
                  </div>
                </Popover>
              </span>
            </li>
          </ul>
          <form class="mt-2 flex gap-1.5" @submit.prevent="addStage">
            <input v-model="newStage" class="input input--full-width h-9 text-sm" placeholder="Новая стадия — встанет после последней рабочей" maxlength="120" />
            <button type="submit" class="button button--secondary button--sm shrink-0" :disabled="!newStage.trim()"><Plus class="size-4" />Стадия</button>
          </form>
          <p class="mt-3 text-xs text-muted">«В работе» — колонки канбана. «Успех» и «Провал» завершают сделку: она уходит с канбана и видна в списке.</p>
        </div>
      </section>
    </div>

    <!-- Поля -->
    <div v-else class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <Segmented label="Какие поля" :items="SHOW" :model-value="show" @update:model-value="(key) => (show = key as Show)" />
        <input v-model="fieldQ" type="search" class="input h-9 min-w-0 flex-1 text-sm" placeholder="Поиск поля" aria-label="Поиск поля" />
        <button type="button" class="button button--primary button--sm" @click="adding = !adding"><Plus class="size-4" />Поле</button>
      </div>

      <form v-if="adding" class="card card--default gap-3 p-4" @submit.prevent="addField">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm">Название<input v-model="draft.title" class="input" maxlength="200" required autofocus /></label>
          <label class="flex flex-col gap-1 text-sm">Тип
            <UiSelect v-model="draft.type" size="lg">
              <option v-for="[key, label] in typeList.filter(([key]) => key !== 'file')" :key="key" :value="key">{{ label }}</option>
            </UiSelect>
          </label>
          <label class="flex flex-col gap-1 text-sm">Блок в карточке<input v-model="draft.section" class="input" list="crm-sections" placeholder="Дополнительно" maxlength="80" /></label>
          <div class="flex items-end pb-2"><Checkbox v-if="draft.type !== 'boolean'" v-model="draft.multiple" label="Несколько значений" /><span v-if="draft.type !== 'boolean'" class="ml-2 text-sm">Несколько значений</span></div>
          <label v-if="draft.type === 'list'" class="flex flex-col gap-1 text-sm sm:col-span-2">Варианты — по одному в строке
            <textarea v-model="draft.options" class="textarea min-h-24" placeholder="Lite&#10;Pro&#10;Premium" />
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="button button--ghost button--sm" @click="adding = false">Отмена</button>
          <button type="submit" class="button button--primary button--sm" :disabled="!draft.title.trim()"><Check class="size-4" />Добавить</button>
        </div>
      </form>
      <datalist id="crm-sections"><option v-for="one in sectionNames" :key="one" :value="one" /></datalist>

      <section class="card card--default gap-0 p-0">
        <p v-if="!fieldList.length" class="p-6 text-center text-sm text-muted">Полей не нашлось</p>
        <ul>
          <li v-for="field in fieldList" :key="field.id" class="border-t border-separator first:border-t-0">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-secondary" :aria-expanded="openField === field.id" @click="toggle(field.id)">
              <ChevronRight class="size-4 shrink-0 text-muted transition-transform" :class="openField === field.id ? 'rotate-90' : ''" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm" :class="field.active ? '' : 'text-muted line-through'">{{ field.title }}<span v-if="field.required" class="text-danger"> *</span></span>
                <span class="block truncate text-xs text-muted">{{ crm.types[field.type] ?? field.type }}{{ field.multiple && field.type !== 'file' ? ", несколько" : "" }} · {{ field.section || "Дополнительно" }}<template v-if="field.externalCode"> · {{ field.externalCode }}</template></span>
              </span>
              <span v-if="field.showOnKanban" class="tag">канбан</span>
              <span v-if="field.showInList" class="tag">список</span>
            </button>
            <div v-if="openField === field.id" class="grid gap-3 bg-surface-secondary/60 px-4 py-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1 text-xs text-muted">Название<input :value="field.title" class="input text-sm" maxlength="200" @blur="renameField(field, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" /></label>
              <label class="flex flex-col gap-1 text-xs text-muted">Блок в карточке<input :value="field.section ?? ''" class="input text-sm" list="crm-sections" placeholder="Дополнительно" maxlength="80" @blur="setSection(field, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" /></label>
              <div class="flex flex-col gap-2 text-sm sm:col-span-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                <span class="inline-flex items-center gap-2"><Checkbox :model-value="field.active" label="Включено" @update:model-value="(on) => patchField(field, { active: on })" />Включено</span>
                <span class="inline-flex items-center gap-2"><Checkbox :model-value="field.required" label="Обязательное" @update:model-value="(on) => patchField(field, { required: on })" />Обязательное при создании</span>
                <span class="inline-flex items-center gap-2"><Checkbox :model-value="field.showOnKanban" label="На канбане" @update:model-value="(on) => patchField(field, { show_on_kanban: on })" />На карточке канбана</span>
                <span class="inline-flex items-center gap-2"><Checkbox :model-value="field.showInList" label="В списке" @update:model-value="(on) => patchField(field, { show_in_list: on })" />Колонка в списке</span>
                <span v-if="!['boolean', 'file'].includes(field.type)" class="inline-flex items-center gap-2"><Checkbox :model-value="field.multiple" label="Несколько значений" @update:model-value="(on) => patchField(field, { multiple: on })" />Несколько значений</span>
              </div>
              <div v-if="field.type === 'list'" class="sm:col-span-2">
                <p class="mb-1 text-xs text-muted">Варианты · {{ plural(field.options.length, "вариант", "варианта", "вариантов") }}</p>
                <ul class="flex flex-col gap-1">
                  <li v-for="one in field.options" :key="one.id" class="flex items-center gap-1.5">
                    <input :value="one.label" class="value-input min-w-0 flex-1 bg-surface" maxlength="200" @blur="renameOption(field, one.id, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
                    <button type="button" class="icon-btn hover:text-danger" aria-label="Убрать вариант" @click="dropOption(field, one.id)"><X class="size-3.5" /></button>
                  </li>
                </ul>
                <form class="mt-1.5 flex gap-1.5" @submit.prevent="addOption(field)">
                  <input v-model="newOption" class="input input--full-width h-8 text-sm" placeholder="Новый вариант" maxlength="200" />
                  <button type="submit" class="button button--secondary button--sm shrink-0" :disabled="!newOption.trim()"><Plus class="size-3.5" /></button>
                </form>
              </div>
              <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
                <button type="button" class="button button--ghost button--sm" @click="moveField(field, -1)"><ArrowUp class="size-3.5" />Выше</button>
                <button type="button" class="button button--ghost button--sm" @click="moveField(field, 1)"><ArrowDown class="size-3.5" />Ниже</button>
                <span class="flex-1" />
                <template v-if="askFieldDelete === field.id">
                  <span class="text-sm">Удалить поле и его значения во всех сделках?</span>
                  <button type="button" class="button button--ghost button--sm" @click="askFieldDelete = null">Отмена</button>
                  <button type="button" class="button button--danger button--sm" @click="deleteField(field)">Удалить</button>
                </template>
                <button v-else type="button" class="button button--ghost button--sm text-danger" @click="askFieldDelete = field.id"><Trash2 class="size-3.5" />Удалить поле</button>
              </div>
            </div>
          </li>
        </ul>
      </section>
      <p class="text-xs text-muted">Выключенное поле не видно в карточке, но значения в сделках сохраняются. Поля из Битрикс24 перенесены с теми же вариантами; тестовые и устаревшие — выключены.</p>
    </div>
  </div>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  color: var(--muted);
  transition: background-color 120ms, color 120ms;
}
.icon-btn:not(:disabled):hover {
  background: var(--default);
  color: var(--foreground);
}
.icon-btn:disabled {
  opacity: 0.3;
}
.color-dot {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: none;
  cursor: pointer;
}
.color-dot::-webkit-color-swatch-wrapper {
  padding: 0;
}
.color-dot::-webkit-color-swatch {
  border: 0;
  border-radius: 9999px;
}
.color-dot::-moz-color-swatch {
  border: 0;
  border-radius: 9999px;
}
.value-input {
  min-width: 0;
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.625rem;
  background: transparent;
  font-size: 0.875rem;
  outline: none;
  transition: background-color 120ms, border-color 120ms;
}
.value-input:hover {
  background: var(--default);
}
.value-input:focus {
  background: var(--field-background, var(--surface));
  border-color: var(--accent);
}
.tag {
  flex-shrink: 0;
  padding: 0.125rem 0.375rem;
  border-radius: 0.375rem;
  background: var(--surface-secondary);
  color: var(--muted);
  font-size: 0.6875rem;
}
</style>
