<!-- Запись канала Changelog — карточкой релиза, а не пузырём: обложка
     (картинка или ролик), подпись «Korzilla 996» с датой, заголовок, текст
     в Markdown, дополнительные кадры и реакции. -->
<script setup lang="ts">
import { computed } from "vue";
import { Smile } from "@lucide/vue";
import Popover from "../Popover.vue";
import EmojiPicker from "./EmojiPicker.vue";
import ChatFace from "./ChatFace.vue";
import { apiUrl } from "../../lib/api";
import { QUICK } from "../../lib/emoji";
import { markdown } from "../../lib/markdown";
import { meId, person, type ChatFile, type ChatItem, type ChatMessage } from "../../lib/messenger";

const props = defineProps<{ message: ChatMessage; chat: ChatItem }>();
const emit = defineEmits<{ react: [emoji: string]; view: [file: ChatFile] }>();

const media = computed(() => props.message.files.filter((file) => file.image || file.video));
const cover = computed(() => media.value[0] ?? null);
const more = computed(() => media.value.slice(1));
/* Первый заголовок — крупно над текстом, остальное — Markdown. */
const parts = computed(() => {
  const body = props.message.body ?? "";
  const hit = /^#{1,4}\s+(.+)\n?/.exec(body);
  return { title: hit?.[1] ?? null, html: markdown(hit ? body.slice(hit[0].length) : body) };
});
const when = computed(() => {
  const date = new Date(props.message.at);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day}, ${time}`;
});
const src = (file: ChatFile) => apiUrl(file.url);
</script>

<template>
  <article :data-id="message.id" class="release-card group/msg mx-auto my-5 w-full max-w-[640px] overflow-hidden rounded-[22px] bg-surface shadow-[0_10px_40px_-12px_rgb(0_0_0/0.28)] ring-1 ring-black/5 dark:ring-white/10">
    <div v-if="cover" class="release-cover relative aspect-[16/9] overflow-hidden bg-default">
      <video v-if="cover.video" :src="src(cover)" class="size-full object-cover" autoplay muted loop playsinline preload="metadata" />
      <button v-else type="button" class="block size-full" :aria-label="`Открыть: ${cover.name}`" @click="emit('view', cover)">
        <img :src="src(cover)" alt="" class="release-kenburns size-full object-cover" loading="lazy" decoding="async" />
      </button>
    </div>

    <div class="px-6 pt-5 pb-4">
      <div class="flex items-center gap-2.5 text-[13px] text-muted">
        <ChatFace :chat="chat" size="xs" />
        <span class="font-semibold text-foreground">Korzilla 996</span>
        <span aria-hidden="true">·</span>
        <time :datetime="message.at">{{ when }}</time>
      </div>
      <h3 v-if="parts.title" class="mt-3 text-[22px] leading-tight font-bold tracking-[-0.01em]">{{ parts.title }}</h3>
      <div class="md-post release-body mt-2.5 text-[15px]" v-html="parts.html" />

      <div v-if="more.length" class="mt-4 grid grid-cols-2 gap-2">
        <template v-for="file in more" :key="file.id">
          <video v-if="file.video" :src="src(file)" class="aspect-[16/10] w-full rounded-xl object-cover ring-1 ring-black/5" autoplay muted loop playsinline preload="metadata" />
          <button v-else type="button" class="overflow-hidden rounded-xl ring-1 ring-black/5" :aria-label="`Открыть: ${file.name}`" @click="emit('view', file)">
            <img :src="src(file)" alt="" class="aspect-[16/10] w-full object-cover transition-transform duration-300 hover:scale-[1.03]" loading="lazy" decoding="async" />
          </button>
        </template>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-1.5 border-t border-separator pt-3">
        <button
          v-for="one in message.reactions"
          :key="one.emoji"
          type="button"
          class="flex h-7 items-center gap-1 rounded-full border px-2 text-sm transition"
          :class="one.users.includes(meId) ? 'border-accent bg-accent-soft text-accent-soft-foreground' : 'border-separator hover:border-accent/50'"
          :title="one.users.map((id) => person(id)?.name ?? 'Сотрудник').join(', ')"
          @click="emit('react', one.emoji)"
        >{{ one.emoji }}<span class="text-xs font-semibold tabular-nums">{{ one.users.length }}</span></button>
        <Popover align="left" up width="w-auto">
          <template #trigger="{ toggle, open }">
            <button type="button" class="flex h-7 items-center gap-1.5 rounded-full px-2 text-sm text-muted transition hover:bg-default hover:text-foreground" :aria-expanded="open" aria-label="Поставить реакцию" @click="toggle"><Smile class="size-4" /><span v-if="!message.reactions.length">Реакция</span></button>
          </template>
          <template #default="{ close }">
            <div class="flex items-center gap-0.5 px-1 pb-1">
              <button v-for="emoji in QUICK.slice(0, 7)" :key="emoji" type="button" class="flex size-9 items-center justify-center rounded-full text-[22px] leading-none transition hover:scale-125 hover:bg-default" :aria-label="`Реакция ${emoji}`" @click="close(); emit('react', emoji)">{{ emoji }}</button>
            </div>
            <EmojiPicker @pick="(emoji) => { close(); emit('react', emoji); }" />
          </template>
        </Popover>
      </div>
    </div>
  </article>
</template>
