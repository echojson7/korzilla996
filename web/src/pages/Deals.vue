<!-- Сделки как в Битрикс24: воронки (выбор вверху), канбан по рабочим
     стадиям и список со всеми сделками, включая завершённые. Карточку тянут
     между стадиями; щелчок открывает сделку справа. Воронки, стадии и поля
     настраиваются в «Настройках CRM» (шестерёнка, право crm.settings).
     В адресе: ?pipeline, ?view=board|list, ?q, ?open, ?setup. -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Plus, Kanban, Table2, ChevronDown, Check, Settings2, Briefcase } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Board from "../components/Board.vue";
import DataTable from "../components/DataTable.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import Popover from "../components/Popover.vue";
import HueChip from "../components/HueChip.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import DealCard from "../components/crm/DealCard.vue";
import CrmSettings from "../components/crm/CrmSettings.vue";
import {
  crm, board, crmEnabled, startCrm, loadBoard, loadList, createDeal, moveDeal, pipelineById, stageById, defaultPipeline, hueOf,
  type DealBrief, type DealFull, type Field, type FieldValue,
} from "../lib/crm";
import { person, nameOf } from "../lib/tasks";
import { auth } from "../lib/session";
import { compactMoney, money, plural } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { moveBefore, type Column } from "../lib/move";
import { local } from "../lib/prefs";
import { toast } from "../lib/toast";
import { ApiError } from "../lib/api";

const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");

onMounted(startCrm);
watch(crmEnabled, (on) => on && startCrm());

/* ---------- Воронка и вид ---------- */
const pipelineId = computed(() => {
  const asked = Number(route.value.query.get("pipeline"));
  return pipelineById.value.has(asked) ? asked : defaultPipeline.value?.id ?? 0;
});
const pipeline = computed(() => pipelineById.value.get(pipelineId.value) ?? null);
const working = computed(() => pipeline.value?.stages.filter((one) => one.semantic === "process") ?? []);
type View = "board" | "list";
const savedView = local<View>("deals.view", "board");
const view = computed<View>(() => (route.value.query.get("view") === "list" ? "list" : route.value.query.get("view") === "board" ? "board" : savedView.value));
watch(view, (next) => (savedView.value = next));
const VIEWS = [
  { key: "board", label: "Канбан", icon: Kanban },
  { key: "list", label: "Список", icon: Table2 },
];
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });

watch([pipelineId, view, crmEnabled], ([id, mode, on]) => {
  if (on && id && mode === "board") loadBoard(id).catch(fail);
}, { immediate: true });

/* ---------- Канбан ---------- */
const kanbanFields = computed(() => crm.fields.filter((one) => one.active && one.showOnKanban));
const listFields = computed(() => crm.fields.filter((one) => one.active && one.showInList));
const words = computed(() => text.value.trim().toLowerCase());
const onBoard = computed(() => {
  if (board.pipelineId !== pipelineId.value) return [];
  if (!words.value) return board.list;
  return board.list.filter((one) => `${one.title} ${one.company ?? ""} ${one.contact ?? ""} ${nameOf(one.responsibleId)} ${one.id}`.toLowerCase().includes(words.value));
});
const sum = (list: DealBrief[]) => list.reduce((total, one) => total + (one.amount || 0), 0);
const columns = computed(() => working.value.map((stage) => {
  const inStage = onBoard.value.filter((one) => one.stageId === stage.id);
  return { id: String(stage.id), label: stage.title, hue: hueOf(stage.color), total: `${inStage.length} · ${compactMoney(sum(inStage))}` };
}));
const boardRef = ref<{ openAdd: (column: string) => void } | null>(null);

async function move(key: number | string, column: string, before: number | string | null) {
  const stageId = Number(column);
  const one = board.list.find((deal) => deal.id === key);
  if (!one) return;
  const was = one.stageId;
  moveBefore(board.list, key, (deal) => deal.id, before);
  one.stageId = stageId;
  try {
    await moveDeal(one.id, stageId, before == null ? null : Number(before));
    if (was !== stageId) toast(`«${one.title}» → ${stageById.value.get(stageId)?.title ?? ""}`, "success");
  } catch (error) {
    fail(error);
    loadBoard(pipelineId.value).catch(() => undefined);
  }
}
async function add(column: string, title: string) {
  try {
    await createDeal({ title, pipeline_id: pipelineId.value, stage_id: Number(column) });
    toast(`Сделка «${title}» создана`, "success");
  } catch (error) {
    fail(error);
  }
}
function newDeal() {
  if (view.value !== "board") setQuery({ view: "board" });
  const first = working.value[0];
  if (first) setTimeout(() => boardRef.value?.openAdd(String(first.id)));
}

/* ---------- Список ---------- */
type Closed = "0" | "1" | "all";
const closed = computed<Closed>(() => (["0", "1", "all"].includes(route.value.query.get("closed") ?? "") ? (route.value.query.get("closed") as Closed) : "all"));
const CLOSED = [
  { key: "0", label: "В работе" },
  { key: "1", label: "Завершённые" },
  { key: "all", label: "Все" },
];
const PER = 200;
const rows = ref<DealBrief[]>([]);
const total = ref(0);
const totalSum = ref(0);
const page = ref(1);
const listLoading = ref(false);
let listSeq = 0;
async function loadRows(reset = true) {
  if (!crmEnabled.value || !pipelineId.value) return;
  const seq = ++listSeq;
  if (reset) page.value = 1;
  listLoading.value = true;
  try {
    const state = await loadList({ pipeline: pipelineId.value, closed: closed.value, q: text.value.trim(), order: "-id", page: page.value, per: PER });
    if (seq !== listSeq) return;
    rows.value = reset ? state.deals : [...rows.value, ...state.deals];
    total.value = state.total;
    totalSum.value = state.sum;
  } catch (error) {
    fail(error);
  } finally {
    if (seq === listSeq) listLoading.value = false;
  }
}
let searchTimer = 0;
watch([pipelineId, closed, view, crmEnabled], () => view.value === "list" && loadRows(), { immediate: true });
watch(text, () => {
  if (view.value !== "list") return;
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadRows(), 250);
});
function more() {
  page.value++;
  loadRows(false);
}
/* Живые правки видны и в списке: свежая версия из доски. */
watch(() => board.list, (list) => {
  if (view.value !== "list") return;
  const fresh = new Map(list.map((one) => [one.id, one]));
  rows.value = rows.value.map((one) => fresh.get(one.id) ?? one);
});

const fieldText = (field: Field, value: FieldValue | undefined): string => {
  if (value == null || value === "") return "";
  const many = Array.isArray(value) ? value : [value];
  return many.map((one) => {
    if (field.type === "list") return field.options.find((opt) => opt.id === String(one))?.label ?? String(one);
    if (field.type === "user") return person(Number(one))?.name ?? `№${one}`;
    if (field.type === "boolean") return one ? "Да" : "Нет";
    if (field.type === "date") return new Date(`${one}T00:00:00`).toLocaleDateString("ru-RU");
    if (field.type === "datetime") return new Date(String(one)).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
    if (field.type === "number") return Number(one).toLocaleString("ru-RU");
    if (field.type === "file") return (one as { name?: string }).name ?? "Файл";
    return String(one);
  }).join(", ");
};
const TABLE = computed<Column<DealBrief>[]>(() => [
  { key: "title", label: "Сделка", sort: (one) => one.title },
  { key: "stage", label: "Стадия", sort: (one) => stageById.value.get(one.stageId)?.sort ?? 0 },
  { key: "amount", label: "Сумма", sort: (one) => one.amount, class: "text-right" },
  { key: "responsible", label: "Ответственный", sort: (one) => nameOf(one.responsibleId) },
  ...listFields.value.map((field) => ({ key: `f_${field.code}`, label: field.title, sort: (one: DealBrief) => fieldText(field, one.fields[field.code]) })),
  { key: "created", label: "Создана", sort: (one) => one.createdAt ?? "" },
]);
const created = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "2-digit" }) : "");

/* ---------- Карточка и настройки ---------- */
const openParam = computed(() => route.value.query.get("open"));
const openId = computed(() => (openParam.value && /^\d+$/.test(openParam.value) ? Number(openParam.value) : null));
const opened = ref<DealFull | null>(null);
watch(openId, () => (opened.value = null));
const open = (deal: DealBrief) => setQuery({ open: deal.id });
const close = () => setQuery({ open: null });
const setup = computed(() => route.value.query.get("setup"));

const tabs = computed(() => crm.pipelines.map((one) => ({ ...one, count: one.open ?? 0 })));
const pipelinePicker = ref<InstanceType<typeof Popover> | null>(null);
const sub = computed(() => {
  if (view.value === "list") return `${plural(total.value, "сделка", "сделки", "сделок")} на ${money(totalSum.value)}`;
  return `${plural(onBoard.value.length, "сделка", "сделки", "сделок")} в работе на ${money(sum(onBoard.value))}`;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Сделки" :sub="crm.loaded ? sub : ''">
      <template #actions>
        <button v-if="crm.can.settings" type="button" class="button button--secondary button--icon-only" aria-label="Настройки CRM" title="Воронки, стадии и поля" @click="setQuery({ setup: 'pipelines', open: null })">
          <Settings2 class="size-4" />
        </button>
        <button v-if="crm.can.create && working.length" type="button" class="button button--primary" @click="newDeal">
          <Plus class="size-4" />Сделка
        </button>
      </template>
      <template v-if="crm.loaded" #toolbar>
        <Popover ref="pipelinePicker" align="left" width="w-80">
          <template #trigger="{ toggle }">
            <button type="button" class="button button--secondary button--sm max-w-full" @click="toggle">
              <Briefcase class="size-4 shrink-0 text-muted" /><span class="truncate">{{ pipeline?.title ?? "Воронка" }}</span><ChevronDown class="size-3.5 shrink-0 text-muted" />
            </button>
          </template>
          <p class="px-3 pt-2 pb-1 text-xs text-muted">Воронки · в работе</p>
          <div class="max-h-96 overflow-y-auto thin-scroll">
            <button v-for="one in tabs" :key="one.id" type="button" class="menu-row" @click="setQuery({ pipeline: one.id, open: null }); pipelinePicker?.close()">
              <span class="min-w-0 flex-1 truncate">{{ one.title }}</span>
              <span class="text-xs text-muted tabular-nums">{{ one.count }}</span>
              <Check class="size-4 text-accent" :class="one.id === pipelineId ? '' : 'invisible'" />
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
          ><component :is="one.icon" class="size-4" />{{ one.label }}</button>
        </div>
        <Segmented v-if="view === 'list'" label="Сделки" :items="CLOSED" :model-value="closed" @update:model-value="(value) => setQuery({ closed: value })" />
        <SearchBox v-model="text" placeholder="Название, компания, контакт, ответственный" class="w-full min-w-0 sm:w-auto sm:flex-1" />
      </template>
    </PageHead>

    <div v-if="auth.demo" class="px-3 md:px-5">
      <p class="sheet rounded-2xl p-6 text-sm text-muted">Сделки хранятся на сервере портала. Откройте портал со стенда, чтобы с ними работать.</p>
    </div>
    <div v-else-if="crm.error && !crm.loaded" class="px-3 md:px-5">
      <p class="sheet rounded-2xl p-6 text-sm text-danger">{{ crm.error }}</p>
    </div>

    <div v-else-if="view === 'board'" class="min-h-0 flex-1 px-3 pb-3 md:px-5">
      <Board
        ref="boardRef"
        :columns="columns"
        :items="onBoard"
        :column-of="(deal) => String(deal.stageId)"
        :key-of="(deal) => deal.id"
        add-placeholder="Название сделки и Enter"
        @move="move"
        @open="open"
        @add="add"
      >
        <template #card="{ item: deal }">
          <p class="leading-snug font-medium">{{ deal.title }}</p>
          <p v-if="deal.company || deal.contact" class="mt-0.5 truncate text-xs text-muted">{{ deal.company || deal.contact }}</p>
          <dl v-if="kanbanFields.some((field) => fieldText(field, deal.fields[field.code]))" class="mt-1.5 flex flex-col gap-0.5 text-xs">
            <template v-for="field in kanbanFields" :key="field.id">
              <div v-if="fieldText(field, deal.fields[field.code])" class="flex min-w-0 gap-1">
                <dt class="shrink-0 text-muted">{{ field.title }}:</dt><dd class="truncate">{{ fieldText(field, deal.fields[field.code]) }}</dd>
              </div>
            </template>
          </dl>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="font-semibold tabular-nums">{{ deal.amount ? money(deal.amount) : "—" }}</span>
            <ChatFace :user="person(deal.responsibleId ?? 0)" size="xs" :title="nameOf(deal.responsibleId)" />
          </div>
        </template>
      </Board>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:px-5 photo-scroll">
      <DataTable :columns="TABLE" :rows="rows" :key-of="(one) => one.id" label="Сделки" class="sheet" @open="open">
        <template #title="{ row }">
          <span class="block font-medium">{{ row.title }}</span>
          <span v-if="row.company || row.contact" class="block truncate text-xs text-muted">{{ row.company || row.contact }}</span>
        </template>
        <template #stage="{ row }">
          <HueChip v-if="stageById.get(row.stageId)" :hue="hueOf(stageById.get(row.stageId)!.color)">{{ stageById.get(row.stageId)!.title }}</HueChip>
        </template>
        <template #amount="{ row }"><span class="tabular-nums">{{ row.amount ? money(row.amount) : "—" }}</span></template>
        <template #responsible="{ row }"><span class="inline-flex items-center gap-2"><ChatFace :user="person(row.responsibleId ?? 0)" size="xs" />{{ nameOf(row.responsibleId) }}</span></template>
        <template v-for="field in listFields" :key="field.id" #[`f_${field.code}`]="{ row }">
          <span class="line-clamp-2 text-sm">{{ fieldText(field, row.fields[field.code]) }}</span>
        </template>
        <template #created="{ row }"><span class="text-sm text-muted whitespace-nowrap">{{ created(row.createdAt) }}</span></template>
      </DataTable>
      <div class="flex justify-center py-3">
        <button v-if="rows.length < total" type="button" class="button button--secondary button--sm" :disabled="listLoading" @click="more">Показать ещё {{ Math.min(PER, total - rows.length) }} из {{ total - rows.length }}</button>
        <p v-else-if="!listLoading && !rows.length" class="sheet w-full rounded-2xl p-6 text-center text-sm text-muted">Сделок не нашлось</p>
      </div>
    </div>

    <SidePanel :open="!!openParam" :chat="opened ? { entity: `deal:${opened.id}`, title: `Сделка: ${opened.title}` } : null" :title="opened?.title ?? (openId ? `Сделка №${openId}` : 'Сделка')" :sub="opened ? `Сделка №${opened.id}${opened.company ? ` · ${opened.company}` : ''}` : ''" @close="close">
      <DealCard v-if="openId" :key="openId" :deal-id="openId" @close="close" @loaded="(one) => (opened = one)" />
    </SidePanel>

    <SidePanel :open="!!setup && crm.can.settings" wide title="Настройки CRM" sub="Воронки, стадии и поля сделок" @close="setQuery({ setup: null })">
      <CrmSettings v-if="setup" :pipeline-id="pipelineId" />
    </SidePanel>
  </div>
</template>

<style scoped>
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
