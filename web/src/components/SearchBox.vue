<!-- Поле поиска HeroUI: лупа, текст, крестик. -->
<script setup lang="ts">
import { Search, X } from "@lucide/vue";

defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <div class="search-field">
    <div class="search-field__group">
      <Search class="search-field__search-icon size-4" data-slot="search-field-search-icon" aria-hidden="true" />
      <input
        class="search-field__input"
        type="search"
        :placeholder="placeholder"
        :value="modelValue"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keydown.esc="$emit('update:modelValue', '')"
      />
      <button v-if="modelValue" type="button" class="search-field__clear-button" slot="clear" aria-label="Очистить" @click="$emit('update:modelValue', '')">
        <X class="size-3.5" />
      </button>
    </div>
  </div>
</template>
