<!-- Лиды, как в Битрикс24 (перенесены оттуда): статусы вкладками со
     счётчиками, список с поиском по названию, имени, телефону и почте,
     карточка справа (components/crm/LeadCard.vue).
     В адресе: ?stage, ?q, ?open. Пока только просмотр. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import PageHead from "../components/PageHead.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import HueChip from "../components/HueChip.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import LeadCard, { type Lead } from "../components/crm/LeadCard.vue";
import { api, ApiError } from "../lib/api";
import { hueOf, type Field, type Pipeline, type Stage } from "../lib/crm";
import { person, nameOf } from "../lib/tasks";
import { plural } from "../lib/format";
import { pageRoute, setQuery } from "../lib/router";
/* Свой адрес: фоновый раздел не реагирует на чужие ?open и фильтры. */
const route = pageRoute();
import { toast } from "../lib/toast";

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
const opened = ref<Lead | null>(null);
watch(openId, () => (opened.value = null));

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

    <SidePanel :open="!!openId" :chat="null" :title="opened?.title ?? 'Лид'" :sub="opened ? `Лид №${opened.id}${opened.name ? ` · ${opened.name}` : ''}` : ''" @close="setQuery({ open: null })">
      <LeadCard v-if="openId" :key="openId" :lead-id="openId" :pipeline="pipeline" :fields="fields" @loaded="(one) => (opened = one)" @close="setQuery({ open: null })" />
    </SidePanel>
  </div>
</template>
