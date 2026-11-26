<!-- Обзор: приветствие, показатели дня, мои задачи, воронка продаж,
     лента компании и кто отсутствует. -->
<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, Briefcase, ListChecks, Users, TrendingUp } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Face from "../components/Face.vue";
import HueChip from "../components/HueChip.vue";
import { FEED, WHO, TODAY, day, ME_ID, type Person } from "../lib/data";
import { summary, defaultPipeline, hueOf } from "../lib/crm";
import { can } from "../lib/access";
import { people } from "../lib/messenger";
import ChatFace from "../components/messenger/ChatFace.vue";
import { STATUS, person, nameOf, isOverdueTask } from "../lib/tasks";
import { when as dueWhen } from "../components/tasks/when";
import { myOpenTasks, overdueTasks } from "../lib/counters";
import { compactMoney, longDate, number, plural, shortDate, time } from "../lib/format";
import { href } from "../lib/router";
import { auth } from "../lib/session";

const hour = new Date().getHours();
const greeting = hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
const firstName = computed(() => (auth.me?.name ?? WHO[ME_ID].name).split(" ")[0]);

/* Статусов «в отпуске» у учёток пока нет: список пуст. */
const away: Person[] = [];
const staffCount = computed(() => [...people.values()].filter((one) => one.active).length);
const when = (date: Date) => (date >= TODAY ? time(date) : date >= day(-1) ? `вчера, ${time(date)}` : `${shortDate(date)}, ${time(date)}`);

/* Основная воронка: рабочие стадии, число и сумма сделок (сводка с сервера). */
const funnel = computed(() => {
  const stages = defaultPipeline.value?.stages.filter((one) => one.semantic === "process") ?? [];
  const at = (id: number) => summary.stages[id] ?? { count: 0, sum: 0 };
  const max = Math.max(1, ...stages.map((stage) => at(stage.id).sum));
  return stages.map((stage) => ({ id: stage.id, label: stage.title, hue: hueOf(stage.color), count: at(stage.id).count, sum: at(stage.id).sum, share: at(stage.id).sum / max }));
});

const stats = computed(() => [
  { label: "Сделки в работе", value: number(summary.open.count), sub: `на ${compactMoney(summary.open.sum)}`, icon: Briefcase, to: href("/deals") },
  { label: "Новые за неделю", value: number(summary.week.count), sub: `на ${compactMoney(summary.week.sum)}`, icon: TrendingUp, to: href("/deals") },
  { label: "Мои задачи", value: number(myOpenTasks.value.length), sub: overdueTasks.value.length ? `просрочено в компании: ${overdueTasks.value.length}` : "всё в срок", icon: ListChecks, to: href("/tasks") },
  { label: "Сотрудники", value: number(staffCount.value), sub: "учётки портала", icon: Users, to: href("/staff") },
]);
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
          <p class="mt-2 text-3xl font-semibold tracking-tight">{{ one.value }}</p>
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
            <li v-for="task in myOpenTasks.slice(0, 8)" :key="task.id">
              <a :href="href('/tasks', { open: task.id })" class="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-secondary">
                <ChatFace :user="person(task.creatorId)" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ task.title }}</span>
                  <span class="block truncate text-xs text-muted">от {{ nameOf(task.creatorId) }} · {{ task.deadline ? `до ${dueWhen(task.deadline)}` : "без срока" }}</span>
                </span>
                <span v-if="isOverdueTask(task)" class="chip chip--sm chip--soft chip--danger"><span class="chip__label">Просрочена</span></span>
                <HueChip v-else :hue="STATUS[task.status].hue">{{ STATUS[task.status].label }}</HueChip>
              </a>
            </li>
            <li v-if="!myOpenTasks.length" class="py-8 text-center text-sm text-muted">Задач нет — можно выдохнуть</li>
          </ul>
        </section>

        <section v-if="can('crm', 'view')" class="sheet rounded-2xl shadow-surface">
          <header class="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 class="truncate font-semibold">Воронка «{{ defaultPipeline?.title ?? "Сделки" }}»</h2>
            <a :href="href('/deals', { pipeline: defaultPipeline?.id })" class="link inline-flex shrink-0 items-center gap-1 text-sm text-accent">Канбан <ArrowRight class="size-3.5" /></a>
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
