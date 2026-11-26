<!-- Учёт времени (mode="work", низ карточки) и история изменений
     (mode="history", правая область панели рядом с чатом). Обсуждение
     задачи — в её чате, поэтому комментарии видны, только если остались
     от прежней версии. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Pencil, Trash2, Send, Plus, Clock, Play, Square, Check, X } from "@lucide/vue";
import Popover from "../Popover.vue";
import ChatFace from "../messenger/ChatFace.vue";
import {
  person, nameOf, taskStore, STATUS, PRIORITIES, duration,
  addComment, updateComment, deleteComment, addTime, updateTime, deleteTime, type TaskFull, type HistoryItem, type Status,
} from "../../lib/tasks";
import { deals } from "../../lib/data";
import { when, parseMinutes, fromLocalInput, toLocalInput } from "./when";
import { toast } from "../../lib/toast";
import { ApiError } from "../../lib/api";

/* spent — затрачено всего с идущим таймером (секунды), running/timerText —
   мой таймер на этой задаче; plan и timer обрабатывает карточка. */
const props = defineProps<{ task: TaskFull; mode: "work" | "history"; spent?: number; running?: boolean; timerText?: string; canPlan?: boolean }>();
const emit = defineEmits<{ changed: [task?: TaskFull]; plan: [minutes: number | null]; timer: [] }>();

type Tab = "comments" | "history" | "time";
const tab = ref<Tab>(props.mode === "history" ? "history" : "time");
const tabs = computed(() => [
  { key: "time" as Tab, label: "Учёт времени", count: props.task.timeItems.length },
  ...(props.task.commentItems.length ? [{ key: "comments" as Tab, label: "Комментарии", count: props.task.commentItems.length }] : []),
]);
const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : "Не получилось", "danger");

/* ---------- Комментарии ---------- */

const draft = ref("");
const sending = ref(false);
const editing = ref<number | null>(null);
const editText = ref("");
async function send() {
  const body = draft.value.trim();
  if (!body || sending.value) return;
  sending.value = true;
  try {
    props.task.commentItems.push(await addComment(props.task.id, body));
    draft.value = "";
    emit("changed");
  } catch (error) {
    fail(error);
  } finally {
    sending.value = false;
  }
}
async function saveEdit(id: number) {
  const body = editText.value.trim();
  if (!body) return;
  try {
    const saved = await updateComment(id, body);
    const at = props.task.commentItems.findIndex((one) => one.id === id);
    if (at >= 0) props.task.commentItems[at] = saved;
    editing.value = null;
  } catch (error) {
    fail(error);
  }
}
async function remove(id: number) {
  try {
    await deleteComment(id);
    props.task.commentItems.splice(props.task.commentItems.findIndex((one) => one.id === id), 1);
    emit("changed");
  } catch (error) {
    fail(error);
  }
}

/* ---------- История ---------- */

const LABEL: Record<string, string> = {
  title: "Название", description: "Описание", priority: "Приоритет", responsible_id: "Ответственный",
  deadline: "Крайний срок", start_at: "Начало", needs_review: "Контроль результата", estimate: "Плановое время",
  project: "Проект", deal_id: "Сделка", parent_id: "Надзадача", accomplices: "Соисполнители", auditors: "Наблюдатели", tags: "Теги",
};
function show(field: string, value: string | null) {
  if (value == null || value === "") return "—";
  if (field === "status") return STATUS[value as Status]?.label ?? value;
  if (field === "priority") return PRIORITIES.find((one) => one.id === value)?.label ?? value;
  if (field === "responsible_id") return nameOf(Number(value));
  if (field === "deadline" || field === "start_at") return when(value);
  if (field === "needs_review") return value === "1" ? "включён" : "выключен";
  if (field === "estimate") return duration(Number(value) * 60);
  if (field === "deal_id") return deals.find((one) => one.id === Number(value))?.title ?? `№${value}`;
  if (field === "parent_id") return taskStore.list.find((one) => one.id === Number(value))?.title ?? `№${value}`;
  return value;
}
function story(one: HistoryItem): { text: string; from?: string; to?: string } {
  switch (one.field) {
    case "created": return { text: "Создал задачу" };
    case "status": return { text: "Статус", from: show("status", one.old), to: show("status", one.new) };
    case "description": return { text: "Изменил описание" };
    case "checklist_add": return { text: `Добавил пункт чек-листа «${one.new}»` };
    case "checklist_done": return { text: `Выполнил пункт «${one.new}»` };
    case "checklist_undone": return { text: `Снял отметку с пункта «${one.new}»` };
    case "checklist_delete": return { text: `Удалил пункт «${one.old}»` };
    case "file_add": return { text: `Добавил файл «${one.new}»` };
    case "file_delete": return { text: `Удалил файл «${one.old}»` };
    default: return { text: LABEL[one.field] ?? one.field, from: show(one.field, one.old), to: show(one.field, one.new) };
  }
}

/* ---------- Время ---------- */

const ADD_PRESETS = [15, 30, 60, 120, 240];
const PLAN_PRESETS = [30, 60, 120, 240, 480, 960, 2400];
const short = (minutes: number) => (minutes % 480 === 0 && minutes >= 480 ? `${minutes / 480} д` : duration(minutes * 60));
const HINT = "Например: 1ч 30м, 1:30, 45 или 1 д";

const plan = computed(() => props.task.estimate ?? 0);
const spentSec = computed(() => props.spent ?? props.task.timeItems.reduce((sum, one) => sum + (one.stoppedAt ? one.seconds : 0), 0));
const share = computed(() => (plan.value ? Math.min(100, (spentSec.value / 60 / plan.value) * 100) : 0));
const over = computed(() => !!plan.value && spentSec.value > plan.value * 60);
const left = computed(() => (plan.value ? plan.value * 60 - spentSec.value : 0));

/* План */
const planText = ref("");
const planPop = ref<{ close: () => void } | null>(null);
function setPlan(minutes: number | null) {
  emit("plan", minutes);
  planPop.value?.close();
}
function savePlanText() {
  if (!planText.value.trim()) return setPlan(null);
  const minutes = parseMinutes(planText.value);
  if (!minutes) return toast(HINT, "danger");
  setPlan(minutes);
}

/* Новая запись */
const adding = ref(false);
const spent = ref("");
const note = ref("");
const day = ref("");
const parsed = computed(() => parseMinutes(spent.value));
function openAdd() {
  adding.value = true;
  spent.value = note.value = day.value = "";
}
async function logTime() {
  const minutes = parsed.value;
  if (!minutes) return toast(HINT, "danger");
  try {
    emit("changed", await addTime(props.task.id, minutes, note.value.trim(), day.value ? fromLocalInput(day.value) ?? undefined : undefined));
    adding.value = false;
  } catch (error) {
    fail(error);
  }
}

/* Правка записи */
const editId = ref<number | null>(null);
const editSpent = ref("");
const editNote = ref("");
const editDay = ref("");
function startEditTime(one: TaskFull["timeItems"][number]) {
  editId.value = one.id;
  editSpent.value = duration(one.seconds);
  editNote.value = one.note ?? "";
  editDay.value = toLocalInput(one.startedAt);
}
async function saveTime() {
  const minutes = parseMinutes(editSpent.value);
  if (!minutes || editId.value == null) return toast(HINT, "danger");
  try {
    emit("changed", await updateTime(editId.value, { minutes, note: editNote.value.trim() || null, date: editDay.value ? fromLocalInput(editDay.value) : undefined }));
    editId.value = null;
  } catch (error) {
    fail(error);
  }
}
async function dropTime(id: number) {
  try {
    await deleteTime(id);
    emit("changed");
  } catch (error) {
    fail(error);
  }
}
const totalBy = computed(() => {
  const sums = new Map<number, number>();
  for (const one of props.task.timeItems) if (one.userId && one.stoppedAt) sums.set(one.userId, (sums.get(one.userId) ?? 0) + one.seconds);
  return [...sums.entries()].sort((a, b) => b[1] - a[1]);
});
/* Поле в только что открытой форме — сразу в фокусе (autofocus так не умеет). */
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
const mine = (one: TaskFull["timeItems"][number]) => one.userId === taskStore.me && !!one.stoppedAt;
</script>

<template>
  <section :class="mode === 'work' ? 'card card--default gap-0 p-4' : ''">
    <div v-if="mode === 'work'" class="flex min-h-8 items-center gap-2">
      <h3 v-if="tabs.length === 1" class="flex items-center gap-2 text-sm font-semibold"><Clock class="size-4 text-muted" />Учёт времени</h3>
      <div v-else class="toggle-button-group toggle-button-group--horizontal" role="tablist">
        <button
          v-for="one in tabs"
          :key="one.key"
          type="button"
          role="tab"
          class="toggle-button toggle-button--sm gap-1.5"
          :aria-selected="tab === one.key"
          :data-selected="tab === one.key ? 'true' : undefined"
          @click="tab = one.key"
        >
          {{ one.label }}<span v-if="one.count" class="text-xs tabular-nums opacity-60">{{ one.count }}</span>
        </button>
      </div>
      <button
        v-if="tab === 'time' && task.can.work && (running || task.status !== 'done')"
        type="button"
        class="button button--sm ml-auto"
        :class="running ? 'button--danger' : 'button--secondary'"
        @click="emit('timer')"
      >
        <template v-if="running"><Square class="size-3.5" /><span class="tabular-nums">{{ timerText }}</span></template>
        <template v-else><Play class="size-3.5" />Запустить таймер</template>
      </button>
    </div>

    <!-- Комментарии -->
    <div v-if="tab === 'comments'" class="mt-3">
      <ul class="flex flex-col gap-3">
        <li v-for="one in task.commentItems" :key="one.id" class="group flex gap-2.5">
          <ChatFace :user="person(one.userId)" size="sm" />
          <div class="min-w-0 flex-1 rounded-xl bg-surface-secondary px-3 py-2">
            <p class="flex items-center gap-2 text-xs">
              <span class="font-semibold">{{ nameOf(one.userId) }}</span>
              <span class="text-muted">{{ when(one.at) }}<template v-if="one.editedAt"> · изменён</template></span>
              <span v-if="one.userId === taskStore.me && editing !== one.id" class="ml-auto hidden gap-1 group-hover:flex">
                <button type="button" class="text-muted hover:text-foreground" aria-label="Изменить" @click="editing = one.id; editText = one.body"><Pencil class="size-3.5" /></button>
                <button type="button" class="text-muted hover:text-danger" aria-label="Удалить" @click="remove(one.id)"><Trash2 class="size-3.5" /></button>
              </span>
            </p>
            <div v-if="editing === one.id" class="mt-1.5">
              <textarea v-model="editText" class="textarea w-full text-sm" rows="3" @keydown.ctrl.enter="saveEdit(one.id)" @keydown.meta.enter="saveEdit(one.id)" @keydown.esc="editing = null" />
              <div class="mt-1 flex gap-1">
                <button type="button" class="button button--primary button--sm" @click="saveEdit(one.id)">Сохранить</button>
                <button type="button" class="button button--ghost button--sm" @click="editing = null">Отмена</button>
              </div>
            </div>
            <p v-else class="mt-0.5 text-sm whitespace-pre-wrap">{{ one.body }}</p>
          </div>
        </li>
      </ul>
      <p v-if="!task.commentItems.length" class="py-3 text-sm text-muted">Комментариев пока нет.</p>
      <form class="mt-3 flex items-end gap-2" @submit.prevent="send">
        <textarea
          v-model="draft"
          class="textarea min-w-0 flex-1 text-sm"
          rows="2"
          placeholder="Комментарий… Ctrl+Enter — отправить"
          @keydown.ctrl.enter.prevent="send"
          @keydown.meta.enter.prevent="send"
        />
        <button type="submit" class="button button--primary button--icon-only" :disabled="!draft.trim() || sending" aria-label="Отправить"><Send class="size-4" /></button>
      </form>
    </div>

    <!-- История -->
    <ol v-else-if="tab === 'history'" class="flex flex-col">
      <li v-for="one in task.historyItems" :key="one.id" class="flex gap-3 border-b border-separator py-3 text-sm last:border-0">
        <ChatFace :user="person(one.userId)" size="sm" />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline gap-2">
            <span class="font-semibold">{{ nameOf(one.userId) }}</span>
            <span class="ml-auto shrink-0 text-xs text-muted tabular-nums">{{ when(one.at) }}</span>
          </span>
          <span class="mt-0.5 block">
            {{ story(one).text }}<template v-if="story(one).to !== undefined">: <span class="text-muted line-through decoration-muted/60">{{ story(one).from }}</span> → <span class="font-medium">{{ story(one).to }}</span></template>
          </span>
        </span>
      </li>
      <li v-if="!task.historyItems.length" class="py-8 text-center text-sm text-muted">Изменений пока нет.</li>
    </ol>

    <!-- Время -->
    <div v-else class="mt-3 flex flex-col gap-3">
      <!-- План и факт -->
      <div class="rounded-xl bg-surface-secondary px-4 py-3">
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span><span class="text-muted">Затрачено</span> <b class="font-semibold tabular-nums" :class="over ? 'text-danger' : ''">{{ spentSec ? duration(spentSec) : "0 мин" }}</b></span>
          <span class="inline-flex items-baseline gap-1.5">
            <span class="text-muted">План</span>
            <Popover v-if="canPlan" ref="planPop" align="left" width="w-72">
              <template #trigger="{ toggle }">
                <button type="button" class="plan-btn" @click="planText = plan ? short(plan) : ''; toggle()">{{ plan ? short(plan) : "задать" }}<Pencil class="size-3 opacity-60" /></button>
              </template>
              <div class="flex flex-col gap-2.5 p-3">
                <p class="text-xs font-medium text-muted">Плановое время</p>
                <div class="flex flex-wrap gap-1.5">
                  <button v-for="m in PLAN_PRESETS" :key="m" type="button" class="preset" :data-on="plan === m ? 'true' : undefined" @click="setPlan(m)">{{ short(m) }}</button>
                </div>
                <form class="flex gap-1.5" @submit.prevent="savePlanText">
                  <input v-model="planText" class="input h-8 min-w-0 flex-1 py-0 text-sm" placeholder="1ч 30м, 2 д…" aria-label="Плановое время" />
                  <button type="submit" class="button button--primary button--sm button--icon-only" aria-label="Сохранить"><Check class="size-4" /></button>
                </form>
                <button v-if="plan" type="button" class="self-start text-xs text-muted hover:text-danger" @click="setPlan(null)">Убрать план</button>
              </div>
            </Popover>
            <b v-else class="font-semibold">{{ plan ? short(plan) : "—" }}</b>
          </span>
          <span v-if="plan" class="ml-auto text-xs tabular-nums" :class="over ? 'text-danger' : 'text-muted'">{{ over ? `сверх плана ${duration(-left)}` : `осталось ${duration(left)}` }}</span>
        </div>
        <div v-if="plan" class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
          <div class="h-full rounded-full transition-[width] duration-500" :class="over ? 'bg-danger' : 'bg-accent'" :style="{ width: `${share}%` }" />
        </div>
        <p v-if="totalBy.length > 1" class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span v-for="[id, seconds] in totalBy" :key="id" class="inline-flex items-center gap-1.5"><ChatFace :user="person(id)" size="xs" /><span class="text-muted">{{ nameOf(id) }}</span> {{ duration(seconds) }}</span>
        </p>
      </div>

      <!-- Добавить вручную -->
      <template v-if="task.can.work">
        <button v-if="!adding" type="button" class="add-time" @click="openAdd"><Plus class="size-4" />Добавить время вручную</button>
        <form v-else class="flex flex-col gap-2.5 rounded-xl border border-separator p-3" @submit.prevent="logTime" @keydown.esc.stop="adding = false">
          <div class="flex flex-wrap items-center gap-1.5">
            <button v-for="m in ADD_PRESETS" :key="m" type="button" class="preset" :data-on="parsed === m ? 'true' : undefined" @click="spent = short(m)">{{ short(m) }}</button>
          </div>
          <div class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2">
            <label class="relative">
              <input v-model="spent" class="input h-9 w-full py-0 pr-16 text-sm" placeholder="1ч 30м" aria-label="Сколько времени" v-focus />
              <span v-if="spent.trim()" class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs" :class="parsed ? 'text-muted' : 'text-danger'">{{ parsed ? `= ${duration(parsed * 60)}` : "?" }}</span>
            </label>
            <input v-model="day" type="datetime-local" class="input h-9 w-full min-w-0 py-0 text-sm" aria-label="Когда начали (по умолчанию — только что)" title="Когда начали; пусто — только что" />
          </div>
          <input v-model="note" class="input h-9 py-0 text-sm" placeholder="Что делали (необязательно)" maxlength="250" />
          <div class="flex items-center gap-2">
            <button type="submit" class="button button--primary button--sm" :disabled="!parsed"><Plus class="size-4" />Добавить</button>
            <button type="button" class="button button--ghost button--sm" @click="adding = false">Отмена</button>
            <span class="ml-auto truncate text-xs text-muted">1ч 30м · 1:30 · 45 · 1 д</span>
          </div>
        </form>
      </template>

      <!-- Записи -->
      <ul v-if="task.timeItems.length" class="flex flex-col">
        <li v-for="one in task.timeItems" :key="one.id" class="group border-b border-separator py-2 text-sm last:border-0">
          <form v-if="editId === one.id" class="flex flex-col gap-2 rounded-xl bg-surface-secondary p-2.5" @submit.prevent="saveTime" @keydown.esc.stop="editId = null">
            <div class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2">
              <input v-model="editSpent" v-focus class="input h-8 w-full py-0 text-sm" aria-label="Сколько времени" />
              <input v-model="editDay" type="datetime-local" class="input h-8 w-full min-w-0 py-0 text-sm" aria-label="Когда" />
            </div>
            <div class="flex items-center gap-2">
              <input v-model="editNote" class="input h-8 min-w-0 flex-1 py-0 text-sm" placeholder="Что делали" maxlength="250" />
              <button type="submit" class="button button--primary button--sm button--icon-only" aria-label="Сохранить"><Check class="size-4" /></button>
              <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Отмена" @click="editId = null"><X class="size-4" /></button>
            </div>
          </form>
          <div v-else class="flex items-center gap-3">
            <ChatFace :user="person(one.userId)" size="xs" />
            <span class="w-28 shrink-0 text-xs text-muted tabular-nums">{{ when(one.startedAt) }}</span>
            <span class="w-20 shrink-0 font-medium tabular-nums" :class="one.stoppedAt ? '' : 'text-accent'">{{ one.stoppedAt ? duration(one.seconds) : "идёт…" }}</span>
            <span class="min-w-0 flex-1 truncate text-muted">{{ one.note }}</span>
            <span v-if="mine(one)" class="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" class="row-btn" aria-label="Изменить запись" @click="startEditTime(one)"><Pencil class="size-3.5" /></button>
              <button type="button" class="row-btn hover:text-danger!" aria-label="Удалить запись" @click="dropTime(one.id)"><Trash2 class="size-3.5" /></button>
            </span>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Время по задаче ещё не учитывали. Запустите таймер или добавьте время вручную.</p>
    </div>
  </section>
</template>

<style scoped>
.preset {
  height: 1.875rem;
  padding: 0 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  background: var(--default);
  color: var(--foreground);
  transition: background-color 0.15s, color 0.15s;
}
.preset:hover { background: color-mix(in oklab, var(--default) 70%, var(--foreground) 8%); }
.preset[data-on] { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
.plan-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 1.75rem;
  margin: -0.25rem 0;
  padding: 0 0.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
}
.plan-btn:hover { background: var(--default); }
.add-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 2.5rem;
  border: 1px dashed var(--border);
  border-radius: 0.75rem;
  font-size: 0.875rem;
  color: var(--muted);
  transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}
.add-time:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.row-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  color: var(--muted);
}
.row-btn:hover { background: var(--default); color: var(--foreground); }
</style>
