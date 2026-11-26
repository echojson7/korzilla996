<!-- Карточка сущности поверх раздела, как слайдер Битрикс24: слева
     плавающая панель карточки, справа на оставшуюся ширину — чат этой
     задачи или сделки (один на сущность, живёт в мессенджере). Обе с
     отступами от краёв экрана и скруглениями. Esc или щелчок мимо закрывают. -->
<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { X, MessagesSquare } from "@lucide/vue";
import { enabled, openEntityChat } from "../lib/messenger";

/* Лента чата — отдельным куском: грузится, только когда нужна. */
const Conversation = defineAsyncComponent(() => import("./messenger/Conversation.vue"));

const props = defineProps<{ open: boolean; title: string; sub?: string; chat?: { entity: string; title: string } | null }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const chatId = ref<number | null>(null);
const chatFailed = ref(false);

const onKey = (event: KeyboardEvent) => {
  if (props.open && event.key === "Escape" && !(event.target as HTMLElement | null)?.closest?.("textarea, input")) emit("close");
};
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
watch(() => props.open, async (open) => {
  if (open) {
    await nextTick();
    panel.value?.focus();
  }
});

/* Чат сущности подтягиваем, когда карточка открыта. */
watch(() => [props.open, props.chat?.entity, enabled.value] as const, async ([open, entity, on]) => {
  chatFailed.value = false;
  if (!open || !entity || !on) return void (chatId.value = null);
  try {
    const one = await openEntityChat(entity, props.chat!.title);
    if (props.chat?.entity === entity) chatId.value = one.id;
  } catch {
    chatFailed.value = true;
  }
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
    </Transition>
    <div v-if="open" class="fixed inset-0 z-50 flex gap-3 p-2 md:p-3" @click.self="emit('close')">
      <Transition name="slide-left" appear>
        <aside
          ref="panel"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl bg-background shadow-2xl outline-none"
          :class="chat ? 'lg:w-[min(640px,48%)]' : 'md:w-[min(760px,100%)]'"
        >
          <header class="flex items-start gap-3 border-b border-separator bg-surface px-6 py-4">
            <div class="min-w-0 flex-1">
              <h2 class="text-xl font-semibold">{{ title }}</h2>
              <p v-if="sub" class="mt-0.5 text-sm text-muted">{{ sub }}</p>
            </div>
            <button type="button" class="button button--ghost button--sm button--icon-only -mr-2" aria-label="Закрыть" title="Закрыть (Esc)" @click="emit('close')">
              <X class="size-5" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto p-6 thin-scroll"><slot /></div>
          <footer v-if="$slots.footer" class="flex items-center gap-2 border-t border-separator bg-surface px-6 py-3"><slot name="footer" /></footer>
        </aside>
      </Transition>

      <Transition name="slide" appear>
        <section v-if="chat" class="hidden min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl lg:flex" :aria-label="`Чат: ${chat.title}`">
          <Conversation v-if="chatId" :chat-id="chatId" class="min-h-0 flex-1" />
          <div v-else class="chat-wall flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-muted">
            <MessagesSquare class="size-10" />
            <p class="mt-3 font-medium text-foreground">Чат {{ chat.title.toLowerCase().startsWith("задача") ? "задачи" : "карточки" }}</p>
            <p v-if="!enabled" class="mt-1 max-w-xs">Чат карточки работает с сервером: откройте портал на стенде.</p>
            <p v-else-if="chatFailed" class="mt-1">Не получилось открыть чат.</p>
            <p v-else class="mt-1">Открываем…</p>
          </div>
        </section>
      </Transition>
    </div>
  </Teleport>
</template>
