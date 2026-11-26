<!-- Низ карточки задачи: история изменений и учёт времени вкладками.
     Обсуждение задачи — в её чате справа от карточки (общий каркас панели),
     поэтому отдельных комментариев здесь нет; старые, если были, видны. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Pencil, Trash2, Send, Plus } from "@lucide/vue";
import ChatFace from "../messenger/ChatFace.vue";
import {
  person, nameOf, taskStore, STATUS, PRIORITIES, duration,
  addComment, updateComment, deleteComment, addTime, deleteTime, type TaskFull, type HistoryItem, type Status,
} from "../../lib/tasks";
import { deals } from "../../lib/data";
import { when, parseMinutes, fromLocalInput } from "./when";
import { toast } from "../../lib/toast";
import { ApiError } from "../../lib/api";

const props = defineProps<{ task: TaskFull }>();
const emit = defineEmits<{ changed: [task?: TaskFull] }>();

type Tab = "comments" | "history" | "time";
const tab = ref<Tab>("history");
const tabs = computed(() => [
  ...(props.task.commentItems.length ? [{ key: "comments" as Tab, label: "Комментарии", count: props.task.commentItems.length }] : []),
  { key: "history" as Tab, label: "История", count: props.task.historyItems.length },
  { key: "time" as Tab, label: "Время", count: props.task.timeItems.length },
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

const spent = ref("");
const note = ref("");
const day = ref("");
async function logTime() {
  const minutes = parseMinutes(spent.value);
  if (!minutes) return toast("Сколько времени? Например, 1:30 или 45", "danger");
  try {
    emit("changed", await addTime(props.task.id, minutes, note.value.trim(), day.value ? fromLocalInput(day.value) ?? undefined : undefined));
    spent.value = note.value = day.value = "";
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
  for (const one of props.task.timeItems) if (one.userId) sums.set(one.userId, (sums.get(one.userId) ?? 0) + one.seconds);
  return [...sums.entries()].sort((a, b) => b[1] - a[1]);
});
</script>

<template>
  <section>
    <div class="toggle-button-group toggle-button-group--horizontal" role="tablist">
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
    <ol v-else-if="tab === 'history'" class="mt-3 flex flex-col">
      <li v-for="one in task.historyItems" :key="one.id" class="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b border-separator py-2 text-sm last:border-0">
        <span class="text-xs text-muted tabular-nums">{{ when(one.at) }}</span>
        <span class="min-w-0">
          <span class="text-muted">{{ nameOf(one.userId) }}:</span>
          {{ story(one).text }}<template v-if="story(one).to !== undefined">: <span class="text-muted line-through decoration-muted/60">{{ story(one).from }}</span> → <span class="font-medium">{{ story(one).to }}</span></template>
        </span>
      </li>
      <li v-if="!task.historyItems.length" class="py-3 text-sm text-muted">Изменений нет.</li>
    </ol>

    <!-- Время -->
    <div v-else class="mt-3">
      <p v-if="totalBy.length" class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span v-for="[id, seconds] in totalBy" :key="id"><span class="text-muted">{{ nameOf(id) }}:</span> {{ duration(seconds) }}</span>
      </p>
      <form v-if="task.can.work" class="mb-3 flex flex-wrap items-center gap-2" @submit.prevent="logTime">
        <input v-model="spent" class="input h-8 py-0 w-28 text-sm" placeholder="1:30 или 45" aria-label="Сколько времени" />
        <input v-model="day" type="datetime-local" class="input h-8 py-0 text-sm" aria-label="Когда (по умолчанию — только что)" />
        <input v-model="note" class="input h-8 py-0 min-w-0 flex-1 text-sm" placeholder="Что делали (необязательно)" maxlength="250" />
        <button type="submit" class="button button--secondary button--sm"><Plus class="size-4" />Добавить время</button>
      </form>
      <ul class="flex flex-col">
        <li v-for="one in task.timeItems" :key="one.id" class="group flex items-center gap-3 border-b border-separator py-2 text-sm last:border-0">
          <ChatFace :user="person(one.userId)" size="xs" />
          <span class="w-36 shrink-0 text-xs text-muted tabular-nums">{{ when(one.startedAt) }}</span>
          <span class="w-20 shrink-0 font-medium tabular-nums">{{ one.stoppedAt ? duration(one.seconds) : "идёт…" }}</span>
          <span class="min-w-0 flex-1 truncate text-muted">{{ one.note }}</span>
          <button v-if="one.userId === taskStore.me && one.stoppedAt" type="button" class="hidden text-muted group-hover:block hover:text-danger" aria-label="Удалить запись" @click="dropTime(one.id)"><Trash2 class="size-3.5" /></button>
        </li>
        <li v-if="!task.timeItems.length" class="py-3 text-sm text-muted">Время по задаче ещё не учитывали.</li>
      </ul>
    </div>
  </section>
</template>
