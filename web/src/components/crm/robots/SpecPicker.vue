<!-- Кто: сотрудник для робота. «Из сделки» (ответственный, создатель, кто
     перевёл), сотрудник из поля сделки или конкретный человек. Значения —
     строки responsible | creator | actor | f:код | u:id (см. Actions.php). -->
<script setup lang="ts">
import { computed } from "vue";
import { X } from "@lucide/vue";
import { crm } from "../../../lib/crm";
import { staffList, person } from "../../../lib/tasks";

const props = defineProps<{ modelValue: string[]; single?: boolean; label: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

const ROLES: Record<string, string> = { responsible: "Ответственный за сделку", creator: "Создатель сделки", actor: "Кто перевёл на стадию" };
const userFields = computed(() => crm.fields.filter((one) => one.type === "user"));
const title = (spec: string) => {
  if (ROLES[spec]) return ROLES[spec];
  if (spec.startsWith("f:")) return `Из поля «${crm.fields.find((one) => one.code === spec.slice(2))?.title ?? spec.slice(2)}»`;
  if (spec.startsWith("u:")) return person(Number(spec.slice(2)))?.name ?? `Сотрудник №${spec.slice(2)}`;
  return spec;
};
const fired = (spec: string) => spec.startsWith("u:") && person(Number(spec.slice(2)))?.active === false;
function add(event: Event) {
  const select = event.target as HTMLSelectElement;
  const spec = select.value;
  select.value = "";
  if (!spec) return;
  emit("update:modelValue", props.single ? [spec] : [...props.modelValue.filter((one) => one !== spec), spec]);
}
const drop = (spec: string) => emit("update:modelValue", props.modelValue.filter((one) => one !== spec));
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div v-if="modelValue.length && !single" class="flex flex-wrap gap-1.5">
      <span v-for="spec in modelValue" :key="spec" class="spec-chip" :class="fired(spec) ? 'opacity-60' : ''">
        {{ title(spec) }}<template v-if="fired(spec)"> · уволен</template>
        <button v-if="!disabled" type="button" class="-mr-1 rounded-full p-0.5 hover:bg-default" :aria-label="`Убрать ${title(spec)}`" @click="drop(spec)"><X class="size-3" /></button>
      </span>
    </div>
    <select class="ui-select" :aria-label="label" :disabled="disabled" :value="single ? modelValue[0] ?? '' : ''" @change="add">
      <option value="" :disabled="single">{{ single ? "Не выбран" : "Добавить…" }}</option>
      <optgroup label="Из сделки">
        <option v-for="(text, key) in ROLES" :key="key" :value="key">{{ text }}</option>
      </optgroup>
      <optgroup v-if="userFields.length" label="Из поля сделки">
        <option v-for="field in userFields" :key="field.code" :value="`f:${field.code}`">{{ field.title }}</option>
      </optgroup>
      <optgroup label="Сотрудники">
        <option v-if="single && modelValue[0]?.startsWith('u:') && fired(modelValue[0])" :value="modelValue[0]">{{ title(modelValue[0]) }} · уволен</option>
        <option v-for="one in staffList" :key="one.id" :value="`u:${one.id}`">{{ one.name }}</option>
      </optgroup>
    </select>
  </div>
</template>

<style scoped>
.spec-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: var(--surface-secondary);
  font-size: 0.8125rem;
}
</style>
