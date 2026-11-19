<!-- Шапка поверх фото: поиск по порталу (Ctrl+K), часы, вид, уведомления,
     профиль. -->
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { Menu, Search, Bell, Palette, LogOut, Sun, Moon, Monitor, Check } from "@lucide/vue";
import Popover from "../components/Popover.vue";
import Face from "../components/Face.vue";
import { auth } from "../lib/session";
import { logout } from "../lib/api";
import { toast } from "../lib/toast";
import { FEED, WHO, TODAY, day } from "../lib/data";
import { time, shortDate } from "../lib/format";
import { BACKDROPS, backdrop, theme, thumb, type Theme } from "../lib/look";

defineEmits<{ menu: []; search: [] }>();

const now = ref(new Date());
const timer = setInterval(() => (now.value = new Date()), 15_000);
onBeforeUnmount(() => clearInterval(timer));

const seen = ref(false);
const when = (date: Date) => (date >= TODAY ? time(date) : date >= day(-1) ? `вчера, ${time(date)}` : `${shortDate(date)}, ${time(date)}`);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Светлая", icon: Sun },
  { id: "dark", label: "Тёмная", icon: Moon },
  { id: "system", label: "Как в системе", icon: Monitor },
];

async function signOut() {
  if (auth.demo) return toast("Это демо без сервера: выходить некуда");
  try {
    await logout();
    location.reload();
  } catch {
    toast("Нет связи с сервером. Попробуйте ещё раз.", "danger");
  }
}
</script>

<template>
  <header class="on-photo flex h-14 shrink-0 items-center gap-2 px-3 md:px-5">
    <button type="button" class="glass-light flex size-9 items-center justify-center rounded-xl lg:hidden" aria-label="Меню" @click="$emit('menu')">
      <Menu class="size-5" />
    </button>

    <button
      type="button"
      class="glass-light flex h-9 min-w-0 flex-1 items-center md:max-w-[440px] gap-2 rounded-xl px-3 text-sm text-white/80 transition-colors"
      @click="$emit('search')"
    >
      <Search class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate text-left">Поиск: сотрудники, сделки, задачи</span>
      <span class="hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-medium sm:inline">{{ isMac ? "⌘" : "Ctrl" }} K</span>
    </button>

    <div class="hidden flex-1 md:block" />

    <span class="hidden text-2xl font-light tabular-nums md:inline">{{ time(now) }}</span>

    <!-- Вид: тема и фон -->
    <Popover width="w-[340px]">
      <template #trigger="{ toggle }">
        <button type="button" class="glass-light flex size-9 items-center justify-center rounded-xl" aria-label="Тема и фон" title="Тема и фон" @click="toggle">
          <Palette class="size-[18px]" />
        </button>
      </template>
      <div class="p-2 [text-shadow:none]">
        <p class="px-1 pb-2 text-sm font-semibold">Тема</p>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="one in THEMES"
            :key="one.id"
            type="button"
            class="flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors"
            :class="theme === one.id ? 'border-accent bg-accent-soft text-accent-soft-foreground' : 'border-border hover:bg-default'"
            @click="theme = one.id"
          >
            <component :is="one.icon" class="size-4" />{{ one.label }}
          </button>
        </div>
        <p class="px-1 pt-4 pb-2 text-sm font-semibold">Фон</p>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="one in BACKDROPS"
            :key="one.id"
            type="button"
            class="relative aspect-[16/10] overflow-hidden rounded-lg ring-offset-2 ring-offset-overlay transition"
            :class="backdrop === one.id ? 'ring-2 ring-accent' : 'hover:opacity-85'"
            :style="{ background: one.color }"
            :title="one.name"
            :aria-label="one.name"
            @click="backdrop = one.id"
          >
            <img :src="thumb(one.id)" alt="" loading="lazy" class="size-full object-cover" />
            <span v-if="backdrop === one.id" class="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check class="size-3" />
            </span>
          </button>
        </div>
      </div>
    </Popover>

    <!-- Уведомления -->
    <Popover width="w-[360px]">
      <template #trigger="{ toggle }">
        <button type="button" class="glass-light relative flex size-9 items-center justify-center rounded-xl" aria-label="Уведомления" title="Уведомления" @click="toggle(); seen = true">
          <Bell class="size-[18px]" />
          <span v-if="!seen" class="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger ring-2 ring-white/40" />
        </button>
      </template>
      <div class="[text-shadow:none]">
        <p class="px-3 pt-2 pb-1 text-sm font-semibold">Уведомления</p>
        <ul class="max-h-[60vh] overflow-y-auto thin-scroll">
          <li v-for="(entry, i) in FEED" :key="i" class="flex gap-3 rounded-xl px-3 py-2 hover:bg-default">
            <Face :who="entry.who" size="sm" />
            <div class="min-w-0 flex-1 text-sm">
              <p><span class="font-medium">{{ WHO[entry.who].name }}</span> {{ entry.text }}</p>
              <p class="text-xs text-muted">{{ when(entry.at) }}</p>
            </div>
          </li>
        </ul>
      </div>
    </Popover>

    <!-- Профиль -->
    <Popover width="w-64">
      <template #trigger="{ toggle }">
        <button type="button" class="glass-light flex h-9 items-center gap-2 rounded-xl pr-2.5 pl-1" aria-label="Профиль" @click="toggle">
          <span class="flex size-7 items-center justify-center rounded-lg bg-white/90 text-xs font-bold text-black [text-shadow:none]">{{ auth.me?.initials }}</span>
          <span class="hidden max-w-[160px] truncate text-sm font-medium md:inline">{{ auth.me?.name }}</span>
        </button>
      </template>
      <div class="[text-shadow:none]">
        <div class="px-3 pt-2 pb-2">
          <p class="truncate font-semibold">{{ auth.me?.name }}</p>
          <p class="truncate text-xs text-muted">{{ auth.me?.position || auth.me?.roleLabel }} · {{ auth.me?.email }}</p>
        </div>
        <div class="separator separator--horizontal my-1" />
        <button type="button" class="menu-item w-full" @click="signOut">
          <LogOut class="size-4" />
          <span>Выйти</span>
        </button>
      </div>
    </Popover>
  </header>
</template>
