<!-- Карточка компании или контакта CRM, как в Битрикс24: шапка с
     аватаром и быстрыми действиями (позвонить, написать, сайт), сводка по
     сделкам, способы связи с видами номеров и копированием, компания
     контакта или контакты компании плитками, сделки (в работе и
     завершённые) и комментарий. Пока просмотр: данные из Битрикса. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Phone, Mail, Globe, MapPin, Copy, Cake, Building2, Users, Briefcase, Pencil, Contact as ContactIcon } from "@lucide/vue";
import ChatFace from "../messenger/ChatFace.vue";
import CardBlock from "../tasks/CardBlock.vue";
import Avatar from "./Avatar.vue";
import ClientTile from "./ClientTile.vue";
import DealMini, { type DealLine } from "./DealMini.vue";
import type { CompanyBrief } from "./ClientBlock.vue";
import { tel, mail, site, siteText, kindOf, copy } from "./links";
import { api, ApiError } from "../../lib/api";
import { person, nameOf } from "../../lib/tasks";
import { compactMoney, plural } from "../../lib/format";
import { navigate, setQuery } from "../../lib/router";
import { toast } from "../../lib/toast";
import type { Contact } from "../../lib/crm";

interface ClientRow { id: number; title?: string; name?: string; post?: string | null; company?: string | null; companyId?: number | null; industry?: string | null; type?: string | null; phones: Contact[]; emails: Contact[]; webs?: Contact[]; address?: string | null; responsibleId: number | null; createdAt: string | null }
export interface ClientFull extends ClientRow { comments: string | null; birthday?: string | null; contacts?: ClientRow[]; companyInfo?: CompanyBrief | null; dealList: DealLine[] }

const props = defineProps<{ kind: "company" | "contact"; id: number }>();
const emit = defineEmits<{ loaded: [one: ClientFull | null]; close: [] }>();

const one = ref<ClientFull | null>(null);
watch(() => [props.kind, props.id] as const, async ([kind, id]) => {
  one.value = null;
  try {
    one.value = await api<ClientFull>("GET", `crm/${kind === "contact" ? "contacts" : "companies"}/${id}`);
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось открыть", "danger");
    emit("close");
  } finally {
    emit("loaded", one.value);
  }
}, { immediate: true });

const title = computed(() => one.value?.title ?? one.value?.name ?? "");
const sub = computed(() => {
  const x = one.value;
  if (!x) return "";
  return props.kind === "company" ? [x.industry, x.type].filter(Boolean).join(" · ") : x.post ?? "";
});

/* Сводка по сделкам. */
const stats = computed(() => {
  const list = one.value?.dealList ?? [];
  const open = list.filter((d) => !d.closed);
  const won = list.filter((d) => d.semantic === "success");
  const sum = (rows: DealLine[]) => rows.reduce((s, d) => s + d.amount, 0);
  return { open: open.length, openSum: sum(open), won: won.length, wonSum: sum(won), all: list.length };
});
const dealTab = ref<"open" | "closed">("open");
watch(stats, (s) => (dealTab.value = s.open || !s.all ? "open" : "closed"));
const deals = computed(() => (one.value?.dealList ?? []).filter((d) => (dealTab.value === "open" ? !d.closed : d.closed)));
const dealsAll = ref(false);
const contactsAll = ref(false);
watch(() => props.id, () => {
  dealsAll.value = false;
  contactsAll.value = false;
});

const copied = (text: string) => copy(text, () => toast("Скопировано", "success"));
const day = (iso: string | null | undefined, year = true) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}) }) : "");
const openContact = (id: number) => setQuery({ tab: "contacts", open: `contact:${id}` });
const openCompany = (id: number) => setQuery({ tab: "companies", open: `company:${id}` });
const openDeal = (id: number) => navigate("/deals", { open: id, view: "list" });
</script>

<template>
  <div v-if="!one" class="flex flex-col gap-4" aria-busy="true">
    <div class="h-36 animate-pulse rounded-2xl bg-surface-secondary" />
    <div class="h-40 animate-pulse rounded-2xl bg-surface-secondary" />
  </div>

  <div v-else class="flex flex-col gap-4">
    <!-- Шапка: аватар, подпись, быстрые действия, сводка по сделкам -->
    <section class="card card--default gap-0 p-0">
      <div class="flex items-center gap-4 px-5 pt-5 pb-4">
        <Avatar :name="title" :kind="kind === 'company' ? 'company' : 'person'" size="lg" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-muted">{{ kind === "company" ? "Компания" : "Контакт" }}<template v-if="sub"> · {{ sub }}</template></p>
          <button v-if="kind === 'contact' && one.companyId" type="button" class="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-sm hover:text-accent" @click="openCompany(one.companyId)"><Building2 class="size-3.5 shrink-0 text-muted" /><span class="truncate">{{ one.company ?? one.companyInfo?.title }}</span></button>
          <p v-if="one.responsibleId" class="mt-1 flex items-center gap-1.5 text-sm"><ChatFace :user="person(one.responsibleId)" size="xs" /><span class="truncate">{{ nameOf(one.responsibleId) }}</span><span class="text-xs text-muted">ответственный</span></p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 px-5 pb-4">
        <a v-if="one.phones[0]" :href="tel(one.phones[0].value)" class="button button--secondary button--sm"><Phone class="size-4" />Позвонить</a>
        <a v-if="one.emails[0]" :href="mail(one.emails[0].value)" class="button button--secondary button--sm"><Mail class="size-4" />Написать</a>
        <a v-if="one.webs?.[0]" :href="site(one.webs[0].value)" target="_blank" rel="noopener" class="button button--secondary button--sm"><Globe class="size-4" />Сайт</a>
      </div>
      <div class="grid grid-cols-3 border-t border-separator">
        <div class="stat"><span class="stat__label">В работе</span><span class="stat__value">{{ stats.open }}</span><span class="stat__sub">{{ stats.openSum ? compactMoney(stats.openSum) : "—" }}</span></div>
        <div class="stat"><span class="stat__label">Выиграно</span><span class="stat__value text-success">{{ stats.won }}</span><span class="stat__sub">{{ stats.wonSum ? compactMoney(stats.wonSum) : "—" }}</span></div>
        <div class="stat"><span class="stat__label">Всего сделок</span><span class="stat__value">{{ stats.all }}</span><span class="stat__sub">{{ one.createdAt ? `с ${new Date(one.createdAt).getFullYear()} года` : "" }}</span></div>
      </div>
    </section>

    <!-- Связь -->
    <CardBlock :icon="ContactIcon" title="Связь" flush>
      <ul class="links">
        <li v-for="x in one.phones" :key="'p' + x.value">
          <Phone class="size-4 shrink-0 text-muted" /><a :href="tel(x.value)" class="truncate tabular-nums hover:text-accent">{{ x.value }}</a><span class="kind">{{ kindOf(x) }}</span>
          <button type="button" class="copy" aria-label="Скопировать" title="Скопировать" @click="copied(x.value)"><Copy class="size-3.5" /></button>
        </li>
        <li v-for="x in one.emails" :key="'e' + x.value">
          <Mail class="size-4 shrink-0 text-muted" /><a :href="mail(x.value)" class="truncate hover:text-accent">{{ x.value }}</a><span class="kind">{{ kindOf(x) }}</span>
          <button type="button" class="copy" aria-label="Скопировать" title="Скопировать" @click="copied(x.value)"><Copy class="size-3.5" /></button>
        </li>
        <li v-for="x in one.webs ?? []" :key="'w' + x.value">
          <Globe class="size-4 shrink-0 text-muted" /><a :href="site(x.value)" target="_blank" rel="noopener" class="truncate hover:text-accent">{{ siteText(x.value) }}</a>
        </li>
        <li v-if="one.address">
          <MapPin class="size-4 shrink-0 text-muted" /><span class="min-w-0 flex-1">{{ one.address }}</span>
          <button type="button" class="copy" aria-label="Скопировать" title="Скопировать" @click="copied(one.address)"><Copy class="size-3.5" /></button>
        </li>
        <li v-if="one.birthday"><Cake class="size-4 shrink-0 text-muted" /><span>{{ day(one.birthday, false) }}</span><span class="kind">день рождения</span></li>
        <li v-if="!one.phones.length && !one.emails.length && !one.webs?.length && !one.address && !one.birthday" class="text-muted">Способов связи нет</li>
      </ul>
    </CardBlock>

    <!-- Компания контакта -->
    <CardBlock v-if="kind === 'contact' && one.companyInfo" :icon="Building2" title="Компания">
      <ClientTile kind="company" :title="one.companyInfo.title" :sub="one.companyInfo.industry" :phones="one.companyInfo.phones" :emails="one.companyInfo.emails" :webs="one.companyInfo.webs" :address="one.companyInfo.address" openable @open="openCompany(one.companyInfo.id)" />
    </CardBlock>

    <!-- Контакты компании -->
    <CardBlock v-if="one.contacts?.length" :icon="Users" title="Контакты" :count="one.contacts.length">
      <div class="grid gap-2 sm:grid-cols-2">
        <ClientTile v-for="x in contactsAll ? one.contacts : one.contacts.slice(0, 6)" :key="x.id" kind="person" :title="x.name ?? ''" :sub="x.post" :phones="x.phones" :emails="x.emails" openable @open="openContact(x.id)" />
      </div>
      <button v-if="one.contacts.length > 6" type="button" class="mt-3 text-sm text-accent" @click="contactsAll = !contactsAll">{{ contactsAll ? "Свернуть" : `Все контакты (${one.contacts.length})` }}</button>
    </CardBlock>

    <!-- Сделки -->
    <CardBlock :icon="Briefcase" title="Сделки" :count="stats.all || null">
      <template v-if="stats.all" #actions>
        <div class="toggle-button-group toggle-button-group--horizontal -mr-2" role="tablist">
          <button type="button" role="tab" class="toggle-button toggle-button--sm gap-1.5" :aria-selected="dealTab === 'open'" :data-selected="dealTab === 'open' ? 'true' : undefined" @click="dealTab = 'open'">В работе <span class="text-xs opacity-60">{{ stats.open }}</span></button>
          <button type="button" role="tab" class="toggle-button toggle-button--sm gap-1.5" :aria-selected="dealTab === 'closed'" :data-selected="dealTab === 'closed' ? 'true' : undefined" @click="dealTab = 'closed'">Завершённые <span class="text-xs opacity-60">{{ stats.all - stats.open }}</span></button>
        </div>
      </template>
      <div v-if="deals.length" class="-mx-2">
        <DealMini v-for="d in dealsAll ? deals : deals.slice(0, 8)" :key="d.id" :deal="d" @open="openDeal(d.id)" />
      </div>
      <p v-else class="text-sm text-muted">{{ stats.all ? (dealTab === "open" ? "Сделок в работе нет." : "Завершённых сделок нет.") : "Сделок нет." }}</p>
      <button v-if="deals.length > 8" type="button" class="mt-2 text-sm text-accent" @click="dealsAll = !dealsAll">{{ dealsAll ? "Свернуть" : `Показать все (${deals.length})` }}</button>
    </CardBlock>

    <CardBlock v-if="one.comments" :icon="Pencil" title="Комментарий">
      <p class="text-sm whitespace-pre-line">{{ one.comments }}</p>
    </CardBlock>

    <p class="px-1 text-xs text-muted">{{ kind === "company" ? "Компания" : "Контакт" }} №{{ one.id }}<template v-if="one.createdAt"> · создан{{ kind === "company" ? "а" : "" }} {{ day(one.createdAt) }}</template> · {{ plural(stats.all, "сделка", "сделки", "сделок") }}</p>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 0.75rem 1.25rem 0.875rem;
}
.stat + .stat {
  border-left: 1px solid var(--separator);
}
.stat__label {
  color: var(--muted);
  font-size: 0.75rem;
}
.stat__value {
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat__sub {
  color: var(--muted);
  font-size: 0.75rem;
  white-space: nowrap;
}
.links {
  display: flex;
  flex-direction: column;
  padding: 0 0.75rem 0.5rem;
}
.links > li {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
}
.links > li:hover {
  background: color-mix(in oklab, var(--default) 60%, transparent);
}
.kind {
  color: var(--muted);
  font-size: 0.75rem;
  white-space: nowrap;
}
.copy {
  display: inline-flex;
  margin-left: auto;
  padding: 0.25rem;
  border-radius: 0.375rem;
  color: var(--muted);
  opacity: 0;
  transition: opacity 120ms;
}
.links > li:hover .copy,
.copy:focus-visible {
  opacity: 1;
}
.copy:hover {
  color: var(--foreground);
  background: var(--default);
}
@media (hover: none) {
  .copy {
    opacity: 1;
  }
}
</style>
