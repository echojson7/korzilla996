<!-- Блок карточки задачи: у всех один вид — белая подложка, шапка 48 px
     (значок, название, счётчик, действие справа) и тело с отступом 16 px.
     flush — тело без отступов (списки полей сами держат поля).
     collapsed (true/false) — блок сворачивается щелчком по шапке
     (родитель хранит состояние и слушает toggle). -->
<script setup lang="ts">
import type { Component } from "vue";
import { ChevronDown } from "@lucide/vue";

/* collapsed по умолчанию null: у булева пропса без значения Vue ставит false. */
withDefaults(defineProps<{ icon?: Component; title: string; count?: string | number | null; flush?: boolean; collapsed?: boolean | null }>(), { collapsed: null });
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <section class="card card--default gap-0 p-0">
    <header class="flex h-11 shrink-0 items-center gap-2 px-5 pt-1">
      <button v-if="collapsed != null" type="button" class="-ml-1 flex min-w-0 flex-1 items-center gap-2 self-stretch pl-1 text-left" :aria-expanded="!collapsed" @click="emit('toggle')">
        <component :is="icon" v-if="icon" class="size-4 shrink-0 text-muted" />
        <h3 class="truncate text-sm font-semibold">{{ title }}</h3>
        <span v-if="count != null && count !== ''" class="shrink-0 text-sm text-muted tabular-nums">{{ count }}</span>
        <ChevronDown class="size-4 shrink-0 text-muted transition-transform" :class="collapsed ? '-rotate-90' : ''" />
      </button>
      <template v-else>
        <component :is="icon" v-if="icon" class="size-4 shrink-0 text-muted" />
        <h3 class="text-sm font-semibold">{{ title }}</h3>
        <span v-if="count != null && count !== ''" class="text-sm text-muted tabular-nums">{{ count }}</span>
      </template>
      <div class="ml-auto flex items-center gap-1.5"><slot name="actions" /></div>
    </header>
    <div v-if="!collapsed" :class="flush ? 'pb-1' : 'px-5 pb-5'"><slot /></div>
    <div v-else class="h-1" />
  </section>
</template>
