<!-- Мессенджер: слева список чатов, справа открытый чат (#/messenger?chat=12).
     На телефоне — что-то одно. Без сервера (демо) чатов нет. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { MessagesSquare } from "@lucide/vue";
import ChatList from "../components/messenger/ChatList.vue";
import Conversation from "../components/messenger/Conversation.vue";
import NewChat from "../components/messenger/NewChat.vue";
import { enabled, chatById, ready } from "../lib/messenger";
import { route, setQuery } from "../lib/router";

const creating = ref(false);
const selected = computed(() => {
  const id = Number(route.value.query.get("chat"));
  return id && (chatById(id) || !ready.value) ? id : null;
});
const open = (id: number | null) => setQuery({ chat: id }, { replace: false });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col px-3 pt-2 pb-3 md:px-5">
    <div v-if="!enabled" class="sheet m-auto max-w-md rounded-2xl p-8 text-center shadow-surface">
      <MessagesSquare class="mx-auto size-10 text-muted" />
      <p class="mt-3 font-semibold">Мессенджер работает с сервером</p>
      <p class="mt-1 text-sm text-muted">Откройте портал на стенде и войдите под своей учёткой.</p>
    </div>
    <div v-else class="sheet flex min-h-0 flex-1 overflow-hidden rounded-2xl shadow-surface">
      <aside class="w-full shrink-0 border-separator md:w-[340px] md:border-r" :class="selected ? 'hidden md:block' : ''">
        <ChatList :selected="selected" @open="open" @create="creating = true" />
      </aside>
      <div class="min-w-0 flex-1" :class="selected ? '' : 'hidden md:flex'">
        <Conversation v-if="selected" :chat-id="selected" back @back="open(null)" />
        <div v-else class="chat-wall flex h-full w-full flex-col items-center justify-center text-center text-muted">
          <MessagesSquare class="size-12" />
          <p class="mt-3 font-medium text-foreground">Выберите чат</p>
          <p class="text-sm">или <button type="button" class="link" @click="creating = true">начните новый</button></p>
        </div>
      </div>
    </div>
    <NewChat :open="creating" @close="creating = false" @created="(chat) => open(chat.id)" />
  </div>
</template>
