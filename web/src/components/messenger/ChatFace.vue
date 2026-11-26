<!-- Обложка чата или аватар сотрудника: картинка нужного размера, если есть,
     иначе буквы в его цвете. В личном чате — аватар собеседника. Общий чат
     портала — ромбом, чат карточки — со значком её типа в углу. -->
<script setup lang="ts">
import { computed } from "vue";
import { Users } from "@lucide/vue";
import { entityOf } from "../../lib/entities";
import { apiUrl } from "../../lib/api";
import { avatarSrc } from "../../lib/profile";
import { person, type ChatItem, type ChatUser } from "../../lib/messenger";

const props = withDefaults(defineProps<{ chat?: ChatItem | null; user?: ChatUser | null; size?: "xs" | "sm" | "md" | "lg" | "xl" }>(), { size: "md" });
const PX = { xs: 24, sm: 32, md: 40, lg: 48, xl: 80 };
const SIZE = { xs: "size-6 text-[9px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base", xl: "size-20 text-2xl" };
const look = computed(() => {
  const px = PX[props.size];
  if (props.chat) {
    /* Личный чат — лицо собеседника. */
    const peer = props.chat.type === "direct" ? person(props.chat.peer) : null;
    const image = props.chat.avatar ? apiUrl(props.chat.avatar) : avatarSrc(peer?.avatar, px);
    return { title: props.chat.title, initials: props.chat.initials, hue: props.chat.hue, image, group: props.chat.type === "group", general: !!props.chat.general, kind: entityOf(props.chat.entity) };
  }
  if (props.user) return { title: props.user.name, initials: props.user.initials, hue: props.user.hue, image: avatarSrc(props.user.avatar, px), group: false, general: false, kind: null };
  return { title: "", initials: "?", hue: 220, image: null, group: false, general: false, kind: null };
});
</script>

<template>
  <!-- Ромб: повёрнутый скруглённый квадрат, буквы и картинка — ровно. -->
  <span v-if="look.general" class="relative inline-flex aspect-square shrink-0 items-center justify-center font-semibold select-none" :class="SIZE[size]" :title="look.title" role="img" :aria-label="look.title">
    <span class="absolute inset-[12%] rotate-45 overflow-hidden rounded-[26%] shadow-sm" :class="look.image ? '' : 'general-face'">
      <img v-if="look.image" :src="look.image" alt="" class="block size-full scale-[1.42] -rotate-45 object-cover" loading="lazy" decoding="async" draggable="false" />
    </span>
    <span v-if="!look.image" class="relative text-white">{{ look.initials }}</span>
  </span>
  <span v-else class="relative inline-flex aspect-square shrink-0 items-center justify-center rounded-full font-semibold select-none" :class="[SIZE[size], look.image ? '' : 'hue-face']" :style="{ '--hue': look.hue }" :title="look.title" role="img" :aria-label="look.title">
    <img v-if="look.image" :src="look.image" alt="" class="block size-full rounded-full object-cover" loading="lazy" decoding="async" draggable="false" />
    <template v-else>{{ look.initials }}</template>
    <span v-if="look.kind && (size === 'md' || size === 'lg')" class="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-surface text-muted shadow-sm ring-1 ring-black/5" :title="look.kind.label"><component :is="look.kind.icon" class="size-2.5" /></span>
    <span v-else-if="look.group && !look.image && (size === 'md' || size === 'lg')" class="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-surface text-muted shadow-sm ring-1 ring-black/5"><Users class="size-2.5" /></span>
  </span>
</template>
