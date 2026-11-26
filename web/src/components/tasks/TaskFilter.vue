<!-- Строка поиска задач как в Битрикс24: в поле — чип набора («Делаю»)
     и чипы заданных полей, дальше текст. Кнопка «Фильтр» открывает панель:
     слева готовые наборы со счётчиками, справа поля. Всё применяется сразу. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, X, SlidersHorizontal, Check, RotateCcw } from "@lucide/vue";
import Popover from "../Popover.vue";
import {
  PRESETS, DUES, preset, search, statuses, responsible, creator, priority, due, project, tag, chips, filtered,
  setPreset, setSearch, setField, resetFilter, type Preset,
} from "./filter";
import { STATUSES, PRIORITIES, staffList, taskStore, type Status } from "../../lib/tasks";

defineProps<{ counts: Record<Preset, number> }>();
const input = ref<HTMLInputElement | null>(null);
const panel = ref<{ close: () => void } | null>(null);

const presetKeys = Object.keys(PRESETS) as Preset[];
const fieldsSet = computed(() => chips.value.length);

function toggleStatus(id: Status) {
  const set = new Set(statuses.value);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  setField("st", STATUSES.filter((one) => set.has(one.id)).map((one) => one.id));
}
const pick = (key: "pr" | "due", value: string, current: string | null) => setField(key, current === value ? null : value);
const people = computed(() => staffList.value);
const onSelect = (key: "who" | "by" | "pj" | "tg", event: Event) => setField(key, (event.target as HTMLSelectElement).value || null);
const placeholder = computed(() => (chips.value.length || preset.value !== "mine" ? "Искать дальше…" : "Поиск: задача, сотрудник, сделка, проект, #тег"));
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="search-field task-filter min-w-0 flex-1">
    <div class="search-field__group cursor-text gap-1.5 pr-1" @click.self="input?.focus()">
      <Search class="search-field__search-icon size-4 shrink-0" aria-hidden="true" />
      <span class="filter-chip filter-chip--preset" :title="PRESETS[preset].hint">
        {{ PRESETS[preset].label }}
        <button v-if="preset !== 'mine'" type="button" class="filter-chip__x" :aria-label="`Убрать набор «${PRESETS[preset].label}»`" @click="setPreset('mine')"><X class="size-3" /></button>
      </span>
      <span v-for="one in chips" :key="one.key" class="filter-chip">
        <span class="max-w-48 truncate">{{ one.label }}</span>
        <button type="button" class="filter-chip__x" :aria-label="`Убрать: ${one.label}`" @click="setField(one.key, null)"><X class="size-3" /></button>
      </span>
      <input
        ref="input"
        class="search-field__input min-w-24 flex-1"
        type="search"
        :placeholder="placeholder"
        :value="search"
        aria-label="Поиск задач"
        @input="setSearch(($event.target as HTMLInputElement).value)"
        @keydown.esc="setSearch('')"
        @keydown.backspace="!search && chips.length && setField(chips[chips.length - 1].key, null)"
      />
      <button v-if="filtered" type="button" class="filter-icon-btn" title="Сбросить фильтр" aria-label="Сбросить фильтр" @click="resetFilter(); input?.focus()"><X class="size-4" /></button>
      <Popover ref="panel" align="right" width="w-[640px]">
        <template #trigger="{ toggle, open }">
          <button type="button" class="filter-btn" :data-open="open ? 'true' : undefined" aria-label="Фильтр" @click="toggle">
            <SlidersHorizontal class="size-4" /><span class="hidden sm:inline">Фильтр</span>
            <span v-if="fieldsSet" class="filter-btn__count">{{ fieldsSet }}</span>
          </button>
        </template>
        <div class="flex max-h-[min(560px,80vh)] min-h-0 flex-col sm:flex-row">
          <!-- Наборы -->
          <nav class="flex shrink-0 flex-col gap-0.5 border-b border-separator p-2 sm:w-48 sm:border-r sm:border-b-0" aria-label="Наборы">
            <p class="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted">Наборы</p>
            <button
              v-for="key in presetKeys"
              :key="key"
              type="button"
              class="preset-row"
              :data-on="preset === key ? 'true' : undefined"
              :title="PRESETS[key].hint"
              @click="setPreset(key)"
            >
              <span class="min-w-0 flex-1 truncate">{{ PRESETS[key].label }}</span>
              <span class="text-xs tabular-nums opacity-60">{{ counts[key] }}</span>
              <Check v-if="preset === key" class="size-3.5 shrink-0" />
            </button>
          </nav>
          <!-- Поля -->
          <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div>
              <p class="field-label">Стадия</p>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="one in STATUSES" :key="one.id" type="button" class="opt" :data-on="statuses.includes(one.id) ? 'true' : undefined" @click="toggleStatus(one.id)">
                  <span class="size-2 rounded-full" :style="{ background: `oklch(0.68 0.16 ${one.hue})` }" />{{ one.column }}
                </button>
              </div>
            </div>
            <div>
              <p class="field-label">Крайний срок</p>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="one in DUES" :key="one.id" type="button" class="opt" :data-on="due === one.id ? 'true' : undefined" @click="pick('due', one.id, due)">{{ one.label }}</button>
              </div>
            </div>
            <div>
              <p class="field-label">Приоритет</p>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="one in PRIORITIES" :key="one.id" type="button" class="opt" :data-on="priority === one.id ? 'true' : undefined" @click="pick('pr', one.id, priority)">{{ one.label }}</button>
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="field-label">Ответственный</span>
                <select class="input h-9 w-full py-0 text-sm" :value="responsible ?? ''" @change="onSelect('who', $event)">
                  <option value="">Любой</option>
                  <option v-for="one in people" :key="one.id" :value="one.id">{{ one.id === taskStore.me ? `${one.name} (я)` : one.name }}</option>
                </select>
              </label>
              <label class="block">
                <span class="field-label">Постановщик</span>
                <select class="input h-9 w-full py-0 text-sm" :value="creator ?? ''" @change="onSelect('by', $event)">
                  <option value="">Любой</option>
                  <option v-for="one in people" :key="one.id" :value="one.id">{{ one.id === taskStore.me ? `${one.name} (я)` : one.name }}</option>
                </select>
              </label>
              <label class="block">
                <span class="field-label">Проект</span>
                <select class="input h-9 w-full py-0 text-sm" :value="project" :disabled="!taskStore.projects.length" @change="onSelect('pj', $event)">
                  <option value="">{{ taskStore.projects.length ? "Любой" : "Проектов нет" }}</option>
                  <option v-for="one in taskStore.projects" :key="one" :value="one">{{ one }}</option>
                </select>
              </label>
              <label class="block">
                <span class="field-label">Тег</span>
                <select class="input h-9 w-full py-0 text-sm" :value="tag" :disabled="!taskStore.tags.length" @change="onSelect('tg', $event)">
                  <option value="">{{ taskStore.tags.length ? "Любой" : "Тегов нет" }}</option>
                  <option v-for="one in taskStore.tags" :key="one" :value="one">#{{ one }}</option>
                </select>
              </label>
            </div>
            <div class="mt-auto flex items-center gap-2 border-t border-separator pt-3">
              <button type="button" class="button button--ghost button--sm" :disabled="!filtered" @click="resetFilter()"><RotateCcw class="size-3.5" />Сбросить</button>
              <button type="button" class="button button--primary button--sm ml-auto" @click="panel?.close()">Готово</button>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  </div>
</template>

<style scoped>
.task-filter .search-field__group {
  height: auto;
  min-height: 2.375rem;
  flex-wrap: wrap;
  padding-block: 0.1875rem;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.75rem;
  padding: 0 0.25rem 0 0.625rem;
  border-radius: 0.5rem;
  background: var(--default);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
}
.filter-chip--preset {
  background: var(--accent-soft);
  color: var(--accent);
}
.filter-chip--preset:not(:has(button)) { padding-right: 0.625rem; }
.filter-chip__x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.375rem;
  opacity: 0.6;
}
.filter-chip__x:hover { opacity: 1; background: color-mix(in oklab, currentColor 14%, transparent); }
.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: var(--muted);
}
.filter-icon-btn:hover { background: var(--default); color: var(--foreground); }
.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.625rem;
  border-radius: 0.5625rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
  background: var(--default);
}
.filter-btn:hover, .filter-btn[data-open] { background: color-mix(in oklab, var(--default) 80%, var(--foreground) 8%); }
.filter-btn__count {
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: 9999px;
  background: var(--accent);
  color: var(--accent-foreground);
  font-size: 0.6875rem;
  line-height: 1.125rem;
  text-align: center;
}
.preset-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.125rem;
  padding: 0 0.625rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  text-align: left;
}
.preset-row:hover { background: var(--default); }
.preset-row[data-on] { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
.field-label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted);
}
.opt {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 1.875rem;
  padding: 0 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  background: var(--default);
  transition: background-color 0.15s, color 0.15s;
}
.opt:hover { background: color-mix(in oklab, var(--default) 70%, var(--foreground) 8%); }
.opt[data-on] { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
</style>
