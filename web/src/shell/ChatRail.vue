<!-- Колонка чатов справа, как в Битрикс24: обложки чатов на стекле,
     непрочитанные — счётчиком. Щелчок открывает чат в панели поверх
     раздела; в самом мессенджере — просто выбирает чат. -->
<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { MessagesSquare, Plus, X } from "@lucide/vue";
import ChatFace from "../components/messenger/ChatFace.vue";
/* Сам чат и окно «Новый чат» — отдельными кусками: нужны по щелчку. */
const Conversation = defineAsyncComponent(() => import("../components/messenger/Conversation.vue"));
const NewChat = defineAsyncComponent(() => import("../components/messenger/NewChat.vue"));
import { chats, enabled, totalUnread, chatById, startMessenger, prefetch } from "../lib/messenger";
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
  <aside v-if="enabled" class="glass on-photo hidden w-[56px] shrink-0 flex-col items-center md:flex" aria-label="Чаты">
    <div class="flex h-14 w-full shrink-0 items-center justify-center">
      <a :href="href('/messenger')" class="relative flex size-10 items-center justify-center rounded-xl transition-colors" :class="onMessenger ? 'bg-white/22 shadow-sm' : 'hover:bg-white/12'" title="Мессенджер" aria-label="Мессенджер">
        <MessagesSquare class="size-[18px]" />
        <span v-if="totalUnread" class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground [text-shadow:none] tabular-nums">{{ totalUnread > 99 ? "99+" : totalUnread }}</span>
      </a>
    </div>
    <div class="mb-2 h-px w-8 shrink-0 bg-white/15" />
    <div class="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto py-1 photo-scroll">
      <button
        v-for="one in visible"
        :key="one.id"
        type="button"
        class="group relative flex size-10 shrink-0 items-center justify-center rounded-full"
        :aria-current="current === one.id ? 'true' : undefined"
        :title="one.title"
        :aria-label="`${one.title}${one.unread ? `, непрочитанных: ${one.unread}` : ''}`"
        @pointerenter="prefetch(one.id)"
        @click="open(one.id)"
      >
        <span v-if="current === one.id" class="absolute top-1/2 -left-2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden="true" />
        <ChatFace :chat="one" size="md" class="[text-shadow:none] transition-[opacity,box-shadow]" :class="current === one.id ? 'shadow-[0_0_0_2px_rgb(255_255_255/0.9)]' : 'opacity-90 group-hover:opacity-100'" />
        <span v-if="one.unread" class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground [text-shadow:none] tabular-nums">{{ one.unread > 99 ? "99+" : one.unread }}</span>
      </button>
    </div>
    <button type="button" class="mt-1 mb-2 flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-white/40 text-white/80 transition-colors hover:border-white/70 hover:bg-white/12 hover:text-white" title="Новый чат" aria-label="Новый чат" @click="creating = true"><Plus class="size-[18px]" /></button>
  </aside>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="panelChat" class="fixed inset-0 z-40 bg-black/25 md:right-[56px]" @click="quick = null" />
    </Transition>
    <Transition name="slide">
      <!-- Мини-чат плавает с отступами; закрывается ярлычком слева,
           выступающим из блока. -->
      <div v-if="panelChat" class="fixed inset-y-2 right-2 left-11 z-50 md:inset-y-3 md:right-[68px] md:left-auto md:w-[min(640px,calc(100vw-120px))]">
        <div class="flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <Conversation :chat-id="panelChat" panel close-tab class="min-h-0 flex-1" @close="quick = null" />
          <button type="button" class="border-t border-separator bg-surface py-2 text-center text-xs text-muted hover:text-foreground" @click="expand">Открыть в мессенджере</button>
        </div>
        <button type="button" class="panel-tab panel-tab--left absolute top-4 -left-9" aria-label="Закрыть чат" title="Закрыть (Esc)" @click="quick = null"><X class="size-5" /></button>
      </div>
    </Transition>
  </Teleport>
  <NewChat :open="creating" @close="creating = false" @created="(chat) => open(chat.id)" />
</template>
