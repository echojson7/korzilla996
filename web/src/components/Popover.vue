<!-- Всплывающая панель у кнопки: меню профиля, уведомления, выбор фона.
     Закрывается щелчком мимо и Esc. -->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(defineProps<{ align?: "left" | "right"; width?: string }>(), { align: "right", width: "w-72" });
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const outside = (event: Event) => {
  if (!root.value?.contains(event.target as Node)) open.value = false;
};
const key = (event: KeyboardEvent) => {
  if (event.key === "Escape") open.value = false;
};
watch(open, (on) => {
  document[on ? "addEventListener" : "removeEventListener"]("pointerdown", outside);
  document[on ? "addEventListener" : "removeEventListener"]("keydown", key as EventListener);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", key as EventListener);
});
const close = () => (open.value = false);
defineExpose({ close });
void props;
</script>

<template>
  <div ref="root" class="relative">
    <slot name="trigger" :open="open" :toggle="() => (open = !open)" />
    <Transition name="pop">
      <div
        v-if="open"
        class="absolute top-full z-50 mt-2 origin-top rounded-2xl bg-overlay p-1.5 text-overlay-foreground shadow-overlay"
        :class="[align === 'right' ? 'right-0' : 'left-0', width]"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>
