<!-- Выбор GIF и стикеров, как в Discord: вкладки GIF / Стикеры / Избранное,
     поиск (пусто — трендовые), сетка-«кирпичики» с догрузкой при прокрутке.
     Звёздочка на плитке добавляет в избранное. Запросы — через сервер. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Search, Star, X, Loader2 } from "@lucide/vue";
import { searchGifs, favorites, loadFavorites, isFavorite, toggleFavorite, provider, PROVIDER_NAME, type GifItem, type GifType } from "../../lib/gifs";
import { ApiError } from "../../lib/api";

const emit = defineEmits<{ pick: [item: GifItem] }>();

type Tab = GifType | "favorites";
const tab = ref<Tab>("gif");
const query = ref("");
const items = ref<GifItem[]>([]);
const next = ref<number | null>(1);
const busy = ref(false);
const error = ref("");
const scroller = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
let ticket = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

async function load(reset: boolean) {
  if (tab.value === "favorites") return;
  if (reset) {
    items.value = [];
    next.value = 1;
    error.value = "";
    scroller.value?.scrollTo({ top: 0 });
  }
  if (next.value == null || (busy.value && !reset)) return;
  const mine = ++ticket;
  busy.value = true;
  try {
    const page = await searchGifs(tab.value, query.value, next.value);
    if (mine !== ticket) return;
    const seen = new Set(items.value.map((one) => one.key));
    items.value.push(...page.items.filter((one) => !seen.has(one.key)));
    next.value = page.next;
    await nextTick();
    fill();
  } catch (e) {
    if (mine !== ticket) return;
    error.value = e instanceof ApiError ? e.message : "Сервис GIF не ответил";
    next.value = null;
  } finally {
    if (mine === ticket) busy.value = false;
  }
}

/* Если первая страница не заполнила окно — догрузить ещё. */
function fill() {
  const el = scroller.value;
  if (el && el.scrollHeight <= el.clientHeight + 40) load(false);
}
function onScroll() {
  const el = scroller.value;
  if (el && el.scrollTop + el.clientHeight > el.scrollHeight - 300) load(false);
}

watch(tab, () => {
  if (tab.value === "favorites") loadFavorites(true);
  else load(true);
});
watch(query, () => {
  clearTimeout(timer);
  if (tab.value !== "favorites") timer = setTimeout(() => load(true), 350);
});
onMounted(() => {
  loadFavorites();
  load(true);
  setTimeout(() => input.value?.focus(), 50);
});

const shown = computed(() => {
  if (tab.value !== "favorites") return items.value;
  const q = query.value.trim().toLowerCase();
  return q ? favorites.value.filter((one) => one.title.toLowerCase().includes(q)) : favorites.value;
});
const ratio = (one: GifItem) => (one.preview.width && one.preview.height ? `${one.preview.width} / ${one.preview.height}` : "1 / 1");
const tabs: { id: Tab; label: string }[] = [
  { id: "gif", label: "GIF" },
  { id: "sticker", label: "Стикеры" },
  { id: "favorites", label: "Избранное" },
];
</script>

<template>
  <div class="flex h-[440px] max-h-[70vh] w-[380px] max-w-[calc(100vw-24px)] flex-col">
    <div class="flex gap-1 px-1 pb-1.5">
      <button
        v-for="one in tabs"
        :key="one.id"
        type="button"
        class="flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm"
        :class="tab === one.id ? 'bg-default font-semibold' : 'text-muted hover:bg-default'"
        @click="tab = one.id"
      >
        <Star v-if="one.id === 'favorites'" class="size-4" :class="tab === one.id ? 'fill-current text-warning' : ''" />{{ one.label }}
      </button>
    </div>
    <label class="mx-1 mb-1.5 flex h-9 items-center gap-2 rounded-xl bg-surface-secondary px-3">
      <Search class="size-4 shrink-0 text-muted" />
      <input
        ref="input"
        v-model="query"
        type="search"
        class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        :placeholder="tab === 'favorites' ? 'Найти в избранном' : provider ? `Поиск в ${PROVIDER_NAME[provider]}` : tab === 'sticker' ? 'Поиск стикеров' : 'Поиск GIF'"
        aria-label="Поиск"
        @keydown.esc.stop="query ? (query = '') : undefined"
      />
      <button v-if="query" type="button" class="text-muted hover:text-foreground" aria-label="Очистить" @click="query = ''"><X class="size-4" /></button>
    </label>

    <div ref="scroller" class="thin-scroll min-h-0 flex-1 overflow-y-auto px-1" @scroll.passive="onScroll">
      <p v-if="error && !shown.length" class="px-4 py-10 text-center text-sm text-muted">{{ error }}</p>
      <p v-else-if="tab === 'favorites' && !shown.length" class="px-4 py-10 text-center text-sm text-muted">
        {{ query ? "В избранном такого нет" : "Здесь будут GIF и стикеры, отмеченные звёздочкой" }}
      </p>
      <p v-else-if="!busy && !shown.length" class="px-4 py-10 text-center text-sm text-muted">Ничего не нашлось</p>
      <div class="columns-2 gap-1.5" :class="tab === 'sticker' || (tab === 'favorites' && shown.every((one) => one.type === 'sticker')) ? 'columns-3' : ''">
        <div v-for="one in shown" :key="one.key" class="group/gif relative mb-1.5 break-inside-avoid">
          <button
            type="button"
            class="block w-full overflow-hidden rounded-lg transition hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            :class="one.type === 'sticker' ? 'bg-transparent' : 'bg-default'"
            :style="{ aspectRatio: ratio(one) }"
            :title="one.title || (one.type === 'sticker' ? 'Стикер' : 'GIF')"
            @click="emit('pick', one)"
          >
            <img :src="one.preview.url" :alt="one.title" class="size-full object-cover" :class="one.type === 'sticker' ? '!object-contain' : ''" loading="lazy" decoding="async" />
          </button>
          <button
            type="button"
            class="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/55 text-white transition"
            :class="isFavorite(one.key) ? 'opacity-100' : 'opacity-0 group-hover/gif:opacity-100 focus-visible:opacity-100'"
            :aria-label="isFavorite(one.key) ? 'Убрать из избранного' : 'В избранное'"
            :title="isFavorite(one.key) ? 'Убрать из избранного' : 'В избранное'"
            @click.stop="toggleFavorite(one)"
          ><Star class="size-4" :class="isFavorite(one.key) ? 'fill-warning text-warning' : ''" /></button>
        </div>
      </div>
      <div v-if="busy" class="flex justify-center py-3 text-muted"><Loader2 class="size-5 animate-spin" /></div>
    </div>
    <p class="px-2 pt-1 text-right text-[11px] text-muted">Портал создан Kirill Aralin 20.11.2026, Korzilla</p>
  </div>
</template>
