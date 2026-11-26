<!-- Текст робота с подстановками {{Название}}: кнопка «{ }» вставляет поле
     сделки туда, где стоит курсор. multiline — многострочное поле. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Braces } from "@lucide/vue";
import Popover from "../../Popover.vue";
import { crm } from "../../../lib/crm";
import { robots } from "../../../lib/robots";

const props = defineProps<{ modelValue: string; multiline?: boolean; placeholder?: string; label: string; disabled?: boolean; rows?: number }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const box = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const menu = ref<InstanceType<typeof Popover> | null>(null);
const q = ref("");
const fields = computed(() => {
  const words = q.value.trim().toLowerCase();
  const own = crm.fields.filter((one) => one.active && one.type !== "file").map((one) => ({ key: one.code, title: one.title }));
  const core = robots.placeholders.map((one) => ({ key: one, title: one }));
  return [...core, ...own].filter((one) => !words || one.title.toLowerCase().includes(words));
});
/* Своё поле вставляется кодом: переименование поля не ломает робота. */
function insert(key: string) {
  const el = box.value;
  const text = props.modelValue ?? "";
  const token = `{{${key}}}`;
  const at = el?.selectionStart ?? text.length;
  const end = el?.selectionEnd ?? at;
  emit("update:modelValue", text.slice(0, at) + token + text.slice(end));
  menu.value?.close();
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(at + token.length, at + token.length);
  });
}
/* Под полем — какие свои поля подставятся (коды непонятны на глаз). */
const used = computed(() => [...(props.modelValue ?? "").matchAll(/\{\{\s*(uf_[a-z0-9_]+|[a-z0-9_]+)\s*\}\}/gi)]
  .map((m) => crm.fields.find((one) => one.code === m[1].toLowerCase()))
  .filter((one, i, list) => one && list.indexOf(one) === i)
  .map((one) => `{{${one!.code}}} — ${one!.title}`));
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="relative">
      <textarea v-if="multiline" ref="box" class="textarea w-full pr-10 text-sm" :rows="rows ?? 4" :value="modelValue" :placeholder="placeholder" :aria-label="label" :disabled="disabled" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
      <input v-else ref="box" class="input w-full pr-10 text-sm" :value="modelValue" :placeholder="placeholder" :aria-label="label" :disabled="disabled" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      <div v-if="!disabled" class="absolute top-1.5 right-1.5">
        <Popover ref="menu" width="w-72">
          <template #trigger="{ toggle }">
            <button type="button" class="button button--ghost button--icon-only button--sm size-7! min-w-7!" title="Вставить поле сделки" aria-label="Вставить поле сделки" @click="toggle"><Braces class="size-4" /></button>
          </template>
          <div class="p-2"><input v-model="q" class="input h-8 w-full text-sm" placeholder="Поле сделки" aria-label="Найти поле" /></div>
          <div class="max-h-72 overflow-y-auto px-1 pb-1 thin-scroll">
            <button v-for="one in fields" :key="one.key" type="button" class="flex w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-default" @click="insert(one.key)">{{ one.title }}</button>
            <p v-if="!fields.length" class="px-2 py-3 text-sm text-muted">Ничего не нашлось</p>
          </div>
        </Popover>
      </div>
    </div>
    <p v-if="used.length" class="text-xs text-muted">{{ used.join(" · ") }}</p>
  </div>
</template>
