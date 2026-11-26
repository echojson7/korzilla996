<!-- Переслать сообщение: выбрать один или несколько своих чатов. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check } from "@lucide/vue";
import Modal from "./Modal.vue";
import ChatFace from "./ChatFace.vue";
import SearchBox from "../SearchBox.vue";
import { chats, forwardMessage, type ChatMessage } from "../../lib/messenger";

const props = defineProps<{ message: ChatMessage | null }>();
const emit = defineEmits<{ close: []; done: [chatIds: number[]] }>();
const q = ref("");
const picked = ref<number[]>([]);
const busy = ref(false);
watch(() => props.message, () => {
  q.value = "";
  picked.value = [];
});
const list = computed(() => {
  const words = q.value.trim().toLowerCase();
  return words ? chats.value.filter((one) => one.title.toLowerCase().includes(words)) : chats.value;
});
const toggle = (id: number) => (picked.value = picked.value.includes(id) ? picked.value.filter((one) => one !== id) : [...picked.value, id]);
async function send() {
  if (!props.message || !picked.value.length || busy.value) return;
  busy.value = true;
  const ids = [...picked.value];
  if (await forwardMessage(props.message, ids)) emit("done", ids);
  busy.value = false;
}
</script>

<template>
  <Modal :open="!!message" title="Переслать сообщение" @close="emit('close')">
    <SearchBox v-model="q" placeholder="Найти чат" />
    <ul class="mt-2 flex max-h-[50vh] flex-col gap-1 overflow-y-auto thin-scroll" role="list">
      <li v-for="one in list" :key="one.id">
        <button type="button" class="flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-default" :aria-pressed="picked.includes(one.id)" @click="toggle(one.id)">
          <ChatFace :chat="one" size="md" />
          <span class="min-w-0 flex-1 truncate text-[15px] font-medium">{{ one.title }}</span>
          <span class="flex size-[22px] items-center justify-center rounded-full border-2 transition-colors" :class="picked.includes(one.id) ? 'border-accent bg-accent text-accent-foreground' : 'border-separator'"><Check v-if="picked.includes(one.id)" class="size-3.5" /></span>
        </button>
      </li>
      <li v-if="!list.length" class="py-8 text-center text-sm text-muted">Ничего не нашлось</li>
    </ul>
    <template #footer>
      <button type="button" class="button button--secondary" @click="emit('close')">Отмена</button>
      <button type="button" class="button button--primary" :disabled="!picked.length || busy" @click="send">Переслать{{ picked.length ? ` (${picked.length})` : "" }}</button>
    </template>
  </Modal>
</template>
