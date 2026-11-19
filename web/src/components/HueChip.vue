<!-- Метка в цвет стадии или статуса (оттенок задаёт сама стадия). -->
<script setup lang="ts">
defineProps<{ hue: number }>();
</script>

<template>
  <span class="hue-soft inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap" :style="{ '--hue': hue }"><slot /></span>
</template>
