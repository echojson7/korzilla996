<!-- Условие как в Битрикс24: строки «поле — оператор — значение», связанные
     «и» / «или». «И» сильнее: a и b или c = (a и b) или c. -->
<script setup lang="ts">
import { Plus, X } from "@lucide/vue";
import ValueInput from "./ValueInput.vue";
import { conditionFields } from "./fields";
import { OPS, type Rule } from "../../../lib/robots";

const props = defineProps<{ modelValue: Rule[]; pipelineId: number; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: Rule[]] }>();
const def = (key: string) => conditionFields.value.find((one) => one.key === key);
const patch = (i: number, part: Partial<Rule>) => emit("update:modelValue", props.modelValue.map((one, j) => (j === i ? { ...one, ...part } : one)));
const add = () => emit("update:modelValue", [...props.modelValue, { field: "amount", op: ">", value: "", join: "and" }]);
const drop = (i: number) => emit("update:modelValue", props.modelValue.filter((_, j) => j !== i));
const noValue = (op: string) => op === "empty" || op === "!empty";
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-for="(rule, i) in modelValue" :key="i">
      <div v-if="i > 0" class="flex justify-center">
        <div class="toggle-button-group toggle-button-group--horizontal" role="radiogroup" aria-label="Связка">
          <button v-for="j in (['and', 'or'] as const)" :key="j" type="button" role="radio" class="toggle-button toggle-button--sm" :aria-checked="rule.join === j" :data-selected="rule.join === j ? 'true' : undefined" :disabled="disabled" @click="patch(i, { join: j })">{{ j === "and" ? "и" : "или" }}</button>
        </div>
      </div>
      <div class="grid grid-cols-[1fr_auto] gap-1.5 rounded-xl border border-separator p-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]">
        <select class="ui-select" :value="rule.field" aria-label="Поле" :disabled="disabled" @change="patch(i, { field: ($event.target as HTMLSelectElement).value, value: '' })">
          <option v-for="one in conditionFields" :key="one.key" :value="one.key">{{ one.title }}</option>
        </select>
        <button type="button" class="button button--ghost button--icon-only button--sm sm:order-last" aria-label="Убрать условие" :disabled="disabled" @click="drop(i)"><X class="size-4" /></button>
        <select class="ui-select" :value="rule.op" aria-label="Оператор" :disabled="disabled" @change="patch(i, { op: ($event.target as HTMLSelectElement).value })">
          <option v-for="(text, op) in OPS" :key="op" :value="op">{{ text }}</option>
        </select>
        <div class="col-span-2 sm:col-span-1">
          <ValueInput v-if="!noValue(rule.op)" :field="def(rule.field)" :model-value="rule.value" label="Значение" :pipeline-id="pipelineId" :disabled="disabled" @update:model-value="(value) => patch(i, { value })" />
        </div>
      </div>
    </template>
    <button v-if="!disabled" type="button" class="button button--ghost button--sm self-start" @click="add"><Plus class="size-4" />{{ modelValue.length ? "Ещё условие" : "Добавить условие" }}</button>
  </div>
</template>
