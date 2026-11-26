<!-- Выбор сотрудника для задачи: поиск, один щелчок (single) или галочки.
     Себя тоже можно выбрать — «я» стоит первым. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Search } from "@lucide/vue";
import ChatFace from "../messenger/ChatFace.vue";
import { staffList, taskStore, type ChatUser } from "../../lib/tasks";

const props = withDefaults(defineProps<{ modelValue?: number[]; single?: boolean }>(), { modelValue: () => [], single: false });
const emit = defineEmits<{ "update:modelValue": [ids: number[]]; pick: [user: ChatUser] }>();
const q = ref("");

const list = computed(() => {
  const words = q.value.trim().toLowerCase();
  return staffList.value
    .filter((one) => !words || `${one.name} ${one.position ?? ""} ${one.department ?? ""}`.toLowerCase().includes(words))
    .sort((a, b) => Number(b.id === taskStore.me) - Number(a.id === taskStore.me));
});
function click(one: ChatUser) {
  if (props.single) return emit("pick", one);
  const set = new Set(props.modelValue);
  if (set.has(one.id)) set.delete(one.id);
  else set.add(one.id);
  emit("update:modelValue", [...set]);
}
</script>

<template>
  <div class="p-1">
    <label class="flex h-9 items-center gap-2 rounded-xl border border-separator bg-field px-3 focus-within:border-accent">
      <Search class="size-4 text-muted" />
      <input v-model="q" type="search" class="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Имя, должность или отдел" aria-label="Поиск сотрудника" autofocus />
    </label>
    <div class="mt-1.5 max-h-72 overflow-y-auto thin-scroll">
      <button v-for="one in list" :key="one.id" type="button" class="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-default" @click="click(one)">
        <ChatFace :user="one" size="xs" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm">{{ one.name }}<span v-if="one.id === taskStore.me" class="text-muted"> (я)</span></span>
          <span v-if="one.position" class="block truncate text-xs text-muted">{{ one.position }}</span>
        </span>
        <Check v-if="modelValue.includes(one.id)" class="size-4 text-accent" />
      </button>
      <p v-if="!list.length" class="py-6 text-center text-sm text-muted">Никого не нашлось</p>
    </div>
  </div>
</template>
