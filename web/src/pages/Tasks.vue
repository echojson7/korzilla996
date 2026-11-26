<!-- Задачи как в Битрикс24: роли (Делаю / Помогаю / Поручил / Наблюдаю),
     просроченные и все; три вида — канбан по статусам (по умолчанию),
     «Сроки» (колонки по крайнему сроку, перенос меняет срок) и таблица.
     Вид помнится (k996.tasks.view) и стоит в адресе (?view), вкладка — ?tab,
     открытая задача — ?open (new — новая задача). Данные — с сервера. -->
<script setup lang="ts">
import { can } from "../lib/access";
import { computed, onMounted, watch } from "vue";
import { Plus, Kanban, Table2, CalendarRange, Briefcase, Flame, CalendarClock, ListChecks, Paperclip, GitBranch, Timer, Hash, Folder } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Board from "../components/Board.vue";
import DataTable from "../components/DataTable.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import HueChip from "../components/HueChip.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import TaskCard from "../components/tasks/TaskCard.vue";
import { dueLook } from "../components/tasks/when";
import {
  taskStore, tasksEnabled, startTasks, loadTasks, STATUSES, STATUS, PERIODS, periodOf, deadlineFor, isOpenTask, isOverdueTask,
  person, nameOf, createTask, moveTask, updateTask, overdueAll, duration, type TaskBrief, type Status, type Period, type TaskInput,
} from "../lib/tasks";
import { deals } from "../lib/data";
import { auth } from "../lib/session";
import { plural } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { moveBefore, type Column } from "../lib/move";
import { local } from "../lib/prefs";
import { toast } from "../lib/toast";
import { ApiError } from "../lib/api";

/* Открыли раздел — сразу свежий список, не ждём опроса. */
onMounted(() => {
  startTasks();
  if (taskStore.loaded) loadTasks().catch(() => undefined);
});
watch(tasksEnabled, (on) => on && startTasks());

type View = "board" | "deadline" | "table";
const savedView = local<View>("tasks.view", "board");
const view = computed<View>(() => {
  const asked = route.value.query.get("view");
  return asked === "table" || asked === "board" || asked === "deadline" ? asked : savedView.value;
});
watch(view, (next) => (savedView.value = next));
const VIEWS = [
  { key: "board", label: "Канбан", icon: Kanban },
  { key: "deadline", label: "Сроки", icon: CalendarRange },
  { key: "table", label: "Таблица", icon: Table2 },
];

const me = () => taskStore.me;
const TABS = {
  mine: { label: "Мои", test: (one: TaskBrief) => [one.creatorId, one.responsibleId, ...one.accomplices, ...one.auditors].includes(me()) },
  doing: { label: "Делаю", test: (one: TaskBrief) => one.responsibleId === me() },
  helping: { label: "Помогаю", test: (one: TaskBrief) => one.accomplices.includes(me()) },
  given: { label: "Поручил", test: (one: TaskBrief) => one.creatorId === me() && one.responsibleId !== me() },
  watching: { label: "Наблюдаю", test: (one: TaskBrief) => one.auditors.includes(me()) },
  overdue: { label: "Просрочены", test: (one: TaskBrief) => isOverdueTask(one) },
  all: { label: "Все", test: () => true },
} as const;
type Tab = keyof typeof TABS;
const tab = computed<Tab>(() => {
  const raw = route.value.query.get("tab");
  return raw && raw in TABS ? (raw as Tab) : "mine";
});
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });

/* В таблице и «Сроках» — без завершённых (кроме «Все»); в канбане им своя колонка. */
const hideDone = (key: Tab) => view.value !== "board" && key !== "all";
const inTab = (key: Tab) => taskStore.list.filter((one) => TABS[key].test(one) && (!hideDone(key) || isOpenTask(one)));
const dealOf = (id: number | null) => (id ? deals.find((deal) => deal.id === id) ?? null : null);
const visible = computed(() => {
  const words = text.value.trim().toLowerCase();
  const list = inTab(tab.value);
  if (!words) return list;
  return list.filter((one) => {
    const deal = dealOf(one.dealId);
    const people = [one.responsibleId, one.creatorId, ...one.accomplices].map(nameOf).join(" ");
    return `${one.title} ${one.id} ${people} ${deal?.title ?? ""} ${deal?.company ?? ""} ${one.project ?? ""} ${one.tags.map((t) => `#${t}`).join(" ")}`.toLowerCase().includes(words);
  });
});
const tabs = computed(() => (Object.keys(TABS) as Tab[]).map((key) => ({ key, label: TABS[key].label, count: inTab(key).filter(isOpenTask).length })));

const statusColumns = STATUSES.map((one) => ({ id: one.id, label: one.column, hue: one.hue }));
const periodColumns = PERIODS.map((one) => ({ id: one.id, label: one.label, hue: one.hue }));
const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : "Не получилось", "danger");

async function move(key: number | string, column: string, before: number | string | null) {
  const id = Number(key);
  const was = taskStore.list.find((one) => one.id === id);
  if (!was) return;
  if (view.value === "deadline") {
    const period = column as Period;
    if (period === periodOf(was)) return;
    const deadline = deadlineFor(period);
    if (deadline === undefined) return toast("В просроченные задачу не перенести — поставьте срок в карточке");
    try {
      await updateTask(id, { deadline });
      toast(`«${was.title}» — ${PERIODS.find((one) => one.id === period)!.label.toLowerCase()}`, "success");
    } catch (error) {
      fail(error);
    }
    return;
  }
  const status = column as Status;
  const old = was.status;
  moveBefore(taskStore.list, id, (one) => one.id, before == null ? null : Number(before));
  was.status = status;
  try {
    const saved = await moveTask(id, status, before == null ? null : Number(before));
    if (old !== status) {
      if (status === "done" && saved.status === "review") toast(`«${saved.title}» ушла на контроль постановщику`, "success");
      else toast(`«${saved.title}» → ${STATUS[saved.status].label}`, "success");
    }
  } catch (error) {
    was.status = old;
    fail(error);
  }
}
async function add(column: string, title: string) {
  const input: TaskInput = { title, responsible_id: me() };
  if (view.value === "deadline") {
    const deadline = deadlineFor(column as Period);
    if (deadline !== undefined) input.deadline = deadline;
  } else input.status = column as Status;
  try {
    await createTask(input);
  } catch (error) {
    fail(error);
  }
}

/* ---------- Открытая задача и новая ---------- */

const openParam = computed(() => route.value.query.get("open"));
const isNew = computed(() => openParam.value === "new");
const openedId = computed(() => (openParam.value && /^\d+$/.test(openParam.value) ? Number(openParam.value) : null));
const preset = computed<TaskInput>(() => {
  const q = route.value.query;
  const out: TaskInput = {};
  if (q.get("deal")) out.deal_id = Number(q.get("deal"));
  if (q.get("parent")) out.parent_id = Number(q.get("parent"));
  return out;
});
const opened = computed(() => taskStore.list.find((one) => one.id === openedId.value) ?? null);
const open = (one: TaskBrief | number) => setQuery({ open: typeof one === "number" ? one : one.id, deal: null, parent: null }, { replace: false });
const close = () => setQuery({ open: null, deal: null, parent: null });
const newTask = () => setQuery({ open: "new" }, { replace: false });

const TABLE: Column<TaskBrief>[] = [
  { key: "title", label: "Задача", sort: (one) => one.title, class: "min-w-[320px]" },
  { key: "status", label: "Статус", sort: (one) => STATUSES.findIndex((s) => s.id === one.status) },
  { key: "deadline", label: "Крайний срок", sort: (one) => (one.deadline ? new Date(one.deadline).getTime() : Number.MAX_SAFE_INTEGER) },
  { key: "responsible", label: "Ответственный", sort: (one) => nameOf(one.responsibleId) },
  { key: "creator", label: "Постановщик", sort: (one) => nameOf(one.creatorId) },
  { key: "project", label: "Проект", sort: (one) => one.project ?? "" },
  { key: "time", label: "Время", sort: (one) => one.timeSpent },
];
const late = computed(() => overdueAll.value.filter((one) => one.responsibleId === me() || one.accomplices.includes(me())).length);
const due = (one: TaskBrief) => dueLook(one.status, one.deadline);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Задачи" :sub="!tasksEnabled ? '' : late ? `Просрочено у меня: ${plural(late, 'задача', 'задачи', 'задач')}` : 'Всё в срок'">
      <template #actions>
        <button v-if="can('tasks', 'create')" type="button" class="button button--primary" :disabled="!tasksEnabled" @click="newTask"><Plus class="size-4" />Задача</button>
      </template>
      <template #toolbar>
        <Segmented label="Задачи" :items="tabs" :model-value="tab" @update:model-value="(key) => setQuery({ tab: key === 'mine' ? null : key })" />
        <SearchBox v-model="text" placeholder="Задача, сотрудник, сделка, проект или #тег" class="w-full min-w-0 sm:w-auto sm:flex-1" />
        <div class="toggle-button-group toggle-button-group--horizontal" role="radiogroup" aria-label="Вид">
          <button
            v-for="one in VIEWS"
            :key="one.key"
            type="button"
            role="radio"
            class="toggle-button toggle-button--sm gap-1.5"
            :aria-checked="view === one.key"
            :data-selected="view === one.key ? 'true' : undefined"
            @click="setQuery({ view: one.key })"
          >
            <component :is="one.icon" class="size-4" />{{ one.label }}
          </button>
        </div>
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 px-3 pb-3 md:px-5">
      <p v-if="auth.ready && !tasksEnabled" class="on-photo py-12 text-center">Задачи работают с сервером портала — войдите в портал на стенде.</p>
      <p v-else-if="taskStore.error && !taskStore.loaded" class="on-photo py-12 text-center">{{ taskStore.error }}</p>

      <Board
        v-else-if="view !== 'table'"

        :columns="view === 'board' ? statusColumns : periodColumns"
        :items="visible"
        :column-of="(one) => (view === 'board' ? one.status : periodOf(one))"
        :key-of="(one) => one.id"
        add-placeholder="Название задачи и Enter"
        @move="move"
        @open="open"
        @add="add"
      >
        <template #card="{ item: one }">
          <p class="line-clamp-3 leading-snug font-medium" :class="{ 'text-muted line-through': one.status === 'done' }">
            <Flame v-if="one.priority === 'high'" class="-mt-0.5 mr-0.5 inline size-3.5 text-danger" aria-label="Высокий приоритет" />{{ one.title }}
          </p>
          <p v-if="dealOf(one.dealId)" class="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            <Briefcase class="size-3 shrink-0" /><span class="truncate">{{ dealOf(one.dealId)!.title }}</span>
          </p>
          <p v-if="one.project || one.tags.length" class="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
            <span v-if="one.project" class="inline-flex items-center gap-0.5 rounded bg-default px-1.5"><Folder class="size-3" />{{ one.project }}</span>
            <span v-for="tag in one.tags.slice(0, 3)" :key="tag" class="inline-flex items-center rounded bg-default px-1.5"><Hash class="size-2.5" />{{ tag }}</span>
          </p>
          <div v-if="one.checklist.total || one.files || one.children || taskStore.timer?.taskId === one.id" class="mt-1.5 flex items-center gap-2.5 text-xs text-muted tabular-nums">
            <span v-if="one.checklist.total" class="inline-flex items-center gap-0.5" :class="{ 'text-success': one.checklist.done === one.checklist.total }"><ListChecks class="size-3.5" />{{ one.checklist.done }}/{{ one.checklist.total }}</span>
            <span v-if="one.children" class="inline-flex items-center gap-0.5"><GitBranch class="size-3.5" />{{ one.children }}</span>
            <span v-if="one.files" class="inline-flex items-center gap-0.5"><Paperclip class="size-3.5" />{{ one.files }}</span>
            <span v-if="taskStore.timer?.taskId === one.id" class="inline-flex items-center gap-0.5 text-danger"><Timer class="size-3.5" />идёт</span>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="min-w-0 flex-1"><span class="due" :class="`due--${due(one).tone}`"><CalendarClock class="size-3 shrink-0" />{{ due(one).text }}</span></span>
            <span class="flex -space-x-1">
              <ChatFace v-if="one.creatorId !== one.responsibleId" :user="person(one.creatorId)" size="xs" class="ring-2 ring-surface" />
              <ChatFace :user="person(one.responsibleId)" size="xs" class="ring-2 ring-surface" />
            </span>
          </div>
        </template>
      </Board>

      <div v-else class="h-full overflow-y-auto rounded-2xl photo-scroll">
        <DataTable :columns="TABLE" :rows="visible" :key-of="(one) => one.id" label="Задачи" class="sheet" @open="open">
          <template #title="{ row }">
            <span class="block font-medium" :class="{ 'text-muted line-through': row.status === 'done' }">
              <Flame v-if="row.priority === 'high'" class="-mt-0.5 mr-0.5 inline size-3.5 text-danger" />{{ row.title }}
            </span>
            <span v-if="dealOf(row.dealId) || row.tags.length" class="block truncate text-xs text-muted">
              <template v-if="dealOf(row.dealId)">{{ dealOf(row.dealId)!.title }} · {{ dealOf(row.dealId)!.company }}</template>
              <template v-for="tag in row.tags" :key="tag"> #{{ tag }}</template>
            </span>
          </template>
          <template #status="{ row }"><HueChip :hue="STATUS[row.status].hue">{{ STATUS[row.status].label }}</HueChip></template>
          <template #deadline="{ row }"><span class="due" :class="`due--${due(row).tone}`">{{ due(row).text }}</span></template>
          <template #responsible="{ row }"><span class="inline-flex items-center gap-2"><ChatFace :user="person(row.responsibleId)" size="xs" />{{ nameOf(row.responsibleId) }}</span></template>
          <template #creator="{ row }"><span class="inline-flex items-center gap-2"><ChatFace :user="person(row.creatorId)" size="xs" />{{ nameOf(row.creatorId) }}</span></template>
          <template #project="{ row }"><span class="text-muted">{{ row.project || "—" }}</span></template>
          <template #time="{ row }"><span class="text-muted tabular-nums">{{ row.timeSpent ? duration(row.timeSpent) : "—" }}</span></template>
        </DataTable>
        <p v-if="taskStore.loaded && !visible.length" class="on-photo py-12 text-center">{{ tab === "overdue" ? "Всё сделано в срок." : "Задач нет." }}</p>
      </div>
    </div>

    <SidePanel
      :open="isNew || openedId != null"
      side-label="История"
      :chat="opened ? { entity: `task:${opened.id}`, title: `Задача: ${opened.title}` } : null"
      :title="isNew ? 'Новая задача' : opened?.title ?? 'Задача'"
      :sub="isNew ? 'Новая задача · постановщик — вы' : opened ? `Задача №${opened.id} · ${STATUS[opened.status].label}` : ''"
      @close="close"
    >
      <!-- Название и кнопки статуса карточка ставит сюда сама (Teleport). -->
      <template #title><div id="task-panel-title" class="min-w-0" /></template>
      <template #side><div id="task-panel-side" /></template>
      <template #footer><div id="task-panel-footer" class="flex min-w-0 flex-1 flex-wrap items-center gap-2" /></template>
      <TaskCard
        v-if="isNew || openedId != null"
        :key="isNew ? 'new' : openedId!"
        :task-id="isNew ? null : openedId"
        :preset="preset"
        @close="close"
        @open="open"
        @created="(id) => setQuery({ open: id, deal: null, parent: null })"
      />
    </SidePanel>
  </div>
</template>
