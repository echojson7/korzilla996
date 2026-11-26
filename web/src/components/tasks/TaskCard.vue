<!-- Карточка задачи (содержимое выезжающей панели), как в Битрикс24.
     Сверху название и кнопки статуса, под ними описание на всю ширину,
     ниже свойства в два столбца «поле — значение» (щелчок по значению
     меняет его), затем чек-лист, подзадачи, файлы и вкладки
     «Комментарии / История / Время».
     Без taskId — форма новой задачи: те же поля, «Поставить задачу». -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  Play, Pause, Check, Pencil, RotateCcw, Timer, Square, CalendarClock, Flame, Briefcase, Hash, X, Plus, Trash2,
  Paperclip, Download, FileText, ListChecks, GitBranch, Link2, MoreHorizontal, ChevronRight, CircleSlash,
  SlidersHorizontal, Users,
} from "@lucide/vue";
import Popover from "../Popover.vue";
import Checkbox from "../Checkbox.vue";
import HueChip from "../HueChip.vue";
import ChatFace from "../messenger/ChatFace.vue";
import MarkdownField from "../editor/MarkdownField.vue";
import UserPick from "./UserPick.vue";
import DeadlinePick from "./DeadlinePick.vue";
import TaskActivity from "./TaskActivity.vue";
import CardBlock from "./CardBlock.vue";
import NoAccess from "../NoAccess.vue";
import { deniedOf, atLeast, type Denied } from "../../lib/denied";
import {
  taskStore, person, nameOf, STATUSES, STATUS, PRIORITIES, getTask, createTask, updateTask, setStatus,
  deleteTask, toggleTimer, addCheck, updateCheck, deleteCheck, addFiles, deleteFile, upsert, forgetTask,
  type TaskFull, type TaskInput, type Status, type Priority, type TaskBrief,
} from "../../lib/tasks";
import { dealIndex, searchDeals, pipelineById, type DealBrief } from "../../lib/crm";
import { chats, threads } from "../../lib/messenger";
import { apiUrl, ApiError } from "../../lib/api";
import { href } from "../../lib/router";
import { toast } from "../../lib/toast";
import { when, dueLook, sizeText } from "./when";

const props = defineProps<{ taskId: number | null; preset?: TaskInput }>();
const emit = defineEmits<{ close: []; open: [id: number]; created: [id: number] }>();

const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");

/* ---------- Задача или черновик ---------- */

const task = ref<TaskFull | null>(null);
const loading = ref(false);
/* Нет доступа / не найдена / сбой: вместо карточки — экран NoAccess. */
const denied = ref<Denied | null>(null);
const draft = computed(() => props.taskId == null);
const blank = (): TaskInput & { checklist: string[] } => ({
  title: "", description: "", status: "pending", priority: "normal", responsible_id: taskStore.me, deadline: null,
  needs_review: false, estimate: null, project: null, deal_id: null, parent_id: null, accomplices: [], auditors: [], tags: [],
  checklist: [], ...props.preset,
});
const form = reactive(blank());

/* Свои быстрые правки чек-листа: пока запросы в пути (и после, если они
   были позже начала загрузки), отметки в карточке — наши, а не из ответа. */
let opSeq = 0;
const checkOps = new Map<number, { seq: number; pending: number; done: boolean; chain: Promise<unknown> }>();
/* Задача с сервера: отметки пунктов, которые щёлкнули после since или ещё
   сохраняются, оставляем свои — в ответе они могут быть старыми. */
function adopt(fresh: TaskFull, since = -1) {
  let touched = false;
  for (const item of fresh.checklistItems) {
    const op = checkOps.get(item.id);
    if (op && (op.pending > 0 || (since >= 0 && op.seq > since))) {
      item.done = op.done;
      touched = true;
    }
  }
  if (touched) fresh.checklist = { done: fresh.checklistItems.filter((one) => one.done).length, total: fresh.checklistItems.length };
  return fresh;
}
async function adoptFrom(run: () => Promise<TaskFull>) {
  const since = opSeq;
  return adopt(await run(), since);
}
async function load(id: number) {
  const first = !task.value || task.value.id !== id;
  loading.value = first;
  const since = opSeq;
  try {
    const fresh = await (first ? atLeast(getTask(id)) : getTask(id));
    denied.value = null;
    task.value = adopt(fresh, since);
  } catch (error) {
    const state = deniedOf(error);
    /* Открытая карточка и сбой связи — оставить её и сказать тостом;
       нет доступа или задачи — убрать всё, что о ней знали. */
    if (state === "error" && !first) return fail(error);
    if (state !== "error") forgetTask(id);
    task.value = null;
    denied.value = state;
  } finally {
    loading.value = false;
  }
}
/* Позвали человека через @ в чате задачи — сервер сделал его наблюдателем:
   перечитать карточку, чтобы он появился в полях. */
const watcherNote = computed(() => {
  const chat = task.value && chats.value.find((one) => one.entity === `task:${task.value!.id}`);
  const list = chat ? threads.get(chat.id)?.messages ?? [] : [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].meta?.event === "watcher") return list[i].id;
  return 0;
});
watch(watcherNote, (next, prev) => {
  if (next && prev !== undefined && next !== prev && task.value) load(task.value.id);
});
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
  if (!next || !t || saving.value || [...checkOps.values()].some((op) => op.pending > 0)) return;
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
    task.value = await adoptFrom(() => updateTask(task.value!.id, input));
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
    task.value = await adoptFrom(() => setStatus(task.value!.id, to));
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
const timerHere = computed(() => !!task.value && taskStore.timer?.taskId === task.value.id);
/* Тикает, только пока таймер идёт в этой задаче, и снимается с карточкой:
   иначе каждое открытие задачи оставляло вечный setInterval и держало
   закрытую карточку в памяти. */
let ticker = 0;
watch(timerHere, (on) => {
  clearInterval(ticker);
  ticker = on ? window.setInterval(() => (now.value = Date.now()), 1000) : 0;
  now.value = Date.now();
}, { immediate: true });
onBeforeUnmount(() => clearInterval(ticker));
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
    task.value = await adoptFrom(() => toggleTimer(task.value!.id));
  } catch (error) {
    fail(error);
  }
}

/* ---------- Поля ---------- */

const due = computed(() => dueLook(v.value.status, v.value.deadline));
const dealOf = (id: number | null) => (id ? dealIndex.get(id) ?? null : null);
const dealQ = ref("");
/* Сделки ищет сервер: их десятки тысяч. */
const dealList = ref<DealBrief[]>([]);
let dealTimer = 0;
function loadDealList() {
  clearTimeout(dealTimer);
  dealTimer = window.setTimeout(() => void searchDeals(dealQ.value.trim()).then((list) => (dealList.value = list)).catch(() => undefined), 200);
}
watch(dealQ, loadDealList);
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


const pickers = reactive<Record<string, { close: () => void } | null>>({});
const setPicker = (name: string) => (el: unknown) => (pickers[name] = el as { close: () => void } | null);
const closePicker = (name: string) => pickers[name]?.close();

/* ---------- Чек-лист ---------- */

const checkText = ref("");
const checkEdit = ref<number | null>(null);
const checkEditText = ref("");
const checklist = computed(() => (task.value ? task.value.checklistItems : form.checklist.map((title, i) => ({ id: -i - 1, title, done: false, doneBy: null, sort: i }))));
const checkDone = computed(() => checklist.value.filter((one) => one.done).length);
const peopleCount = computed(() => new Set([v.value.creatorId, v.value.responsibleId, ...v.value.accomplices, ...v.value.auditors].filter(Boolean)).size);
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
/* Быстрые щелчки: отметка меняется сразу, ответ сервера применяется,
   только если после него по этому пункту ничего не щёлкали; пока есть
   запросы в пути, карточка не перечитывается (иначе старый ответ снимет
   свежие галочки). Когда всё дошло — одна сверка с сервером. */
async function toggleCheck(id: number, done: boolean) {
  if (draft.value || !task.value) return;
  const item = task.value.checklistItems.find((one) => one.id === id);
  if (!item) return;
  const before = item.done;
  item.done = done;
  syncBrief(false);
  const op = checkOps.get(id) ?? { seq: 0, pending: 0, done, chain: Promise.resolve() };
  const mySeq = ++opSeq;
  Object.assign(op, { seq: mySeq, done, pending: op.pending + 1 });
  checkOps.set(id, op);
  /* По одному пункту запросы идут строго друг за другом: на сервер они
     приходят в том же порядке, что и щелчки. */
  const request = op.chain.catch(() => undefined).then(() => updateCheck(id, { done }));
  op.chain = request;
  try {
    const saved = await request;
    if (op.seq === mySeq) Object.assign(item, saved, { done: op.done });
  } catch (error) {
    if (op.seq === mySeq) {
      item.done = before;
      op.done = before;
    }
    fail(error);
  } finally {
    op.pending--;
    syncBrief(false);
    if (![...checkOps.values()].some((one) => one.pending > 0) && task.value) {
      const t = task.value;
      const listedVersion = taskStore.list.find((one) => one.id === t.id)?.version ?? 0;
      if (listedVersion > (t.version ?? 0)) load(t.id);
    }
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
function syncBrief(push = true) {
  const t = task.value;
  if (!t) return;
  t.checklist = { done: t.checklistItems.filter((one) => one.done).length, total: t.checklistItems.length };
  t.files = t.fileItems.length;
  t.comments = t.commentItems.length;
  if (push) upsert(t);
  else {
    /* Только счётчик на карточке доски, без версии — её принесёт сверка. */
    const row = taskStore.list.find((one) => one.id === t.id);
    if (row) row.checklist = { ...t.checklist };
  }
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
  if (next) task.value = adopt(next);
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
  <template v-else-if="denied && taskId != null">
    <Teleport defer to="#task-panel-title"><h2 class="text-xl font-semibold">Задача №{{ taskId }}</h2></Teleport>
    <NoAccess :state="denied" what="task" @retry="load(taskId)">
      <button type="button" class="button button--ghost button--sm" @click="emit('close')">Закрыть</button>
    </NoAccess>
  </template>
  <div
    v-else-if="task || draft"
    :class="descEditing ? 'absolute inset-0 bg-surface' : '-m-3 flex flex-col gap-4'"
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
    <!-- Описание — просто текст задачи, без рамки; под ним «Изменить»
         (видна всегда, если есть права). -->
    <section class="flow-root px-1 pt-3 pb-4">
      <template v-if="v.description">
        <div class="desc-plain" @dblclick="canEdit && editDesc()">
          <MarkdownField :model-value="v.description" :editable="false" />
        </div>
        <button v-if="canEdit" type="button" class="button button--secondary button--sm mt-3" @click="editDesc"><Pencil class="size-3.5" />Изменить</button>
      </template>
      <template v-else-if="canEdit">
        <p class="py-1 text-sm text-muted">Описания нет.</p>
        <button type="button" class="button button--secondary button--sm mt-2" @click="editDesc"><Pencil class="size-3.5" />Добавить описание</button>
      </template>
      <p v-else class="py-1 text-sm text-muted">Описания нет.</p>
    </section>

    <!-- Свойства: группы в одинаковых блоках, поле слева, значение справа -->
    <CardBlock :icon="SlidersHorizontal" title="Основное" flush>
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

        <dt>Контроль</dt>
        <dd>
          <Checkbox :model-value="v.needsReview" :disabled="!canEdit" @update:model-value="(on) => patch({ needs_review: on })"><span class="text-sm">Принять работу после завершения</span></Checkbox>
        </dd>
      </dl>
    </CardBlock>
    <CardBlock :icon="Users" title="Участники" :count="peopleCount" flush>
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
    </CardBlock>
    <CardBlock :icon="Link2" title="Связи" flush>
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
            <a v-if="dealOf(v.dealId)" :href="href('/deals', { pipeline: dealOf(v.dealId)!.pipelineId, open: v.dealId })" class="link inline-flex min-w-0 items-center gap-1.5 text-sm">
              <Briefcase class="size-3.5 shrink-0 text-muted" /><span class="truncate">{{ dealOf(v.dealId)!.title }}{{ dealOf(v.dealId)!.company ? ` · ${dealOf(v.dealId)!.company}` : "" }}</span>
            </a>
            <span v-else-if="v.dealId" class="text-muted">Сделка №{{ v.dealId }}</span>
            <Popover v-if="canEdit" :ref="setPicker('deal')" align="left" width="w-80">
              <template #trigger="{ toggle }">
                <button type="button" class="value shrink-0 text-muted" :class="v.dealId ? 'value--after' : ''" @click="toggle(); loadDealList()">{{ v.dealId ? "Сменить" : "Привязать сделку" }}</button>
              </template>
              <div class="p-1">
                <input v-model="dealQ" class="input input--full-width h-9 text-sm" placeholder="Название, компания или номер" autofocus />
                <div class="mt-1 max-h-64 overflow-y-auto thin-scroll">
                  <button v-for="one in dealList" :key="one.id" type="button" class="menu-row" @click="patch({ deal_id: one.id }); closePicker('deal')">
                    <span class="min-w-0 flex-1 text-left"><span class="block truncate">{{ one.title }}</span><span class="block truncate text-xs text-muted">{{ [one.company, pipelineById.get(one.pipelineId)?.title].filter(Boolean).join(" · ") }}</span></span>
                  </button>
                </div>
                <button v-if="v.dealId" type="button" class="menu-row text-danger" @click="patch({ deal_id: null }); closePicker('deal')"><X class="size-4" />Отвязать</button>
              </div>
            </Popover>
          </div>
        </dd>

        <dt>Надзадача</dt>
        <dd>
          <div class="flex min-w-0 items-center gap-1.5">
            <button v-if="parentInfo" type="button" class="link inline-flex min-w-0 items-center gap-1 text-left text-sm" @click="emit('open', parentInfo.id)">
              <GitBranch class="size-3.5 shrink-0 text-muted" /><span class="truncate">{{ parentInfo.title }}</span>
            </button>
            <Popover v-if="canEdit" :ref="setPicker('parent')" align="left" width="w-80">
              <template #trigger="{ toggle }">
                <button type="button" class="value shrink-0 text-muted" :class="parentInfo ? 'value--after' : ''" @click="toggle">{{ v.parentId ? "Сменить" : "Сделать подзадачей" }}</button>
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
      </dl>
    </CardBlock>

    <!-- Чек-лист -->
    <CardBlock :icon="ListChecks" title="Чек-лист" :count="checklist.length ? `${checkDone} из ${checklist.length}` : null">
      <div v-if="checklist.length" class="mb-2 h-1 overflow-hidden rounded-full bg-default">
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
      <input v-if="canWork" v-model="checkText" class="add-input mt-1 w-full" placeholder="+ Добавить пункт и Enter" @keydown.enter.prevent="addCheckItem" />
    </CardBlock>

    <!-- Подзадачи -->
    <CardBlock v-if="task" :icon="GitBranch" title="Подзадачи" :count="task.childItems.length ? `${task.childItems.filter((one) => one.status === 'done').length} из ${task.childItems.length}` : null">
      <ul class="-mx-1 flex flex-col">
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
      <input v-if="task.can.edit || task.can.work" ref="childInput" v-model="childText" class="add-input mt-1 w-full" placeholder="+ Подзадача: название и Enter" @keydown.enter.prevent="addChild" />
    </CardBlock>

    <!-- Файлы -->
    <CardBlock
      v-if="task"
      :icon="Paperclip"
      title="Файлы"
      :count="task.fileItems.length || null"
      class="transition"
      :class="{ 'ring-2 ring-accent': dropping }"
      @dragover.prevent="task.can.work && (dropping = true)"
      @dragleave="dropping = false"
      @drop.prevent="task.can.work && onDrop($event)"
    >
      <template #actions>
        <button v-if="task.can.work" type="button" class="button button--ghost button--sm -mr-2" :disabled="uploading != null" @click="fileInput?.click()">
          <Plus class="size-4" />{{ uploading != null ? `Загрузка ${Math.round(uploading * 100)}%` : "Прикрепить" }}
        </button>
        <input ref="fileInput" type="file" multiple class="hidden" @change="sendFiles(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''" />
      </template>
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
    </CardBlock>

    <!-- Комментарии, история, время -->
    <TaskActivity v-if="task" :task="task" mode="work" :spent="spentTotal" :running="timerHere" :timer-text="timerText" :can-plan="canEdit" @changed="onActivityChanged" @timer="timer" @plan="(minutes) => patch({ estimate: minutes })" />
    <p v-if="task" class="px-1 pb-2 text-xs text-muted">Создана {{ when(task.createdAt) }}<template v-if="task.completedAt"> · завершена {{ when(task.completedAt) }}</template> · №{{ task.id }}</p>

    </template>

    <!-- История изменений — в правой области панели, переключателем с чатом -->
    <Teleport v-if="task" defer to="#task-panel-side">
      <TaskActivity :task="task" mode="history" @changed="onActivityChanged" />
    </Teleport>

  </div>
</template>

<style scoped>
/* Описание без подложки: текст идёт прямо по фону карточки. */
.desc-plain :deep(.md-box > div),
.desc-plain > :deep(div.md) { padding: 0; }

/* Свойства: подпись слева, значение справа, строки через черту. */
.props {
  display: grid;
  grid-template-columns: minmax(112px, 150px) minmax(0, 1fr);
  padding: 0 0 0.25rem;
}
/* Строка: подпись слева, значение справа. Разделитель — с отступами от
   краёв блока: черта у подписи начинается с отступа, у значения — кончается. */
.props > dt,
.props > dd {
  display: flex;
  align-items: center;
  min-height: 3rem;
  padding-block: 0.5rem;
  font-size: 0.875rem;
  border-top: 1px solid var(--separator);
}
.props > dt {
  margin-left: 1.25rem;
  padding-right: 0.75rem;
  color: var(--muted);
  font-size: 0.8125rem;
}
.props > dd {
  min-width: 0;
  margin-right: 1.25rem;
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
/* Кнопка после названия (сделка, надзадача): без сдвига влево, иначе её
   подсветка при наведении наезжает на название. */
.value--after {
  margin-left: 0.25rem;
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
