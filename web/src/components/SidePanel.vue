<!-- Карточка сущности поверх раздела, как слайдер Битрикс24: один
     плавающий блок с отступами и скруглением, слева карточка (уже), справа
     чат этой задачи или сделки (один на сущность, живёт в мессенджере).
     Закрывает ярлычок слева, Esc или щелчок мимо. Колонка чатов справа
     остаётся открытой: из неё поверх карточки открываются мини-чаты. -->
<script setup lang="ts">
import { backdrop } from "../lib/backdrop";
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { X, MessagesSquare } from "@lucide/vue";
import { enabled, openEntityChat } from "../lib/messenger";

/* Лента чата — отдельным куском: грузится, только когда нужна. */
const Conversation = defineAsyncComponent(() => import("./messenger/Conversation.vue"));

/* sideLabel и слот side — вторая вкладка правой области (например, история
   задачи): в шапке области переключатель «Чат / <sideLabel>». */
const props = defineProps<{ open: boolean; title: string; sub?: string; chat?: { entity: string; title: string } | null; sideLabel?: string }>();
const emit = defineEmits<{ close: [] }>();
const shut = backdrop(() => emit("close"));
const panel = ref<HTMLElement | null>(null);
const chatId = ref<number | null>(null);
const chatFailed = ref(false);
const sideMode = ref<"chat" | "side">("chat");
watch(() => props.chat?.entity, () => (sideMode.value = "chat"));

const onKey = (event: KeyboardEvent) => {
  if (props.open && event.key === "Escape" && !(event.target as HTMLElement | null)?.closest?.("textarea, input, [contenteditable=true]")) emit("close");
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
      <div v-if="open" class="fixed inset-0 z-40 bg-black/40 md:right-[56px]" />
    </Transition>
    <div v-if="open" class="fixed inset-0 z-50 flex p-2 md:right-[56px] md:py-3 md:pr-3 md:pl-12" v-on="shut">
      <Transition name="slide-left" appear>
        <!-- Карточка и чат — один цельный блок: карточка уже, чат шире. -->
        <div class="relative flex min-w-0 overflow-visible" :class="chat ? 'w-full' : 'w-full md:w-[min(760px,100%)]'">
          <div class="flex min-w-0 flex-1 overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
            <aside
              ref="panel"
              tabindex="-1"
              role="dialog"
              aria-modal="true"
              data-card
              :aria-label="title"
              class="flex w-full min-w-0 shrink-0 flex-col outline-none"
              :class="chat ? 'lg:w-[clamp(400px,38%,560px)] lg:border-r lg:border-separator' : ''"
            >
              <header class="flex items-start gap-3 border-b border-separator bg-surface px-6 py-4">
                <div class="min-w-0 flex-1">
                  <slot name="title"><h2 class="text-xl font-semibold">{{ title }}</h2></slot>
                  <p v-if="sub" class="mt-0.5 text-sm text-muted">{{ sub }}</p>
                </div>
                <button type="button" class="button button--ghost button--sm button--icon-only -mr-2 md:hidden" aria-label="Закрыть" @click="emit('close')">
                  <X class="size-5" />
                </button>
              </header>
              <div class="relative min-h-0 flex-1 overflow-y-auto p-6 thin-scroll"><slot /></div>
              <footer v-if="$slots.footer" class="flex items-center gap-2 border-t border-separator bg-surface px-6 py-3"><slot name="footer" /></footer>
            </aside>

            <section v-if="chat" class="hidden min-w-0 flex-1 flex-col bg-surface lg:flex" :aria-label="`Чат: ${chat.title}`">
              <!-- Переключатель «Чат / История» в шапке правой области -->
              <div v-show="sideMode === 'chat'" class="flex min-h-0 flex-1 flex-col">
                <Conversation v-if="chatId" :chat-id="chatId" class="min-h-0 flex-1">
                  <template v-if="sideLabel" #header-extra>
                    <div class="toggle-button-group toggle-button-group--horizontal shrink-0" role="tablist">
                      <button type="button" role="tab" class="toggle-button toggle-button--sm" aria-selected="true" data-selected="true">Чат</button>
                      <button type="button" role="tab" class="toggle-button toggle-button--sm" aria-selected="false" @click="sideMode = 'side'">{{ sideLabel }}</button>
                    </div>
                  </template>
                </Conversation>
                <div v-else class="chat-wall flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-muted">
                  <MessagesSquare class="size-10" />
                  <p class="mt-3 font-medium text-foreground">Чат {{ chat.title.toLowerCase().startsWith("задача") ? "задачи" : "карточки" }}</p>
                  <p v-if="!enabled" class="mt-1 max-w-xs">Чат карточки работает с сервером: откройте портал на стенде.</p>
                  <p v-else-if="chatFailed" class="mt-1">Не получилось открыть чат.</p>
                  <p v-else class="mt-1">Открываем…</p>
                  <button v-if="sideLabel" type="button" class="button button--secondary button--sm mt-4" @click="sideMode = 'side'">{{ sideLabel }}</button>
                </div>
              </div>
              <div v-if="sideLabel" v-show="sideMode === 'side'" class="flex min-h-0 flex-1 flex-col">
                <header class="flex h-16 shrink-0 items-center gap-3 border-b border-separator px-3 md:px-4">
                  <h3 class="min-w-0 flex-1 truncate font-semibold">{{ sideLabel }}</h3>
                  <div class="toggle-button-group toggle-button-group--horizontal shrink-0" role="tablist">
                    <button type="button" role="tab" class="toggle-button toggle-button--sm" aria-selected="false" @click="sideMode = 'chat'">Чат</button>
                    <button type="button" role="tab" class="toggle-button toggle-button--sm" aria-selected="true" data-selected="true">{{ sideLabel }}</button>
                  </div>
                </header>
                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2 thin-scroll"><slot name="side" /></div>
              </div>
            </section>
          </div>
          <button type="button" class="panel-tab panel-tab--left absolute top-4 -left-9 hidden md:flex" aria-label="Закрыть" title="Закрыть (Esc)" @click="emit('close')"><X class="size-5" /></button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
