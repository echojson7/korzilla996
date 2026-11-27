<!-- Смарт-процессы, как в Битрикс24 («Договоры», «Претензии»): тип —
     вкладкой, стадии — фильтром, список с поиском, карточка справа со
     стадией, связями, своими полями и документами. ?type, ?stage, ?q, ?open. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Link2, SlidersHorizontal, FileText } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import HueChip from "../components/HueChip.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import CardBlock from "../components/tasks/CardBlock.vue";
import FieldValue from "../components/crm/FieldValue.vue";
import DocumentList from "../components/crm/DocumentList.vue";
import { api, ApiError } from "../lib/api";
import { hueOf, type CrmDocument, type Field, type FieldValue as Value, type Pipeline } from "../lib/crm";
import { person, nameOf } from "../lib/tasks";
import { money, plural } from "../lib/format";
import { navigate, pageRoute, setQuery } from "../lib/router";
/* Свой адрес: фоновый раздел не реагирует на чужие ?open и фильтры. */
const route = pageRoute();
import { toast } from "../lib/toast";

interface SmartType { id: number; title: string; count: number; pipelines: Pipeline[]; fields: Field[] }
interface Item {
  id: number; typeId: number; title: string; stageId: number | null; stage: { title: string; color: string; semantic: string } | null;
  amount: number; closed: boolean; responsibleId: number | null; dealId: number | null; leadId: number | null; companyId: number | null; contactId: number | null;
  beginDate: string | null; closeDate: string | null; createdAt: string | null;
}
interface ItemFull extends Item { fields: Record<string, Value>; deal: string | null; company: string | null; contact: string | null; documents: CrmDocument[] }

const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : "Не получилось загрузить", "danger");
const types = ref<SmartType[]>([]);
api<SmartType[]>("GET", "crm/smart-types").then((out) => (types.value = out)).catch(fail);

const typeId = computed(() => Number(route.value.query.get("type")) || types.value[0]?.id || 0);
const type = computed(() => types.value.find((one) => one.id === typeId.value) ?? null);
const stages = computed(() => type.value?.pipelines.flatMap((one) => one.stages) ?? []);
const stage = computed(() => Number(route.value.query.get("stage")) || 0);
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });
const TYPES = computed(() => types.value.map((one) => ({ key: String(one.id), label: one.title, count: one.count })));

const rows = ref<Item[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
let asked = 0;
async function load(reset: boolean) {
  if (!typeId.value) return;
  const ticket = ++asked;
  if (reset) page.value = 1;
  loading.value = true;
  try {
    const q = new URLSearchParams({ type: String(typeId.value), page: String(page.value) });
    if (stage.value) q.set("stage", String(stage.value));
    if (text.value.trim()) q.set("q", text.value.trim());
    const out = await api<{ rows: Item[]; total: number }>("GET", `crm/smart?${q}`);
    if (ticket !== asked) return;
    rows.value = reset ? out.rows : [...rows.value, ...out.rows];
    total.value = out.total;
  } catch (error) {
    fail(error);
  } finally {
    if (ticket === asked) loading.value = false;
  }
}
let timer: ReturnType<typeof setTimeout> | undefined;
watch([typeId, stage, text], (_, prev) => {
  clearTimeout(timer);
  timer = setTimeout(() => load(true), prev && prev[0] === typeId.value && prev[1] === stage.value ? 250 : 0);
}, { immediate: true });

const openId = computed(() => Number(route.value.query.get("open")) || 0);
const opened = ref<ItemFull | null>(null);
watch(openId, async (id) => {
  opened.value = null;
  if (!id) return;
  try {
    opened.value = await api<ItemFull>("GET", `crm/smart/${id}`);
  } catch (error) {
    fail(error);
    setQuery({ open: null });
  }
}, { immediate: true });
const openedFields = computed(() => {
  const item = opened.value;
  const list = types.value.find((one) => one.id === item?.typeId)?.fields ?? [];
  return item ? list.filter((field) => { const v = item.fields[field.code]; return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length); }) : [];
});
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("ru-RU") : "");
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Смарт-процессы" :sub="type ? plural(total, 'элемент', 'элемента', 'элементов') : ''">
      <template #toolbar>
        <Segmented v-if="types.length" label="Тип" :items="TYPES" :model-value="String(typeId)" @update:model-value="(key) => setQuery({ type: key, stage: null, open: null })" />
        <select v-if="stages.length" class="input h-9 w-auto py-0 text-sm" :value="stage" aria-label="Стадия" @change="setQuery({ stage: Number(($event.target as HTMLSelectElement).value) || null })">
          <option :value="0">Все стадии</option>
          <option v-for="one in stages" :key="one.id" :value="one.id">{{ one.title }}</option>
        </select>
        <SearchBox v-model="text" placeholder="Название" class="w-full min-w-0 sm:w-auto sm:flex-1" />
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <section class="sheet overflow-hidden rounded-2xl shadow-surface">
        <button
          v-for="one in rows"
          :key="one.id"
          type="button"
          class="grid w-full grid-cols-1 gap-x-3 gap-y-1 border-b border-separator px-4 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-default/60 md:grid-cols-[minmax(240px,2fr)_minmax(160px,1fr)_minmax(150px,1fr)_110px_100px] md:items-center"
          @click="setQuery({ open: one.id })"
        >
          <span class="truncate font-medium">{{ one.title }}</span>
          <span class="min-w-0"><HueChip v-if="one.stage" :hue="hueOf(one.stage.color)" class="max-w-full truncate">{{ one.stage.title }}</HueChip></span>
          <span class="hidden min-w-0 items-center gap-2 md:flex"><template v-if="one.responsibleId"><ChatFace :user="person(one.responsibleId)" size="xs" /><span class="truncate">{{ nameOf(one.responsibleId) }}</span></template></span>
          <span class="hidden text-right tabular-nums md:block">{{ one.amount ? money(one.amount) : "" }}</span>
          <span class="hidden text-right text-muted tabular-nums md:block">{{ date(one.createdAt) }}</span>
        </button>
        <p v-if="!rows.length && !loading" class="px-4 py-10 text-center text-muted">{{ types.length ? "Ничего не нашлось" : "Смарт-процессов пока нет" }}</p>
      </section>
      <div v-if="rows.length < total" class="mt-3 flex justify-center">
        <button type="button" class="button button--secondary" :disabled="loading" @click="page++; load(false)">Показать ещё</button>
      </div>
    </div>

    <SidePanel :open="!!openId" :chat="null" :title="opened?.title ?? type?.title ?? 'Элемент'" :sub="opened ? `${type?.title ?? ''} №${opened.id}` : ''" @close="setQuery({ open: null })">
      <div v-if="opened" class="space-y-3 p-3 md:p-4">
        <CardBlock :icon="Link2" title="Основное">
          <div class="space-y-2 text-sm">
            <p v-if="opened.stage"><HueChip :hue="hueOf(opened.stage.color)">{{ opened.stage.title }}</HueChip></p>
            <p v-if="opened.amount" class="font-medium">{{ money(opened.amount) }}</p>
            <p v-if="opened.beginDate || opened.closeDate" class="text-muted">{{ [opened.beginDate && `с ${date(opened.beginDate)}`, opened.closeDate && `до ${date(opened.closeDate)}`].filter(Boolean).join(" ") }}</p>
            <p v-if="opened.deal">Сделка: <button type="button" class="link" @click="navigate('/deals', { open: opened.dealId, view: 'list' })">{{ opened.deal }}</button></p>
            <p v-if="opened.company">Компания: <button type="button" class="link" @click="navigate('/clients', { open: `company:${opened.companyId}` })">{{ opened.company }}</button></p>
            <p v-if="opened.contact">Контакт: <button type="button" class="link" @click="navigate('/clients', { tab: 'contacts', open: `contact:${opened.contactId}` })">{{ opened.contact }}</button></p>
            <p v-if="opened.responsibleId" class="flex items-center gap-2 text-muted">Ответственный: <ChatFace :user="person(opened.responsibleId)" size="xs" /><span class="text-default-foreground">{{ nameOf(opened.responsibleId) }}</span></p>
          </div>
        </CardBlock>
        <CardBlock v-if="openedFields.length" :icon="SlidersHorizontal" title="Поля" flush>
          <dl class="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-3 gap-y-2 px-4 pb-3 text-sm">
            <template v-for="field in openedFields" :key="field.id">
              <dt class="text-muted">{{ field.title }}</dt>
              <dd class="min-w-0"><FieldValue :field="field" :value="opened.fields[field.code]" :editable="false" /></dd>
            </template>
          </dl>
        </CardBlock>
        <CardBlock v-if="opened.documents.length" :icon="FileText" title="Документы" :count="opened.documents.length">
          <DocumentList :rows="opened.documents" />
        </CardBlock>
      </div>
      <p v-else class="p-6 text-sm text-muted">Загружаю…</p>
    </SidePanel>
  </div>
</template>
