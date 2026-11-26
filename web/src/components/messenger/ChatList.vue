<!-- Список чатов: поиск, закреплённые сверху, непрочитанные — счётчиком. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, SquarePen, Pin } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import { Bell } from "@lucide/vue";
import { chats, ready, meId, people, when, startDirect, typingIn, prefetch, canNotify, askNotify, type ChatItem } from "../../lib/messenger";
import { toast } from "../../lib/toast";

const props = defineProps<{ selected: number | null }>();
const emit = defineEmits<{ open: [id: number]; create: [] }>();
const q = ref("");

const visible = computed(() => {
  const words = q.value.trim().toLowerCase();
  return words ? chats.value.filter((one) => one.title.toLowerCase().includes(words)) : chats.value;
});
/* В поиске — и сотрудники, с кем чата ещё нет. */
const strangers = computed(() => {
  const words = q.value.trim().toLowerCase();
  if (!words) return [];
  const talked = new Set(chats.value.filter((one) => one.type === "direct").map((one) => one.peer));
  return [...people.values()].filter((one) => one.active && one.id !== meId.value && !talked.has(one.id) && one.name.toLowerCase().includes(words)).slice(0, 8);
});
const preview = (one: ChatItem) => {
  const typers = typingIn(one.id);
  if (typers.length) return one.type === "group" ? `${typers[0].name.split(" ")[0]} печатает…` : "печатает…";
  return one.last ? `${one.last.userId === meId.value && one.last.kind !== "system" ? "Вы: " : ""}${one.last.text}` : "Нет сообщений";
};
async function talk(id: number) {
  try {
    const chat = await startDirect(id);
    q.value = "";
    emit("open", chat.id);
  } catch {
    toast("Не получилось открыть чат", "danger");
  }
}
void props;
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-2 p-3">
      <label class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-separator bg-field px-3 focus-within:border-accent">
        <Search class="size-4 shrink-0 text-muted" />
        <input v-model="q" type="search" class="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Поиск чатов и людей" aria-label="Поиск чатов и людей" />
      </label>
      <button type="button" class="button button--primary button--icon-only shrink-0" aria-label="Новый чат" title="Новый чат" @click="emit('create')"><SquarePen class="size-[18px]" /></button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2 thin-scroll">
      <button v-if="canNotify === 'default'" type="button" class="mb-2 flex w-full items-center gap-2.5 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm text-accent-soft-foreground" @click="askNotify">
        <Bell class="size-4 shrink-0" /><span>Включить уведомления о новых сообщениях</span>
      </button>
      <p v-if="!ready" class="py-10 text-center text-sm text-muted">Загружаем чаты…</p>
      <div v-else-if="!chats.length" class="px-4 py-10 text-center text-sm text-muted">
        <p>Чатов пока нет.</p>
        <button type="button" class="link mt-1" @click="emit('create')">Начать переписку</button>
      </div>
      <button
        v-for="one in visible"
        :key="one.id"
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
        :class="selected === one.id ? 'bg-accent-soft' : 'hover:bg-default'"
        @pointerenter="prefetch(one.id)"
        @click="emit('open', one.id)"
      >
        <ChatFace :chat="one" size="lg" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="min-w-0 flex-1 truncate text-[15px] font-semibold">{{ one.title }}</span>
            <Pin v-if="one.pinned" class="size-3 shrink-0 text-muted" aria-label="Закреплён" />
            <span class="shrink-0 text-xs text-muted">{{ when(one.last?.at ?? one.at) }}</span>
          </span>
          <span class="mt-0.5 flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm" :class="typingIn(one.id).length ? 'text-accent' : 'text-muted'">{{ preview(one) }}</span>
            <span v-if="one.unread" class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground tabular-nums">{{ one.unread > 99 ? "99+" : one.unread }}</span>
          </span>
        </span>
      </button>
      <template v-if="strangers.length">
        <p class="px-3 pt-3 pb-1 text-xs font-semibold text-muted uppercase">Сотрудники</p>
        <button v-for="one in strangers" :key="one.id" type="button" class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-default" @click="talk(one.id)">
          <ChatFace :user="one" size="lg" />
          <span class="min-w-0 flex-1"><span class="block truncate text-[15px] font-semibold">{{ one.name }}</span><span class="block truncate text-sm text-muted">{{ one.position || "Написать" }}</span></span>
        </button>
      </template>
      <p v-if="ready && chats.length && q && !visible.length && !strangers.length" class="py-8 text-center text-sm text-muted">Ничего не нашлось</p>
    </div>
  </div>
</template>
