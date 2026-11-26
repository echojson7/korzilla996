<!-- Задачи: вкладки Мои / Поручил / Просрочены / Все и два вида — канбан
     по статусам (по умолчанию) и таблица. Вид помнится (k996.tasks.view) и
     стоит в адресе (?view), вкладка — ?tab, открытая задача — ?open.
     В канбане завершённые лежат в своей колонке, в таблице «Мои» и
     «Поручил» показывают только открытые. «+» в колонке — быстрая задача. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Kanban, Table2, Briefcase, Flame, Play, Eye, Check, RotateCcw, CalendarClock } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Board from "../components/Board.vue";
import DataTable from "../components/DataTable.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import Face from "../components/Face.vue";
import HueChip from "../components/HueChip.vue";
import PersonLine from "../components/PersonLine.vue";
import { tasks, deals, WHO, TASK_STATES, TASK_STATE, ME_ID, TODAY, day, isOpen, isOverdue, type Task, type TaskState } from "../lib/data";
import { shortDate, plural } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { moveBefore, type Column } from "../lib/move";
import { local } from "../lib/prefs";
import { toast } from "../lib/toast";

type View = "board" | "table";
const savedView = local<View>("tasks.view", "board");
const view = computed<View>(() => {
  const asked = route.value.query.get("view");
  return asked === "table" || asked === "board" ? asked : savedView.value;
});
watch(view, (next) => (savedView.value = next));
const setView = (next: string) => setQuery({ view: next });

const TABS = {
  mine: { label: "Мои", test: (one: Task) => one.owner === ME_ID },
  given: { label: "Поручил", test: (one: Task) => one.author === ME_ID && one.owner !== ME_ID },
  overdue: { label: "Просрочены", test: isOverdue },
  all: { label: "Все", test: () => true },
} as const;
type Tab = keyof typeof TABS;
const tab = computed<Tab>(() => {
  const raw = route.value.query.get("tab");
  return raw && raw in TABS ? (raw as Tab) : "mine";
});
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });

/* В таблице «Мои» и «Поручил» — без завершённых; в канбане им своя колонка. */
const inTab = (key: Tab, forTable: boolean) => tasks.filter((one) => TABS[key].test(one) && (!forTable || key === "all" || key === "overdue" || isOpen(one)));
const dealOf = (one: Task) => deals.find((deal) => deal.id === one.deal);
const visible = computed(() => {
  const words = text.value.trim().toLowerCase();
  const list = inTab(tab.value, view.value === "table");
  if (!words) return list;
  return list.filter((one) => {
    const deal = dealOf(one);
    return `${one.title} ${one.id} ${WHO[one.owner].name} ${WHO[one.author].name} ${deal?.title ?? ""} ${deal?.company ?? ""}`.toLowerCase().includes(words);
  });
});
const tabs = computed(() => (Object.keys(TABS) as Tab[]).map((key) => ({ key, label: TABS[key].label, count: inTab(key, view.value === "table").length })));
const VIEWS = [{ key: "board", label: "Канбан" }, { key: "table", label: "Таблица" }];

const COLUMN_LABEL: Record<TaskState, string> = { new: "Новые", work: "Выполняются", review: "На проверке", done: "Завершены" };
const columns = TASK_STATES.map((one) => ({ id: one.id, label: COLUMN_LABEL[one.id], hue: one.hue }));
const board = ref<{ openAdd: (column: string) => void } | null>(null);

function move(key: number | string, state: string, before: number | string | null) {
  const was = tasks.find((one) => one.id === key)?.state;
  const task = moveBefore(tasks, key, (one) => one.id, before);
  if (!task) return;
  task.state = state as TaskState;
  if (was !== state) toast(`«${task.title}» → ${TASK_STATE[task.state].label}`, "success");
}
let seq = 900;
function add(state: string, title: string) {
  tasks.unshift({ id: ++seq, title, owner: ME_ID, author: ME_ID, deadline: null, state: state as TaskState, deal: null });
}
function newTask() {
  if (view.value !== "board") setQuery({ view: "board" });
  setTimeout(() => board.value?.openAdd("new"), 0);
}

/* Срок лейблом, цвет по близости: красный — просрочена, оранжевый —
   сегодня, жёлтый — завтра и послезавтра, зелёный — дальше. */
const tomorrow = day(1);
type Tone = "danger" | "warning" | "soon" | "calm" | "none" | "done";
function deadline(one: Task): { text: string; tone: Tone; cls: string } {
  const pick = (text: string, tone: Tone, cls: string) => ({ text, tone, cls });
  if (one.state === "done") return pick("Завершена", "done", "text-success");
  if (!one.deadline) return pick("Без срока", "none", "text-muted");
  if (isOverdue(one)) return pick(`Просрочена · ${shortDate(one.deadline)}`, "danger", "text-danger font-medium");
  if (one.deadline < tomorrow) return pick("Сегодня", "warning", "text-warning font-medium");
  if (one.deadline < day(2)) return pick("Завтра", "soon", "text-muted");
  if (one.deadline < day(3)) return pick(shortDate(one.deadline), "soon", "text-muted");
  return pick(shortDate(one.deadline), "calm", "text-muted");
}

const TABLE: Column<Task>[] = [
  { key: "title", label: "Задача", sort: (one) => one.title, class: "min-w-[320px]" },
  { key: "owner", label: "Ответственный", sort: (one) => WHO[one.owner].name },
  { key: "author", label: "Постановщик", sort: (one) => WHO[one.author].name },
  { key: "deadline", label: "Срок", sort: (one) => one.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER },
  { key: "state", label: "Статус", sort: (one) => TASK_STATES.findIndex((state) => state.id === one.state) },
];

const opened = computed(() => tasks.find((one) => String(one.id) === route.value.query.get("open")) ?? null);
const open = (one: Task) => setQuery({ open: one.id });
const close = () => setQuery({ open: null });
const STEP: Partial<Record<TaskState, { to: TaskState; label: string; icon: unknown }>> = {
  new: { to: "work", label: "Начать", icon: Play },
  work: { to: "review", label: "На проверку", icon: Eye },
  review: { to: "done", label: "Завершить", icon: Check },
};
function step(one: Task, to: TaskState) {
  one.state = to;
  if (to === "done") {
    toast(`Задача завершена: «${one.title}»`, "success");
    close();
  }
}
const late = computed(() => tasks.filter(isOverdue).length);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Задачи" :sub="late ? `Просрочено: ${plural(late, 'задача', 'задачи', 'задач')}` : 'Всё в срок'">
      <template #actions>
        <button type="button" class="button button--primary" @click="newTask"><Plus class="size-4" />Задача</button>
      </template>
      <template #toolbar>
        <Segmented label="Задачи" :items="tabs" :model-value="tab" @update:model-value="(key) => setQuery({ tab: key === 'mine' ? null : key, open: null })" />
        <SearchBox v-model="text" placeholder="Задача, сделка или сотрудник" class="w-full min-w-0 sm:w-auto sm:flex-1" />
        <div class="toggle-button-group toggle-button-group--horizontal" role="radiogroup" aria-label="Вид">
          <button
            v-for="one in VIEWS"
            :key="one.key"
            type="button"
            role="radio"
            class="toggle-button toggle-button--sm gap-1.5"
            :aria-checked="view === one.key"
            :data-selected="view === one.key ? 'true' : undefined"
            @click="setView(one.key)"
          >
            <Kanban v-if="one.key === 'board'" class="size-4" /><Table2 v-else class="size-4" />{{ one.label }}
          </button>
        </div>
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 px-3 pb-3 md:px-5">
      <Board
        v-if="view === 'board'"
        ref="board"
        :columns="columns"
        :items="visible"
        :column-of="(one) => one.state"
        :key-of="(one) => one.id"
        add-placeholder="Название задачи и Enter"
        @move="move"
        @open="open"
        @add="add"
      >
        <template #card="{ item: one }">
          <p class="line-clamp-3 leading-snug font-medium" :class="{ 'text-muted line-through': one.state === 'done' }">
            <Flame v-if="one.important" class="-mt-0.5 mr-0.5 inline size-3.5 text-danger" aria-label="Важная" />{{ one.title }}
          </p>
          <p v-if="dealOf(one)" class="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            <Briefcase class="size-3 shrink-0" /><span class="truncate">{{ dealOf(one)!.title }}</span>
          </p>
          <div class="mt-2 flex items-center gap-2">
            <span class="min-w-0 flex-1"><span class="due" :class="`due--${deadline(one).tone}`"><CalendarClock class="size-3 shrink-0" />{{ deadline(one).text }}</span></span>
            <span class="flex gap-0.5">
              <Face :who="one.author" size="xs" />
              <Face v-if="one.owner !== one.author" :who="one.owner" size="xs" />
            </span>
          </div>
        </template>
      </Board>

      <div v-else class="h-full overflow-y-auto rounded-2xl photo-scroll">
        <DataTable :columns="TABLE" :rows="visible" :key-of="(one) => one.id" label="Задачи" class="sheet" @open="open">
          <template #title="{ row }">
            <span class="block font-medium" :class="{ 'text-muted line-through': row.state === 'done' }">
              <Flame v-if="row.important" class="-mt-0.5 mr-0.5 inline size-3.5 text-danger" />{{ row.title }}
            </span>
            <span v-if="dealOf(row)" class="block truncate text-xs text-muted">{{ dealOf(row)!.title }} · {{ dealOf(row)!.company }}</span>
          </template>
          <template #owner="{ row }"><PersonLine :id="row.owner" /></template>
          <template #author="{ row }"><PersonLine :id="row.author" /></template>
          <template #deadline="{ row }"><span class="due" :class="`due--${deadline(row).tone}`">{{ deadline(row).text }}</span></template>
          <template #state="{ row }">
            <HueChip :hue="TASK_STATE[row.state].hue">{{ TASK_STATE[row.state].label }}</HueChip>
          </template>
        </DataTable>
        <p v-if="!visible.length" class="on-photo py-12 text-center">{{ tab === "overdue" ? "Всё сделано в срок." : "Задач нет." }}</p>
      </div>
    </div>

    <SidePanel :open="!!opened" :title="opened?.title ?? ''" :sub="opened ? `Задача №${opened.id}` : ''" @close="close">
      <template v-if="opened">
        <div class="grid gap-4 md:grid-cols-[1fr_240px]">
          <section class="card card--default gap-3 p-4">
            <h3 class="text-sm font-semibold">Описание</h3>
            <p class="text-sm" :class="opened.text ? '' : 'text-muted'">{{ opened.text || "Описания нет." }}</p>
            <template v-if="dealOf(opened)">
              <h3 class="pt-2 text-sm font-semibold">Сделка</h3>
              <p class="flex items-center gap-2 text-sm"><Briefcase class="size-4 text-muted" />{{ dealOf(opened)!.title }} · {{ dealOf(opened)!.company }}</p>
            </template>
          </section>
          <aside class="card card--default gap-3 p-4 text-sm">
            <div>
              <p class="text-xs text-muted">Статус</p>
              <HueChip :hue="TASK_STATE[opened.state].hue">{{ TASK_STATE[opened.state].label }}</HueChip>
            </div>
            <div><p class="text-xs text-muted">Срок</p><p class="mt-1" :class="deadline(opened).cls">{{ deadline(opened).text }}</p></div>
            <div><p class="mb-1 text-xs text-muted">Постановщик</p><PersonLine :id="opened.author" :sub="WHO[opened.author].role" /></div>
            <div><p class="mb-1 text-xs text-muted">Ответственный</p><PersonLine :id="opened.owner" :sub="WHO[opened.owner].role" /></div>
            <p v-if="opened.deadline && opened.deadline < TODAY && opened.state !== 'done'" class="rounded-lg bg-danger-soft px-2 py-1.5 text-xs text-danger-soft-foreground">Срок прошёл</p>
          </aside>
        </div>
      </template>
      <template #footer>
        <template v-if="opened">
          <button v-if="STEP[opened.state]" type="button" class="button button--primary" @click="step(opened, STEP[opened.state]!.to)">
            <component :is="STEP[opened.state]!.icon" class="size-4" />{{ STEP[opened.state]!.label }}
          </button>
          <button v-else type="button" class="button button--secondary" @click="step(opened, 'work')"><RotateCcw class="size-4" />Вернуть в работу</button>
          <button type="button" class="button button--ghost" @click="close">Закрыть</button>
        </template>
      </template>
    </SidePanel>
  </div>
</template>
