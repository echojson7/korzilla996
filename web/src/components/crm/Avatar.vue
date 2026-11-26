<!-- Заглушка аватара клиента CRM: буквы на цветном фоне. Компания —
     скруглённый квадрат, человек — круг. Цвет — от названия, у одного
     клиента всегда один. -->
<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ name: string; kind?: "company" | "person"; size?: "sm" | "md" | "lg" }>(), { kind: "person", size: "md" });
const letters = computed(() => {
  const words = props.name.replace(/[«»"'()]/g, " ").replace(/\b(ООО|ОАО|ЗАО|ПАО|АО|ИП|LLC|ltd)\b/gi, " ").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
});
const hue = computed(() => {
  let h = 0;
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
});
const box = computed(() => ({ sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" })[props.size]);
</script>

<template>
  <span class="hue-soft inline-flex shrink-0 items-center justify-center font-semibold select-none" :class="[box, kind === 'company' ? 'rounded-xl' : 'rounded-full']" :style="{ '--hue': hue }" aria-hidden="true">
    <span class="initials">{{ letters }}</span>
  </span>
</template>
