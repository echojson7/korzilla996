<!-- Карточка сделки как в Битрикс24: полоса стадий (щелчок — перевод,
     «Завершить» — успех или провал), сводка (сумма, ответственный, срок),
     блок «Клиент» с плитками компании и контактов из базы, поля сделки,
     товары, свои поля блоками (пустые блоки свёрнуты, пустые поля — под
     «Ещё N полей»: их в воронках Битрикса больше сотни), счета, договоры,
     документы, комментарий, задачи и история. Правка сразу уходит на сервер. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Check, ChevronDown, Clock, ListChecks, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Trash2, Link2, LayoutList, ShoppingCart, Receipt, FileText, Layers, CalendarDays } from "@lucide/vue";
import Popover from "../Popover.vue";
import HueChip from "../HueChip.vue";
import NoAccess from "../NoAccess.vue";
import ChatFace from "../messenger/ChatFace.vue";
import MarkdownField from "../editor/MarkdownField.vue";
import CardBlock from "../tasks/CardBlock.vue";
import UserPick from "../tasks/UserPick.vue";
import FieldValue from "./FieldValue.vue";
import ProductRows from "./ProductRows.vue";
import InvoiceList from "./InvoiceList.vue";
import DocumentList from "./DocumentList.vue";
import SmartList from "./SmartList.vue";
import StageBar from "./StageBar.vue";
import ClientBlock from "./ClientBlock.vue";
import {
  crm, getDeal, updateDeal, deleteDeal, onDealChange, pipelineById, stageById, fieldByCode, hueOf, CURRENCIES,
  type DealFull, type DealInput, type Field, type FieldValue as Value, type Stage, type ProductRow,
} from "../../lib/crm";
import { taskStore, STATUS, person, nameOf } from "../../lib/tasks";
import { when as dueWhen } from "../tasks/when";
import { href } from "../../lib/router";
import { money, plural } from "../../lib/format";
import { toast } from "../../lib/toast";
import { ApiError } from "../../lib/api";
import { atLeast, deniedOf, type Denied } from "../../lib/denied";

const props = defineProps<{ dealId: number }>();
const emit = defineEmits<{ close: []; loaded: [deal: DealFull | null] }>();
const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");

const deal = ref<DealFull | null>(null);
const loading = ref(true);
const denied = ref<Denied | null>(null);

async function load(id: number) {
  const first = !deal.value || deal.value.id !== id;
  loading.value = first;
  try {
    const fresh = await (first ? atLeast(getDeal(id)) : getDeal(id));
    denied.value = null;
    deal.value = fresh;
  } catch (error) {
    const state = deniedOf(error);
    if (state === "error" && !first) return fail(error);
    deal.value = null;
    denied.value = state;
  } finally {
    loading.value = false;
    emit("loaded", deal.value);
  }
}
watch(() => props.dealId, (id) => load(id), { immediate: true });
/* Сделку поменяли в другой вкладке или коллега — перечитать. */
const stop = onDealChange((ids) => deal.value && ids.includes(deal.value.id) && load(deal.value.id));
onBeforeUnmount(stop);

const canEdit = computed(() => !!deal.value?.can.edit);
const pipeline = computed(() => (deal.value ? pipelineById.value.get(deal.value.pipelineId) ?? null : null));
const stage = computed(() => (deal.value ? stageById.value.get(deal.value.stageId) ?? null : null));

async function patch(input: DealInput) {
  if (!deal.value) return;
  try {
    deal.value = await updateDeal(deal.value.id, input);
  } catch (error) {
    fail(error);
    load(deal.value.id);
  }
}
async function toStage(one: Stage) {
  if (!deal.value || one.id === deal.value.stageId || !canEdit.value) return;
  await patch({ stage_id: one.id });
  toast(`Стадия: ${one.title}`, "success");
}
function saveField(field: Field, value: Value) {
  patch({ fields: { [field.code]: value } });
}

/* ---------- Основные поля ---------- */
const titleText = ref("");
const amountText = ref("");
watch(deal, (one) => {
  titleText.value = one?.title ?? "";
  amountText.value = one && one.amount ? one.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 }).replace(/\u00a0/g, " ") : "";
}, { immediate: true });
function saveText(_key: "title", text: string) {
  if (!deal.value) return;
  const value = text.trim();
  if (deal.value.title === value) return;
  if (!value) return void (titleText.value = deal.value.title);
  patch({ title: value });
}
function saveAmount() {
  if (!deal.value) return;
  const value = Number(amountText.value.replace(/[\s ]/g, "").replace(",", ".")) || 0;
  if (value !== deal.value.amount) patch({ amount: value });
}
const pickers = new Map<string, InstanceType<typeof Popover> | null>();
const setPicker = (key: string) => (el: unknown) => pickers.set(key, el as InstanceType<typeof Popover> | null);
const closePicker = (key: string) => pickers.get(key)?.close();

/* ---------- Свои поля блоками ---------- */
const expanded = ref(new Set<string>());
const filled = (value: Value | undefined) => !(value == null || value === "" || value === false || (Array.isArray(value) && !value.length));
const sections = computed(() => {
  const groups = new Map<string, Field[]>();
  for (const field of crm.fields) {
    if (!field.active) continue;
    const name = field.section || "Дополнительно";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(field);
  }
  return [...groups.entries()].map(([name, fields]) => {
    const values = deal.value?.fields ?? {};
    const shown = expanded.value.has(name) ? fields : fields.filter((one) => filled(values[one.code]) || one.required);
    return { name, fields, shown, hidden: fields.length - shown.length, count: fields.filter((one) => filled(values[one.code])).length };
  }).sort((a, b) => Number(!a.count) - Number(!b.count));
});
/* Свои поля с блоком «О сделке» — прямо в основном блоке. */
const MAIN = "О сделке";
const mainGroup = computed(() => sections.value.find((one) => one.name === MAIN) ?? null);
const otherGroups = computed(() => sections.value.filter((one) => one.name !== MAIN));
/* Свёрнутые блоки: по умолчанию свёрнут блок без заполненных полей. */
const folded = ref(new Map<string, boolean>());
const isFolded = (name: string, count: number) => folded.value.get(name) ?? count === 0;
function fold(name: string, count: number) {
  const next = new Map(folded.value);
  next.set(name, !isFolded(name, count));
  folded.value = next;
}
function toggleSection(name: string) {
  const next = new Set(expanded.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  expanded.value = next;
}

/* ---------- Комментарий ---------- */
const commentEditing = ref(false);
const commentDraft = ref("");
watch(() => deal.value?.id, () => (commentEditing.value = false));
function editComment() {
  commentDraft.value = deal.value?.comments ?? "";
  commentEditing.value = true;
}
async function saveComment() {
  await patch({ comments: commentDraft.value.trim() || null });
  commentEditing.value = false;
}

/* ---------- Товары ---------- */
const productsTotal = (rows: ProductRow[]) => rows.reduce((sum, one) => sum + one.sum - one.discount, 0);

/* ---------- Задачи и история ---------- */
const activity = ref<"tasks" | "history">("tasks");
const dealTasks = computed(() => (deal.value ? taskStore.list.filter((one) => one.dealId === deal.value!.id) : []));
const historyAll = ref(false);
const LABELS: Record<string, string> = {
  created: "Сделка создана", title: "Название", amount: "Сумма", currency: "Валюта", responsible_id: "Ответственный",
  company: "Компания", contact: "Контакт", close_date: "Дата завершения", comments: "Комментарий", stage_id: "Стадия", pipeline_id: "Воронка",
};
const historyLabel = (field: string) => LABELS[field] ?? (field.startsWith("fields.") ? fieldByCode.value.get(field.slice(7))?.title ?? "Поле" : field);
const history = computed(() => (deal.value?.history ?? []).slice(0, historyAll.value ? undefined : 8));
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const ago = (iso: string | null) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days < 1 ? "сегодня" : days < 2 ? "вчера" : `${plural(days, "день", "дня", "дней")} назад`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }).replace(" г.", "");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "—");

/* ---------- Прочее ---------- */
const askDelete = ref(false);
async function remove() {
  if (!deal.value) return;
  try {
    await deleteDeal(deal.value.id);
    toast("Сделка удалена", "success");
    emit("close");
  } catch (error) {
    fail(error);
  }
}
function copyLink() {
  navigator.clipboard?.writeText(location.href).then(() => toast("Ссылка скопирована", "success"), () => undefined);
}
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-4" aria-busy="true">
    <div class="h-9 animate-pulse rounded-lg bg-surface-secondary" />
    <div class="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
    <div class="h-40 animate-pulse rounded-2xl bg-surface-secondary" />
    <div class="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
  </div>
  <NoAccess v-else-if="denied" :state="denied" what="deal" @retry="load(dealId)"><button type="button" class="button button--ghost button--sm" @click="emit('close')">Закрыть</button></NoAccess>

  <div v-else-if="deal && commentEditing" class="absolute inset-0 bg-surface">
    <MarkdownField fill :model-value="commentDraft" placeholder="Комментарий к сделке: договорённости, ссылки, списки." @update:model-value="(text: string) => (commentDraft = text)" @submit="saveComment" @cancel="commentEditing = false" />
    <div class="absolute right-4 bottom-4 flex gap-2">
      <button type="button" class="button button--ghost button--sm" @click="commentEditing = false">Отмена</button>
      <button type="button" class="button button--primary button--sm" @click="saveComment"><Check class="size-4" />Сохранить</button>
    </div>
  </div>

  <div v-else-if="deal" class="flex flex-col gap-4">
    <StageBar v-if="pipeline" :stages="pipeline.stages" :current="deal.stageId" :editable="canEdit" finish-label="Завершить" @pick="toStage" />

    <!-- Сводка: сумма, ответственный, срок -->
    <section class="card card--default grid grid-cols-1 gap-0 p-0 sm:grid-cols-3">
      <div class="summary">
        <span class="summary__label">Сумма</span>
        <div v-if="canEdit" class="flex min-w-0 items-baseline gap-0.5">
          <input v-model="amountText" inputmode="decimal" class="value-input value-input--big w-full max-w-[9.5rem] min-w-0 tabular-nums" placeholder="0" aria-label="Сумма" @blur="saveAmount" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <Popover :ref="setPicker('currency')" align="left" width="w-32">
            <template #trigger="{ toggle }"><button type="button" class="value text-sm text-muted" @click="toggle">{{ deal.currency }}<ChevronDown class="size-3.5" /></button></template>
            <button v-for="one in CURRENCIES" :key="one" type="button" class="menu-row" @click="patch({ currency: one }); closePicker('currency')">{{ one }}<Check v-if="one === deal.currency" class="ml-auto size-4 text-accent" /></button>
          </Popover>
        </div>
        <span v-else class="text-xl font-semibold tabular-nums">{{ deal.currency === "RUB" ? money(deal.amount) : `${deal.amount.toLocaleString("ru-RU")} ${deal.currency}` }}</span>
      </div>
      <div class="summary">
        <span class="summary__label">Ответственный</span>
        <Popover v-if="canEdit" :ref="setPicker('owner')" align="left" width="w-80">
          <template #trigger="{ toggle }">
            <button type="button" class="value max-w-full" @click="toggle"><ChatFace :user="person(deal.responsibleId ?? 0)" size="xs" /><span class="truncate">{{ nameOf(deal.responsibleId) }}</span></button>
          </template>
          <UserPick single :model-value="deal.responsibleId ? [deal.responsibleId] : []" @pick="(one) => { patch({ responsible_id: one.id }); closePicker('owner'); }" />
        </Popover>
        <span v-else class="inline-flex min-w-0 items-center gap-2 text-sm"><ChatFace :user="person(deal.responsibleId ?? 0)" size="xs" /><span class="truncate">{{ nameOf(deal.responsibleId) }}</span></span>
      </div>
      <div class="summary">
        <span class="summary__label">Дата завершения</span>
        <label v-if="canEdit" class="value relative max-w-full cursor-pointer">
          <CalendarDays class="size-4 shrink-0 text-muted" />
          <span class="truncate" :class="deal.closeDate ? '' : 'text-muted'">{{ deal.closeDate ? shortDay(deal.closeDate) : "Не указана" }}</span>
          <input type="date" :value="deal.closeDate ?? ''" class="date-overlay" aria-label="Дата завершения" @change="patch({ close_date: ($event.target as HTMLInputElement).value || null })" @click="($event.target as HTMLInputElement).showPicker?.()" />
        </label>
        <span v-else class="text-sm">{{ deal.closeDate ? day(deal.closeDate) : "—" }}</span>
      </div>
    </section>

    <!-- Клиент: компания и контакты из базы -->
    <ClientBlock
      :company="deal.companyInfo ?? null"
      :company-text="deal.companyInfo ? null : deal.company"
      :contacts="deal.contactList ?? (deal.contactInfo ? [deal.contactInfo] : [])"
      :editable="canEdit"
      @company="(id) => patch({ company_id: id })"
      @contacts="(ids) => patch({ contact_ids: ids })"
    />

    <!-- О сделке -->
    <CardBlock :icon="SlidersHorizontal" title="О сделке" flush>
      <template #actions>
        <Popover :ref="setPicker('more')" width="w-60">
          <template #trigger="{ toggle }">
            <button type="button" class="button button--sm button--ghost button--icon-only -mr-2" aria-label="Ещё" title="Ещё" @click="toggle"><MoreHorizontal class="size-4" /></button>
          </template>
          <button type="button" class="menu-row" @click="copyLink(); closePicker('more')"><Link2 class="size-4" />Скопировать ссылку</button>
          <button v-if="deal.can.delete" type="button" class="menu-row text-danger" @click="askDelete = true; closePicker('more')"><Trash2 class="size-4" />Удалить сделку</button>
        </Popover>
      </template>
      <dl class="props">
        <dt>Название</dt>
        <dd>
          <input v-if="canEdit" v-model="titleText" class="value-input w-full font-medium" @blur="saveText('title', titleText)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <span v-else class="font-medium">{{ deal.title }}</span>
        </dd>

        <dt>Воронка</dt>
        <dd>
          <Popover v-if="canEdit" :ref="setPicker('pipeline')" align="left" width="w-72">
            <template #trigger="{ toggle }"><button type="button" class="value" @click="toggle">{{ pipeline?.title ?? "—" }}<ChevronDown class="size-3.5 text-muted" /></button></template>
            <p class="px-3 pt-2 pb-1 text-xs text-muted">Перенести в другую воронку — на её первую стадию</p>
            <div class="max-h-72 overflow-y-auto thin-scroll">
              <button v-for="one in crm.pipelines" :key="one.id" type="button" class="menu-row" @click="one.id !== deal.pipelineId && patch({ pipeline_id: one.id }); closePicker('pipeline')">
                <span class="min-w-0 flex-1 truncate">{{ one.title }}</span><Check v-if="one.id === deal.pipelineId" class="size-4 text-accent" />
              </button>
            </div>
          </Popover>
          <span v-else>{{ pipeline?.title ?? "—" }}</span>
        </dd>

        <dt>На стадии</dt>
        <dd class="gap-2"><HueChip v-if="stage" :hue="hueOf(stage.color)">{{ stage.title }}</HueChip><span v-if="deal.stageChangedAt" class="text-muted">{{ ago(deal.stageChangedAt) }}</span></dd>

        <dt>Создана</dt>
        <dd class="text-muted">{{ day(deal.createdAt) }}<template v-if="deal.creatorId"> · {{ nameOf(deal.creatorId) }}</template></dd>
        <template v-if="deal.externalId">
          <dt>В Битрикс24</dt>
          <dd class="text-muted">Сделка №{{ deal.externalId }}</dd>
        </template>
        <template v-for="field in mainGroup?.shown ?? []" :key="field.id">
          <dt :title="field.title"><span class="line-clamp-2">{{ field.title }}<span v-if="field.required" class="text-danger"> *</span></span></dt>
          <dd><FieldValue :field="field" :value="deal.fields[field.code]" :editable="canEdit" @save="(value) => saveField(field, value)" /></dd>
        </template>
      </dl>
      <button v-if="mainGroup && (mainGroup.hidden || expanded.has(MAIN))" type="button" class="mx-5 mb-3 inline-flex items-center gap-1 text-sm text-accent" @click="toggleSection(MAIN)">
        <template v-if="expanded.has(MAIN)">Скрыть пустые</template>
        <template v-else><Plus class="size-3.5" />Ещё {{ plural(mainGroup.hidden, "поле", "поля", "полей") }}</template>
      </button>
    </CardBlock>

    <!-- Товары -->
    <CardBlock v-if="deal.products?.length" :icon="ShoppingCart" title="Товары" :count="`${deal.products.length} · ${money(productsTotal(deal.products))}`">
      <ProductRows :rows="deal.products" />
    </CardBlock>

    <!-- Свои поля -->
    <CardBlock
      v-for="group in otherGroups"
      :key="group.name"
      :icon="LayoutList"
      :title="group.name"
      :count="group.count ? `${group.count} из ${group.fields.length}` : null"
      :collapsed="isFolded(group.name, group.count)"
      flush
      @toggle="fold(group.name, group.count)"
    >
      <dl v-if="group.shown.length" class="props">
        <template v-for="field in group.shown" :key="field.id">
          <dt :title="field.title"><span class="line-clamp-2">{{ field.title }}<span v-if="field.required" class="text-danger"> *</span></span></dt>
          <dd><FieldValue :field="field" :value="deal.fields[field.code]" :editable="canEdit" @save="(value) => saveField(field, value)" /></dd>
        </template>
      </dl>
      <button v-if="group.hidden || expanded.has(group.name)" type="button" class="mx-5 mb-3 inline-flex items-center gap-1 text-sm text-accent" :class="group.shown.length ? 'mt-1' : ''" @click="toggleSection(group.name)">
        <template v-if="expanded.has(group.name)">Скрыть пустые</template>
        <template v-else><Plus class="size-3.5" />{{ group.shown.length ? "Ещё" : "Показать" }} {{ plural(group.hidden, "поле", "поля", "полей") }}</template>
      </button>
    </CardBlock>

    <!-- Счета -->
    <CardBlock v-if="deal.invoices?.length" :icon="Receipt" title="Счета" :count="deal.invoices.length">
      <InvoiceList :rows="deal.invoices" />
    </CardBlock>

    <!-- Смарт-процессы (договоры, претензии) -->
    <CardBlock v-if="deal.smart?.length" :icon="Layers" title="Договоры и процессы" :count="deal.smart.length">
      <SmartList :rows="deal.smart" />
    </CardBlock>

    <!-- Документы -->
    <CardBlock v-if="deal.documents?.length" :icon="FileText" title="Документы" :count="deal.documents.length">
      <DocumentList :rows="deal.documents" />
    </CardBlock>

    <!-- Комментарий -->
    <CardBlock :icon="Pencil" title="Комментарий">
      <template #actions>
        <button v-if="canEdit" type="button" class="button button--ghost button--sm -mr-2" @click="editComment"><Pencil class="size-3.5" />{{ deal.comments ? "Изменить" : "Добавить" }}</button>
      </template>
      <div v-if="deal.comments" class="-mx-4 -mt-2 -mb-3" @dblclick="canEdit && editComment()"><MarkdownField :model-value="deal.comments" :editable="false" /></div>
      <button v-else-if="canEdit" type="button" class="w-full rounded-xl border border-dashed border-separator px-3 py-3 text-left text-sm text-muted hover:border-accent hover:text-foreground" @click="editComment">Договорённости, ссылки, важные детали…</button>
      <p v-else class="text-sm text-muted">Комментария нет.</p>
    </CardBlock>

    <!-- Задачи и история -->
    <CardBlock :icon="ListChecks" :title="activity === 'tasks' ? 'Задачи' : 'История'" :count="activity === 'tasks' ? dealTasks.length || null : deal.history.length || null">
      <template #actions>
        <div class="toggle-button-group toggle-button-group--horizontal" role="tablist">
          <button type="button" role="tab" class="toggle-button toggle-button--sm" :aria-selected="activity === 'tasks'" :data-selected="activity === 'tasks' ? 'true' : undefined" @click="activity = 'tasks'">Задачи</button>
          <button type="button" role="tab" class="toggle-button toggle-button--sm" :aria-selected="activity === 'history'" :data-selected="activity === 'history' ? 'true' : undefined" @click="activity = 'history'">История</button>
        </div>
        <a v-if="activity === 'tasks'" :href="href('/tasks', { open: 'new', deal: deal.id })" class="button button--ghost button--sm button--icon-only -mr-2" aria-label="Новая задача" title="Новая задача"><Plus class="size-4" /></a>
      </template>
      <template v-if="activity === 'tasks'">
        <ul v-if="dealTasks.length" class="-mx-2">
          <li v-for="task in dealTasks" :key="task.id">
            <a :href="href('/tasks', { tab: 'all', open: task.id })" class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-secondary">
              <ChatFace :user="person(task.responsibleId ?? 0)" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ task.title }}</span>
                <span class="block text-xs text-muted">{{ nameOf(task.responsibleId) }}{{ task.deadline ? ` · до ${dueWhen(task.deadline)}` : "" }}</span>
              </span>
              <HueChip :hue="STATUS[task.status].hue">{{ STATUS[task.status].label }}</HueChip>
            </a>
          </li>
        </ul>
        <a v-else :href="href('/tasks', { open: 'new', deal: deal.id })" class="flex items-center gap-2 rounded-xl border border-dashed border-separator px-3 py-3 text-sm text-muted hover:border-accent hover:text-foreground"><Plus class="size-4" />Поставить задачу по сделке</a>
      </template>
      <template v-else>
        <ol class="timeline">
          <li v-for="one in history" :key="one.id" class="flex gap-2.5 text-sm">
            <ChatFace :user="person(one.userId ?? 0)" size="xs" class="mt-0.5" />
            <div class="min-w-0 flex-1">
              <p class="min-w-0">
                <span class="font-medium">{{ historyLabel(one.field) }}</span>
                <template v-if="one.field !== 'created'">: <span class="text-muted line-through decoration-1">{{ one.old || "пусто" }}</span> → {{ one.new || "пусто" }}</template>
              </p>
              <p class="flex items-center gap-1 text-xs text-muted"><Clock class="size-3" />{{ at(one.at) }} · {{ nameOf(one.userId) }}</p>
            </div>
          </li>
        </ol>
        <p v-if="!deal.history.length" class="text-sm text-muted">Изменений пока не было.</p>
        <button v-if="deal.history.length > 8" type="button" class="mt-3 text-sm text-accent" @click="historyAll = !historyAll">{{ historyAll ? "Свернуть" : `Вся история (${deal.history.length})` }}</button>
      </template>
    </CardBlock>

    <div v-if="askDelete" class="card card--default flex-row items-center gap-3 border border-danger/40 p-4">
      <p class="min-w-0 flex-1 text-sm">Удалить сделку «{{ deal.title }}»? Это нельзя отменить.</p>
      <button type="button" class="button button--ghost button--sm" @click="askDelete = false">Отмена</button>
      <button type="button" class="button button--danger button--sm" @click="remove"><Trash2 class="size-4" />Удалить</button>
    </div>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1.25rem 0.875rem;
}
.summary + .summary {
  border-top: 1px solid var(--separator);
}
@media (min-width: 640px) {
  .summary + .summary {
    border-top: 0;
    border-left: 1px solid var(--separator);
  }
}
.summary__label {
  color: var(--muted);
  font-size: 0.75rem;
}
.value-input--big {
  height: 2.25rem;
  font-size: 1.25rem;
  font-weight: 600;
}
.date-overlay {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.props {
  display: grid;
  grid-template-columns: minmax(112px, 170px) minmax(0, 1fr);
  padding: 0 0 0.25rem;
}
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
.value-input::placeholder {
  color: var(--muted);
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
