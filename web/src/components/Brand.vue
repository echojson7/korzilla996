<!-- Название портала: «Korzilla» в Onest и 996 в рамке, как номер кабинета.
     compact — только рамка с 996 (свёрнутое меню). Цвет берётся из currentColor. -->
<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>

<template>
  <span class="brand" :class="{ 'brand--compact': compact }" aria-label="Korzilla 996">
    <span v-if="!compact" class="brand__name">Korzilla</span>
    <span class="brand__num">996</span>
  </span>
</template>

<style scoped>
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  line-height: 1;
  white-space: nowrap;
}
.brand__name {
  font-weight: 650;
  letter-spacing: -0.03em;
}
.brand__num {
  font-family: var(--font-brand-mono);
  font-weight: 600;
  font-size: 0.58em;
  letter-spacing: 0.04em;
  border: max(1.5px, 0.075em) solid currentColor;
  border-radius: 0.2em;
  padding: 0.14em 0.22em 0.12em;
}
.brand--compact .brand__num {
  font-size: 13px;
  border-width: 2px;
  border-radius: 7px;
  padding: 7px 5px 6px;
}
</style>
