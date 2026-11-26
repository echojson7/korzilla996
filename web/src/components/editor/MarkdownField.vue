<!-- Обёртка редактора описаний: сам редактор (Tiptap) грузится отдельным
     куском при первом показе, пока он едет — текст как есть. -->
<script setup lang="ts">
import { defineAsyncComponent, h } from "vue";

const props = defineProps<{ modelValue?: string | null; editable?: boolean; placeholder?: string; minHeight?: string }>();
const emit = defineEmits<{ "update:modelValue": [string]; save: [string] }>();

const Editor = defineAsyncComponent({
  loader: () => import("./MarkdownEditor.vue"),
  loadingComponent: { render: () => h("div", { class: "md px-3 py-2 whitespace-pre-wrap text-muted" }, props.modelValue || props.placeholder || "") },
  delay: 0,
});
</script>

<template>
  <Editor
    :model-value="modelValue"
    :editable="editable !== false"
    :placeholder="placeholder"
    :min-height="minHeight"
    @update:model-value="(value: string) => emit('update:modelValue', value)"
    @save="(value: string) => emit('save', value)"
  />
</template>
