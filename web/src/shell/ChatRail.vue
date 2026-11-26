<!-- Колонка чатов справа, как в Битрикс24: обложки чатов на стекле,
     непрочитанные — счётчиком. Щелчок открывает чат в панели поверх
     раздела; в самом мессенджере — просто выбирает чат. -->
<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { MessagesSquare, Plus } from "@lucide/vue";
import ChatFace from "../components/messenger/ChatFace.vue";
/* Сам чат и окно «Новый чат» — отдельными кусками: нужны по щелчку. */
const Conversation = defineAsyncComponent(() => import("../components/messenger/Conversation.vue"));
const NewChat = defineAsyncComponent(() => import("../components/messenger/NewChat.vue"));
import { chats, enabled, totalUnread, chatById, startMessenger } from "../lib/messenger";
import { route, href, setQuery, navigate } from "../lib/router";

const quick = ref<number | null>(null);
const creating = ref(false);
const onMessenger = computed(() => route.value.path === "/messenger");
const current = computed(() => (onMessenger.value ? Number(route.value.query.get("chat")) || null : quick.value));
const visible = computed(() => chats.value.slice(0, 30));

function open(id: number) {
  if (onMessenger.value) setQuery({ chat: id }, { replace: false });
  else quick.value = quick.value === id ? null : id;
}
const panelChat = computed(() => (quick.value && !onMessenger.value && chatById(quick.value) ? quick.value : null));
function expand() {
  const id = quick.value;
  quick.value = null;
  navigate("/messenger", { chat: id });
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === "Escape" && quick.value && !document.querySelector("[aria-modal=true]")) quick.value = null;
};
onMounted(() => {
  startMessenger();
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <aside v-if="enabled" class="glass on-photo hidden w-[68px] shrink-0 flex-col items-center md:flex" aria-label="Чаты">
    <a :href="href('/messenger')" class="relative mt-2.5 flex size-11 items-center justify-center rounded-2xl transition-colors" :class="onMessenger ? 'bg-white/25' : 'hover:bg-white/15'" title="Мессенджер" aria-label="Мессенджер">
      <MessagesSquare class="size-[22px]" />
      <span v-if="totalUnread" class="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-danger-foreground [text-shadow:none] tabular-nums">{{ totalUnread > 99 ? "99+" : totalUnread }}</span>
    </a>
    <div class="my-2 h-px w-8 bg-white/20" />
    <div class="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1 photo-scroll">
      <button
        v-for="one in visible"
        :key="one.id"
        type="button"
        class="relative shrink-0 rounded-full ring-offset-2 ring-offset-transparent transition hover:scale-105"
        :class="current === one.id ? 'ring-2 ring-white' : ''"
        :title="one.title"
        :aria-label="`${one.title}${one.unread ? `, непрочитанных: ${one.unread}` : ''}`"
        @click="open(one.id)"
      >
        <ChatFace :chat="one" size="lg" class="[text-shadow:none] shadow-md" />
        <span v-if="one.unread" class="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground ring-2 ring-black/20 [text-shadow:none] tabular-nums">{{ one.unread > 99 ? "99+" : one.unread }}</span>
      </button>
    </div>
    <button type="button" class="mb-2.5 mt-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-dashed border-white/50 hover:bg-white/15" title="Новый чат" aria-label="Новый чат" @click="creating = true"><Plus class="size-5" /></button>
  </aside>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="panelChat" class="fixed inset-0 z-40 bg-black/25 md:right-[68px]" @click="quick = null" />
    </Transition>
    <Transition name="slide">
      <div v-if="panelChat" class="fixed inset-y-0 right-0 z-50 flex w-full flex-col shadow-2xl md:right-[68px] md:w-[min(640px,calc(100vw-68px))]">
        <Conversation :chat-id="panelChat" panel class="min-h-0 flex-1" @close="quick = null" />
        <button type="button" class="border-t border-separator bg-surface py-2 text-center text-xs text-muted hover:text-foreground" @click="expand">Открыть в мессенджере</button>
      </div>
    </Transition>
  </Teleport>
  <NewChat :open="creating" @close="creating = false" @created="(chat) => open(chat.id)" />
</template>
