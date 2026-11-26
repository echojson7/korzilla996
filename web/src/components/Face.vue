<!-- Аватар сотрудника: буквы в его цвете. -->
<script setup lang="ts">
import { computed } from "vue";
import { WHO, type Person } from "../lib/data";

const props = withDefaults(defineProps<{ who: Person | string; size?: "xs" | "sm" | "md" | "lg" }>(), { size: "sm" });
const one = computed(() => (typeof props.who === "string" ? WHO[props.who] : props.who));
const SIZE = { xs: "size-6", sm: "size-8", md: "size-10", lg: "size-16" };
const TEXT = { xs: "text-[9px] tracking-tighter", sm: "text-xs", md: "text-sm", lg: "text-xl" };
</script>

<template>
  <span v-if="one" class="avatar shrink-0" :class="SIZE[size]" :title="one.name" role="img" :aria-label="one.name">
    <span class="avatar__fallback hue-face font-semibold" :class="TEXT[size]" :style="{ '--hue': one.hue }">{{ one.initials }}</span>
  </span>
</template>
