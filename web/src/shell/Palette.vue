<!-- Поиск по порталу (Ctrl+K): разделы, сделки, задачи, сотрудники.
     Стрелки выбирают, Enter открывает. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Search, Briefcase, ListChecks, User, CornerDownLeft } from "@lucide/vue";
import { PAGES } from "../pages";
import { deals, tasks, WHO } from "../lib/data";
import { people } from "../lib/messenger";
import { navigate } from "../lib/router";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const text = ref("");
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

interface Hit {
  group: string;
  label: string;
  hint?: string;
  icon: unknown;
  go: () => void;
}
const has = (value: string, words: string) => value.toLowerCase().includes(words);

const hits = computed<Hit[]>(() => {
  const words = text.value.trim().toLowerCase();
  const out: Hit[] = PAGES.filter((one) => !words || has(one.title, words)).map((one) => ({ group: "Разделы", label: one.title, icon: one.icon, go: () => navigate(one.path) }));
  if (!words) return out;
  for (const one of deals) if (has(`${one.title} ${one.company} ${one.id}`, words)) out.push({ group: "Сделки", label: one.title, hint: one.company, icon: Briefcase, go: () => navigate("/deals", { funnel: one.funnel, open: one.id }) });
  for (const one of tasks) if (has(`${one.title} ${one.id}`, words)) out.push({ group: "Задачи", label: one.title, hint: WHO[one.owner].name, icon: ListChecks, go: () => navigate("/tasks", { tab: "all", open: one.id }) });
  for (const one of people.values()) if (one.active && has(`${one.name} ${one.position ?? ""} ${one.department ?? ""}`, words)) out.push({ group: "Сотрудники", label: one.name, hint: one.position ?? undefined, icon: User, go: () => navigate("/staff", { q: one.name }) });
  return out.slice(0, 40);
});

watch(() => props.open, async (open) => {
  if (!open) return;
  text.value = "";
  active.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(text, () => (active.value = 0));

function pick(hit?: Hit) {
  if (!hit) return;
  hit.go();
  emit("close");
}
function key(event: KeyboardEvent) {
  if (event.key === "ArrowDown") active.value = Math.min(active.value + 1, hits.value.length - 1);
  else if (event.key === "ArrowUp") active.value = Math.max(active.value - 1, 0);
  else if (event.key === "Enter") pick(hits.value[active.value]);
  else if (event.key === "Escape") emit("close");
  else return;
  event.preventDefault();
  nextTick(() => document.querySelector(`[data-hit="${active.value}"]`)?.scrollIntoView({ block: "nearest" }));
}
const groupStart = (i: number) => i === 0 || hits.value[i - 1].group !== hits.value[i].group;
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]" @click.self="emit('close')">
        <div class="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-overlay text-overlay-foreground shadow-overlay" role="dialog" aria-label="Поиск по порталу">
          <div class="flex items-center gap-3 border-b border-separator px-4">
            <Search class="size-5 shrink-0 text-muted" />
            <input ref="input" v-model="text" class="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" placeholder="Сделка, задача, сотрудник или раздел" @keydown="key" />
            <kbd class="kbd text-xs">Esc</kbd>
          </div>
          <ul class="min-h-0 flex-1 overflow-y-auto p-2 thin-scroll" role="listbox">
            <template v-for="(hit, i) in hits" :key="`${hit.group}-${hit.label}-${i}`">
              <li v-if="groupStart(i)" class="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{{ hit.group }}</li>
              <li
                :data-hit="i"
                role="option"
                :aria-selected="active === i"
                class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm"
                :class="active === i ? 'bg-accent-soft text-accent-soft-foreground' : ''"
                @pointermove="active = i"
                @click="pick(hit)"
              >
                <component :is="hit.icon" class="size-4 shrink-0 opacity-70" />
                <span class="min-w-0 flex-1 truncate">{{ hit.label }}</span>
                <span v-if="hit.hint" class="truncate text-xs text-muted">{{ hit.hint }}</span>
                <CornerDownLeft v-if="active === i" class="size-3.5 shrink-0 opacity-60" />
              </li>
            </template>
            <li v-if="!hits.length" class="py-10 text-center text-sm text-muted">Ничего не нашлось</li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
