<!-- Обзор: приветствие, показатели дня, мои задачи, воронка продаж,
     лента компании и кто отсутствует. -->
<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, Briefcase, ListChecks, Users, TrendingUp } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Face from "../components/Face.vue";
import HueChip from "../components/HueChip.vue";
import { deals, FUNNELS, FEED, WHO, STAFF, TASK_STATE, TODAY, day, isOverdue, ME_ID } from "../lib/data";
import { myOpenTasks, overdueTasks } from "../lib/counters";
import { compactMoney, longDate, number, plural, shortDate, time } from "../lib/format";
import { href } from "../lib/router";
import { auth } from "../lib/session";

const sum = (list: { sum: number }[]) => list.reduce((total, one) => total + one.sum, 0);
const hour = new Date().getHours();
const greeting = hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
const firstName = computed(() => (auth.me?.name ?? WHO[ME_ID].name).split(" ")[0]);

const fresh = computed(() => deals.filter((one) => one.created >= day(-6)));
const away = STAFF.filter((one) => one.away);
const when = (date: Date) => (date >= TODAY ? time(date) : date >= day(-1) ? `вчера, ${time(date)}` : `${shortDate(date)}, ${time(date)}`);

const funnel = computed(() => {
  const sites = FUNNELS[0];
  const list = deals.filter((one) => one.funnel === sites.id);
  const max = Math.max(1, ...sites.stages.map((stage) => sum(list.filter((one) => one.stage === stage.id))));
  return sites.stages.map((stage) => {
    const inStage = list.filter((one) => one.stage === stage.id);
    return { ...stage, count: inStage.length, sum: sum(inStage), share: sum(inStage) / max };
  });
});

const stats = computed(() => [
  { label: "Сделки в работе", value: number(deals.length), sub: `на ${compactMoney(sum(deals))}`, icon: Briefcase, to: href("/deals") },
  { label: "Новые за неделю", value: number(fresh.value.length), sub: `на ${compactMoney(sum(fresh.value))}`, icon: TrendingUp, to: href("/deals") },
  { label: "Мои задачи", value: number(myOpenTasks.value.length), sub: overdueTasks.value.length ? `просрочено в компании: ${overdueTasks.value.length}` : "всё в срок", icon: ListChecks, to: href("/tasks") },
  { label: "Сотрудники", value: number(STAFF.length), sub: away.length ? `в отпуске: ${away.length}` : "все на месте", icon: Users, to: href("/staff") },
]);
const deadline = (date: Date | null) => (!date ? "без срока" : `до ${shortDate(date)}`);
</script>

<template>
  <div class="h-full overflow-y-auto pb-6 photo-scroll">
    <PageHead :title="`${greeting}, ${firstName}`" :sub="longDate(TODAY)" />
    <div class="grid gap-3 px-3 md:px-5">
      <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <a v-for="one in stats" :key="one.label" :href="one.to" class="sheet group rounded-2xl p-4 shadow-surface transition hover:-translate-y-0.5 hover:shadow-md">
          <div class="flex items-center gap-2 text-sm text-muted">
            <component :is="one.icon" class="size-4" />{{ one.label }}
          </div>
          <p class="mt-2 text-3xl font-semibold tabular-nums">{{ one.value }}</p>
          <p class="mt-0.5 truncate text-xs text-muted">{{ one.sub }}</p>
        </a>
      </div>

      <div class="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <section class="sheet rounded-2xl shadow-surface">
          <header class="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 class="font-semibold">Мои задачи</h2>
            <a :href="href('/tasks')" class="link inline-flex items-center gap-1 text-sm text-accent">Все задачи <ArrowRight class="size-3.5" /></a>
          </header>
          <ul class="px-2 pb-2">
            <li v-for="task in myOpenTasks" :key="task.id">
              <a :href="href('/tasks', { open: task.id })" class="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-secondary">
                <Face :who="task.author" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ task.title }}</span>
                  <span class="block truncate text-xs text-muted">от {{ WHO[task.author].name }} · {{ deadline(task.deadline) }}</span>
                </span>
                <span v-if="isOverdue(task)" class="chip chip--sm chip--soft chip--danger"><span class="chip__label">Просрочена</span></span>
                <HueChip v-else :hue="TASK_STATE[task.state].hue">{{ TASK_STATE[task.state].label }}</HueChip>
              </a>
            </li>
            <li v-if="!myOpenTasks.length" class="py-8 text-center text-sm text-muted">Задач нет — можно выдохнуть</li>
          </ul>
        </section>

        <section class="sheet rounded-2xl shadow-surface">
          <header class="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 class="font-semibold">Воронка «Сайты»</h2>
            <a :href="href('/deals')" class="link inline-flex items-center gap-1 text-sm text-accent">Канбан <ArrowRight class="size-3.5" /></a>
          </header>
          <ul class="flex flex-col gap-2.5 px-5 pb-5">
            <li v-for="stage in funnel" :key="stage.id" :style="{ '--hue': stage.hue }">
              <div class="flex items-baseline justify-between gap-2 text-sm">
                <span class="truncate">{{ stage.label }}</span>
                <span class="shrink-0 text-xs text-muted tabular-nums">{{ plural(stage.count, "сделка", "сделки", "сделок") }} · {{ compactMoney(stage.sum) }}</span>
              </div>
              <div class="mt-1 h-2 overflow-hidden rounded-full bg-surface-secondary">
                <div class="hue-bar h-full rounded-full" :style="{ width: `${Math.max(4, stage.share * 100)}%` }" />
              </div>
            </li>
          </ul>
        </section>
      </div>

      <div class="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <section class="sheet rounded-2xl shadow-surface">
          <h2 class="px-5 pt-4 pb-2 font-semibold">Лента</h2>
          <ol class="px-5 pb-4">
            <li v-for="(entry, i) in FEED" :key="i" class="relative flex gap-3 pb-4 last:pb-0">
              <span v-if="i < FEED.length - 1" class="absolute top-9 bottom-0 left-4 w-px bg-separator" />
              <Face :who="entry.who" size="sm" />
              <div class="min-w-0 flex-1 text-sm">
                <p><span class="font-medium">{{ WHO[entry.who].name }}</span> {{ entry.text }}</p>
                <p class="text-xs text-muted">{{ when(entry.at) }}</p>
              </div>
            </li>
          </ol>
        </section>
        <section class="sheet rounded-2xl shadow-surface">
          <h2 class="px-5 pt-4 pb-2 font-semibold">Отсутствуют</h2>
          <ul class="px-2 pb-3">
            <li v-for="one in away" :key="one.id" class="flex items-center gap-3 rounded-xl px-3 py-2">
              <Face :who="one" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ one.name }}</span>
                <span class="block truncate text-xs text-muted">{{ one.away }}</span>
              </span>
            </li>
            <li v-if="!away.length" class="py-6 text-center text-sm text-muted">Все на месте</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
