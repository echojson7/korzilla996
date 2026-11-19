<!-- Сотрудник строкой: аватар, имя и подпись. -->
<script setup lang="ts">
import { WHO } from "../lib/data";
import Face from "./Face.vue";

defineProps<{ id: string; sub?: string }>();
</script>

<template>
  <span v-if="WHO[id]" class="inline-flex min-w-0 items-center gap-2">
    <Face :who="id" size="xs" />
    <span class="min-w-0">
      <span class="block truncate">{{ WHO[id].name }}</span>
      <span v-if="sub" class="block truncate text-xs text-muted">{{ sub }}</span>
    </span>
  </span>
</template>
