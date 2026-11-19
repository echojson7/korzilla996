<script setup lang="ts">
import { CircleCheck, CircleAlert, Info } from "@lucide/vue";
import { toasts } from "../lib/toast";
</script>

<template>
  <div class="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2" aria-live="polite">
    <TransitionGroup name="pop">
      <div v-for="one in toasts" :key="one.id" class="pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl bg-overlay px-4 py-3 text-sm text-overlay-foreground shadow-lg">
        <CircleCheck v-if="one.tone === 'success'" class="size-4 shrink-0 text-success" />
        <CircleAlert v-else-if="one.tone === 'danger'" class="size-4 shrink-0 text-danger" />
        <Info v-else class="size-4 shrink-0 text-accent" />
        {{ one.text }}
      </div>
    </TransitionGroup>
  </div>
</template>
