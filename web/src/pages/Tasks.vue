<!-- Задачи как в Битрикс24: роли (Делаю / Помогаю / Поручил / Наблюдаю),
     просроченные и все; три вида — канбан по статусам (по умолчанию),
     «Сроки» (колонки по крайнему сроку, перенос меняет срок) и таблица.
     Вид помнится (k996.tasks.view) и стоит в адресе (?view), фильтр — ?tab, q, st… (components/tasks/filter.ts),
     открытая задача — ?open (new — новая задача). Данные — с сервера. -->
<script setup lang="ts">
import { can } from "../lib/access";
import { computed, onMounted, ref, watch } from "vue";
import { Plus, Kanban, Table2, CalendarRange, Briefcase, Flame, CalendarClock, ListChecks, Paperclip, GitBranch, Timer, Hash, Folder, ArrowUpDown, Check, AlarmClock, MessageCircle, CheckCheck } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Board from "../components/Board.vue";
import DataTable from "../components/DataTable.vue";
import Popover from "../components/Popover.vue";
import TaskFilter from "../components/tasks/TaskFilter.vue";
import { PRESETS, SORTS, preset as filterPreset, statuses, sort, only, matches, sorted, unreadByTask, setSort, toggleOnly, type Preset } from "../components/tasks/filter";
import { chats, markChatsRead } from "../lib/messenger";
import SidePanel from "../components/SidePanel.vue";
import HueChip from "../components/HueChip.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import TaskCard from "../components/tasks/TaskCard.vue";
import { dueLook } from "../components/tasks/when";
import {
  taskStore, tasksEnabled, startTasks, loadTasks, STATUSES, STATUS, PERIODS, periodOf, deadlineFor, isOpenTask, isOverdueTask,
  person, nameOf, createTask, moveTask, setStatus, updateTask, overdueAll, duration, type TaskBrief, type Status, type Period, type TaskInput,
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
const dealOf = (id: number | null) => (id ? deals.find((deal) => deal.id === id) ?? null : null);

/* Отбор — в components/tasks/filter.ts (набор, поля, поиск, сортировка,
   счётчики). В таблице и «Сроках» без завершённых, если стадию не выбрали
   явно и набор не «Все задачи»; в канбане им своя колонка. */
const hideDone = computed(() => view.value !== "board" && filterPreset.value !== "all" && !statuses.value.length);
const visible = computed(() => sorted(taskStore.list.filter((one) => matches(one) && (!hideDone.value || isOpenTask(one)))));
const presetCounts = computed(() => {
  const out = {} as Record<Preset, number>;
  for (const key of Object.keys(PRESETS) as Preset[]) out[key] = taskStore.list.filter((one) => PRESETS[key].test(one) && isOpenTask(one)).length;
  return out;
});
/* Счётчики над доской — по набору и полям, без самих переключателей. */
const base = computed(() => taskStore.list.filter((one) => matches(one, { skipOnly: true })));
const overdueCount = computed(() => base.value.filter((one) => isOverdueTask(one)).length);
const commentTasks = computed(() => base.value.filter((one) => unreadByTask.value.has(one.id)));
const commentCount = computed(() => commentTasks.value.reduce((sum, one) => sum + (unreadByTask.value.get(one.id) ?? 0), 0));
async function readAll() {
  const ids = new Set(commentTasks.value.map((one) => one.id));
  const list = chats.value.filter((chat) => {
    const hit = /^task:(\d+)$/.exec(chat.entity ?? "");
    return hit && chat.unread > 0 && ids.has(Number(hit[1]));
  });
  if (!list.length) return;
  await markChatsRead(list);
  if (only.value === "comments") toggleOnly("comments");
  toast(`Прочитано: ${plural(list.length, "чат задачи", "чата задач", "чатов задач")}`, "success");
}
const sortLabel = computed(() => SORTS.find((one) => one.id === sort.value)!.label);
const sortPop = ref<{ close: () => void } | null>(null);

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
  /* Сортировка не «вручную» — место в колонке задаёт она, меняем только стадию. */
  const manual = sort.value === "manual";
  if (!manual && status === old) return;
  if (manual) moveBefore(taskStore.list, id, (one) => one.id, before == null ? null : Number(before));
  was.status = status;
  try {
    const saved = manual ? await moveTask(id, status, before == null ? null : Number(before)) : await setStatus(id, status);
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
    <PageHead title="Задачи" :sub="!tasksEnabled ? '' : `${PRESETS[filterPreset].label}: ${plural(visible.length, 'задача', 'задачи', 'задач')}${late ? ` · просрочено у меня ${late}` : ''}`">
      <template #actions>
        <!-- Счётчики, как в Битрикс24: щелчок — показать только их. -->
        <div v-if="tasksEnabled" class="flex flex-wrap items-center justify-end gap-1.5">
          <button type="button" class="counter-chip" :data-on="only === 'overdue' ? 'true' : undefined" :disabled="!overdueCount && only !== 'overdue'" @click="toggleOnly('overdue')">
            <AlarmClock class="size-3.5" />Просрочены<span class="counter-chip__n" :style="overdueCount ? { background: 'var(--danger)', color: 'var(--danger-foreground)' } : undefined">{{ overdueCount }}</span>
          </button>
          <button type="button" class="counter-chip" :data-on="only === 'comments' ? 'true' : undefined" :disabled="!commentCount && only !== 'comments'" @click="toggleOnly('comments')">
            <MessageCircle class="size-3.5" />Комментарии<span class="counter-chip__n" :style="commentCount ? { background: 'var(--success)', color: 'var(--success-foreground)' } : undefined">{{ commentCount }}</span>
          </button>
          <button type="button" class="counter-chip counter-chip--ghost" :disabled="!commentCount" title="Отметить прочитанными все чаты задач" @click="readAll"><CheckCheck class="size-3.5" />Прочитать все</button>
        </div>
        <button v-if="can('tasks', 'create')" type="button" class="button button--primary" :disabled="!tasksEnabled" @click="newTask"><Plus class="size-4" />Задача</button>
      </template>
      <template #toolbar>
        <TaskFilter :counts="presetCounts" />
        <Popover ref="sortPop" align="right" width="w-64">
          <template #trigger="{ toggle, open: shown }">
            <button type="button" class="glass-btn" :data-open="shown ? 'true' : undefined" :data-on="sort !== 'manual' ? 'true' : undefined" :title="`Сортировка: ${sortLabel.toLowerCase()}`" @click="toggle">
              <ArrowUpDown class="size-4" /><span class="hidden lg:inline">{{ sort === "manual" ? "Сортировка" : sortLabel }}</span>
            </button>
          </template>
          <div class="p-1.5">
            <p class="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted">Сортировка</p>
            <button v-for="one in SORTS" :key="one.id" type="button" class="sort-row" :data-on="sort === one.id ? 'true' : undefined" @click="setSort(one.id); sortPop?.close()">
              <span class="min-w-0 flex-1"><span class="block text-sm">{{ one.label }}</span><span class="block text-xs text-muted">{{ one.hint }}</span></span>
              <Check v-if="sort === one.id" class="size-4 shrink-0 text-accent" />
            </button>
          </div>
        </Popover>
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
          <div v-if="one.checklist.total || one.files || one.children || taskStore.timer?.taskId === one.id || unreadByTask.has(one.id)" class="mt-1.5 flex items-center gap-2.5 text-xs text-muted tabular-nums">
            <span v-if="unreadByTask.has(one.id)" class="inline-flex h-[18px] items-center gap-0.5 rounded-full px-1.5 font-semibold" :style="{ background: 'var(--success)', color: 'var(--success-foreground)' }" :title="`Новых сообщений: ${unreadByTask.get(one.id)}`"><MessageCircle class="size-3" />{{ unreadByTask.get(one.id) }}</span>
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
        <p v-if="taskStore.loaded && !visible.length" class="on-photo py-12 text-center">{{ only === "overdue" ? "Всё сделано в срок." : only === "comments" ? "Новых комментариев нет." : "По фильтру задач нет." }}</p>
      </div>
    </div>

    <SidePanel
      :open="isNew || openedId != null"
      wide
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

<style scoped>
.counter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2.125rem;
  padding: 0 0.375rem 0 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--foreground);
  background: color-mix(in oklab, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--surface-shadow);
  text-shadow: none;
  transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
}
.counter-chip:hover:not(:disabled):not([data-on]) { background: var(--surface); }
.counter-chip[data-on]:hover { background: color-mix(in oklab, var(--accent) 88%, black); }
.counter-chip:disabled { opacity: 0.7; cursor: default; }
.counter-chip[data-on] { background: var(--accent); color: var(--accent-foreground); }
.counter-chip--ghost { padding-right: 0.75rem; }
.counter-chip__n {
  min-width: 1.375rem;
  height: 1.375rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  background: var(--default);
  font-size: 0.75rem;
  line-height: 1.375rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.counter-chip[data-on] .counter-chip__n { background: color-mix(in oklab, white 25%, transparent) !important; color: inherit !important; }
.glass-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2.375rem;
  padding: 0 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  background: color-mix(in oklab, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--surface-shadow);
}
.glass-btn:hover, .glass-btn[data-open] { background: var(--surface); }
.glass-btn[data-on] { color: var(--accent); }
.sort-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
  text-align: left;
}
.sort-row:hover { background: var(--default); }
.sort-row[data-on] { background: var(--accent-soft); }
</style>
