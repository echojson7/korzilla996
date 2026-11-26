<!-- Заголовок раздела на фото и строка фильтров под ним. -->
<script setup lang="ts">
defineProps<{ title: string; sub?: string }>();
</script>

<template>
  <div class="shrink-0 px-3 pt-2 md:px-5">
    <div class="on-photo flex flex-wrap items-end gap-x-4 gap-y-2 pb-3">
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-[26px] leading-tight font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="sub" class="mt-0.5 text-sm text-white/80">{{ sub }}</p>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-2 [text-shadow:none]"><slot name="actions" /></div>
    </div>
    <div v-if="$slots.toolbar" class="photo-toolbar mb-3 flex flex-wrap items-center gap-2"><slot name="toolbar" /></div>
  </div>
</template>
