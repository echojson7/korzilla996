<!-- Поиск компании или контакта в базе CRM для привязки к сделке:
     по названию, имени, телефону, почте. Enter — первый найденный. -->
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { Search } from "@lucide/vue";
import Avatar from "./Avatar.vue";
import { api } from "../../lib/api";
import type { Contact } from "../../lib/crm";

export interface PickedClient { id: number; title?: string; name?: string; post?: string | null; company?: string | null; industry?: string | null; phones: Contact[]; emails: Contact[] }

const props = defineProps<{ kind: "company" | "contact"; skip?: number[] }>();
const emit = defineEmits<{ pick: [one: PickedClient] }>();
const text = ref("");
const rows = ref<PickedClient[]>([]);
const loading = ref(false);
const input = ref<HTMLInputElement | null>(null);
let asked = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function load() {
  const ticket = ++asked;
  loading.value = true;
  try {
    const q = new URLSearchParams({ page: "1" });
    if (text.value.trim()) q.set("q", text.value.trim());
    const out = await api<{ rows: PickedClient[] }>("GET", `crm/${props.kind === "company" ? "companies" : "contacts"}?${q}`);
    if (ticket === asked) rows.value = out.rows.filter((one) => !props.skip?.includes(one.id)).slice(0, 20);
  } catch {
    if (ticket === asked) rows.value = [];
  } finally {
    if (ticket === asked) loading.value = false;
  }
}
watch(text, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
onMounted(() => {
  load();
  setTimeout(() => input.value?.focus(), 30);
});
const label = (one: PickedClient) => one.title ?? one.name ?? "";
const sub = (one: PickedClient) => [one.post, one.company, one.industry, one.phones[0]?.value, one.emails[0]?.value].filter(Boolean).join(" · ");
</script>

<template>
  <div class="flex flex-col">
    <label class="mx-2 mt-2 mb-1 flex items-center gap-2 rounded-xl bg-default px-3">
      <Search class="size-4 shrink-0 text-muted" />
      <input ref="input" v-model="text" class="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" :placeholder="kind === 'company' ? 'Название, телефон, ИНН, сайт' : 'Имя, телефон, почта'" @keydown.enter.prevent="rows[0] && emit('pick', rows[0])" />
    </label>
    <div class="max-h-80 overflow-y-auto p-1 thin-scroll">
      <button v-for="one in rows" :key="one.id" type="button" class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-default" @click="emit('pick', one)">
        <Avatar :name="label(one)" :kind="kind === 'company' ? 'company' : 'person'" size="sm" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm">{{ label(one) }}</span>
          <span v-if="sub(one)" class="block truncate text-xs text-muted">{{ sub(one) }}</span>
        </span>
      </button>
      <p v-if="!rows.length" class="px-3 py-4 text-center text-sm text-muted">{{ loading ? "Ищу…" : "Ничего не нашлось" }}</p>
    </div>
  </div>
</template>
