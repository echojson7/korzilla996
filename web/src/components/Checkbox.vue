<!-- Флажок в стиле HeroUI (классы checkbox из @heroui/styles): настоящий
     input внутри для клавиатуры и экранных чтецов, вид — квадрат HeroUI. -->
<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <label class="checkbox ui-check" :data-selected="modelValue ? 'true' : undefined" :data-disabled="disabled ? 'true' : undefined">
    <input
      type="checkbox"
      class="sr-only"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="label"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="checkbox__content inline-flex items-center gap-2.5" data-slot="checkbox-content">
      <span class="checkbox__control size-[18px]!">
        <span class="checkbox__indicator">
          <svg v-if="modelValue" viewBox="0 0 17 18" fill="none" aria-hidden="true" data-slot="checkbox-default-indicator--checkmark">
            <polyline points="1 9 7 14 15 4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
          </svg>
        </span>
      </span>
      <slot />
    </span>
  </label>
</template>
