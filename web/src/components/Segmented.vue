<!-- Переключатель вкладок (группа кнопок HeroUI) со счётчиками. -->
<script setup lang="ts">
defineProps<{ items: { key: string; label: string; count?: number }[]; modelValue: string; label: string }>();
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <div class="toggle-button-group toggle-button-group--horizontal max-w-full overflow-x-auto [scrollbar-width:none]" role="radiogroup" :aria-label="label">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      role="radio"
      class="toggle-button toggle-button--sm gap-1.5"
      :aria-checked="modelValue === item.key"
      :data-selected="modelValue === item.key ? 'true' : undefined"
      @click="$emit('update:modelValue', item.key)"
    >
      {{ item.label }}
      <span v-if="item.count != null" class="text-xs tabular-nums opacity-60">{{ item.count }}</span>
    </button>
  </div>
</template>
