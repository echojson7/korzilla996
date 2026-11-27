<!-- Робот или триггер стадии: что делает, когда, при каком условии.
     Сохраняется кнопкой; журнал запусков робота — внизу. -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import UiSelect from "../../UiSelect.vue";
import { Check, Copy, Plus, Trash2, X, Info } from "@lucide/vue";
import Checkbox from "../../Checkbox.vue";
import SpecPicker from "./SpecPicker.vue";
import TemplateInput from "./TemplateInput.vue";
import ValueInput from "./ValueInput.vue";
import ConditionEditor from "./ConditionEditor.vue";
import { writableFields, dateFields, conditionFields } from "./fields";
import { crm } from "../../../lib/crm";
import { PRIORITIES } from "../../../lib/tasks";
import {
  robots, saveRobot, deleteRobot, saveTrigger, deleteTrigger, robotRuns, UNITS, RUN_STATUS,
  type Robot, type Trigger, type Rule, type Delay, type RobotRun,
} from "../../../lib/robots";
import { apiUrl, ApiError } from "../../../lib/api";
import { href } from "../../../lib/router";
import { toast } from "../../../lib/toast";

const props = defineProps<{ kind: "robot" | "trigger"; item: Partial<Robot & Trigger> & { stageId: number; type: string } }>();
const emit = defineEmits<{ close: [] }>();
const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");

const isRobot = computed(() => props.kind === "robot");
const editable = computed(() => robots.can.edit);
const pipeline = computed(() => crm.pipelines.find((one) => one.id === robots.pipelineId));
const stage = computed(() => pipeline.value?.stages.find((one) => one.id === draft.stageId));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}
const draft = reactive({
  stageId: props.item.stageId,
  type: props.item.type,
  title: props.item.title ?? "",
  active: props.item.active ?? true,
  allowBack: props.item.allowBack ?? false,
  settings: (clone(props.item.settings) ?? {}) as Record<string, any>,
  conditions: (clone(props.item.conditions) ?? []) as Rule[],
  delay: (clone(props.item.delay) ?? { type: "now", value: "0", unit: "m" }) as Delay,
});
const s = draft.settings;
/* Значения по умолчанию для нового робота. */
const defaults: Record<string, Record<string, any>> = {
  task: { title: "", description: "", responsible: ["responsible"], creator: ["responsible"], accomplices: [], auditors: [], deadline_value: "", deadline_unit: "wd", priority: "normal", checklist: "", needs_review: false },
  notify: { to: ["responsible"], from: ["responsible"], text: "", link: true },
  chat: { from: ["responsible"], text: "" },
  field: { values: [{ field: "title", value: "" }] },
  stage: { stage_id: "" },
  responsible: { users: [], mode: "first" },
  deal: { stage_id: "", title: "{{Название}}", responsible: ["responsible"], copy: true, values: [] },
  webhook: { url: "", method: "GET", body: "" },
  task_done: { title: "" },
  field_trigger: { fields: [] },
};
function fill() {
  const base = defaults[draft.type === "field" && !isRobot.value ? "field_trigger" : draft.type] ?? {};
  for (const [key, value] of Object.entries(base)) if (s[key] === undefined) s[key] = clone(value);
}
fill();
watch(() => draft.type, fill);
if (!draft.title) draft.title = (isRobot.value ? robots.types : robots.triggerTypes)[draft.type] ?? "";
watch(() => draft.type, (type, was) => {
  const names = isRobot.value ? robots.types : robots.triggerTypes;
  if (!draft.title || draft.title === names[was]) draft.title = names[type] ?? draft.title;
});

const list = (key: string) => computed({ get: () => (s[key] ?? []) as string[], set: (value) => (s[key] = value) });
const responsible = list("responsible");
const creator = list("creator");
const accomplices = list("accomplices");
const auditors = list("auditors");
const to = list("to");
const from = list("from");
const users = list("users");

const fieldDef = (key: string) => writableFields.value.find((one) => one.key === key);
const addValue = () => (s.values = [...(s.values ?? []), { field: writableFields.value[0]?.key ?? "title", value: "" }]);
const allStages = computed(() => crm.pipelines.map((one) => ({ title: one.title, stages: one.stages })));

const DELAYS = [
  { key: "now", label: "Сразу" },
  { key: "after", label: "Через время" },
  { key: "field", label: "От даты в поле" },
];
const delayType = computed(() => draft.delay.type);
function setDelay(key: string) {
  if (!editable.value) return;
  const type = key as Delay["type"];
  draft.delay = { ...draft.delay, type, unit: type === "field" ? "d" : draft.delay.unit, field: type === "field" ? draft.delay.field || dateFields.value[0]?.key : null };
}
function watchField(field: string) {
  if (field && !s.fields.includes(field)) s.fields.push(field);
}
/* Тип без сужения TypeScript в цепочке v-if. */
const typeIs = (type: string) => (draft.type as string) === type;

/* Входящий вебхук: полный адрес для внешней системы. */
const hookUrl = computed(() => (props.item.hook ? `${location.origin}${apiUrl(props.item.hook)}` : ""));
const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast("Скопировано", "success"));

/* Журнал запусков. */
const runs = ref<RobotRun[] | null>(null);
if (isRobot.value && props.item.id) robotRuns({ robot: props.item.id }).then((rows) => (runs.value = rows)).catch(() => (runs.value = []));
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const tone: Record<string, string> = { done: "text-success", failed: "text-danger", skipped: "text-muted", cancelled: "text-muted", pending: "text-warning", running: "text-warning" };

const saving = ref(false);
async function save() {
  saving.value = true;
  try {
    if (isRobot.value) {
      await saveRobot(props.item.id ?? null, { stage_id: draft.stageId, type: draft.type, title: draft.title, settings: s, conditions: draft.conditions, delay: draft.delay.type === "now" ? null : draft.delay, active: draft.active });
    } else {
      await saveTrigger(props.item.id ?? null, { stage_id: draft.stageId, type: draft.type, title: draft.title, settings: s, conditions: draft.conditions, allow_back: draft.allowBack, active: draft.active });
    }
    toast(props.item.id ? "Сохранено" : isRobot.value ? "Робот добавлен" : "Триггер добавлен", "success");
    emit("close");
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}
const askDelete = ref(false);
async function remove() {
  try {
    await (isRobot.value ? deleteRobot(props.item.id!) : deleteTrigger(props.item.id!));
    toast(isRobot.value ? "Робот удалён" : "Триггер удалён", "success");
    emit("close");
  } catch (error) {
    fail(error);
  }
}
</script>

<template>
  <form class="flex flex-col gap-4 pb-4" @submit.prevent="save">
    <section class="card card--default gap-3 p-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm">{{ isRobot ? "Действие" : "Событие" }}
          <UiSelect v-model="draft.type" :disabled="!editable">
            <option v-for="(text, key) in (isRobot ? robots.types : robots.triggerTypes)" :key="key" :value="key" :disabled="key === 'bitrix' && draft.type !== 'bitrix'">{{ text }}</option>
          </UiSelect>
        </label>
        <label class="flex flex-col gap-1 text-sm">Стадия
          <UiSelect v-model.number="draft.stageId" :disabled="!editable">
            <option v-for="one in pipeline?.stages ?? []" :key="one.id" :value="one.id">{{ one.title }}</option>
          </UiSelect>
        </label>
        <label class="flex flex-col gap-1 text-sm sm:col-span-2">Название
          <input v-model="draft.title" class="input text-sm" maxlength="250" :disabled="!editable" />
        </label>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span class="inline-flex items-center gap-2"><Checkbox v-model="draft.active" label="Включён" :disabled="!editable" />{{ isRobot ? "Робот включён" : "Триггер включён" }}</span>
        <span v-if="!isRobot" class="inline-flex items-center gap-2"><Checkbox v-model="draft.allowBack" label="Можно назад" :disabled="!editable" />Возвращать сделку на эту стадию с более поздних</span>
      </div>
      <p v-if="item.note" class="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm"><Info class="mt-0.5 size-4 shrink-0 text-warning" /><span class="whitespace-pre-line">{{ item.note }}</span></p>
    </section>

    <!-- Что делает -->
    <section v-if="!typeIs('bitrix')" class="card card--default gap-3 p-4">
      <h3 class="text-sm font-semibold">{{ isRobot ? "Что сделать" : "Когда срабатывает" }}</h3>

      <template v-if="isRobot && typeIs('task')">
        <label class="flex flex-col gap-1 text-sm">Название задачи<TemplateInput v-model="s.title" label="Название задачи" placeholder="Проверка ТЗ ({{Компания}})" :disabled="!editable" /></label>
        <label class="flex flex-col gap-1 text-sm">Описание<TemplateInput v-model="s.description" multiline :rows="5" label="Описание задачи" :disabled="!editable" /></label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm">Ответственный<SpecPicker v-model="responsible" single label="Ответственный" :disabled="!editable" /></label>
          <label class="flex flex-col gap-1 text-sm">Постановщик<SpecPicker v-model="creator" single label="Постановщик" :disabled="!editable" /></label>
          <label class="flex flex-col gap-1 text-sm">Соисполнители<SpecPicker v-model="accomplices" label="Соисполнители" :disabled="!editable" /></label>
          <label class="flex flex-col gap-1 text-sm">Наблюдатели<SpecPicker v-model="auditors" label="Наблюдатели" :disabled="!editable" /></label>
          <div class="flex flex-col gap-1 text-sm">Крайний срок
            <div class="flex gap-1.5">
              <input v-model="s.deadline_value" class="input w-24 text-sm" placeholder="нет" aria-label="Через сколько" :disabled="!editable" />
              <UiSelect v-model="s.deadline_unit" class="flex-1" aria-label="Единица срока" :disabled="!editable">
                <option v-for="(text, key) in UNITS" :key="key" :value="key">{{ text }} от постановки</option>
              </UiSelect>
            </div>
            <span class="text-xs text-muted">Число или поле сделки через «{ }». Пусто — без срока.</span>
          </div>
          <label class="flex flex-col gap-1 text-sm">Приоритет
            <UiSelect v-model="s.priority" :disabled="!editable"><option v-for="one in PRIORITIES" :key="one.id" :value="one.id">{{ one.label }}</option></UiSelect>
          </label>
        </div>
        <label class="flex flex-col gap-1 text-sm">Чек-лист — пункт в строке<textarea v-model="s.checklist" class="textarea text-sm" rows="3" :disabled="!editable" /></label>
        <span class="inline-flex items-center gap-2 text-sm"><Checkbox v-model="s.needs_review" label="Принять работу" :disabled="!editable" />Принять работу после завершения</span>
      </template>

      <template v-else-if="isRobot && typeIs('notify')">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm">Кому<SpecPicker v-model="to" label="Кому" :disabled="!editable" /></label>
          <label class="flex flex-col gap-1 text-sm">От кого<SpecPicker v-model="from" single label="От кого" :disabled="!editable" /></label>
        </div>
        <label class="flex flex-col gap-1 text-sm">Текст<TemplateInput v-model="s.text" multiline label="Текст уведомления" :disabled="!editable" /></label>
        <span class="inline-flex items-center gap-2 text-sm"><Checkbox v-model="s.link" label="Ссылка на сделку" :disabled="!editable" />Добавить ссылку на сделку</span>
        <p class="text-xs text-muted">Приходит в чат «Уведомления CRM» у каждого получателя.</p>
      </template>

      <template v-else-if="isRobot && typeIs('chat')">
        <label class="flex flex-col gap-1 text-sm">От кого<SpecPicker v-model="from" single label="От кого" :disabled="!editable" /></label>
        <label class="flex flex-col gap-1 text-sm">Сообщение<TemplateInput v-model="s.text" multiline label="Сообщение" :disabled="!editable" /></label>
      </template>

      <template v-else-if="isRobot && (typeIs('field') || typeIs('deal'))">
        <template v-if="typeIs('deal')">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-sm">Воронка и стадия
              <UiSelect v-model.number="s.stage_id" :disabled="!editable">
                <option value="" disabled>Выберите стадию</option>
                <optgroup v-for="one in allStages" :key="one.title" :label="one.title"><option v-for="st in one.stages" :key="st.id" :value="st.id">{{ st.title }}</option></optgroup>
              </UiSelect>
            </label>
            <label class="flex flex-col gap-1 text-sm">Ответственный<SpecPicker v-model="responsible" single label="Ответственный" :disabled="!editable" /></label>
          </div>
          <label class="flex flex-col gap-1 text-sm">Название<TemplateInput v-model="s.title" label="Название новой сделки" :disabled="!editable" /></label>
          <span class="inline-flex items-center gap-2 text-sm"><Checkbox v-model="s.copy" label="Скопировать" :disabled="!editable" />Скопировать компанию, контакты, сумму и поля</span>
          <p class="text-sm">Заполнить поля</p>
        </template>
        <div v-for="(row, i) in s.values" :key="i" class="grid grid-cols-[1fr_auto] gap-1.5 rounded-xl border border-separator p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
          <UiSelect v-model="row.field" aria-label="Поле" :disabled="!editable" @change="row.value = ''">
            <option v-for="one in writableFields" :key="one.key" :value="one.key">{{ one.title }}</option>
          </UiSelect>
          <button type="button" class="button button--ghost button--icon-only button--sm sm:order-last" aria-label="Убрать поле" :disabled="!editable" @click="s.values.splice(i, 1)"><X class="size-4" /></button>
          <div class="col-span-2 sm:col-span-1"><ValueInput v-model="row.value" :field="fieldDef(row.field)" label="Значение" :pipeline-id="robots.pipelineId" :disabled="!editable" /></div>
        </div>
        <button v-if="editable" type="button" class="button button--ghost button--sm self-start" @click="addValue"><Plus class="size-4" />Поле</button>
      </template>

      <template v-else-if="isRobot && typeIs('stage')">
        <label class="flex flex-col gap-1 text-sm">Перевести на стадию
          <UiSelect v-model.number="s.stage_id" :disabled="!editable">
            <option value="" disabled>Выберите стадию</option>
            <optgroup v-for="one in allStages" :key="one.title" :label="one.title"><option v-for="st in one.stages" :key="st.id" :value="st.id">{{ st.title }}</option></optgroup>
          </UiSelect>
        </label>
      </template>

      <template v-else-if="isRobot && typeIs('responsible')">
        <label class="flex flex-col gap-1 text-sm">Кого назначить<SpecPicker v-model="users" label="Сотрудники" :disabled="!editable" /></label>
        <label class="flex flex-col gap-1 text-sm">Если несколько
          <UiSelect v-model="s.mode" :disabled="!editable">
            <option value="first">Первого из списка</option>
            <option value="queue">По очереди</option>
            <option value="random">Случайно</option>
          </UiSelect>
        </label>
      </template>

      <template v-else-if="isRobot && typeIs('webhook')">
        <label class="flex flex-col gap-1 text-sm">Адрес<TemplateInput v-model="s.url" label="Адрес вебхука" placeholder="Адрес с подстановками полей сделки" :disabled="!editable" /></label>
        <label class="flex flex-col gap-1 text-sm">Метод
          <UiSelect v-model="s.method" :disabled="!editable"><option>GET</option><option>POST</option></UiSelect>
        </label>
        <label v-if="s.method === 'POST'" class="flex flex-col gap-1 text-sm">Тело (JSON)<TemplateInput v-model="s.body" multiline label="Тело запроса" placeholder="JSON с подстановками, например ID сделки" :disabled="!editable" /></label>
        <p class="text-xs text-muted">Подстановки в адресе кодируются для ссылки сами.</p>
      </template>

      <template v-else-if="!isRobot && typeIs('task_done')">
        <label class="flex flex-col gap-1 text-sm">Название задачи содержит (необязательно)<input v-model="s.title" class="input text-sm" placeholder="Любая задача по сделке" :disabled="!editable" /></label>
      </template>

      <template v-else-if="!isRobot && typeIs('field')">
        <label class="flex flex-col gap-1 text-sm">Какие поля изменились (пусто — любые)
          <UiSelect model-value="" :disabled="!editable" @change="watchField">
            <option value="">Добавить поле…</option>
            <option v-for="one in conditionFields" :key="one.key" :value="one.key">{{ one.title }}</option>
          </UiSelect>
        </label>
        <div v-if="s.fields.length" class="flex flex-wrap gap-1.5">
          <span v-for="(code, i) in s.fields" :key="code" class="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-sm">
            {{ conditionFields.find((one) => one.key === code)?.title ?? code }}
            <button v-if="editable" type="button" class="rounded-full p-0.5 hover:bg-default" aria-label="Убрать" @click="s.fields.splice(i, 1)"><X class="size-3" /></button>
          </span>
        </div>
        <p class="text-xs text-muted">Сработает, когда поле поменяют руками или роботом и условие ниже выполнится.</p>
      </template>

      <template v-else-if="!isRobot && typeIs('webhook')">
        <div v-if="hookUrl" class="flex flex-col gap-1.5 text-sm">
          Адрес для внешней системы
          <div class="flex gap-1.5">
            <input :value="hookUrl + '?deal='" class="input min-w-0 flex-1 font-mono text-xs" readonly aria-label="Адрес вебхука" />
            <button type="button" class="button button--secondary button--sm" @click="copy(hookUrl + '?deal=')"><Copy class="size-4" />Копировать</button>
          </div>
          <p class="text-xs text-muted">GET или POST. Параметр deal — номер сделки здесь, или external — номер сделки в Битрикс24. Адрес секретный: не публикуйте его.</p>
        </div>
        <p v-else class="text-sm text-muted">Адрес появится после сохранения.</p>
      </template>
    </section>

    <!-- Когда -->
    <section v-if="isRobot" class="card card--default gap-3 p-4">
      <h3 class="text-sm font-semibold">Когда выполнить</h3>
      <div class="toggle-button-group toggle-button-group--horizontal self-start" role="radiogroup" aria-label="Когда">
        <button v-for="one in DELAYS" :key="one.key" type="button" role="radio" class="toggle-button toggle-button--sm" :aria-checked="delayType === one.key" :data-selected="delayType === one.key ? 'true' : undefined" @click="setDelay(one.key)">{{ one.label }}</button>
      </div>
      <div v-if="draft.delay.type !== 'now'" class="flex flex-wrap items-center gap-1.5 text-sm">
        <template v-if="draft.delay.type === 'field'">
          <UiSelect v-model="draft.delay.field" class="w-auto max-w-full" aria-label="Поле с датой" :disabled="!editable">
            <option v-for="one in dateFields" :key="one.key" :value="one.key">{{ one.title }}</option>
          </UiSelect>
          <span>сдвиг</span>
        </template>
        <span v-else>через</span>
        <input v-model="draft.delay.value" class="input w-24 text-sm" aria-label="Сколько" :disabled="!editable" />
        <UiSelect v-model="draft.delay.unit" class="w-auto max-w-full" aria-label="Единица" :disabled="!editable">
          <option v-for="(text, key) in UNITS" :key="key" :value="key">{{ text }}</option>
        </UiSelect>
      </div>
      <p class="text-xs text-muted">Отложенный робот выполнится, только если сделка всё ещё на стадии «{{ stage?.title }}».</p>
    </section>

    <!-- Условие -->
    <section class="card card--default gap-3 p-4">
      <h3 class="text-sm font-semibold">Условие <span class="font-normal text-muted">{{ draft.conditions.length ? "" : "— нет, выполняется всегда" }}</span></h3>
      <ConditionEditor v-model="draft.conditions" :pipeline-id="robots.pipelineId" :disabled="!editable" />
    </section>

    <!-- Журнал -->
    <section v-if="isRobot && item.id" class="card card--default gap-2 p-4">
      <h3 class="text-sm font-semibold">Последние запуски</h3>
      <p v-if="runs === null" class="text-sm text-muted">Загружаю…</p>
      <p v-else-if="!runs.length" class="text-sm text-muted">Робот ещё не запускался.</p>
      <ul v-else class="flex flex-col divide-y divide-separator text-sm">
        <li v-for="run in runs ?? []" :key="run.id" class="flex flex-col gap-0.5 py-1.5">
          <div class="flex items-center gap-2">
            <span class="font-medium" :class="tone[run.status]">{{ RUN_STATUS[run.status] ?? run.status }}</span>
            <a v-if="run.deal" :href="href('/deals', { open: run.dealId })" class="min-w-0 flex-1 truncate text-accent">{{ run.deal }}</a>
            <span v-else class="flex-1 text-muted">Сделка №{{ run.dealId }}</span>
            <span class="shrink-0 text-xs text-muted">{{ at(run.finishedAt ?? run.runAt) }}</span>
          </div>
          <p v-if="run.result" class="text-xs text-muted">{{ run.result }}</p>
        </li>
      </ul>
    </section>

    <div v-if="editable" class="flex flex-wrap items-center gap-2">
      <template v-if="item.id">
        <template v-if="askDelete">
          <span class="text-sm">Удалить?</span>
          <button type="button" class="button button--ghost button--sm" @click="askDelete = false">Нет</button>
          <button type="button" class="button button--danger button--sm" @click="remove">Удалить</button>
        </template>
        <button v-else type="button" class="button button--ghost button--sm text-danger" @click="askDelete = true"><Trash2 class="size-4" />Удалить</button>
      </template>
      <span class="flex-1" />
      <button type="button" class="button button--ghost" @click="emit('close')">Отмена</button>
      <button type="submit" class="button button--primary" :disabled="saving || !draft.title.trim()"><Check class="size-4" />Сохранить</button>
    </div>
  </form>
</template>
