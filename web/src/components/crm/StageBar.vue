<!-- Полоса стадий сделки или статусов лида, как в Битрикс24: пройденные
     стадии закрашены, текущая подписана, щелчок — перевод (если можно
     менять). «Завершить» — финальные стадии: успех или провал. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ChevronDown, Flag, RotateCcw } from "@lucide/vue";
import Popover from "../Popover.vue";
import type { Stage } from "../../lib/crm";

const props = defineProps<{ stages: Stage[]; current: number; editable?: boolean; finishLabel?: string }>();
const emit = defineEmits<{ pick: [stage: Stage] }>();
const working = computed(() => props.stages.filter((one) => one.semantic === "process"));
const finals = computed(() => props.stages.filter((one) => one.semantic !== "process"));
const stage = computed(() => props.stages.find((one) => one.id === props.current) ?? null);
const closed = computed(() => !!stage.value && stage.value.semantic !== "process");
const index = computed(() => working.value.findIndex((one) => one.id === props.current));
const menu = ref<InstanceType<typeof Popover> | null>(null);
function pick(one: Stage) {
  menu.value?.close();
  if (props.editable && one.id !== props.current) emit("pick", one);
}
</script>

<template>
  <div class="flex items-stretch gap-1">
    <button
      v-for="(one, i) in working"
      :key="one.id"
      type="button"
      class="stage-step"
      :class="[!closed && i <= index ? 'stage-step--on' : '', !closed && i === index ? 'stage-step--current' : '']"
      :style="{ '--stage': one.color }"
      :title="one.title"
      :disabled="!editable"
      @click="pick(one)"
    >{{ one.title }}</button>
    <Popover v-if="editable && finals.length" ref="menu" width="w-64">
      <template #trigger="{ toggle }">
        <button type="button" class="stage-step stage-step--final" :class="closed ? 'stage-step--on' : ''" :style="{ '--stage': stage?.color ?? '#7bd500' }" @click="toggle">
          <Flag class="size-3.5 shrink-0" />{{ closed ? stage?.title : finishLabel ?? "Завершить" }}<ChevronDown class="size-3.5 shrink-0" />
        </button>
      </template>
      <p class="px-3 pt-2 pb-1 text-xs text-muted">{{ finishLabel ?? "Завершить" }}</p>
      <button v-for="one in finals" :key="one.id" type="button" class="menu-row" @click="pick(one)">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ background: one.color }" />
        <span class="min-w-0 flex-1 truncate">{{ one.title }}</span>
        <span class="text-xs text-muted">{{ one.semantic === "success" ? "успех" : "провал" }}</span>
        <Check v-if="one.id === current" class="size-4 text-accent" />
      </button>
      <button v-if="closed && working[0]" type="button" class="menu-row" @click="pick(working[0])"><RotateCcw class="size-4" />Вернуть в работу</button>
    </Popover>
    <span v-else-if="closed" class="stage-step stage-step--final stage-step--on" :style="{ '--stage': stage?.color ?? '#7bd500' }"><Flag class="size-3.5" />{{ stage?.title }}</span>
  </div>
</template>

<style scoped>
.stage-step {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  overflow: hidden;
  border-radius: 0.5rem;
  background: var(--surface-secondary);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: background-color 120ms, color 120ms;
}
.stage-step:not(:disabled):hover {
  background: color-mix(in oklab, var(--stage) 30%, var(--surface-secondary));
  color: var(--foreground);
}
.stage-step--on {
  background: var(--stage);
  color: #fff;
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
}
.stage-step--on:not(:disabled):hover {
  background: color-mix(in oklab, var(--stage) 85%, black);
  color: #fff;
}
/* Узкая панель: у остальных стадий только цвет, название — в подсказке. */
.stage-step:not(.stage-step--current):not(.stage-step--final) {
  font-size: 0;
}
.stage-step--current {
  flex: 0 1 auto;
  min-width: 4rem;
  padding: 0 0.75rem;
}
.stage-step--final {
  flex: 0 0 auto;
  max-width: 12rem;
}
.menu-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.6rem;
  font-size: 0.875rem;
  text-align: left;
}
.menu-row:hover {
  background: var(--default);
}
</style>
