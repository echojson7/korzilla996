<!-- Карточка задачи (содержимое выезжающей панели), как в Битрикс24.
     Сверху название и кнопки статуса, под ними описание на всю ширину,
     ниже свойства в два столбца «поле — значение» (щелчок по значению
     меняет его), затем чек-лист, подзадачи, файлы и вкладки
     «Комментарии / История / Время».
     Без taskId — форма новой задачи: те же поля, «Поставить задачу». -->
<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import {
  Play, Pause, Check, Pencil, RotateCcw, Clock, Timer, Square, CalendarClock, Flame, Briefcase, Hash, X, Plus, Trash2,
  Paperclip, Download, FileText, ListChecks, GitBranch, Link2, MoreHorizontal, ChevronRight, CircleSlash,
} from "@lucide/vue";
import Popover from "../Popover.vue";
import Checkbox from "../Checkbox.vue";
import HueChip from "../HueChip.vue";
import ChatFace from "../messenger/ChatFace.vue";
import MarkdownField from "../editor/MarkdownField.vue";
import UserPick from "./UserPick.vue";
import DeadlinePick from "./DeadlinePick.vue";
import TaskActivity from "./TaskActivity.vue";
import {
  taskStore, person, nameOf, STATUSES, STATUS, PRIORITIES, duration, getTask, createTask, updateTask, setStatus,
  deleteTask, toggleTimer, addCheck, updateCheck, deleteCheck, addFiles, deleteFile, upsert,
  type TaskFull, type TaskInput, type Status, type Priority, type TaskBrief,
} from "../../lib/tasks";
import { deals, FUNNEL } from "../../lib/data";
import { apiUrl, ApiError } from "../../lib/api";
import { href } from "../../lib/router";
import { toast } from "../../lib/toast";
import { when, dueLook, parseMinutes, sizeText } from "./when";

const props = defineProps<{ taskId: number | null; preset?: TaskInput }>();
const emit = defineEmits<{ close: []; open: [id: number]; created: [id: number] }>();

const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");

/* ---------- Задача или черновик ---------- */

const task = ref<TaskFull | null>(null);
const loading = ref(false);
const draft = computed(() => props.taskId == null);
const blank = (): TaskInput & { checklist: string[] } => ({
  title: "", description: "", status: "pending", priority: "normal", responsible_id: taskStore.me, deadline: null,
  needs_review: false, estimate: null, project: null, deal_id: null, parent_id: null, accomplices: [], auditors: [], tags: [],
  checklist: [], ...props.preset,
});
const form = reactive(blank());

async function load(id: number) {
  loading.value = !task.value || task.value.id !== id;
  try {
    task.value = await getTask(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      toast("Задача не найдена или удалена", "danger");
      emit("close");
    } else fail(error);
  } finally {
    loading.value = false;
  }
}
watch(() => props.taskId, (id) => {
  if (id != null) load(id);
  else {
    task.value = null;
    Object.assign(form, blank());
    nextTick(() => titleInput.value?.focus());
  }
}, { immediate: true });

/* Кто-то поменял задачу — список узнал об этом из real-time, подтягиваем карточку. */
const listed = computed(() => taskStore.list.find((one) => one.id === props.taskId));
watch(() => listed.value && { version: listed.value.version, at: listed.value.updatedAt }, (next) => {
  const t = task.value;
  if (!next || !t || saving.value) return;
  if ((next.version ?? 0) > (t.version ?? 0) || (next.version == null && next.at !== t.updatedAt)) load(t.id);
});

/* Значения для показа — из задачи или из черновика. */
const v = computed(() => {
  const t = task.value;
  if (t) return {
    title: t.title, description: t.description, status: t.status, priority: t.priority, creatorId: t.creatorId,
    responsibleId: t.responsibleId, accomplices: t.accomplices, auditors: t.auditors, deadline: t.deadline,
    needsReview: t.needsReview, estimate: t.estimate, project: t.project, dealId: t.dealId, parentId: t.parentId, tags: t.tags,
  };
  return {
    title: form.title ?? "", description: form.description ?? "", status: form.status ?? "pending", priority: form.priority ?? "normal",
    creatorId: taskStore.me, responsibleId: form.responsible_id ?? taskStore.me, accomplices: form.accomplices ?? [], auditors: form.auditors ?? [],
    deadline: form.deadline ?? null, needsReview: !!form.needs_review, estimate: form.estimate ?? null, project: form.project ?? null,
    dealId: form.deal_id ?? null, parentId: form.parent_id ?? null, tags: form.tags ?? [],
  };
});
const canEdit = computed(() => draft.value || !!task.value?.can.edit);
const canWork = computed(() => draft.value || !!task.value?.can.work);

/* Одна точка правки: черновик меняется на месте, задача — на сервере. */
const saving = ref(false);
/* Один человек — одна роль: добавили наблюдателем того, кто был
   соисполнителем, — из соисполнителей он уходит, и наоборот. */
function setRole(role: "accomplices" | "auditors", ids: number[]) {
  const other = role === "accomplices" ? "auditors" : "accomplices";
  const rest = v.value[other].filter((id) => !ids.includes(id));
  patch(rest.length === v.value[other].length ? { [role]: ids } : { [role]: ids, [other]: rest });
}
async function patch(input: TaskInput) {
  if (draft.value) return Object.assign(form, input);
  if (!task.value) return;
  saving.value = true;
  try {
    task.value = await updateTask(task.value.id, input);
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}

/* ---------- Название ---------- */

const titleInput = ref<HTMLTextAreaElement | null>(null);
const titleText = ref("");
watch(() => v.value.title, (next) => (titleText.value = next), { immediate: true });
function saveTitle() {
  const next = titleText.value.replace(/\s+/g, " ").trim();
  if (draft.value) return (form.title = next);
  if (!next) return (titleText.value = v.value.title);
  if (next !== v.value.title) patch({ title: next });
}

/* ---------- Описание ---------- */

const descEditing = ref(false);
const descDraft = ref("");
function editDesc() {
  descDraft.value = v.value.description ?? "";
  descEditing.value = true;
}
async function saveDesc() {
  const text = descDraft.value.trim();
  if (text !== (v.value.description ?? "")) await patch({ description: text || null });
  descEditing.value = false;
}
const cancelDesc = () => (descEditing.value = false);

/* ---------- Статус и кнопки ---------- */

type Action = { to: Status; label: string; icon: unknown; primary?: boolean };
const actions = computed<Action[]>(() => {
  const t = task.value;
  if (!t || !t.can.work) return [];
  const iAmCreator = t.creatorId === taskStore.me || t.can.delete;
  const finish: Action = { to: "done", label: t.needsReview && !iAmCreator ? "Сдать на контроль" : "Завершить", icon: Check, primary: true };
  switch (t.status) {
    case "pending": return [{ to: "work", label: "Начать", icon: Play, primary: true }, { ...finish, primary: false }, { to: "deferred", label: "Отложить", icon: CircleSlash }];
    case "work": return [finish, { to: "pending", label: "Приостановить", icon: Pause }, { to: "deferred", label: "Отложить", icon: CircleSlash }];
    case "review": return iAmCreator
      ? [{ to: "done", label: "Принять работу", icon: Check, primary: true }, { to: "work", label: "Вернуть на доработку", icon: RotateCcw }]
      : [];
    case "deferred": return [{ to: "pending", label: "Возобновить", icon: RotateCcw, primary: true }, { ...finish, primary: false }];
    default: return [{ to: "pending", label: "Возобновить", icon: RotateCcw }];
  }
});
async function go(to: Status) {
  if (draft.value) return (form.status = to);
  if (!task.value) return;
  saving.value = true;
  try {
    task.value = await setStatus(task.value.id, to);
    if (task.value.status === "done") toast(`Задача завершена: «${task.value.title}»`, "success");
    else if (task.value.status === "review" && to === "done") toast("Задача ушла на контроль постановщику", "success");
  } catch (error) {
    fail(error);
  } finally {
    saving.value = false;
  }
}

/* ---------- Таймер ---------- */

const now = ref(Date.now());
setInterval(() => (now.value = Date.now()), 1000);
const timerHere = computed(() => !!task.value && taskStore.timer?.taskId === task.value.id);
const timerText = computed(() => {
  if (!timerHere.value || !taskStore.timer) return "";
  const s = Math.max(0, Math.floor((now.value - new Date(taskStore.timer.startedAt).getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
});
const spentTotal = computed(() => {
  const t = task.value;
  if (!t) return 0;
  const running = timerHere.value && taskStore.timer ? Math.floor((now.value - new Date(taskStore.timer.startedAt).getTime()) / 1000) : 0;
  return t.timeItems.reduce((sum, one) => sum + (one.stoppedAt ? one.seconds : 0), 0) + running;
});
async function timer() {
  if (!task.value) return;
  try {
    task.value = await toggleTimer(task.value.id);
  } catch (error) {
    fail(error);
  }
}

/* ---------- Поля ---------- */

const due = computed(() => dueLook(v.value.status, v.value.deadline));
const dealOf = (id: number | null) => (id ? deals.find((one) => one.id === id) ?? null : null);
const dealQ = ref("");
const dealList = computed(() => {
  const words = dealQ.value.trim().toLowerCase();
  return deals.filter((one) => !words || `${one.title} ${one.company} ${one.id}`.toLowerCase().includes(words)).slice(0, 30);
});
const parentQ = ref("");
const parentList = computed(() => {
  const words = parentQ.value.trim().toLowerCase();
  return taskStore.list
    .filter((one) => one.id !== task.value?.id && one.parentId !== task.value?.id)
    .filter((one) => !words || `${one.title} ${one.id}`.toLowerCase().includes(words))
    .slice(0, 30);
});
const parentInfo = computed(() => task.value?.parent ?? (v.value.parentId ? taskStore.list.find((one) => one.id === v.value.parentId) ?? null : null));

const projectText = ref("");
watch(() => v.value.project, (next) => (projectText.value = next ?? ""), { immediate: true });
const saveProject = () => projectText.value.trim() !== (v.value.project ?? "") && patch({ project: projectText.value.trim() || null });

const tagText = ref("");
function addTag() {
  const name = tagText.value.trim().replace(/^#/, "").toLowerCase();
  tagText.value = "";
  if (name && !v.value.tags.includes(name)) patch({ tags: [...v.value.tags, name] });
}
const dropTag = (name: string) => patch({ tags: v.value.tags.filter((one) => one !== name) });

const estimateText = ref("");
watch(() => v.value.estimate, (next) => (estimateText.value = next ? duration(next * 60) : ""), { immediate: true });
function saveEstimate() {
  const minutes = estimateText.value.trim() ? parseMinutes(estimateText.value) : null;
  if (estimateText.value.trim() && minutes == null) return toast("Например: 2 ч, 1:30 или 45", "danger");
  if (minutes !== v.value.estimate) patch({ estimate: minutes });
  estimateText.value = minutes ? duration(minutes * 60) : "";
}

const pickers = reactive<Record<string, { close: () => void } | null>>({});
const setPicker = (name: string) => (el: unknown) => (pickers[name] = el as { close: () => void } | null);
const closePicker = (name: string) => pickers[name]?.close();

/* ---------- Чек-лист ---------- */

const checkText = ref("");
const checkEdit = ref<number | null>(null);
const checkEditText = ref("");
const checklist = computed(() => (task.value ? task.value.checklistItems : form.checklist.map((title, i) => ({ id: -i - 1, title, done: false, doneBy: null, sort: i }))));
const checkDone = computed(() => checklist.value.filter((one) => one.done).length);
async function addCheckItem() {
  const title = checkText.value.trim();
  if (!title) return;
  checkText.value = "";
  if (draft.value) return form.checklist.push(title);
  try {
    task.value!.checklistItems.push(await addCheck(task.value!.id, title));
    syncBrief();
  } catch (error) {
    fail(error);
  }
}
async function toggleCheck(id: number, done: boolean) {
  if (draft.value || !task.value) return;
  const item = task.value.checklistItems.find((one) => one.id === id);
  if (!item) return;
  item.done = done;
  try {
    Object.assign(item, await updateCheck(id, { done }));
    syncBrief();
  } catch (error) {
    item.done = !done;
    fail(error);
  }
}
async function renameCheck(id: number) {
  const title = checkEditText.value.trim();
  checkEdit.value = null;
  if (!title) return;
  if (draft.value) return (form.checklist[-id - 1] = title);
  const item = task.value?.checklistItems.find((one) => one.id === id);
  if (!item || item.title === title) return;
  try {
    Object.assign(item, await updateCheck(id, { title }));
  } catch (error) {
    fail(error);
  }
}
async function removeCheck(id: number) {
  if (draft.value) return form.checklist.splice(-id - 1, 1);
  try {
    await deleteCheck(id);
    task.value!.checklistItems = task.value!.checklistItems.filter((one) => one.id !== id);
    syncBrief();
  } catch (error) {
    fail(error);
  }
}
function syncBrief() {
  const t = task.value;
  if (!t) return;
  t.checklist = { done: t.checklistItems.filter((one) => one.done).length, total: t.checklistItems.length };
  t.files = t.fileItems.length;
  t.comments = t.commentItems.length;
  upsert(t);
}

/* ---------- Подзадачи ---------- */

const childText = ref("");
async function addChild() {
  const title = childText.value.trim();
  if (!title || !task.value) return;
  childText.value = "";
  try {
    const child = await createTask({ title, parent_id: task.value.id, responsible_id: task.value.responsibleId ?? taskStore.me, project: task.value.project, deal_id: task.value.dealId });
    task.value.childItems.push(child);
    task.value.children++;
  } catch (error) {
    fail(error);
  }
}

/* ---------- Файлы ---------- */

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref<number | null>(null);
const dropping = ref(false);
async function sendFiles(list: FileList | File[] | null | undefined) {
  const files = [...(list ?? [])];
  if (!files.length || !task.value) return;
  uploading.value = 0;
  try {
    const saved = await addFiles(task.value.id, files, (part) => (uploading.value = part));
    task.value.fileItems.push(...saved);
    syncBrief();
  } catch (error) {
    fail(error);
  } finally {
    uploading.value = null;
  }
}
function onDrop(event: DragEvent) {
  dropping.value = false;
  if (event.dataTransfer?.files.length) sendFiles(event.dataTransfer.files);
}
async function removeFile(id: number) {
  try {
    await deleteFile(id);
    task.value!.fileItems = task.value!.fileItems.filter((one) => one.id !== id);
    syncBrief();
  } catch (error) {
    fail(error);
  }
}

/* ---------- Создание, удаление, ссылка ---------- */

const creating = ref(false);
async function create() {
  const title = (titleText.value || "").replace(/\s+/g, " ").trim();
  if (!title) {
    toast("Назовите задачу", "danger");
    return titleInput.value?.focus();
  }
  creating.value = true;
  try {
    const { checklist: items, ...input } = form;
    const made = await createTask({ ...input, title });
    for (const item of items) await addCheck(made.id, item).catch(() => undefined);
    toast(`Задача поставлена: «${made.title}»`, "success");
    emit("created", made.id);
  } catch (error) {
    fail(error);
  } finally {
    creating.value = false;
  }
}
async function remove() {
  if (!task.value) return;
  const title = task.value.title;
  try {
    await deleteTask(task.value.id);
    toast(`Задача удалена: «${title}»`);
    emit("close");
  } catch (error) {
    fail(error);
  }
}
const askDelete = ref(false);
function copyLink() {
  if (!task.value) return;
  const url = new URL(href("/tasks", { tab: "all", open: task.value.id }), location.href).toString();
  navigator.clipboard?.writeText(url).then(() => toast("Ссылка на задачу скопирована", "success"), () => toast(url));
}
const childDue = (one: TaskBrief) => dueLook(one.status, one.deadline);
const onActivityChanged = (next?: TaskFull) => {
  if (next) task.value = next;
  else if (task.value) load(task.value.id);
};
const priorityLabel = (id: Priority) => PRIORITIES.find((one) => one.id === id)?.label ?? id;
defineExpose({ create });
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-3">
    <div class="h-8 w-2/3 animate-pulse rounded-lg bg-default" />
    <div class="h-32 animate-pulse rounded-xl bg-default" />
    <div class="h-64 animate-pulse rounded-xl bg-default" />
  </div>
  <div
    v-else-if="task || draft"
    :class="descEditing ? 'absolute inset-0 bg-surface' : '-m-3 flex flex-col gap-3'"
    @keydown.ctrl.enter="draft && !descEditing && create()"
    @keydown.meta.enter="draft && !descEditing && create()"
  >
    <!-- Название — в шапке панели -->
    <Teleport defer to="#task-panel-title">
      <div class="flex items-start gap-1.5">
        <Flame v-if="v.priority === 'high'" class="mt-1 size-5 shrink-0 text-danger" aria-label="Высокий приоритет" />
        <textarea
          ref="titleInput"
          v-model="titleText"
          rows="1"
          class="-mx-1.5 min-w-0 flex-1 resize-none [field-sizing:content] rounded-lg bg-transparent px-1.5 py-0.5 text-xl leading-snug font-semibold outline-none hover:bg-default/70 focus:bg-background focus:ring-2 focus:ring-accent/40"
          :class="{ 'text-muted line-through': v.status === 'done' }"
          :readonly="!canEdit"
          placeholder="Что нужно сделать?"
          aria-label="Название задачи"
          maxlength="250"
          @keydown.enter.exact.prevent="($event.target as HTMLTextAreaElement).blur()"
          @blur="saveTitle"
        />
      </div>
    </Teleport>

    <!-- Подвал панели: кнопки статуса, таймер, ещё -->
    <Teleport defer to="#task-panel-footer">
      <template v-if="descEditing">
        <button type="button" class="button button--primary button--sm" :disabled="saving" @click="saveDesc"><Check class="size-4" />Сохранить</button>
        <button type="button" class="button button--ghost button--sm" @click="cancelDesc">Отмена</button>
        <span class="ml-auto hidden text-xs text-muted sm:inline">Ctrl+Enter — сохранить, Esc — отмена</span>
      </template>
      <template v-else-if="draft">
        <button type="button" class="button button--primary" :disabled="creating" @click="create"><Check class="size-4" />Поставить задачу</button>
        <button type="button" class="button button--ghost" @click="emit('close')">Отмена</button>
        <span class="ml-auto hidden text-xs text-muted sm:inline">Ctrl+Enter — поставить</span>
      </template>
      <template v-else-if="task && askDelete">
        <span class="min-w-0 flex-1 text-sm text-danger">Удалить задачу со всеми файлами и историей?</span>
        <button type="button" class="button button--danger button--sm" @click="remove"><Trash2 class="size-4" />Удалить</button>
        <button type="button" class="button button--ghost button--sm" @click="askDelete = false">Отмена</button>
      </template>
      <template v-else-if="task">
        <button
          v-for="one in actions"
          :key="one.to + one.label"
          type="button"
          class="button button--sm"
          :class="one.primary ? 'button--primary' : 'button--secondary'"
          :disabled="saving"
          @click="go(one.to)"
        >
          <component :is="one.icon" class="size-4" />{{ one.label }}
        </button>
        <span v-if="task.status === 'review' && !actions.length" class="text-sm text-muted">Ждёт проверки постановщиком</span>
        <span class="flex-1" />
        <button
          v-if="task.can.work && task.status !== 'done'"
          type="button"
          class="button button--sm button--icon-only"
          :class="timerHere ? 'button--danger w-auto! px-3' : 'button--ghost'"
          :title="timerHere ? 'Остановить учёт времени' : 'Начать учёт времени'"
          :aria-label="timerHere ? 'Остановить учёт времени' : 'Начать учёт времени'"
          @click="timer"
        >
          <template v-if="timerHere"><Square class="size-3.5" /><span class="tabular-nums">{{ timerText }}</span></template>
          <Timer v-else class="size-4" />
        </button>
        <Popover :ref="setPicker('more')" width="w-60" up>
          <template #trigger="{ toggle }">
            <button type="button" class="button button--sm button--ghost button--icon-only" aria-label="Ещё" title="Ещё" @click="toggle"><MoreHorizontal class="size-4" /></button>
          </template>
          <button type="button" class="menu-row" @click="copyLink(); closePicker('more')"><Link2 class="size-4" />Скопировать ссылку</button>
          <button v-if="task.can.edit || task.can.work" type="button" class="menu-row" @click="closePicker('more'); nextTick(() => ($refs.childInput as HTMLInputElement)?.focus())"><GitBranch class="size-4" />Добавить подзадачу</button>
          <button v-if="task.can.delete" type="button" class="menu-row text-danger" @click="askDelete = true; closePicker('more')"><Trash2 class="size-4" />Удалить задачу</button>
        </Popover>
      </template>
    </Teleport>

    <!-- Описание: правка на всю область карточки, по кнопке «Изменить» -->
    <MarkdownField
      v-if="descEditing"
      fill
      :model-value="descDraft"
      :placeholder="'Опишите задачу. Списки, чек-листы, ссылки и картинки — на панели сверху.'"
      @update:model-value="(text: string) => (descDraft = text)"
      @submit="saveDesc"
      @cancel="cancelDesc"
    />
    <template v-else>
    <section class="card card--default gap-0 p-0">
      <header class="flex h-11 items-center gap-2 px-4">
        <h3 class="min-w-0 flex-1 text-sm font-semibold">Описание</h3>
        <button v-if="canEdit" type="button" class="button button--ghost button--sm -mr-2" @click="editDesc"><Pencil class="size-3.5" />{{ v.description ? "Изменить" : "Добавить" }}</button>
      </header>
      <div v-if="v.description" class="-mt-2 pb-1" @dblclick="canEdit && editDesc()">
        <MarkdownField :model-value="v.description" :editable="false" />
      </div>
      <p v-else class="-mt-1 px-4 pb-4 text-sm text-muted">Описания нет.</p>
    </section>

    <!-- Свойства: поле слева, значение справа -->
    <section class="card card--default p-0">
      <dl class="props">
        <dt>Статус</dt>
        <dd>
          <Popover v-if="canWork" :ref="setPicker('status')" align="left" width="w-56">
            <template #trigger="{ toggle }">
              <button type="button" class="value" @click="toggle"><HueChip :hue="STATUS[v.status].hue">{{ STATUS[v.status].label }}</HueChip></button>
            </template>
            <button v-for="one in STATUSES" :key="one.id" type="button" class="menu-row" @click="draft ? (form.status = one.id) : go(one.id); closePicker('status')">
              <span class="size-2.5 rounded-full hue-bar" :style="{ '--hue': one.hue }" />{{ one.label }}<Check v-if="one.id === v.status" class="ml-auto size-4 text-accent" />
            </button>
          </Popover>
          <HueChip v-else :hue="STATUS[v.status].hue">{{ STATUS[v.status].label }}</HueChip>
        </dd>

        <dt>Крайний срок</dt>
        <dd>
          <Popover v-if="canEdit" :ref="setPicker('deadline')" align="left" width="w-64">
            <template #trigger="{ toggle }">
              <button type="button" class="value" @click="toggle">
                <span class="due" :class="`due--${due.tone === 'done' ? 'calm' : due.tone}`"><CalendarClock class="size-3 shrink-0" />{{ v.deadline ? (due.tone === 'danger' ? due.text : when(v.deadline)) : "Без срока" }}</span>
              </button>
            </template>
            <DeadlinePick :model-value="v.deadline" @pick="(iso) => { patch({ deadline: iso }); closePicker('deadline'); }" />
          </Popover>
          <span v-else class="due" :class="`due--${due.tone}`"><CalendarClock class="size-3 shrink-0" />{{ v.deadline ? when(v.deadline) : "Без срока" }}</span>
        </dd>

        <dt>Приоритет</dt>
        <dd>
          <div v-if="canEdit" class="toggle-button-group toggle-button-group--horizontal" role="radiogroup" aria-label="Приоритет">
            <button
              v-for="one in PRIORITIES"
              :key="one.id"
              type="button"
              role="radio"
              class="toggle-button toggle-button--sm gap-1"
              :class="{ 'prio-high': one.id === 'high' && v.priority === 'high' }"
              :aria-checked="v.priority === one.id"
              :data-selected="v.priority === one.id ? 'true' : undefined"
              @click="patch({ priority: one.id })"
            >
              <Flame v-if="one.id === 'high'" class="size-3.5" />{{ one.label }}
            </button>
          </div>
          <span v-else>{{ priorityLabel(v.priority) }}</span>
        </dd>

      </dl>
    </section>
    <section class="card card--default p-0">
      <dl class="props">
        <dt>Постановщик</dt>
        <dd><span class="person"><ChatFace :user="person(v.creatorId)" size="xs" />{{ nameOf(v.creatorId) }}</span></dd>

        <dt>Ответственный</dt>
        <dd>
          <Popover v-if="canEdit" :ref="setPicker('responsible')" align="left" width="w-72">
            <template #trigger="{ toggle }">
              <button type="button" class="value person" @click="toggle"><ChatFace :user="person(v.responsibleId)" size="xs" />{{ nameOf(v.responsibleId) }}</button>
            </template>
            <UserPick single :model-value="v.responsibleId ? [v.responsibleId] : []" @pick="(one) => { patch({ responsible_id: one.id }); closePicker('responsible'); }" />
          </Popover>
          <span v-else class="person"><ChatFace :user="person(v.responsibleId)" size="xs" />{{ nameOf(v.responsibleId) }}</span>
        </dd>

        <template v-for="role in (['accomplices', 'auditors'] as const)" :key="role">
          <dt>{{ role === "accomplices" ? "Соисполнители" : "Наблюдатели" }}</dt>
          <dd class="flex flex-wrap items-center gap-2">
            <span v-for="id in v[role]" :key="id" class="person chip-person">
              <ChatFace :user="person(id)" size="xs" />{{ nameOf(id) }}
              <button v-if="canEdit" type="button" class="flex size-5 items-center justify-center rounded-full text-muted hover:bg-black/5 hover:text-foreground" :aria-label="`Убрать ${nameOf(id)}`" @click="patch({ [role]: v[role].filter((one) => one !== id) })"><X class="size-3.5" /></button>
            </span>
            <Popover v-if="canEdit" :ref="setPicker(role)" align="left" width="w-72">
              <template #trigger="{ toggle }">
                <button type="button" class="add-btn" :aria-label="role === 'accomplices' ? 'Добавить соисполнителя' : 'Добавить наблюдателя'" @click="toggle"><Plus class="size-4" />{{ v[role].length ? "" : "Добавить" }}</button>
              </template>
              <UserPick :model-value="v[role]" @update:model-value="(ids) => setRole(role, ids)" />
            </Popover>
            <span v-else-if="!v[role].length" class="text-muted">—</span>
          </dd>
        </template>

      </dl>
    </section>
    <section class="card card--default p-0">
      <dl class="props">
        <dt>Проект</dt>
        <dd>
          <template v-if="canEdit">
            <input v-model="projectText" list="task-projects" class="value-input w-full" placeholder="Без проекта" @change="saveProject" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <datalist id="task-projects"><option v-for="one in taskStore.projects" :key="one" :value="one" /></datalist>
          </template>
          <span v-else>{{ v.project || "—" }}</span>
        </dd>

        <dt>Сделка</dt>
        <dd>
          <div class="flex min-w-0 items-center gap-1.5">
            <a v-if="dealOf(v.dealId)" :href="href('/deals', { funnel: dealOf(v.dealId)!.funnel, open: v.dealId })" class="link inline-flex min-w-0 items-center gap-1.5 text-sm">
              <Briefcase class="size-3.5 shrink-0 text-muted" /><span class="truncate">{{ dealOf(v.dealId)!.title }} · {{ dealOf(v.dealId)!.company }}</span>
            </a>
            <span v-else-if="v.dealId" class="text-muted">Сделка №{{ v.dealId }}</span>
            <Popover v-if="canEdit" :ref="setPicker('deal')" align="left" width="w-80">
              <template #trigger="{ toggle }">
                <button type="button" class="value shrink-0 text-muted" @click="toggle">{{ v.dealId ? "Сменить" : "Привязать сделку" }}</button>
              </template>
              <div class="p-1">
                <input v-model="dealQ" class="input input--full-width h-9 text-sm" placeholder="Название, компания или номер" autofocus />
                <div class="mt-1 max-h-64 overflow-y-auto thin-scroll">
                  <button v-for="one in dealList" :key="one.id" type="button" class="menu-row" @click="patch({ deal_id: one.id }); closePicker('deal')">
                    <span class="min-w-0 flex-1 text-left"><span class="block truncate">{{ one.title }}</span><span class="block truncate text-xs text-muted">{{ one.company }} · {{ FUNNEL[one.funnel].name }}</span></span>
                  </button>
                </div>
                <button v-if="v.dealId" type="button" class="menu-row text-danger" @click="patch({ deal_id: null }); closePicker('deal')"><X class="size-4" />Отвязать</button>
              </div>
            </Popover>
          </div>
        </dd>

        <dt>Теги</dt>
        <dd class="flex flex-wrap items-center gap-2">
          <span v-for="one in v.tags" :key="one" class="inline-flex h-8 items-center gap-1 rounded-lg bg-default px-2.5 text-sm">
            <Hash class="size-3.5 text-muted" />{{ one }}
            <button v-if="canEdit" type="button" class="-mr-1 flex size-5 items-center justify-center rounded-md text-muted hover:bg-black/5 hover:text-foreground" :aria-label="`Убрать тег ${one}`" @click="dropTag(one)"><X class="size-3.5" /></button>
          </span>
          <template v-if="canEdit">
            <input v-model="tagText" list="task-tags" class="add-input h-8! w-36" placeholder="+ Добавить тег" @keydown.enter.prevent="addTag" @change="addTag" />
            <datalist id="task-tags"><option v-for="one in taskStore.tags.filter((t) => !v.tags.includes(t))" :key="one" :value="one" /></datalist>
          </template>
          <span v-else-if="!v.tags.length" class="text-muted">—</span>
        </dd>

        <dt>Надзадача</dt>
        <dd>
          <div class="flex min-w-0 items-center gap-1.5">
            <button v-if="parentInfo" type="button" class="link inline-flex min-w-0 items-center gap-1 text-left text-sm" @click="emit('open', parentInfo.id)">
              <GitBranch class="size-3.5 shrink-0 text-muted" /><span class="truncate">{{ parentInfo.title }}</span>
            </button>
            <Popover v-if="canEdit" :ref="setPicker('parent')" align="left" width="w-80">
              <template #trigger="{ toggle }">
                <button type="button" class="value shrink-0 text-muted" @click="toggle">{{ v.parentId ? "Сменить" : "Сделать подзадачей" }}</button>
              </template>
              <div class="p-1">
                <input v-model="parentQ" class="input input--full-width h-9 text-sm" placeholder="Название или номер задачи" autofocus />
                <div class="mt-1 max-h-64 overflow-y-auto thin-scroll">
                  <button v-for="one in parentList" :key="one.id" type="button" class="menu-row" @click="patch({ parent_id: one.id }); closePicker('parent')">
                    <span class="min-w-0 flex-1 truncate text-left">{{ one.title }}</span><span class="text-xs text-muted">№{{ one.id }}</span>
                  </button>
                </div>
                <button v-if="v.parentId" type="button" class="menu-row text-danger" @click="patch({ parent_id: null }); closePicker('parent')"><X class="size-4" />Убрать</button>
              </div>
            </Popover>
          </div>
        </dd>

      </dl>
    </section>
    <section class="card card--default p-0">
      <dl class="props">
        <dt>Контроль</dt>
        <dd>
          <Checkbox :model-value="v.needsReview" :disabled="!canEdit" @update:model-value="(on) => patch({ needs_review: on })"><span class="text-sm">Принять работу после завершения</span></Checkbox>
        </dd>

        <dt>Время</dt>
        <dd class="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span class="inline-flex items-center gap-2">
            <span class="text-muted">план</span>
            <input v-if="canEdit" v-model="estimateText" class="value-input w-28" placeholder="не задан" @change="saveEstimate" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <span v-else>{{ v.estimate ? duration(v.estimate * 60) : "—" }}</span>
          </span>
          <span v-if="task" class="inline-flex items-center gap-1.5">
            <Clock class="size-3.5 text-muted" /><span class="text-muted">затрачено</span>
            <span :class="v.estimate && spentTotal > v.estimate * 60 ? 'font-medium text-danger' : 'font-medium'">{{ spentTotal ? duration(spentTotal) : "0 мин" }}</span>
          </span>
        </dd>

        <template v-if="task">
          <dt>Создана</dt>
          <dd class="text-muted">{{ when(task.createdAt) }}<template v-if="task.completedAt"> · завершена {{ when(task.completedAt) }}</template></dd>
        </template>
      </dl>
    </section>

    <!-- Чек-лист -->
    <section class="card card--default gap-3 p-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold">
        <ListChecks class="size-4 text-muted" />Чек-лист
        <span v-if="checklist.length" class="font-normal text-muted tabular-nums">{{ checkDone }} из {{ checklist.length }}</span>
      </h3>
      <div v-if="checklist.length" class="h-1 overflow-hidden rounded-full bg-default">
        <div class="h-full rounded-full bg-success transition-all" :style="{ width: `${(checkDone / checklist.length) * 100}%` }" />
      </div>
      <ul class="flex flex-col">
        <li v-for="one in checklist" :key="one.id" class="group -mx-2 flex min-h-10 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-default/60">
          <Checkbox :model-value="one.done" :disabled="!canWork || draft" :label="one.title" @update:model-value="(on) => toggleCheck(one.id, on)" />
          <input
            v-if="checkEdit === one.id"
            v-model="checkEditText"
            class="value-input flex-1"
            autofocus
            @keydown.enter="renameCheck(one.id)"
            @keydown.esc="checkEdit = null"
            @blur="renameCheck(one.id)"
          />
          <span v-else class="min-w-0 flex-1 text-sm" :class="{ 'text-muted line-through': one.done, 'cursor-text': canWork }" @click="canWork && ((checkEdit = one.id), (checkEditText = one.title))">{{ one.title }}</span>
          <button v-if="canWork" type="button" class="flex size-7 items-center justify-center rounded-lg text-muted opacity-0 group-hover:opacity-100 hover:bg-default hover:text-danger focus:opacity-100" aria-label="Удалить пункт" @click="removeCheck(one.id)"><X class="size-4" /></button>
        </li>
      </ul>
      <input v-if="canWork" v-model="checkText" class="add-input w-full" placeholder="+ Добавить пункт и Enter" @keydown.enter.prevent="addCheckItem" />
    </section>

    <!-- Подзадачи -->
    <section v-if="task" class="card card--default gap-2 p-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold"><GitBranch class="size-4 text-muted" />Подзадачи<span v-if="task.childItems.length" class="font-normal text-muted">{{ task.childItems.filter((one) => one.status === "done").length }} из {{ task.childItems.length }}</span></h3>
      <ul class="flex flex-col">
        <li v-for="one in task.childItems" :key="one.id">
          <button type="button" class="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-default/60" @click="emit('open', one.id)">
            <span class="size-2 shrink-0 rounded-full hue-bar" :style="{ '--hue': STATUS[one.status].hue }" :title="STATUS[one.status].label" />
            <span class="min-w-0 flex-1 truncate text-sm" :class="{ 'text-muted line-through': one.status === 'done' }">{{ one.title }}</span>
            <span class="due shrink-0" :class="`due--${childDue(one).tone}`">{{ childDue(one).text }}</span>
            <ChatFace :user="person(one.responsibleId)" size="xs" />
            <ChevronRight class="size-4 text-muted" />
          </button>
        </li>
      </ul>
      <input v-if="task.can.edit || task.can.work" ref="childInput" v-model="childText" class="add-input w-full" placeholder="+ Подзадача: название и Enter" @keydown.enter.prevent="addChild" />
    </section>

    <!-- Файлы -->
    <section
      v-if="task"
      class="card card--default gap-2 p-4 transition"
      :class="{ 'ring-2 ring-accent': dropping }"
      @dragover.prevent="task.can.work && (dropping = true)"
      @dragleave="dropping = false"
      @drop.prevent="task.can.work && onDrop($event)"
    >
      <h3 class="flex items-center gap-2 text-sm font-semibold">
        <Paperclip class="size-4 text-muted" />Файлы<span v-if="task.fileItems.length" class="font-normal text-muted">{{ task.fileItems.length }}</span>
        <button v-if="task.can.work" type="button" class="button button--ghost button--sm ml-auto" :disabled="uploading != null" @click="fileInput?.click()">
          <Plus class="size-4" />{{ uploading != null ? `Загрузка ${Math.round(uploading * 100)}%` : "Прикрепить" }}
        </button>
        <input ref="fileInput" type="file" multiple class="hidden" @change="sendFiles(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''" />
      </h3>
      <ul v-if="task.fileItems.length" class="grid gap-2 sm:grid-cols-2">
        <li v-for="one in task.fileItems" :key="one.id" class="group flex items-center gap-2.5 rounded-xl border border-separator p-2">
          <a :href="apiUrl(one.url)" target="_blank" rel="noopener" class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default">
            <img v-if="one.image" :src="apiUrl(one.url)" alt="" class="size-full object-cover" loading="lazy" />
            <FileText v-else class="size-5 text-muted" />
          </a>
          <span class="min-w-0 flex-1">
            <a :href="apiUrl(one.url)" target="_blank" rel="noopener" class="block truncate text-sm hover:underline">{{ one.name }}</a>
            <span class="block truncate text-xs text-muted">{{ sizeText(one.size) }} · {{ nameOf(one.userId) }}</span>
          </span>
          <a :href="`${apiUrl(one.url)}?download=1`" class="text-muted hover:text-foreground" aria-label="Скачать"><Download class="size-4" /></a>
          <button v-if="one.userId === taskStore.me || task.can.edit" type="button" class="hidden text-muted group-hover:block hover:text-danger" aria-label="Удалить файл" @click="removeFile(one.id)"><Trash2 class="size-4" /></button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ task.can.work ? "Перетащите файлы сюда или нажмите «Прикрепить»." : "Файлов нет." }}</p>
    </section>

    <!-- Комментарии, история, время -->
    <TaskActivity v-if="task" :task="task" mode="work" @changed="onActivityChanged" />

    </template>

    <!-- История изменений — в правой области панели, переключателем с чатом -->
    <Teleport v-if="task" defer to="#task-panel-side">
      <TaskActivity :task="task" mode="history" @changed="onActivityChanged" />
    </Teleport>

  </div>
</template>

<style scoped>
/* Свойства: подпись слева, значение справа, строки через черту. */
.props {
  display: grid;
  grid-template-columns: minmax(112px, 150px) minmax(0, 1fr);
  padding: 0.25rem 0;
}
/* Строка: подпись слева, значение справа. Разделитель — с отступами от
   краёв блока: черта у подписи начинается с отступа, у значения — кончается. */
.props > dt,
.props > dd {
  display: flex;
  align-items: center;
  min-height: 3.25rem;
  padding-block: 0.625rem;
  font-size: 0.875rem;
  border-top: 1px solid var(--separator);
}
.props > dt {
  margin-left: 1rem;
  padding-right: 0.75rem;
  color: var(--muted);
  font-size: 0.8125rem;
}
.props > dd {
  min-width: 0;
  margin-right: 1rem;
}
.props > dt:first-of-type,
.props > dt:first-of-type + dd {
  border-top: 0;
}
/* Значение, которое меняется щелчком: как «призрачная» кнопка HeroUI. */
.value {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  margin-left: -0.5rem;
  padding: 0 0.5rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  transition: background-color 120ms;
}
.value:hover {
  background: var(--default);
}
.value-input {
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
.value-input:hover {
  background: var(--default);
}
.value-input:focus {
  background: var(--field-background, var(--surface));
  border-color: var(--accent);
}
/* Добавить: кнопка и поле с пунктирной рамкой. */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px dashed var(--border);
  border-radius: 0.625rem;
  color: var(--muted);
  font-size: 0.875rem;
  transition: background-color 120ms, color 120ms, border-color 120ms;
}
.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.add-input {
  min-width: 0;
  height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px dashed var(--border);
  border-radius: 0.75rem;
  background: transparent;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 120ms, background-color 120ms;
}
.add-input:hover {
  border-color: color-mix(in oklab, var(--accent) 50%, var(--border));
}
.add-input:focus {
  border-style: solid;
  border-color: var(--accent);
  background: var(--surface);
}
.prio-high[data-selected="true"] {
  color: var(--danger);
}
.person {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}
.chip-person {
  height: 2rem;
  gap: 0.5rem;
  padding: 0 0.375rem 0 0.25rem;
  border-radius: 999px;
  background: var(--default);
  font-size: 0.8125rem;
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
</style>
