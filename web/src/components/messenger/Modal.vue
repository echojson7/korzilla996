<!-- Окно посередине экрана: Esc и щелчок мимо закрывают. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { X } from "@lucide/vue";

const props = defineProps<{ open: boolean; title: string; width?: string }>();
const emit = defineEmits<{ close: [] }>();
const onKey = (event: KeyboardEvent) => {
  if (props.open && event.key === "Escape") {
    event.stopPropagation();
    emit("close");
  }
};
onMounted(() => document.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey, true));
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-[8vh]" @pointerdown.self="emit('close')">
        <div role="dialog" aria-modal="true" :aria-label="title" class="flex max-h-[84vh] w-full flex-col overflow-hidden rounded-3xl bg-overlay text-overlay-foreground shadow-overlay" :class="width ?? 'max-w-md'">
          <header class="flex items-center gap-2 px-5 pt-4 pb-2">
            <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ title }}</h2>
            <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Закрыть" @click="emit('close')"><X class="size-4" /></button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4 thin-scroll"><slot /></div>
          <footer v-if="$slots.footer" class="flex items-center justify-end gap-2 border-t border-separator px-5 py-3"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
