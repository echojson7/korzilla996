<!-- Новый чат: личный (щелчок по человеку) или групповой (название и
     участники галочками). -->
<script setup lang="ts">
import { ref, watch } from "vue";
import Modal from "./Modal.vue";
import PeoplePicker from "./PeoplePicker.vue";
import { startDirect, createGroup, type ChatItem, type ChatUser } from "../../lib/messenger";
import { ApiError } from "../../lib/api";
import { toast } from "../../lib/toast";
import { can } from "../../lib/access";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [chat: ChatItem] }>();
const mode = ref<"direct" | "group">("direct");
const title = ref("");
const picked = ref<number[]>([]);
const busy = ref(false);

watch(() => props.open, (on) => {
  if (on) {
    mode.value = "direct";
    title.value = "";
    picked.value = [];
  }
});

async function run(job: () => Promise<ChatItem>) {
  if (busy.value) return;
  busy.value = true;
  try {
    emit("created", await job());
    emit("close");
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось создать чат", "danger");
  } finally {
    busy.value = false;
  }
}
const direct = (one: ChatUser) => run(() => startDirect(one.id));
const group = () => {
  if (!title.value.trim()) return toast("Назовите чат", "danger");
  run(() => createGroup(title.value.trim(), picked.value));
};
</script>

<template>
  <Modal :open="open" title="Новый чат" @close="emit('close')">
    <div v-if="can('messenger', 'chats')" class="toggle-button-group toggle-button-group--horizontal mb-3 grid w-full grid-cols-2" role="radiogroup" aria-label="Вид чата">
      <button v-for="one in ([['direct', 'Личный'], ['group', 'Групповой']] as const)" :key="one[0]" type="button" role="radio" class="toggle-button justify-center" :aria-checked="mode === one[0]" :data-selected="mode === one[0] ? 'true' : undefined" @click="mode = one[0]">{{ one[1] }}</button>
    </div>
    <PeoplePicker v-if="mode === 'direct'" single @pick="direct" />
    <template v-else>
      <input v-model="title" class="input mb-3 w-full" maxlength="120" placeholder="Название чата, например «Отдел продаж»" aria-label="Название чата" @keydown.enter="group" />
      <p class="mb-1 text-xs text-muted">Участники{{ picked.length ? `: ${picked.length}` : "" }}</p>
      <PeoplePicker v-model="picked" />
    </template>
    <template v-if="mode === 'group'" #footer>
      <button type="button" class="button button--secondary" @click="emit('close')">Отмена</button>
      <button type="button" class="button button--primary" :disabled="busy" @click="group">Создать чат</button>
    </template>
  </Modal>
</template>
