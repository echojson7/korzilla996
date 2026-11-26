<!-- Список сотрудников с поиском: один щелчок (single) или галочки. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Search } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import { people, meId, type ChatUser } from "../../lib/messenger";

const props = withDefaults(defineProps<{ modelValue?: number[]; single?: boolean; exclude?: number[] }>(), { modelValue: () => [], single: false, exclude: () => [] });
const emit = defineEmits<{ "update:modelValue": [ids: number[]]; pick: [user: ChatUser] }>();
const q = ref("");

const list = computed(() => {
  const words = q.value.trim().toLowerCase();
  return [...people.values()]
    .filter((one) => one.active && one.id !== meId.value && !props.exclude.includes(one.id))
    .filter((one) => !words || `${one.name} ${one.position ?? ""} ${one.department ?? ""}`.toLowerCase().includes(words))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
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
  <div>
    <label class="flex h-10 items-center gap-2 rounded-xl border border-separator bg-field px-3 focus-within:border-accent">
      <Search class="size-4 text-muted" />
      <input v-model="q" type="search" class="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Имя, должность или отдел" aria-label="Поиск сотрудника" autofocus />
    </label>
    <div class="mt-2 max-h-[46vh] overflow-y-auto thin-scroll">
      <button v-for="one in list" :key="one.id" type="button" class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-default" @click="click(one)">
        <ChatFace :user="one" size="sm" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ one.name }}</span>
          <span v-if="one.position || one.department" class="block truncate text-xs text-muted">{{ [one.position, one.department].filter(Boolean).join(" · ") }}</span>
        </span>
        <span v-if="!single" class="flex size-5 items-center justify-center rounded-md border" :class="modelValue.includes(one.id) ? 'border-accent bg-accent text-accent-foreground' : 'border-separator'"><Check v-if="modelValue.includes(one.id)" class="size-3.5" /></span>
      </button>
      <p v-if="!list.length" class="py-8 text-center text-sm text-muted">Никого не нашлось</p>
    </div>
  </div>
</template>
