<!-- Шапка поверх фото: поиск по порталу (Ctrl+K), часы, вид, уведомления,
     профиль. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Menu, Search, Bell, Palette, LogOut, Sun, Moon, Monitor, Check, UserRound, Settings, Plus, X } from "@lucide/vue";
import Popover from "../components/Popover.vue";
import Face from "../components/Face.vue";
import { auth } from "../lib/session";
import { logout } from "../lib/api";
import { toast } from "../lib/toast";
import { FEED, WHO, TODAY, day } from "../lib/data";
import { time, shortDate } from "../lib/format";
import { href } from "../lib/router";
import { avatarSrc } from "../lib/profile";
import { people } from "../lib/messenger";
import { BACKDROPS, CUSTOM, backdrop, customBackdrop, messageLayout, removeCustomBackdrop, setCustomBackdrop, theme, thumb, type MessageLayout, type Theme } from "../lib/look";

defineEmits<{ menu: []; search: [] }>();

const now = ref(new Date());
const timer = setInterval(() => (now.value = new Date()), 15_000);
onBeforeUnmount(() => clearInterval(timer));

/* Свой аватар: из списка людей (обновляется на лету), иначе — из входа. */
const myAvatar = computed(() => (auth.me?.id ? people.get(auth.me.id)?.avatar : undefined) ?? auth.me?.avatar);
const meAvatar = computed(() => avatarSrc(myAvatar.value, 28));
const meAvatarBig = computed(() => avatarSrc(myAvatar.value, 40));

const seen = ref(false);

/* Свой фон: плитка «+» открывает выбор файла. */
const picker = ref<HTMLInputElement | null>(null);
async function pickOwn(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("Нужна картинка: JPG, PNG или WebP", "danger");
    return;
  }
  try {
    await setCustomBackdrop(file);
  } catch (error) {
    toast(error instanceof Error ? error.message : "Не удалось поставить картинку", "danger");
  }
}
const when = (date: Date) => (date >= TODAY ? time(date) : date >= day(-1) ? `вчера, ${time(date)}` : `${shortDate(date)}, ${time(date)}`);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Светлая", icon: Sun },
  { id: "dark", label: "Тёмная", icon: Moon },
  { id: "system", label: "Как в системе", icon: Monitor },
];
const LAYOUTS: { id: MessageLayout; label: string }[] = [
  { id: "split", label: "Мои справа" },
  { id: "left", label: "Все слева" },
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
        <p class="px-1 pt-4 pb-2 text-sm font-semibold">Сообщения в чатах</p>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="one in LAYOUTS"
            :key="one.id"
            type="button"
            class="flex flex-col items-center gap-1.5 rounded-xl border px-2 pt-2.5 pb-2 text-xs transition-colors"
            :class="messageLayout === one.id ? 'border-accent bg-accent-soft text-accent-soft-foreground' : 'border-border hover:bg-default'"
            :aria-pressed="messageLayout === one.id"
            @click="messageLayout = one.id"
          >
            <!-- Схема ленты: полоски-сообщения, свои — цветом акцента. -->
            <span class="flex w-16 flex-col gap-1" aria-hidden="true">
              <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-current opacity-40" /><span class="h-2 w-8 rounded-full bg-current opacity-25" /></span>
              <span class="flex items-center gap-1" :class="one.id === 'split' ? 'flex-row-reverse' : ''"><span v-if="one.id === 'left'" class="size-2 rounded-full bg-accent" /><span class="h-2 w-9 rounded-full bg-accent/70" /></span>
              <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-current opacity-40" /><span class="h-2 w-6 rounded-full bg-current opacity-25" /></span>
            </span>
            {{ one.label }}
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
          <div
            v-if="customBackdrop"
            class="relative aspect-[16/10] overflow-hidden rounded-lg ring-offset-2 ring-offset-overlay transition"
            :class="backdrop === CUSTOM ? 'ring-2 ring-accent' : 'hover:opacity-85'"
            :style="{ background: customBackdrop.color }"
          >
            <button type="button" class="size-full" title="Свой фон" aria-label="Свой фон" @click="backdrop = CUSTOM">
              <img :src="customBackdrop.src" alt="" class="size-full object-cover" />
            </button>
            <span v-if="backdrop === CUSTOM" class="pointer-events-none absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check class="size-3" />
            </span>
            <button
              type="button"
              class="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
              title="Убрать свой фон"
              aria-label="Убрать свой фон"
              @click="removeCustomBackdrop()"
            >
              <X class="size-3" />
            </button>
          </div>
          <button
            type="button"
            class="flex aspect-[16/10] items-center justify-center rounded-lg border-2 border-dashed border-current/25 text-muted transition hover:border-accent hover:text-accent"
            :title="customBackdrop ? 'Заменить свой фон' : 'Свой фон'"
            :aria-label="customBackdrop ? 'Заменить свой фон' : 'Свой фон'"
            @click="picker?.click()"
          >
            <Plus class="size-5" />
          </button>
          <input ref="picker" type="file" accept="image/*" class="hidden" @change="pickOwn" />
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
          <img v-if="meAvatar" :src="meAvatar" alt="" class="size-7 rounded-full object-cover ring-1 ring-white/50" />
          <span v-else class="flex size-7 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-black [text-shadow:none]"><span class="initials">{{ auth.me?.initials }}</span></span>
          <span class="hidden max-w-[160px] truncate text-sm font-medium md:inline">{{ auth.me?.name }}</span>
        </button>
      </template>
      <template #default="{ close }">
      <div class="[text-shadow:none]" @click="($event.target as HTMLElement).closest('a') && close()">
        <a :href="href('/profile')" class="flex items-center gap-3 rounded-xl px-3 pt-2 pb-2 hover:bg-default">
          <img v-if="meAvatarBig" :src="meAvatarBig" alt="" class="size-10 shrink-0 rounded-full object-cover" />
          <span v-else class="hue-face flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold" :style="{ '--hue': auth.me?.hue ?? 220 }"><span class="initials">{{ auth.me?.initials }}</span></span>
          <span class="min-w-0">
            <span class="block truncate font-semibold">{{ auth.me?.name }}</span>
            <span class="block truncate text-xs text-muted">{{ auth.me?.position || auth.me?.roleLabel }} · {{ auth.me?.email }}</span>
          </span>
        </a>
        <div class="separator separator--horizontal my-1" />
        <a :href="href('/profile')" class="menu-item w-full">
          <UserRound class="size-4" />
          <span>Мой профиль</span>
        </a>
        <a :href="href('/profile', { edit: 1 })" class="menu-item w-full">
          <Settings class="size-4" />
          <span>Настройки профиля</span>
        </a>
        <div class="separator separator--horizontal my-1" />
        <button type="button" class="menu-item w-full" @click="signOut">
          <LogOut class="size-4" />
          <span>Выйти</span>
        </button>
      </div>
      </template>
    </Popover>
  </header>
</template>
