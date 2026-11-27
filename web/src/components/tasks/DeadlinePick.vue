<!-- Выбор крайнего срока: быстрые варианты и точные дата со временем. -->
<script setup lang="ts">
import { ref, watch } from "vue";
import UiDate from "../UiDate.vue";
import { quickDeadline, toLocalInput, fromLocalInput } from "./when";

const props = defineProps<{ modelValue: string | null }>();
const emit = defineEmits<{ pick: [iso: string | null] }>();
const exact = ref(toLocalInput(props.modelValue));
watch(() => props.modelValue, (next) => (exact.value = toLocalInput(next)));
const QUICK = [
  { kind: "today", label: "Сегодня" },
  { kind: "tomorrow", label: "Завтра" },
  { kind: "friday", label: "В пятницу" },
  { kind: "week", label: "Через неделю" },
  { kind: "month", label: "Через месяц" },
] as const;
</script>

<template>
  <div class="flex flex-col gap-1 p-1">
    <button v-for="one in QUICK" :key="one.kind" type="button" class="rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-default" @click="emit('pick', quickDeadline(one.kind))">{{ one.label }}</button>
    <div class="my-1 h-px bg-separator" />
    <UiDate v-model="exact" type="datetime" :clearable="false" placeholder="Точная дата и время" aria-label="Точный срок" @change="(v) => v && emit('pick', fromLocalInput(v))" />
    <button v-if="modelValue" type="button" class="button button--ghost button--sm mt-1" @click="emit('pick', null)">Без срока</button>
  </div>
</template>
