<!-- Обложка чата или аватар сотрудника: картинка, если есть, иначе буквы
     в его цвете. online — зелёная точка не нужна, пока нет статусов. -->
<script setup lang="ts">
import { computed } from "vue";
import { Users } from "@lucide/vue";
import { apiUrl } from "../../lib/api";
import type { ChatItem, ChatUser } from "../../lib/messenger";

const props = withDefaults(defineProps<{ chat?: ChatItem | null; user?: ChatUser | null; size?: "xs" | "sm" | "md" | "lg" | "xl" }>(), { size: "md" });
const SIZE = { xs: "size-6 text-[9px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base", xl: "size-20 text-2xl" };
const look = computed(() => {
  if (props.chat) return { title: props.chat.title, initials: props.chat.initials, hue: props.chat.hue, image: props.chat.avatar ? apiUrl(props.chat.avatar) : null, group: props.chat.type === "group" };
  if (props.user) return { title: props.user.name, initials: props.user.initials, hue: props.user.hue, image: null, group: false };
  return { title: "", initials: "?", hue: 220, image: null, group: false };
});
</script>

<template>
  <span class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none" :class="[SIZE[size], look.image ? '' : 'hue-soft']" :style="{ '--hue': look.hue }" :title="look.title" role="img" :aria-label="look.title">
    <img v-if="look.image" :src="look.image" alt="" class="size-full object-cover" loading="lazy" />
    <template v-else>{{ look.initials }}</template>
    <span v-if="look.group && !look.image && (size === 'md' || size === 'lg')" class="absolute right-0 bottom-0 flex size-4 items-center justify-center rounded-full bg-surface text-muted shadow-sm"><Users class="size-2.5" /></span>
  </span>
</template>
