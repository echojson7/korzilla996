<!-- Лиды, как в Битрикс24 (перенесены оттуда): статусы вкладками со
     счётчиками, список с поиском по названию, имени, телефону и почте,
     карточка справа — статус, связь, все поля по блокам, контакты, товары.
     В адресе: ?stage, ?q, ?open. Пока только просмотр. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Phone, Mail, Globe, MapPin, UserRound, ShoppingCart, SlidersHorizontal, Pencil, Receipt, FileText, Layers } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import HueChip from "../components/HueChip.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import CardBlock from "../components/tasks/CardBlock.vue";
import FieldValue from "../components/crm/FieldValue.vue";
import ProductRows from "../components/crm/ProductRows.vue";
import InvoiceList from "../components/crm/InvoiceList.vue";
import DocumentList from "../components/crm/DocumentList.vue";
import SmartList from "../components/crm/SmartList.vue";
import { api, ApiError } from "../lib/api";
import { hueOf, type Contact, type Field, type FieldValue as Value, type Pipeline, type CrmDocument, type Invoice, type SmartBrief, type ProductRow, type Stage } from "../lib/crm";
import { person, nameOf } from "../lib/tasks";
import { money, plural } from "../lib/format";
import { navigate, route, setQuery } from "../lib/router";
import { toast } from "../lib/toast";

interface Lead {
  id: number; title: string; name: string | null; post: string | null; companyTitle: string | null; stageId: number; closed: boolean;
  amount: number; currency: string; phones: Contact[]; emails: Contact[]; responsibleId: number | null; createdAt: string | null;
}
interface LeadFull extends Lead {
  comments: string | null; fields: Record<string, Value>; webs: Contact[]; address: string | null;
  contacts: { id: number; name: string; post: string | null; phones: Contact[]; emails: Contact[] }[]; products: ProductRow[]; invoices: Invoice[]; documents: CrmDocument[]; smart: SmartBrief[];
}

const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : "Не получилось загрузить", "danger");

/* ---------- Статусы и поля ---------- */
const pipeline = ref<Pipeline | null>(null);
const counts = ref<Record<string, number>>({});
const fields = ref<Field[]>([]);
api<{ pipeline: Pipeline | null; counts: Record<string, number>; fields: Field[] }>("GET", "crm/lead-schema")
  .then((out) => {
    pipeline.value = out.pipeline;
    counts.value = out.counts;
    fields.value = out.fields;
  })
  .catch(fail);
const stages = computed(() => pipeline.value?.stages ?? []);
const stageOf = (id: number): Stage | undefined => stages.value.find((one) => one.id === id);
const allCount = computed(() => Object.values(counts.value).reduce((sum, n) => sum + Number(n), 0));

const stage = computed(() => Number(route.value.query.get("stage")) || 0);
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });

/* ---------- Список ---------- */
const rows = ref<Lead[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
let asked = 0;
async function load(reset: boolean) {
  const ticket = ++asked;
  if (reset) page.value = 1;
  loading.value = true;
  try {
    const q = new URLSearchParams({ page: String(page.value) });
    if (stage.value) q.set("stage", String(stage.value));
    if (text.value.trim()) q.set("q", text.value.trim());
    const out = await api<{ rows: Lead[]; total: number }>("GET", `crm/leads?${q}`);
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
watch([stage, text], (_, prev) => {
  clearTimeout(timer);
  timer = setTimeout(() => load(true), prev && prev[0] === stage.value ? 250 : 0);
}, { immediate: true });

/* ---------- Карточка ---------- */
const openId = computed(() => Number(route.value.query.get("open")) || 0);
const opened = ref<LeadFull | null>(null);
watch(openId, async (id) => {
  opened.value = null;
  if (!id) return;
  try {
    opened.value = await api<LeadFull>("GET", `crm/leads/${id}`);
  } catch (error) {
    fail(error);
    setQuery({ open: null });
  }
}, { immediate: true });

/* Поля карточки по блокам, пустые не показываем. */
const groups = computed(() => {
  const lead = opened.value;
  if (!lead) return [];
  const out = new Map<string, Field[]>();
  for (const field of fields.value) {
    const value = lead.fields[field.code];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) continue;
    const name = field.section || "Дополнительно";
    out.set(name, [...(out.get(name) ?? []), field]);
  }
  return [...out].map(([name, list]) => ({ name, list }));
});

const tel = (value: string) => `tel:${value.replace(/[^\d+]/g, "")}`;
const site = (value: string) => (/^https?:/i.test(value) ? value : `https://${value}`);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");
const sub = computed(() => (pipeline.value ? plural(total.value, "лид", "лида", "лидов") : ""));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Лиды" :sub="sub">
      <template #toolbar>
        <div class="toggle-button-group toggle-button-group--horizontal max-w-full overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Статус">
          <button type="button" role="radio" class="toggle-button toggle-button--sm gap-1.5" :aria-checked="!stage" :data-selected="!stage ? 'true' : undefined" @click="setQuery({ stage: null })">
            Все <span class="text-xs tabular-nums opacity-60">{{ allCount }}</span>
          </button>
          <button
            v-for="one in stages"
            :key="one.id"
            type="button"
            role="radio"
            class="toggle-button toggle-button--sm gap-1.5 whitespace-nowrap"
            :aria-checked="stage === one.id"
            :data-selected="stage === one.id ? 'true' : undefined"
            @click="setQuery({ stage: one.id })"
          >
            <span class="size-2 rounded-full" :style="{ background: one.color }" />{{ one.title }}
            <span class="text-xs tabular-nums opacity-60">{{ counts[one.id] ?? 0 }}</span>
          </button>
        </div>
        <SearchBox v-model="text" placeholder="Название, имя, телефон, почта" class="w-full min-w-0 sm:w-auto sm:flex-1" />
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <section class="sheet overflow-hidden rounded-2xl shadow-surface">
        <div class="hidden grid-cols-[minmax(240px,1.8fr)_minmax(150px,1fr)_minmax(170px,1fr)_minmax(150px,1fr)_100px] gap-3 border-b border-separator px-4 py-2 text-xs text-muted md:grid">
          <span>Лид</span><span>Телефон</span><span>Статус</span><span>Ответственный</span><span class="text-right">Создан</span>
        </div>
        <button
          v-for="one in rows"
          :key="one.id"
          type="button"
          class="grid w-full grid-cols-1 gap-x-3 gap-y-1 border-b border-separator px-4 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-default/60 md:grid-cols-[minmax(240px,1.8fr)_minmax(150px,1fr)_minmax(170px,1fr)_minmax(150px,1fr)_100px] md:items-center"
          @click="setQuery({ open: one.id })"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ one.title }}</span>
            <span v-if="one.name || one.companyTitle" class="block truncate text-xs text-muted">{{ [one.name, one.companyTitle].filter(Boolean).join(" · ") }}</span>
          </span>
          <span class="truncate">{{ one.phones[0]?.value ?? "—" }}</span>
          <span class="min-w-0"><HueChip v-if="stageOf(one.stageId)" :hue="hueOf(stageOf(one.stageId)!.color)" class="max-w-full truncate">{{ stageOf(one.stageId)!.title }}</HueChip></span>
          <span class="hidden min-w-0 items-center gap-2 md:flex"><template v-if="one.responsibleId"><ChatFace :user="person(one.responsibleId)" size="xs" /><span class="truncate">{{ nameOf(one.responsibleId) }}</span></template><span v-else class="text-muted">—</span></span>
          <span class="hidden text-right text-muted tabular-nums md:block">{{ date(one.createdAt) }}</span>
        </button>
        <p v-if="!rows.length && !loading" class="px-4 py-10 text-center text-muted">Лидов не нашлось</p>
        <p v-if="loading && !rows.length" class="px-4 py-10 text-center text-muted">Загружаю…</p>
      </section>
      <div v-if="rows.length < total" class="mt-3 flex justify-center">
        <button type="button" class="button button--secondary" :disabled="loading" @click="page++; load(false)">Показать ещё</button>
      </div>
    </div>

    <SidePanel :open="!!openId" :chat="null" :title="opened?.title ?? 'Лид'" :sub="opened ? `Лид №${opened.id}${opened.createdAt ? ` · ${date(opened.createdAt)}` : ''}` : ''" @close="setQuery({ open: null })">
      <div v-if="opened" class="space-y-3 p-3 md:p-4">
        <CardBlock :icon="UserRound" title="О лиде">
          <div class="space-y-2 text-sm">
            <p v-if="stageOf(opened.stageId)"><HueChip :hue="hueOf(stageOf(opened.stageId)!.color)">{{ stageOf(opened.stageId)!.title }}</HueChip></p>
            <p v-if="opened.name" class="font-medium">{{ opened.name }}<span v-if="opened.post" class="font-normal text-muted"> · {{ opened.post }}</span></p>
            <p v-if="opened.companyTitle" class="text-muted">{{ opened.companyTitle }}</p>
            <p v-if="opened.amount" class="font-medium">{{ money(opened.amount) }}</p>
            <p v-for="one in opened.phones" :key="'p' + one.value" class="flex items-center gap-2"><Phone class="size-4 shrink-0 text-muted" /><a :href="tel(one.value)" class="link">{{ one.value }}</a></p>
            <p v-for="one in opened.emails" :key="'e' + one.value" class="flex items-center gap-2"><Mail class="size-4 shrink-0 text-muted" /><a :href="`mailto:${one.value}`" class="link">{{ one.value }}</a></p>
            <p v-for="one in opened.webs" :key="'w' + one.value" class="flex items-center gap-2"><Globe class="size-4 shrink-0 text-muted" /><a :href="site(one.value)" target="_blank" rel="noopener" class="link">{{ one.value }}</a></p>
            <p v-if="opened.address" class="flex items-center gap-2"><MapPin class="size-4 shrink-0 text-muted" />{{ opened.address }}</p>
            <p v-if="opened.responsibleId" class="flex items-center gap-2 text-muted">Ответственный: <ChatFace :user="person(opened.responsibleId)" size="xs" /><span class="text-default-foreground">{{ nameOf(opened.responsibleId) }}</span></p>
          </div>
        </CardBlock>

        <CardBlock v-for="group in groups" :key="group.name" :icon="SlidersHorizontal" :title="group.name" flush>
          <dl class="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-3 gap-y-2 px-4 pb-3 text-sm">
            <template v-for="field in group.list" :key="field.id">
              <dt class="text-muted">{{ field.title }}</dt>
              <dd class="min-w-0"><FieldValue :field="field" :value="opened.fields[field.code]" :editable="false" /></dd>
            </template>
          </dl>
        </CardBlock>

        <CardBlock v-if="opened.contacts.length" :icon="UserRound" title="Контакты" :count="opened.contacts.length">
          <button v-for="one in opened.contacts" :key="one.id" type="button" class="menu-row w-full" @click="navigate('/clients', { tab: 'contacts', open: `contact:${one.id}` })">
            <span class="min-w-0 flex-1 truncate">{{ one.name }}<span v-if="one.post" class="text-muted"> · {{ one.post }}</span></span>
            <span class="text-xs text-muted">{{ one.phones[0]?.value }}</span>
          </button>
        </CardBlock>

        <CardBlock v-if="opened.products.length" :icon="ShoppingCart" title="Товары" :count="opened.products.length">
          <ProductRows :rows="opened.products" />
        </CardBlock>

        <CardBlock v-if="opened.invoices.length" :icon="Receipt" title="Счета" :count="opened.invoices.length">
          <InvoiceList :rows="opened.invoices" />
        </CardBlock>

        <CardBlock v-if="opened.smart.length" :icon="Layers" title="Договоры и процессы" :count="opened.smart.length">
          <SmartList :rows="opened.smart" />
        </CardBlock>

        <CardBlock v-if="opened.documents.length" :icon="FileText" title="Документы" :count="opened.documents.length">
          <DocumentList :rows="opened.documents" />
        </CardBlock>

        <CardBlock v-if="opened.comments" :icon="Pencil" title="Комментарий">
          <p class="text-sm whitespace-pre-line">{{ opened.comments }}</p>
        </CardBlock>
      </div>
      <p v-else class="p-6 text-sm text-muted">Загружаю…</p>
    </SidePanel>
  </div>
</template>
