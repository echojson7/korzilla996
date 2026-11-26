<!-- Сделки: канбан воронки, как в Битрикс24. Вверху воронки, колонки —
     стадии с числом и суммой. Карточку тянут между стадиями; щелчок
     открывает сделку справа, там же стадия меняется щелчком по полосе.
     Воронка, поиск и открытая сделка — в адресе (?funnel, ?q, ?open). -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, Clock, CircleAlert } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Board from "../components/Board.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import SidePanel from "../components/SidePanel.vue";
import Face from "../components/Face.vue";
import HueChip from "../components/HueChip.vue";
import PersonLine from "../components/PersonLine.vue";
import { deals, FUNNEL, FUNNELS, WHO, ME_ID, type Deal } from "../lib/data";
import ChatFace from "../components/messenger/ChatFace.vue";
import MarkdownField from "../components/editor/MarkdownField.vue";
import { taskStore, STATUS, person, nameOf } from "../lib/tasks";
import { when as dueWhen } from "../components/tasks/when";
import { href } from "../lib/router";
import { compactMoney, money, plural, shortDate } from "../lib/format";
import { route, setQuery } from "../lib/router";
import { moveBefore } from "../lib/move";
import { toast } from "../lib/toast";

const funnelId = computed(() => (FUNNEL[route.value.query.get("funnel") ?? ""] ? route.value.query.get("funnel")! : "sites"));
const funnel = computed(() => FUNNEL[funnelId.value]);
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });
const board = ref<{ openAdd: (column: string) => void } | null>(null);

const sum = (list: Deal[]) => list.reduce((total, one) => total + one.sum, 0);
const inFunnel = computed(() => deals.filter((one) => one.funnel === funnelId.value));
const visible = computed(() => {
  const words = text.value.trim().toLowerCase();
  if (!words) return inFunnel.value;
  return inFunnel.value.filter((one) => `${one.title} ${one.company} ${WHO[one.owner].name} ${one.id}`.toLowerCase().includes(words));
});
const columns = computed(() => funnel.value.stages.map((stage) => ({ ...stage, total: compactMoney(sum(visible.value.filter((one) => one.stage === stage.id))) })));
const tabs = computed(() => FUNNELS.map((one) => ({ key: one.id, label: one.name, count: deals.filter((deal) => deal.funnel === one.id).length })));

const stageOf = (deal: Deal) => FUNNEL[deal.funnel].stages.find((one) => one.id === deal.stage)!;
function move(key: number | string, stage: string, before: number | string | null) {
  const was = deals.find((one) => one.id === key)?.stage;
  const deal = moveBefore(deals, key, (one) => one.id, before);
  if (!deal) return;
  deal.stage = stage;
  if (was !== stage) toast(`«${deal.title}» → ${stageOf(deal).label}`, "success");
}

let seq = 4000;
function add(stage: string, title: string) {
  deals.unshift({ id: ++seq, funnel: funnelId.value, stage, title, company: "Без компании", sum: 0, owner: ME_ID, created: new Date(), next: null });
  toast(`Сделка «${title}» создана`, "success");
}

const opened = computed(() => deals.find((one) => String(one.id) === route.value.query.get("open")) ?? null);
const open = (deal: Deal) => setQuery({ open: deal.id });
const close = () => setQuery({ open: null });
const dealTasks = computed(() => (opened.value ? taskStore.list.filter((one) => one.dealId === opened.value!.id) : []));

const nextLabel = (at: number) => (at === 0 ? "сегодня" : at === 1 ? "завтра" : at < 0 ? "просрочено" : `через ${plural(at, "день", "дня", "дней")}`);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Сделки" :sub="`${plural(inFunnel.length, 'сделка', 'сделки', 'сделок')} на ${money(sum(inFunnel))}`">
      <template #actions>
        <button type="button" class="button button--primary" @click="board?.openAdd(funnel.stages[0].id)">
          <Plus class="size-4" />Сделка
        </button>
      </template>
      <template #toolbar>
        <Segmented label="Воронки" :items="tabs" :model-value="funnelId" @update:model-value="(funnel) => setQuery({ funnel, open: null })" />
        <SearchBox v-model="text" placeholder="Название, компания, ответственный" class="w-full min-w-0 sm:w-auto sm:flex-1" />
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 px-3 pb-3 md:px-5">
      <Board
        ref="board"
        :columns="columns"
        :items="visible"
        :column-of="(deal) => deal.stage"
        :key-of="(deal) => deal.id"
        add-placeholder="Название сделки и Enter"
        @move="move"
        @open="open"
        @add="add"
      >
        <template #card="{ item: deal }">
          <p class="leading-snug font-medium">{{ deal.title }}</p>
          <p class="mt-0.5 truncate text-xs text-muted">{{ deal.company }}</p>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="font-semibold tabular-nums">{{ money(deal.sum) }}</span>
            <Face :who="deal.owner" size="xs" />
          </div>
          <p v-if="deal.next" class="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs" :class="deal.next.at < 0 ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-surface-secondary text-muted'">
            <CircleAlert v-if="deal.next.at < 0" class="size-3.5 shrink-0" />
            <Clock v-else class="size-3.5 shrink-0" />
            <span class="truncate">{{ deal.next.text }} · {{ nextLabel(deal.next.at) }}</span>
          </p>
        </template>
      </Board>
    </div>

    <SidePanel :open="!!opened" :chat="opened ? { entity: `deal:${opened.id}`, title: `Сделка: ${opened.title}` } : null" :title="opened?.title ?? ''" :sub="opened ? `Сделка №${opened.id} · ${opened.company}` : ''" @close="close">
      <template v-if="opened">
        <!-- Полоса стадий: щелчок переводит сделку, как в Битрикс24 -->
        <div class="flex gap-1">
          <button
            v-for="(stage, i) in FUNNEL[opened.funnel].stages"
            :key="stage.id"
            type="button"
            class="h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-xs font-medium transition"
            :class="i <= FUNNEL[opened.funnel].stages.findIndex((one) => one.id === opened!.stage) ? 'hue-bar text-white' : 'bg-surface-secondary text-muted hover:bg-surface-tertiary'"
            :style="{ '--hue': stage.hue }"
            :title="stage.label"
            @click="opened.stage = stage.id; toast(`Стадия: ${stage.label}`, 'success')"
          >{{ stage.label }}</button>
        </div>

        <section class="md-card card card--default mt-5 overflow-hidden p-0">
          <MarkdownField v-model="opened.text" placeholder="Описание сделки: щёлкните и пишите. Списки, чек-листы, ссылки и картинки — на панели сверху." min-height="80px" />
        </section>

        <div class="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          <section class="card card--default gap-3 p-4">
            <h3 class="text-sm font-semibold">О сделке</h3>
            <dl class="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
              <dt class="text-muted">Сумма</dt><dd class="font-semibold">{{ money(opened.sum) }}</dd>
              <dt class="text-muted">Компания</dt><dd>{{ opened.company }}</dd>
              <dt class="text-muted">Воронка</dt><dd>{{ FUNNEL[opened.funnel].name }}</dd>
              <dt class="text-muted">Создана</dt><dd>{{ shortDate(opened.created) }}</dd>
              <dt class="text-muted">Ответственный</dt><dd><PersonLine :id="opened.owner" :sub="WHO[opened.owner].role" /></dd>
            </dl>
          </section>
          <section class="card card--default gap-3 p-4">
            <h3 class="text-sm font-semibold">Дела</h3>
            <p v-if="opened.next" class="flex items-center gap-2 text-sm"><Clock class="size-4 text-muted" />{{ opened.next.text }} · {{ nextLabel(opened.next.at) }}</p>
            <p v-else class="text-sm text-muted">Запланированных дел нет.</p>
          </section>
        </div>

        <section class="card card--default mt-4 gap-2 p-4">
          <h3 class="flex items-center text-sm font-semibold">Задачи по сделке
            <a :href="href('/tasks', { open: 'new', deal: opened.id })" class="link ml-auto inline-flex items-center gap-1 text-sm font-normal text-accent"><Plus class="size-3.5" />Задача</a>
          </h3>
          <ul v-if="dealTasks.length" class="-mx-2">
            <li v-for="task in dealTasks" :key="task.id">
              <a :href="href('/tasks', { tab: 'all', open: task.id })" class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-secondary">
                <ChatFace :user="person(task.responsibleId)" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm">{{ task.title }}</span>
                  <span class="block text-xs text-muted">{{ nameOf(task.responsibleId) }}{{ task.deadline ? ` · до ${dueWhen(task.deadline)}` : "" }}</span>
                </span>
                <HueChip :hue="STATUS[task.status].hue">{{ STATUS[task.status].label }}</HueChip>
              </a>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">Задач нет.</p>
        </section>

        <section class="card card--default mt-4 gap-2 p-4">
          <h3 class="text-sm font-semibold">Бизнес-процесс</h3>
          <p class="text-sm text-muted">Сделку ведёт шаблон «Весь процесс (запускается автоматически)» из Битрикс24. Он заработает вместе с движком процессов.</p>
        </section>
      </template>
    </SidePanel>
  </div>
</template>
