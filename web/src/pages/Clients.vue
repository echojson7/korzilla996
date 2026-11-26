<!-- Компании и контакты CRM, как в Битрикс24 (перенесены оттуда). Список
     с поиском по названию, имени, телефону и почте; щелчок открывает
     карточку справа: реквизиты связи, контакты компании и сделки.
     В адресе: ?tab=companies|contacts, ?q, ?open=company:5 | contact:9. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Building2, UserRound, Phone, Mail, Globe, MapPin } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import { api, ApiError } from "../lib/api";
import { person, nameOf } from "../lib/tasks";
import { money, plural } from "../lib/format";
import { navigate, route, setQuery } from "../lib/router";
import { toast } from "../lib/toast";
import type { Contact } from "../lib/crm";

interface Row {
  id: number;
  title?: string;
  name?: string;
  post?: string | null;
  company?: string | null;
  companyId?: number | null;
  phones: Contact[];
  emails: Contact[];
  webs?: Contact[];
  address?: string | null;
  responsibleId: number | null;
  deals?: number;
  createdAt: string | null;
}
interface DealRow { id: number; title: string; amount: number; currency: string; closed: boolean; stage: string | null; color: string | null; semantic: string | null }
interface Full extends Row { comments: string | null; birthday?: string | null; contacts?: Row[]; dealList: DealRow[] }

type Tab = "companies" | "contacts";
const tab = computed<Tab>(() => (route.value.query.get("tab") === "contacts" ? "contacts" : "companies"));
const TABS = [
  { key: "companies", label: "Компании" },
  { key: "contacts", label: "Контакты" },
];
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });

const rows = ref<Row[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const more = computed(() => rows.value.length < total.value);
let asked = 0;

async function load(reset: boolean) {
  const ticket = ++asked;
  if (reset) page.value = 1;
  loading.value = true;
  try {
    const q = new URLSearchParams({ page: String(page.value) });
    if (text.value.trim()) q.set("q", text.value.trim());
    const out = await api<{ rows: Row[]; total: number }>("GET", `crm/${tab.value}?${q}`);
    if (ticket !== asked) return;
    rows.value = reset ? out.rows : [...rows.value, ...out.rows];
    total.value = out.total;
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось загрузить", "danger");
  } finally {
    if (ticket === asked) loading.value = false;
  }
}
let timer: ReturnType<typeof setTimeout> | undefined;
watch([tab, text], (_, prev) => {
  clearTimeout(timer);
  timer = setTimeout(() => load(true), prev && prev[0] === tab.value ? 250 : 0);
}, { immediate: true });
function next() {
  page.value++;
  load(false);
}

/* ---------- Карточка ---------- */
const openParam = computed(() => route.value.query.get("open") ?? "");
const opened = ref<Full | null>(null);
const openKind = computed(() => (openParam.value.startsWith("contact:") ? "contact" : "company"));
watch(openParam, async (value) => {
  opened.value = null;
  const [kind, id] = value.split(":");
  if (!id) return;
  try {
    opened.value = await api<Full>("GET", `crm/${kind === "contact" ? "contacts" : "companies"}/${Number(id)}`);
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось открыть", "danger");
    setQuery({ open: null });
  }
}, { immediate: true });
const open = (kind: "company" | "contact", id: number) => setQuery({ open: `${kind}:${id}` });
const titleOf = (one: Row) => one.title ?? one.name ?? "";
const tel = (value: string) => `tel:${value.replace(/[^\d+]/g, "")}`;
const site = (value: string) => (/^https?:/i.test(value) ? value : `https://${value}`);
const sub = computed(() => (loading.value && !rows.value.length ? "" : plural(total.value, tab.value === "companies" ? "компания" : "контакт", tab.value === "companies" ? "компании" : "контакта", tab.value === "companies" ? "компаний" : "контактов")));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Компании и контакты" :sub="sub">
      <template #toolbar>
        <Segmented label="Раздел" :items="TABS" :model-value="tab" @update:model-value="(value) => setQuery({ tab: value, open: null })" />
        <SearchBox v-model="text" :placeholder="tab === 'companies' ? 'Название, телефон, почта, сайт' : 'Имя, телефон, почта, должность'" class="w-full min-w-0 sm:w-auto sm:flex-1" />
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <section class="sheet overflow-hidden rounded-2xl shadow-surface">
        <div class="hidden grid-cols-[minmax(220px,1.6fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_80px] gap-3 border-b border-separator px-4 py-2 text-xs text-muted md:grid">
          <span>{{ tab === "companies" ? "Компания" : "Контакт" }}</span><span>Телефон</span><span>Почта</span><span>Ответственный</span><span class="text-right">Сделок</span>
        </div>
        <button
          v-for="one in rows"
          :key="one.id"
          type="button"
          class="grid w-full grid-cols-1 gap-x-3 gap-y-0.5 border-b border-separator px-4 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-default/60 md:grid-cols-[minmax(220px,1.6fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_80px] md:items-center"
          @click="open(tab === 'companies' ? 'company' : 'contact', one.id)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <component :is="tab === 'companies' ? Building2 : UserRound" class="size-4 shrink-0 text-muted" />
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ titleOf(one) }}</span>
              <span v-if="one.post || one.company" class="block truncate text-xs text-muted">{{ [one.post, one.company].filter(Boolean).join(" · ") }}</span>
            </span>
          </span>
          <span class="truncate text-muted md:text-default-foreground">{{ one.phones[0]?.value ?? "—" }}</span>
          <span class="truncate text-muted md:text-default-foreground">{{ one.emails[0]?.value ?? "—" }}</span>
          <span class="hidden min-w-0 items-center gap-2 md:flex"><template v-if="one.responsibleId"><ChatFace :user="person(one.responsibleId)" size="xs" /><span class="truncate">{{ nameOf(one.responsibleId) }}</span></template><span v-else class="text-muted">—</span></span>
          <span class="hidden text-right tabular-nums md:block">{{ one.deals || "—" }}</span>
        </button>
        <p v-if="!rows.length && !loading" class="px-4 py-10 text-center text-muted">Ничего не нашлось</p>
        <p v-if="loading && !rows.length" class="px-4 py-10 text-center text-muted">Загружаю…</p>
      </section>
      <div v-if="more" class="mt-3 flex justify-center">
        <button type="button" class="button button--secondary" :disabled="loading" @click="next">Показать ещё</button>
      </div>
    </div>

    <SidePanel :open="!!openParam" :title="opened ? titleOf(opened) : openKind === 'contact' ? 'Контакт' : 'Компания'" :sub="opened ? (openKind === 'contact' ? [opened.post, opened.company].filter(Boolean).join(' · ') || 'Контакт' : 'Компания') : ''" @close="setQuery({ open: null })">
      <div v-if="opened" class="space-y-4 p-4 md:p-5">
        <section class="space-y-2 text-sm">
          <p v-for="one in opened.phones" :key="'p' + one.value" class="flex items-center gap-2"><Phone class="size-4 shrink-0 text-muted" /><a :href="tel(one.value)" class="link">{{ one.value }}</a></p>
          <p v-for="one in opened.emails" :key="'e' + one.value" class="flex items-center gap-2"><Mail class="size-4 shrink-0 text-muted" /><a :href="`mailto:${one.value}`" class="link">{{ one.value }}</a></p>
          <p v-for="one in opened.webs ?? []" :key="'w' + one.value" class="flex items-center gap-2"><Globe class="size-4 shrink-0 text-muted" /><a :href="site(one.value)" target="_blank" rel="noopener" class="link">{{ one.value }}</a></p>
          <p v-if="opened.address" class="flex items-center gap-2"><MapPin class="size-4 shrink-0 text-muted" />{{ opened.address }}</p>
          <p v-if="opened.companyId" class="flex items-center gap-2"><Building2 class="size-4 shrink-0 text-muted" /><button type="button" class="link" @click="open('company', opened.companyId)">{{ opened.company }}</button></p>
          <p v-if="opened.responsibleId" class="flex items-center gap-2 text-muted">Ответственный: <ChatFace :user="person(opened.responsibleId)" size="xs" /><span class="text-default-foreground">{{ nameOf(opened.responsibleId) }}</span></p>
        </section>

        <section v-if="opened.comments" class="rounded-xl bg-default/50 p-3 text-sm whitespace-pre-line">{{ opened.comments }}</section>

        <section v-if="opened.contacts?.length">
          <h3 class="mb-1.5 text-xs font-medium text-muted">Контакты · {{ opened.contacts.length }}</h3>
          <button v-for="one in opened.contacts" :key="one.id" type="button" class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-default/60" @click="open('contact', one.id)">
            <UserRound class="size-4 shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate">{{ one.name }}<span v-if="one.post" class="text-muted"> · {{ one.post }}</span></span>
            <span class="text-xs text-muted">{{ one.phones[0]?.value }}</span>
          </button>
        </section>

        <section>
          <h3 class="mb-1.5 text-xs font-medium text-muted">Сделки · {{ opened.dealList.length }}</h3>
          <p v-if="!opened.dealList.length" class="text-sm text-muted">Сделок нет</p>
          <button v-for="one in opened.dealList" :key="one.id" type="button" class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-default/60" @click="navigate('/deals', { open: one.id, view: 'list' })">
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: one.color ?? '#999' }" />
            <span class="min-w-0 flex-1 truncate">{{ one.title }}</span>
            <span class="shrink-0 text-xs text-muted">{{ one.stage }}</span>
            <span class="shrink-0 text-xs tabular-nums">{{ money(one.amount) }}</span>
          </button>
        </section>
      </div>
      <p v-else class="p-6 text-sm text-muted">Загружаю…</p>
    </SidePanel>
  </div>
</template>
