<!-- Карточка лида, как в Битрикс24 (лиды и сделки похожи): полоса
     статусов, сводка (сумма, ответственный, когда создан), блок «Клиент» —
     человек и компания из лида и привязанные контакты, поля лида блоками,
     товары, счета, договоры, документы и комментарий. Пока просмотр:
     лиды перенесены из Битрикса. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { SlidersHorizontal, ShoppingCart, Receipt, FileText, Layers, Pencil, LayoutList } from "@lucide/vue";
import HueChip from "../HueChip.vue";
import ChatFace from "../messenger/ChatFace.vue";
import CardBlock from "../tasks/CardBlock.vue";
import FieldValue from "./FieldValue.vue";
import ProductRows from "./ProductRows.vue";
import InvoiceList from "./InvoiceList.vue";
import DocumentList from "./DocumentList.vue";
import SmartList from "./SmartList.vue";
import StageBar from "./StageBar.vue";
import ClientBlock, { type CompanyBrief, type ContactBrief } from "./ClientBlock.vue";
import ClientTile from "./ClientTile.vue";
import { api, ApiError } from "../../lib/api";
import { hueOf, type Contact, type Field, type FieldValue as Value, type Pipeline, type CrmDocument, type Invoice, type SmartBrief, type ProductRow } from "../../lib/crm";
import { person, nameOf } from "../../lib/tasks";
import { money, plural } from "../../lib/format";
import { toast } from "../../lib/toast";

export interface Lead {
  id: number; title: string; name: string | null; post: string | null; companyTitle: string | null; stageId: number; closed: boolean;
  amount: number; currency: string; phones: Contact[]; emails: Contact[]; responsibleId: number | null; creatorId?: number | null; createdAt: string | null; updatedAt?: string | null;
}
interface LeadFull extends Lead {
  comments: string | null; fields: Record<string, Value>; webs: Contact[]; address: string | null; companyId: number | null; companyInfo: CompanyBrief | null; externalId: string | null;
  contacts: ContactBrief[]; products: ProductRow[]; invoices: Invoice[]; documents: CrmDocument[]; smart: SmartBrief[];
}

const props = defineProps<{ leadId: number; pipeline: Pipeline | null; fields: Field[] }>();
const emit = defineEmits<{ loaded: [lead: LeadFull | null]; close: [] }>();

const lead = ref<LeadFull | null>(null);
watch(() => props.leadId, async (id) => {
  lead.value = null;
  try {
    lead.value = await api<LeadFull>("GET", `crm/leads/${id}`);
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось открыть", "danger");
    emit("close");
  } finally {
    emit("loaded", lead.value);
  }
}, { immediate: true });

const stage = computed(() => props.pipeline?.stages.find((one) => one.id === lead.value?.stageId) ?? null);

/* Человек из самого лида — если его нет среди привязанных контактов. */
const leadPerson = computed(() => {
  const one = lead.value;
  if (!one) return null;
  const same = one.name && one.contacts.some((c) => c.name.trim().toLowerCase() === one.name!.trim().toLowerCase());
  if (same || (!one.name && !one.phones.length && !one.emails.length)) return null;
  return { title: one.name || "Контакт из лида", sub: one.post, phones: one.phones, emails: one.emails, webs: one.webs, address: one.address };
});

/* Поля по блокам, только заполненные; первый блок — в «О лиде». */
const filled = (value: Value | undefined) => !(value == null || value === "" || value === false || (Array.isArray(value) && !value.length));
const groups = computed(() => {
  const one = lead.value;
  if (!one) return [];
  const out = new Map<string, Field[]>();
  for (const field of props.fields) {
    if (!filled(one.fields[field.code])) continue;
    const name = field.section || "Дополнительно";
    out.set(name, [...(out.get(name) ?? []), field]);
  }
  return [...out].map(([name, list]) => ({ name, list }));
});
const folded = ref(new Set<string>());
function fold(name: string) {
  const next = new Set(folded.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  folded.value = next;
}

const productsTotal = (rows: ProductRow[]) => rows.reduce((sum, one) => sum + one.sum - one.discount, 0);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "—");
const ago = (iso: string | null) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days < 1 ? "сегодня" : days < 2 ? "вчера" : `${plural(days, "день", "дня", "дней")} назад`;
};
</script>

<template>
  <div v-if="!lead" class="flex flex-col gap-4" aria-busy="true">
    <div class="h-9 animate-pulse rounded-lg bg-surface-secondary" />
    <div class="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
    <div class="h-40 animate-pulse rounded-2xl bg-surface-secondary" />
  </div>

  <div v-else class="flex flex-col gap-4">
    <StageBar v-if="pipeline" :stages="pipeline.stages" :current="lead.stageId" finish-label="Завершить" />

    <section class="card card--default grid grid-cols-1 gap-0 p-0 sm:grid-cols-3">
      <div class="summary">
        <span class="summary__label">Сумма</span>
        <span class="text-xl font-semibold tabular-nums" :class="lead.amount ? '' : 'text-muted'">{{ lead.currency === "RUB" || !lead.currency ? money(lead.amount) : `${lead.amount.toLocaleString("ru-RU")} ${lead.currency}` }}</span>
      </div>
      <div class="summary">
        <span class="summary__label">Ответственный</span>
        <span class="inline-flex min-w-0 items-center gap-2 text-sm"><ChatFace :user="person(lead.responsibleId ?? 0)" size="xs" /><span class="truncate">{{ nameOf(lead.responsibleId) }}</span></span>
      </div>
      <div class="summary">
        <span class="summary__label">Создан</span>
        <span class="text-sm">{{ day(lead.createdAt) }}</span>
        <span class="text-xs text-muted">{{ ago(lead.createdAt) }}</span>
      </div>
    </section>

    <ClientBlock :company="lead.companyInfo" :company-text="lead.companyInfo ? null : lead.companyTitle" :contacts="lead.contacts">
      <ClientTile v-if="leadPerson" kind="person" :title="leadPerson.title" :sub="leadPerson.sub" badge="из лида" :phones="leadPerson.phones" :emails="leadPerson.emails" :webs="leadPerson.webs" :address="leadPerson.address" />
    </ClientBlock>

    <CardBlock :icon="SlidersHorizontal" title="О лиде" flush>
      <dl class="props">
        <dt>Название</dt>
        <dd class="font-medium">{{ lead.title }}</dd>
        <dt>Статус</dt>
        <dd><HueChip v-if="stage" :hue="hueOf(stage.color)">{{ stage.title }}</HueChip></dd>
        <template v-if="lead.updatedAt">
          <dt>Изменён</dt>
          <dd class="text-muted">{{ day(lead.updatedAt) }}</dd>
        </template>
        <template v-if="lead.creatorId">
          <dt>Создал</dt>
          <dd class="gap-2"><ChatFace :user="person(lead.creatorId)" size="xs" />{{ nameOf(lead.creatorId) }}</dd>
        </template>
        <template v-if="lead.externalId">
          <dt>В Битрикс24</dt>
          <dd class="text-muted">Лид №{{ lead.externalId }}</dd>
        </template>
      </dl>
    </CardBlock>

    <CardBlock v-if="lead.products.length" :icon="ShoppingCart" title="Товары" :count="`${lead.products.length} · ${money(productsTotal(lead.products))}`">
      <ProductRows :rows="lead.products" />
    </CardBlock>

    <CardBlock v-for="group in groups" :key="group.name" :icon="LayoutList" :title="group.name" :count="group.list.length" :collapsed="folded.has(group.name)" flush @toggle="fold(group.name)">
      <dl class="props">
        <template v-for="field in group.list" :key="field.id">
          <dt :title="field.title"><span class="line-clamp-2">{{ field.title }}</span></dt>
          <dd><FieldValue :field="field" :value="lead.fields[field.code]" :editable="false" /></dd>
        </template>
      </dl>
    </CardBlock>

    <CardBlock v-if="lead.invoices.length" :icon="Receipt" title="Счета" :count="lead.invoices.length">
      <InvoiceList :rows="lead.invoices" />
    </CardBlock>
    <CardBlock v-if="lead.smart.length" :icon="Layers" title="Договоры и процессы" :count="lead.smart.length">
      <SmartList :rows="lead.smart" />
    </CardBlock>
    <CardBlock v-if="lead.documents.length" :icon="FileText" title="Документы" :count="lead.documents.length">
      <DocumentList :rows="lead.documents" />
    </CardBlock>
    <CardBlock v-if="lead.comments" :icon="Pencil" title="Комментарий">
      <p class="text-sm whitespace-pre-line">{{ lead.comments }}</p>
    </CardBlock>
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
.props {
  display: grid;
  grid-template-columns: minmax(112px, 170px) minmax(0, 1fr);
  padding: 0 0 0.25rem;
}
.props > dt,
.props > dd {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
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
</style>
