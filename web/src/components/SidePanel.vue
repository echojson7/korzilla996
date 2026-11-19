<!-- Карточка сущности справа, как слайдер Битрикс24: открывается поверх
     раздела, не уводя со страницы; Esc или щелчок мимо закрывают. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { X } from "@lucide/vue";

const props = defineProps<{ open: boolean; title: string; sub?: string }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);

const onKey = (event: KeyboardEvent) => {
  if (props.open && event.key === "Escape") emit("close");
};
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
watch(() => props.open, async (open) => {
  if (open) {
    await nextTick();
    panel.value?.focus();
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 bg-black/35" @click="emit('close')" />
    </Transition>
    <Transition name="slide">
      <aside
        v-if="open"
        ref="panel"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="fixed inset-y-0 right-0 z-50 flex w-[min(760px,100vw)] flex-col bg-background shadow-2xl outline-none"
      >
        <button
          type="button"
          class="absolute top-4 -left-12 hidden size-9 items-center justify-center rounded-full bg-white/90 text-black shadow md:flex"
          aria-label="Закрыть"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
        <header class="flex items-start gap-3 border-b border-separator bg-surface px-6 py-4">
          <div class="min-w-0 flex-1">
            <h2 class="text-xl font-semibold">{{ title }}</h2>
            <p v-if="sub" class="mt-0.5 text-sm text-muted">{{ sub }}</p>
          </div>
          <button type="button" class="button button--ghost button--sm button--icon-only md:hidden" aria-label="Закрыть" @click="emit('close')">
            <X class="size-4" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-6 thin-scroll"><slot /></div>
        <footer v-if="$slots.footer" class="flex items-center gap-2 border-t border-separator bg-surface px-6 py-3"><slot name="footer" /></footer>
      </aside>
    </Transition>
  </Teleport>
</template>
