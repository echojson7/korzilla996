<!-- Левое меню на стекле поверх фото, как в Битрикс24. Пункты сгруппированы,
     у Сделок и Задач счётчики (красный — есть просроченные). Меню сворачивается
     до иконок; на телефоне выезжает поверх. -->
<script setup lang="ts">
import { computed } from "vue";
import { ChevronsLeft, ChevronsRight, X } from "@lucide/vue";
import { PAGES } from "../pages";
import { route, href } from "../lib/router";
import { myOpenTasks, myOverdue, newDeals } from "../lib/counters";
import { totalUnread } from "../lib/messenger";
import Brand from "../components/Brand.vue";

const props = defineProps<{ collapsed: boolean; mobileOpen: boolean }>();
const emit = defineEmits<{ toggle: []; closeMobile: [] }>();

const groups = computed(() => {
  const out: { name: string; items: typeof PAGES }[] = [];
  for (const one of PAGES) {
    const last = out[out.length - 1];
    if (last && last.name === one.group) last.items.push(one);
    else out.push({ name: one.group, items: [one] });
  }
  return out;
});
const count = (id: string) => (id === "messenger" ? totalUnread.value : id === "tasks" ? myOpenTasks.value.length : id === "deals" ? newDeals.value : 0);
const hot = (id: string) => (id === "tasks" && myOverdue.value > 0) || id === "messenger";
const narrow = computed(() => props.collapsed && !props.mobileOpen);
</script>

<template>
  <Transition name="fade">
    <div v-if="mobileOpen" class="fixed inset-0 z-30 bg-black/40 lg:hidden" @click="emit('closeMobile')" />
  </Transition>
  <nav
    class="glass on-photo fixed inset-y-0 left-0 z-40 flex flex-col transition-[width,transform] duration-200 lg:static lg:z-auto lg:translate-x-0"
    :class="[narrow ? 'w-[68px] min-w-[68px] max-w-[68px]' : 'w-[224px] min-w-[224px] max-w-[224px]', mobileOpen ? 'translate-x-0' : '-translate-x-full']"
    aria-label="Разделы портала"
  >
    <div class="flex h-14 shrink-0 items-center gap-2.5" :class="narrow ? 'justify-center px-0' : 'px-4'">
      <Brand v-if="narrow" compact />
      <span v-else class="min-w-0 flex-1 truncate text-[19px]"><Brand /></span>
      <button v-if="mobileOpen" type="button" class="flex size-8 items-center justify-center rounded-lg hover:bg-white/15 lg:hidden" aria-label="Закрыть меню" @click="emit('closeMobile')">
        <X class="size-4" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 photo-scroll">
      <div v-for="group in groups" :key="group.name" class="mt-3 first:mt-1">
        <p v-if="group.name && !narrow" class="px-3 pb-1 text-[11px] font-semibold tracking-wider text-white/55 uppercase">{{ group.name }}</p>
        <div v-else-if="group.name" class="mx-3 mb-2 h-px bg-white/15" />
        <a
          v-for="item in group.items"
          :key="item.id"
          :href="href(item.path)"
          class="group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors"
          :class="route.path === item.path ? 'bg-white/22 text-white shadow-sm' : 'text-white/85 hover:bg-white/12 hover:text-white'"
          :title="narrow ? item.title : undefined"
          :aria-current="route.path === item.path ? 'page' : undefined"
          @pointerenter="item.load()"
          @focus="item.load()"
          @click="emit('closeMobile')"
        >
          <component :is="item.icon" class="size-[18px] shrink-0" />
          <span v-if="!narrow" class="min-w-0 flex-1 truncate">{{ item.title }}</span>
          <span
            v-if="count(item.id)"
            class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="[hot(item.id) ? 'bg-danger text-danger-foreground' : 'bg-white/25 text-white', narrow ? 'absolute top-0.5 right-0.5 h-4 min-w-4 px-1 text-[10px]' : '']"
          >{{ count(item.id) }}</span>
        </a>
      </div>
    </div>

    <button
      type="button"
      class="m-2.5 hidden h-9 items-center gap-3 rounded-xl px-3 text-sm text-white/70 hover:bg-white/12 hover:text-white lg:flex"
      :aria-label="collapsed ? 'Развернуть меню' : 'Свернуть меню'"
      @click="emit('toggle')"
    >
      <ChevronsRight v-if="collapsed" class="size-[18px] shrink-0" />
      <ChevronsLeft v-else class="size-[18px] shrink-0" />
      <span v-if="!collapsed">Свернуть меню</span>
    </button>
  </nav>
</template>
