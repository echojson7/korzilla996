<!-- Список чатов: поиск, закреплённые сверху, непрочитанные — счётчиком. -->
<script setup lang="ts">
import { entityOf } from "../../lib/entities";
import { computed, defineAsyncComponent, ref } from "vue";
import { SquarePen, Pin, Check, CheckCheck, BellRing, BellOff } from "@lucide/vue";
/* Меню чата — отдельным куском: нужно только по правому щелчку. */
const ChatMenu = defineAsyncComponent(() => import("./ChatMenu.vue"));
import SearchBox from "../SearchBox.vue";
import ChatFace from "./ChatFace.vue";
import { chats, ready, meId, people, when, startDirect, typingIn, prefetch, canNotify, askNotify, type ChatItem } from "../../lib/messenger";
import { toast } from "../../lib/toast";

const props = defineProps<{ selected: number | null }>();
const emit = defineEmits<{ open: [id: number]; create: [] }>();
const q = ref("");
const menu = ref<{ chat: ChatItem; x: number; y: number } | null>(null);

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
  return one.last?.text ?? "Нет сообщений";
};
/* «Вы:» и галочки — только у своих обычных сообщений. */
const mine = (one: ChatItem) => !!one.last && one.last.userId === meId.value && one.last.kind !== "system" && !typingIn(one.id).length;
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
    <div class="flex items-center gap-2 px-3 pt-3 pb-2">
      <SearchBox v-model="q" placeholder="Поиск чатов и людей" class="min-w-0 flex-1" />
      <button type="button" class="button button--primary button--icon-only shrink-0" aria-label="Новый чат" title="Новый чат" @click="emit('create')"><SquarePen class="size-[18px]" /></button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-3 thin-scroll">
      <button v-if="canNotify === 'default'" type="button" class="mx-1 mb-2 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-2xl bg-accent-soft px-3 py-2.5 text-left text-sm text-accent-soft-foreground transition-opacity hover:opacity-90" @click="askNotify">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><BellRing class="size-4" /></span>
        <span class="min-w-0 leading-tight"><span class="block font-medium">Уведомления</span><span class="block text-xs opacity-80">Узнавать о новых сообщениях, даже когда вкладка в фоне</span></span>
      </button>

      <div v-if="!ready" class="flex flex-col gap-1" aria-label="Загружаем чаты">
        <div v-for="i in 6" :key="i" class="flex h-[68px] items-center gap-3 rounded-2xl px-3">
          <span class="size-12 shrink-0 animate-pulse rounded-full bg-default" />
          <span class="flex-1 space-y-2"><span class="block h-3.5 w-2/3 animate-pulse rounded-full bg-default" /><span class="block h-3 w-1/2 animate-pulse rounded-full bg-default" /></span>
        </div>
      </div>
      <div v-else-if="!chats.length" class="px-4 py-12 text-center text-sm text-muted">
        <p class="font-medium text-foreground">Чатов пока нет</p>
        <button type="button" class="button button--secondary button--sm mt-3" @click="emit('create')">Начать переписку</button>
      </div>

      <ul class="flex flex-col gap-1" role="list">
        <li v-for="one in visible" :key="one.id">
          <button
            type="button"
            class="group relative flex h-[68px] w-full items-center gap-3 rounded-2xl px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            :class="selected === one.id ? 'chat-row--on' : 'hover:bg-default/70 active:bg-default'"
            :aria-current="selected === one.id ? 'true' : undefined"
            @pointerenter="prefetch(one.id)"
            @click="emit('open', one.id)"
            @contextmenu.prevent="menu = { chat: one, x: $event.clientX, y: $event.clientY }"
          >
            <ChatFace :chat="one" size="lg" />
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline gap-2">
                <span class="flex min-w-0 flex-1 items-center gap-1 text-[15px] leading-5 font-semibold"><component :is="entityOf(one.entity)!.icon" v-if="entityOf(one.entity)" class="size-3.5 shrink-0 opacity-60" :aria-label="entityOf(one.entity)!.label" /><span class="truncate">{{ one.title }}</span><BellOff v-if="one.muted" class="size-3.5 shrink-0 text-muted" aria-label="Без звука" /></span>
                <span class="flex shrink-0 items-center gap-1 text-xs tabular-nums" :class="one.unread ? 'font-medium text-accent' : 'text-muted'">
                  <template v-if="mine(one)">
                    <CheckCheck v-if="one.readUpTo >= one.last!.id" class="size-3.5 text-accent" aria-label="Прочитано" />
                    <Check v-else class="size-3.5" aria-label="Доставлено" />
                  </template>
                  {{ when(one.last?.at ?? one.at) }}
                </span>
              </span>
              <span class="mt-1 flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-sm leading-5" :class="typingIn(one.id).length ? 'text-accent' : 'text-muted'">
                  <span v-if="mine(one)" class="text-foreground/80">Вы: </span>{{ preview(one) }}
                </span>
                <Pin v-if="one.pinned && !one.unread && !one.markedUnread" class="size-3.5 shrink-0 rotate-45 text-muted" aria-label="Закреплён" />
                <!-- Без звука — счётчик серый; отмечен непрочитанным вручную — точка. -->
                <span
                  v-if="one.unread || one.markedUnread"
                  class="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
                  :class="one.muted ? 'bg-default-foreground/25 text-background' : 'bg-accent text-accent-foreground'"
                  :aria-label="one.unread ? `Непрочитанных: ${one.unread}` : 'Отмечен непрочитанным'"
                >{{ one.unread ? (one.unread > 99 ? "99+" : one.unread) : "" }}</span>
              </span>
            </span>
          </button>
        </li>
      </ul>

      <template v-if="strangers.length">
        <p class="px-3 pt-4 pb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Сотрудники</p>
        <ul class="flex flex-col gap-1" role="list">
          <li v-for="one in strangers" :key="one.id">
            <button type="button" class="flex h-[68px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-default/70" @click="talk(one.id)">
              <ChatFace :user="one" size="lg" />
              <span class="min-w-0 flex-1"><span class="block truncate text-[15px] leading-5 font-semibold">{{ one.name }}</span><span class="mt-1 block truncate text-sm leading-5 text-muted">{{ one.position || "Написать сообщение" }}</span></span>
            </button>
          </li>
        </ul>
      </template>
      <p v-if="ready && chats.length && q && !visible.length && !strangers.length" class="py-10 text-center text-sm text-muted">Ничего не нашлось</p>
    </div>
    <ChatMenu v-if="menu" :key="menu.chat.id" :chat="menu.chat" :x="menu.x" :y="menu.y" @close="menu = null" />
  </div>
</template>
