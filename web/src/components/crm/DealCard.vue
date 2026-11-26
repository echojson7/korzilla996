<!-- Карточка сделки как в Битрикс24: полоса стадий (щелчок — перевод,
     «Завершить» — успех или провал), основные поля, свои поля блоками
     (блок задаёт администратор в настройках полей), комментарий, задачи
     по сделке и история. Пустые поля блока спрятаны под «Ещё N полей»:
     их в воронках Битрикса больше сотни. Правка сразу уходит на сервер. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Check, ChevronDown, Clock, History, ListChecks, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Trash2, Link2, Flag, RotateCcw, LayoutList, ShoppingCart, Users, Receipt } from "@lucide/vue";
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
import {
  crm, getDeal, updateDeal, deleteDeal, onDealChange, pipelineById, stageById, fieldByCode, hueOf, CURRENCIES,
  type DealFull, type DealInput, type Field, type FieldValue as Value, type Stage,
} from "../../lib/crm";
import { taskStore, STATUS, person, nameOf } from "../../lib/tasks";
import { when as dueWhen } from "../tasks/when";
import { href, navigate } from "../../lib/router";
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
const working = computed(() => pipeline.value?.stages.filter((one) => one.semantic === "process") ?? []);
const finals = computed(() => pipeline.value?.stages.filter((one) => one.semantic !== "process") ?? []);
const stageIndex = computed(() => working.value.findIndex((one) => one.id === deal.value?.stageId));

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
const companyText = ref("");
const contactText = ref("");
watch(deal, (one) => {
  titleText.value = one?.title ?? "";
  amountText.value = one && one.amount ? one.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 }).replace(/\u00a0/g, " ") : "";
  companyText.value = one?.company ?? "";
  contactText.value = one?.contact ?? "";
}, { immediate: true });
function saveText(key: "title" | "company" | "contact", text: string) {
  if (!deal.value) return;
  const value = text.trim();
  if ((deal.value[key] ?? "") === value) return;
  if (key === "title" && !value) return void (titleText.value = deal.value.title);
  patch({ [key]: value || null });
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

/* ---------- Задачи и история ---------- */
const dealTasks = computed(() => (deal.value ? taskStore.list.filter((one) => one.dealId === deal.value!.id) : []));
const historyAll = ref(false);
const LABELS: Record<string, string> = {
  created: "Сделка создана", title: "Название", amount: "Сумма", currency: "Валюта", responsible_id: "Ответственный",
  company: "Компания", contact: "Контакт", close_date: "Дата завершения", comments: "Комментарий", stage_id: "Стадия", pipeline_id: "Воронка",
};
const historyLabel = (field: string) => LABELS[field] ?? (field.startsWith("fields.") ? fieldByCode.value.get(field.slice(7))?.title ?? "Поле" : field);
const history = computed(() => (deal.value?.history ?? []).slice(0, historyAll.value ? undefined : 8));
const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
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
    <div class="h-48 animate-pulse rounded-2xl bg-surface-secondary" />
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
    <!-- Полоса стадий -->
    <div class="flex items-stretch gap-1">
      <button
        v-for="(one, i) in working"
        :key="one.id"
        type="button"
        class="stage-step"
        :class="[!deal.closed && i <= stageIndex ? 'stage-step--on' : '', !deal.closed && i === stageIndex ? 'stage-step--current' : '']"
        :style="{ '--stage': one.color }"
        :title="one.title"
        :disabled="!canEdit"
        @click="toStage(one)"
      >{{ one.title }}</button>
      <Popover v-if="canEdit" :ref="setPicker('finish')" width="w-64">
        <template #trigger="{ toggle }">
          <button type="button" class="stage-step stage-step--final" :class="deal.closed ? 'stage-step--on' : ''" :style="{ '--stage': stage?.color ?? '#7bd500' }" @click="toggle">
            <Flag class="size-3.5 shrink-0" />{{ deal.closed ? stage?.title : "Завершить" }}<ChevronDown class="size-3.5 shrink-0" />
          </button>
        </template>
        <p class="px-3 pt-2 pb-1 text-xs text-muted">Завершить сделку</p>
        <button v-for="one in finals" :key="one.id" type="button" class="menu-row" @click="toStage(one); closePicker('finish')">
          <span class="size-2.5 shrink-0 rounded-full" :style="{ background: one.color }" />
          <span class="min-w-0 flex-1 truncate">{{ one.title }}</span>
          <span class="text-xs text-muted">{{ one.semantic === "success" ? "успех" : "провал" }}</span>
          <Check v-if="one.id === deal.stageId" class="size-4 text-accent" />
        </button>
        <button v-if="deal.closed && working[0]" type="button" class="menu-row" @click="toStage(working[0]); closePicker('finish')"><RotateCcw class="size-4" />Вернуть в работу</button>
      </Popover>
      <span v-else-if="deal.closed" class="stage-step stage-step--final stage-step--on" :style="{ '--stage': stage?.color ?? '#7bd500' }"><Flag class="size-3.5" />{{ stage?.title }}</span>
    </div>

    <!-- Основное -->
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

        <dt>Сумма</dt>
        <dd class="gap-1">
          <template v-if="canEdit">
            <input v-model="amountText" inputmode="decimal" class="value-input w-36 font-semibold tabular-nums" placeholder="0" @blur="saveAmount" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <Popover :ref="setPicker('currency')" align="left" width="w-32">
              <template #trigger="{ toggle }"><button type="button" class="value text-muted" @click="toggle">{{ deal.currency }}<ChevronDown class="size-3.5" /></button></template>
              <button v-for="one in CURRENCIES" :key="one" type="button" class="menu-row" @click="patch({ currency: one }); closePicker('currency')">{{ one }}<Check v-if="one === deal.currency" class="ml-auto size-4 text-accent" /></button>
            </Popover>
          </template>
          <span v-else class="font-semibold tabular-nums">{{ deal.currency === "RUB" ? money(deal.amount) : `${deal.amount.toLocaleString("ru-RU")} ${deal.currency}` }}</span>
        </dd>

        <dt>Стадия</dt>
        <dd><HueChip v-if="stage" :hue="hueOf(stage.color)">{{ stage.title }}</HueChip></dd>

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

        <dt>Ответственный</dt>
        <dd>
          <Popover v-if="canEdit" :ref="setPicker('owner')" align="left" width="w-80">
            <template #trigger="{ toggle }">
              <button type="button" class="value" @click="toggle"><ChatFace :user="person(deal.responsibleId ?? 0)" size="xs" />{{ nameOf(deal.responsibleId) }}</button>
            </template>
            <UserPick single :model-value="deal.responsibleId ? [deal.responsibleId] : []" @pick="(one) => { patch({ responsible_id: one.id }); closePicker('owner'); }" />
          </Popover>
          <span v-else class="inline-flex items-center gap-2"><ChatFace :user="person(deal.responsibleId ?? 0)" size="xs" />{{ nameOf(deal.responsibleId) }}</span>
        </dd>

        <dt>Компания</dt>
        <dd>
          <input v-if="canEdit" v-model="companyText" class="value-input w-full" placeholder="Не указана" @blur="saveText('company', companyText)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <span v-else>{{ deal.company || "—" }}</span>
          <span v-if="deal.companyInfo" class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <button type="button" class="link" @click="navigate('/clients', { open: `company:${deal.companyInfo.id}` })">Карточка компании</button>
            <a v-for="one in deal.companyInfo.phones" :key="'p' + one.value" :href="`tel:${one.value.replace(/[^\d+]/g, '')}`" class="link">{{ one.value }}</a>
            <a v-for="one in deal.companyInfo.emails" :key="'e' + one.value" :href="`mailto:${one.value}`" class="link">{{ one.value }}</a>
            <a v-for="one in deal.companyInfo.webs" :key="'w' + one.value" :href="/^https?:/i.test(one.value) ? one.value : `https://${one.value}`" target="_blank" rel="noopener" class="link">{{ one.value }}</a>
            <span v-if="deal.companyInfo.address" class="text-muted">{{ deal.companyInfo.address }}</span>
          </span>
        </dd>

        <dt>Контакт</dt>
        <dd>
          <input v-if="canEdit" v-model="contactText" class="value-input w-full" placeholder="Не указан" @blur="saveText('contact', contactText)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <span v-else>{{ deal.contact || "—" }}</span>
          <span v-if="deal.contactInfo" class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <button type="button" class="link" @click="navigate('/clients', { tab: 'contacts', open: `contact:${deal.contactInfo.id}` })">Карточка контакта</button>
            <span v-if="deal.contactInfo.post" class="text-muted">{{ deal.contactInfo.post }}</span>
            <a v-for="one in deal.contactInfo.phones" :key="'p' + one.value" :href="`tel:${one.value.replace(/[^\d+]/g, '')}`" class="link">{{ one.value }}</a>
            <a v-for="one in deal.contactInfo.emails" :key="'e' + one.value" :href="`mailto:${one.value}`" class="link">{{ one.value }}</a>
          </span>
        </dd>

        <dt>Дата завершения</dt>
        <dd>
          <input v-if="canEdit" type="date" :value="deal.closeDate ?? ''" class="value-input" @change="patch({ close_date: ($event.target as HTMLInputElement).value || null })" />
          <span v-else>{{ deal.closeDate ? day(deal.closeDate) : "—" }}</span>
        </dd>

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
      <button v-if="mainGroup && (mainGroup.hidden || expanded.has(MAIN))" type="button" class="mx-4 mb-3 inline-flex items-center gap-1 text-sm text-accent" @click="toggleSection(MAIN)">
        <template v-if="expanded.has(MAIN)">Скрыть пустые</template>
        <template v-else><Plus class="size-3.5" />Ещё {{ plural(mainGroup.hidden, "поле", "поля", "полей") }}</template>
      </button>
    </CardBlock>

    <!-- Свои поля -->
    <CardBlock v-for="group in otherGroups" :key="group.name" :icon="LayoutList" :title="group.name" :count="group.count ? `${group.count} из ${group.fields.length}` : null" flush>
      <dl v-if="group.shown.length" class="props">
        <template v-for="field in group.shown" :key="field.id">
          <dt :title="field.title"><span class="line-clamp-2">{{ field.title }}<span v-if="field.required" class="text-danger"> *</span></span></dt>
          <dd><FieldValue :field="field" :value="deal.fields[field.code]" :editable="canEdit" @save="(value) => saveField(field, value)" /></dd>
        </template>
      </dl>
      <button v-if="group.hidden || expanded.has(group.name)" type="button" class="mx-4 mb-3 inline-flex items-center gap-1 text-sm text-accent" :class="group.shown.length ? 'mt-1' : ''" @click="toggleSection(group.name)">
        <template v-if="expanded.has(group.name)">Скрыть пустые</template>
        <template v-else><Plus class="size-3.5" />{{ group.shown.length ? "Ещё" : "Показать" }} {{ plural(group.hidden, "поле", "поля", "полей") }}</template>
      </button>
    </CardBlock>

    <!-- Все контакты (когда их больше одного) -->
    <CardBlock v-if="(deal.contactList?.length ?? 0) > 1" :icon="Users" title="Контакты" :count="deal.contactList!.length">
      <button v-for="one in deal.contactList" :key="one.id" type="button" class="menu-row w-full" @click="navigate('/clients', { tab: 'contacts', open: `contact:${one.id}` })">
        <span class="min-w-0 flex-1 truncate">{{ one.name }}<span v-if="one.post" class="text-muted"> · {{ one.post }}</span></span>
        <span class="text-xs text-muted">{{ one.phones[0]?.value }}</span>
      </button>
    </CardBlock>

    <!-- Товары -->
    <CardBlock v-if="deal.products?.length" :icon="ShoppingCart" title="Товары" :count="deal.products.length">
      <ProductRows :rows="deal.products" />
    </CardBlock>

    <!-- Счета -->
    <CardBlock v-if="deal.invoices?.length" :icon="Receipt" title="Счета" :count="deal.invoices.length">
      <InvoiceList :rows="deal.invoices" />
    </CardBlock>

    <!-- Комментарий -->
    <CardBlock :icon="Pencil" title="Комментарий">
      <template #actions>
        <button v-if="canEdit" type="button" class="button button--ghost button--sm -mr-2" @click="editComment"><Pencil class="size-3.5" />{{ deal.comments ? "Изменить" : "Добавить" }}</button>
      </template>
      <div v-if="deal.comments" class="-mx-4 -mt-2 -mb-3" @dblclick="canEdit && editComment()"><MarkdownField :model-value="deal.comments" :editable="false" /></div>
      <p v-else class="text-sm text-muted">Комментария нет.</p>
    </CardBlock>

    <!-- Задачи -->
    <CardBlock :icon="ListChecks" title="Задачи по сделке" :count="dealTasks.length || null">
      <template #actions>
        <a :href="href('/tasks', { open: 'new', deal: deal.id })" class="button button--ghost button--sm -mr-2"><Plus class="size-3.5" />Задача</a>
      </template>
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
      <p v-else class="text-sm text-muted">Задач нет.</p>
    </CardBlock>

    <!-- История -->
    <CardBlock :icon="History" title="История" :count="deal.history.length || null">
      <ol class="flex flex-col gap-2.5">
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
      <button v-if="deal.history.length > 8" type="button" class="mt-3 text-sm text-accent" @click="historyAll = !historyAll">{{ historyAll ? "Свернуть" : `Вся история (${deal.history.length})` }}</button>
    </CardBlock>

    <div v-if="askDelete" class="card card--default flex-row items-center gap-3 border border-danger/40 p-4">
      <p class="min-w-0 flex-1 text-sm">Удалить сделку «{{ deal.title }}»? Это нельзя отменить.</p>
      <button type="button" class="button button--ghost button--sm" @click="askDelete = false">Отмена</button>
      <button type="button" class="button button--danger button--sm" @click="remove"><Trash2 class="size-4" />Удалить</button>
    </div>
  </div>
</template>

<style scoped>
.stage-step {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  overflow: hidden;
  border-radius: 0.5rem;
  background: var(--surface-secondary);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: background-color 120ms, color 120ms;
}
.stage-step:not(:disabled):hover {
  background: color-mix(in oklab, var(--stage) 30%, var(--surface-secondary));
  color: var(--foreground);
}
.stage-step--on {
  background: var(--stage);
  color: #fff;
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
}
.stage-step--on:not(:disabled):hover {
  background: color-mix(in oklab, var(--stage) 85%, black);
  color: #fff;
}
/* Узкая панель: у остальных стадий только цвет, название — в подсказке. */
.stage-step:not(.stage-step--current):not(.stage-step--final) {
  font-size: 0;
}
.stage-step--current {
  flex: 0 1 auto;
  min-width: 4rem;
  padding: 0 0.75rem;
}
.stage-step--final {
  flex: 0 0 auto;
  max-width: 12rem;
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
