<!-- Значение для поля сделки по его типу: список — варианты, сотрудник —
     люди, стадия — стадии воронки, да/нет, дата; иначе текст с подстановками. -->
<script setup lang="ts">
import { computed } from "vue";
import TemplateInput from "./TemplateInput.vue";
import { crm } from "../../../lib/crm";
import { staffList } from "../../../lib/tasks";
import type { FieldDef } from "./fields";

const props = defineProps<{ field: FieldDef | undefined; modelValue: string; label: string; pipelineId: number; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const set = (value: string) => emit("update:modelValue", value);
const stages = computed(() => crm.pipelines.find((one) => one.id === props.pipelineId)?.stages ?? []);
</script>

<template>
  <select v-if="field?.type === 'list'" class="ui-select" :value="modelValue" :aria-label="label" :disabled="disabled" @change="set(($event.target as HTMLSelectElement).value)">
    <option value="">—</option>
    <option v-for="one in field.options ?? []" :key="one.id" :value="one.id">{{ one.label }}</option>
  </select>
  <select v-else-if="field?.type === 'user'" class="ui-select" :value="modelValue" :aria-label="label" :disabled="disabled" @change="set(($event.target as HTMLSelectElement).value)">
    <option value="">—</option>
    <option v-for="one in staffList" :key="one.id" :value="String(one.id)">{{ one.name }}</option>
  </select>
  <select v-else-if="field?.type === 'stage'" class="ui-select" :value="modelValue" :aria-label="label" :disabled="disabled" @change="set(($event.target as HTMLSelectElement).value)">
    <option value="">—</option>
    <option v-for="one in stages" :key="one.id" :value="String(one.id)">{{ one.title }}</option>
  </select>
  <select v-else-if="field?.type === 'boolean'" class="ui-select" :value="modelValue" :aria-label="label" :disabled="disabled" @change="set(($event.target as HTMLSelectElement).value)">
    <option value="1">Да</option>
    <option value="0">Нет</option>
  </select>
  <input v-else-if="field?.type === 'date' && !modelValue.includes('{{')" type="date" class="input w-full text-sm" :value="modelValue" :aria-label="label" :disabled="disabled" @input="set(($event.target as HTMLInputElement).value)" />
  <TemplateInput v-else :model-value="modelValue" :label="label" :multiline="field?.type === 'text'" :rows="3" :disabled="disabled" @update:model-value="set" />
</template>
