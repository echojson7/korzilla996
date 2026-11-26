<!-- Роботы и триггеры воронки, как в Битрикс24: столбец на каждую стадию,
     сверху триггеры (что переводит сделку на эту стадию), ниже роботы (что
     происходит, когда сделка пришла). Роботов можно перетаскивать: порядок
     в столбце — порядок выполнения. Щелчок открывает настройку справа. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Bell, Bot, Clock, CopyPlus, GripVertical, Info, ListChecks, ListFilter, MessageSquare, PencilLine, Plus, ArrowRightLeft,
  UserRoundCog, Webhook, Zap, CircleCheck, ChevronLeft,
} from "@lucide/vue";
import type { Component } from "vue";
import Popover from "../../Popover.vue";
import SidePanel from "../../SidePanel.vue";
import AutomationEditor from "./AutomationEditor.vue";
import { fieldTitle, dateFields } from "./fields";
import { crm, hueOf } from "../../../lib/crm";
import { robots, loadRobots, orderRobots, delayText, type Robot, type Trigger } from "../../../lib/robots";
import { loadPeople } from "../../../lib/messenger";
import { toast } from "../../../lib/toast";
import { ApiError } from "../../../lib/api";

const props = defineProps<{ pipelineId: number }>();
const emit = defineEmits<{ close: [] }>();
const fail = (error: unknown) => toast(error instanceof ApiError ? error.first : error instanceof Error ? error.message : "Не получилось", "danger");

watch(() => props.pipelineId, (id) => id && loadRobots(id).catch(fail), { immediate: true });
loadPeople().catch(() => undefined);

const pipeline = computed(() => crm.pipelines.find((one) => one.id === props.pipelineId) ?? null);
const ready = computed(() => robots.loaded && robots.pipelineId === props.pipelineId);
const robotsOf = (stageId: number) => robots.list.filter((one) => one.stageId === stageId);
const triggersOf = (stageId: number) => robots.triggers.filter((one) => one.stageId === stageId);
const total = computed(() => ({ robots: robots.list.filter((one) => one.active).length, triggers: robots.triggers.filter((one) => one.active).length }));

const ICONS: Record<string, Component> = {
  task: ListChecks, notify: Bell, chat: MessageSquare, field: PencilLine, stage: ArrowRightLeft, responsible: UserRoundCog,
  deal: CopyPlus, webhook: Webhook, bitrix: Info,
};
const TRIGGER_ICONS: Record<string, Component> = { task_done: CircleCheck, field: ListFilter, webhook: Webhook };
const titleOf = (code: string) => dateFields.value.find((one) => one.key === code)?.title ?? fieldTitle(code);

/* Настройка справа. */
const editing = ref<{ kind: "robot" | "trigger"; item: Partial<Robot & Trigger> & { stageId: number; type: string } } | null>(null);
const openRobot = (one: Robot) => (editing.value = { kind: "robot", item: one });
const openTrigger = (one: Trigger) => (editing.value = { kind: "trigger", item: one });
const addRobot = (stageId: number, type: string) => (editing.value = { kind: "robot", item: { stageId, type } });
const addTrigger = (stageId: number, type: string) => (editing.value = { kind: "trigger", item: { stageId, type } });
const menus = new Map<string, InstanceType<typeof Popover>>();

/* Перетаскивание роботов: в столбце — порядок, в другой столбец — перенос. */
const dragging = ref<number | null>(null);
const over = ref<{ stageId: number; before: number | null } | null>(null);
function drop() {
  const id = dragging.value;
  const target = over.value;
  dragging.value = null;
  over.value = null;
  if (id == null || !target) return;
  const ids = robotsOf(target.stageId).map((one) => one.id).filter((one) => one !== id);
  const at = target.before == null ? ids.length : Math.max(0, ids.indexOf(target.before));
  ids.splice(at, 0, id);
  const robot = robots.list.find((one) => one.id === id);
  if (robot) robot.stageId = target.stageId;
  orderRobots(target.stageId, ids).catch(fail);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="button button--secondary button--sm" @click="emit('close')"><ChevronLeft class="size-4" />К сделкам</button>
      <p class="on-photo min-w-0 flex-1 truncate text-sm">
        <template v-if="ready">Роботов: {{ total.robots }} · триггеров: {{ total.triggers }}<template v-if="!robots.can.edit"> · только просмотр</template></template>
      </p>
    </div>

    <p v-if="!ready" class="sheet rounded-2xl p-6 text-sm text-muted">Загружаю роботов…</p>
    <div v-else class="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1 photo-scroll">
      <section
        v-for="stage in pipeline?.stages ?? []"
        :key="stage.id"
        class="flex h-full w-[278px] min-w-[262px] shrink-0 flex-col border-l border-white/45 px-[7px] first:w-[271px] first:border-l-0 first:pl-0"
        :style="{ '--hue': hueOf(stage.color) }"
      >
        <header class="hue-bar flex h-8 shrink-0 items-center gap-2 rounded-xl px-3 text-white">
          <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ stage.title }}</h2>
          <span v-if="stage.semantic !== 'process'" class="rounded-full bg-black/15 px-1.5 text-xs">{{ stage.semantic === "success" ? "успех" : "провал" }}</span>
        </header>

        <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pt-2 pb-2 photo-scroll" @dragover.prevent="dragging != null && (over = { stageId: stage.id, before: null })" @drop.prevent="drop">
          <!-- Триггеры -->
          <p class="on-photo flex items-center gap-1 px-1 text-xs font-semibold tracking-wide uppercase opacity-90"><Zap class="size-3.5" />Триггеры</p>
          <button
            v-for="one in triggersOf(stage.id)"
            :key="`t${one.id}`"
            type="button"
            class="rounded-xl border border-dashed border-accent/50 bg-surface px-3 py-2 text-left text-sm shadow-surface hover:border-accent"
            :class="one.active ? '' : 'opacity-60'"
            @click="openTrigger(one)"
          >
            <span class="flex items-start gap-2">
              <component :is="TRIGGER_ICONS[one.type] ?? Zap" class="mt-0.5 size-4 shrink-0 text-accent" />
              <span class="min-w-0 flex-1">
                <span class="block leading-snug font-medium">{{ one.title }}</span>
                <span class="block text-xs text-muted">{{ robots.triggerTypes[one.type] }}<template v-if="one.conditions.length"> · с условием</template><template v-if="!one.active"> · выключен</template></span>
              </span>
            </span>
          </button>
          <Popover v-if="robots.can.edit" :ref="(el) => el && menus.set(`t${stage.id}`, el as InstanceType<typeof Popover>)" align="left" width="w-64">
            <template #trigger="{ toggle }">
              <button type="button" class="on-photo flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-xs hover:bg-white/15" @click="toggle"><Plus class="size-3.5" />Триггер</button>
            </template>
            <div class="p-1">
              <button v-for="(text, key) in robots.triggerTypes" :key="key" type="button" class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-default" @click="menus.get(`t${stage.id}`)?.close(); addTrigger(stage.id, key)">
                <component :is="TRIGGER_ICONS[key] ?? Zap" class="size-4 text-muted" />{{ text }}
              </button>
            </div>
          </Popover>

          <!-- Роботы -->
          <p class="on-photo mt-2 flex items-center gap-1 px-1 text-xs font-semibold tracking-wide uppercase opacity-90"><Bot class="size-3.5" />Роботы</p>
          <template v-for="one in robotsOf(stage.id)" :key="`r${one.id}`">
            <div v-if="over && dragging !== one.id && over.stageId === stage.id && over.before === one.id" class="h-1 rounded-full bg-white/80" />
            <button
              type="button"
              class="group rounded-xl border border-transparent bg-surface px-3 py-2 text-left text-sm shadow-surface transition-[border-color,opacity] hover:border-border"
              :class="[one.active ? '' : 'opacity-60', dragging === one.id ? 'opacity-40' : '', one.type === 'bitrix' ? 'border-warning/60!' : '']"
              :draggable="robots.can.edit"
              @dragstart="dragging = one.id"
              @dragend="dragging = null; over = null"
              @dragover.prevent.stop="dragging != null && (over = { stageId: stage.id, before: one.id })"
              @drop.prevent.stop="drop"
              @click="openRobot(one)"
            >
              <span class="flex items-start gap-2">
                <component :is="ICONS[one.type] ?? Bot" class="mt-0.5 size-4 shrink-0" :class="one.type === 'bitrix' ? 'text-warning' : 'text-muted'" />
                <span class="min-w-0 flex-1">
                  <span class="block leading-snug font-medium">{{ one.title }}</span>
                  <span class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span class="inline-flex items-center gap-0.5"><Clock class="size-3" />{{ delayText(one.delay, titleOf) }}</span>
                    <span v-if="one.conditions.length">· с условием</span>
                    <span v-if="!one.active">· выключен</span>
                    <span v-if="one.type === 'bitrix'" class="text-warning">· нужно настроить</span>
                  </span>
                  <span v-if="one.stats && (one.stats.done || one.stats.failed)" class="mt-0.5 block text-xs text-muted">
                    За 30 дней: {{ one.stats.done ?? 0 }}<span v-if="one.stats.failed" class="text-danger"> · ошибок {{ one.stats.failed }}</span>
                  </span>
                </span>
                <GripVertical v-if="robots.can.edit" class="mt-0.5 size-4 shrink-0 text-muted opacity-0 group-hover:opacity-100" />
              </span>
            </button>
          </template>
          <div v-if="over && over.stageId === stage.id && over.before === null && dragging != null" class="h-1 rounded-full bg-white/80" />
          <Popover v-if="robots.can.edit" :ref="(el) => el && menus.set(`r${stage.id}`, el as InstanceType<typeof Popover>)" align="left" width="w-64">
            <template #trigger="{ toggle }">
              <button type="button" class="on-photo flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-xs hover:bg-white/15" @click="toggle"><Plus class="size-3.5" />Робот</button>
            </template>
            <div class="p-1">
              <template v-for="(text, key) in robots.types" :key="key">
                <button v-if="key !== 'bitrix'" type="button" class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-default" @click="menus.get(`r${stage.id}`)?.close(); addRobot(stage.id, key)">
                  <component :is="ICONS[key] ?? Bot" class="size-4 text-muted" />{{ text }}
                </button>
              </template>
            </div>
          </Popover>
          <p v-if="!robots.can.edit && !robotsOf(stage.id).length && !triggersOf(stage.id).length" class="on-photo py-4 text-center text-sm opacity-75">Пусто</p>
        </div>
      </section>
    </div>

    <SidePanel :open="!!editing" :title="editing ? editing.item.id ? editing.item.title ?? '' : editing.kind === 'robot' ? 'Новый робот' : 'Новый триггер' : ''" :sub="editing?.kind === 'robot' ? 'Робот стадии' : 'Триггер стадии'" @close="editing = null">
      <AutomationEditor v-if="editing" :key="`${editing.kind}${editing.item.id ?? 'new'}${editing.item.stageId}${editing.item.type}`" :kind="editing.kind" :item="editing.item" @close="editing = null" />
    </SidePanel>
  </div>
</template>
