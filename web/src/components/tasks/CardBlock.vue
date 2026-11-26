<!-- Блок карточки задачи: у всех один вид — белая подложка, шапка 48 px
     (значок, название, счётчик, действие справа) и тело с отступом 16 px.
     flush — тело без отступов (списки полей сами держат поля). -->
<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ icon?: Component; title: string; count?: string | number | null; flush?: boolean }>();
</script>

<template>
  <section class="card card--default gap-0 p-0">
    <header class="flex h-11 shrink-0 items-center gap-2 px-4 pt-1">
      <component :is="icon" v-if="icon" class="size-4 shrink-0 text-muted" />
      <h3 class="text-sm font-semibold">{{ title }}</h3>
      <span v-if="count != null && count !== ''" class="text-sm text-muted tabular-nums">{{ count }}</span>
      <div class="ml-auto flex items-center gap-1.5"><slot name="actions" /></div>
    </header>
    <div :class="flush ? 'pb-1' : 'px-4 pb-4'"><slot /></div>
  </section>
</template>
