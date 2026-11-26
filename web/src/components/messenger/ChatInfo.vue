<!-- О чате: обложка и название группы, участники, добавить, выйти.
     Для личного чата — карточка собеседника. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Camera, LogOut, Trash2, UserPlus, Crown, X, Pencil } from "@lucide/vue";
import Modal from "./Modal.vue";
import ChatFace from "./ChatFace.vue";
import { href } from "../../lib/router";
import PeoplePicker from "./PeoplePicker.vue";
import { person, meId, renameChat, addMembers, removeMember, setCover, type ChatItem } from "../../lib/messenger";
import { auth } from "../../lib/session";
import { ApiError } from "../../lib/api";
import { toast } from "../../lib/toast";

const props = defineProps<{ open: boolean; chat: ChatItem | null }>();
const emit = defineEmits<{ close: []; left: [] }>();

const adding = ref(false);
const picked = ref<number[]>([]);
const title = ref("");
const renaming = ref(false);
const cover = ref<HTMLInputElement | null>(null);

watch(() => props.open, () => {
  adding.value = false;
  picked.value = [];
  renaming.value = false;
  title.value = props.chat?.title ?? "";
});

const group = computed(() => props.chat?.type === "group");
const manager = computed(() => !!props.chat && (props.chat.createdBy === meId.value || auth.me?.permissions.includes("*")));
const members = computed(() => (props.chat?.members ?? []).map((id) => person(id)).filter((one) => !!one).sort((a, b) => a!.name.localeCompare(b!.name, "ru")));
const peer = computed(() => person(props.chat?.peer));

async function guard(job: () => Promise<unknown>, fail: string) {
  try {
    await job();
  } catch (error) {
    toast(error instanceof ApiError ? error.first : fail, "danger");
  }
}
const saveTitle = () => props.chat && title.value.trim() && guard(async () => {
  await renameChat(props.chat!.id, title.value.trim());
  renaming.value = false;
}, "Не получилось переименовать");
const saveMembers = () => props.chat && picked.value.length && guard(async () => {
  await addMembers(props.chat!.id, picked.value);
  adding.value = false;
  picked.value = [];
}, "Не получилось добавить");
const kick = (id: number) => props.chat && guard(() => removeMember(props.chat!.id, id), "Не получилось убрать участника");
const leave = () => props.chat && guard(async () => {
  if (!confirmLeave.value) return (confirmLeave.value = true);
  await removeMember(props.chat!.id, meId.value);
  emit("left");
  emit("close");
}, "Не получилось выйти из чата");
const confirmLeave = ref(false);
watch(() => props.open, () => (confirmLeave.value = false));

function onCover(event: Event) {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = "";
  if (file && props.chat) guard(() => setCover(props.chat!.id, file), "Обложка не загрузилась");
}
</script>

<template>
  <Modal :open="open && !!chat" :title="group ? 'О чате' : 'Собеседник'" @close="emit('close')">
    <template v-if="chat">
      <div class="flex flex-col items-center pt-2 pb-4 text-center">
        <div class="relative">
          <ChatFace :chat="chat" size="xl" />
          <button v-if="group" type="button" class="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground shadow" aria-label="Сменить обложку" title="Сменить обложку" @click="cover?.click()"><Camera class="size-4" /></button>
          <input ref="cover" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" @change="onCover" />
        </div>
        <button v-if="group && chat.avatar" type="button" class="link mt-2 text-xs" @click="guard(() => setCover(chat!.id, null), 'Не получилось убрать обложку')">Убрать обложку</button>
        <div v-if="renaming" class="mt-3 flex w-full gap-2">
          <input v-model="title" class="input min-w-0 flex-1" maxlength="120" aria-label="Название чата" @keydown.enter="saveTitle" @keydown.esc.stop="renaming = false" />
          <button type="button" class="button button--primary" @click="saveTitle">Сохранить</button>
        </div>
        <p v-else class="mt-3 flex items-center gap-1.5 text-lg font-semibold">
          {{ chat.title }}
          <button v-if="group && manager" type="button" class="button button--ghost button--sm button--icon-only" aria-label="Переименовать" @click="renaming = true"><Pencil class="size-3.5" /></button>
        </p>
        <p v-if="!group && peer" class="text-sm text-muted">{{ [peer.position, peer.department].filter(Boolean).join(" · ") || "Сотрудник" }}</p>
        <p v-if="!group && peer?.status" class="mt-1 text-sm">{{ peer.status.emoji }} {{ peer.status.text }}</p>
        <a v-if="!group && peer" :href="href('/profile', { id: peer.id })" class="button button--secondary button--sm mt-3" @click="emit('close')">Открыть профиль</a>
        <p v-else-if="group" class="text-sm text-muted">Участников: {{ chat.members.length }}</p>
      </div>

      <template v-if="group">
        <div v-if="adding">
          <PeoplePicker v-model="picked" :exclude="chat.members" />
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" class="button button--secondary" @click="adding = false">Отмена</button>
            <button type="button" class="button button--primary" :disabled="!picked.length" @click="saveMembers">Добавить{{ picked.length ? ` (${picked.length})` : "" }}</button>
          </div>
        </div>
        <template v-else>
          <p v-if="chat.general" class="mb-2 rounded-xl bg-surface-secondary px-3 py-2 text-sm text-muted">Общий чат портала: в нём все сотрудники, новые попадают сюда сами.</p>
          <button v-if="!chat.general" type="button" class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-accent hover:bg-default" @click="adding = true"><UserPlus class="size-5" />Добавить участников</button>
          <div v-for="one in members" :key="one!.id" class="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-default">
            <a :href="href('/profile', { id: one!.id })" class="rounded-full" :aria-label="`Профиль: ${one!.name}`" @click="emit('close')"><ChatFace :user="one" size="sm" /></a>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1 truncate text-sm font-medium">{{ one!.name }}<span v-if="one!.id === meId" class="text-muted">(вы)</span><Crown v-if="one!.id === chat.createdBy" class="size-3.5 text-warning" aria-label="Создатель чата" /></span>
              <span v-if="one!.position" class="block truncate text-xs text-muted">{{ one!.position }}</span>
            </span>
            <button v-if="manager && !chat.general && one!.id !== meId" type="button" class="button button--ghost button--sm button--icon-only opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Убрать из чата" @click="kick(one!.id)"><X class="size-4" /></button>
          </div>
          <button v-if="!chat.general" type="button" class="mt-3 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-danger hover:bg-danger/10" @click="leave">
            <component :is="confirmLeave ? Trash2 : LogOut" class="size-5" />{{ confirmLeave ? "Точно выйти? Нажмите ещё раз" : "Выйти из чата" }}
          </button>
        </template>
      </template>
    </template>
  </Modal>
</template>
