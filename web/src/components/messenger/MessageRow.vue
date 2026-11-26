<!-- Одно сообщение ленты: пузырь, файлы, реакции, кто прочитал, кнопки
     сбоку. Отдельный компонент, чтобы обновление ленты (кто печатает,
     наведение, новое сообщение) не перерисовывало все пузыри: Vue
     перерисует только те, у которых поменялись входные данные. -->
<script lang="ts">
/* Общее для всех сообщений — одно на модуль, а не на каждый пузырь. */
import { computed, watch } from "vue";
import { people, type ChatFile } from "../../lib/messenger";

/* Текст со ссылками — без v-html. */
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
/* @Имя сотрудника — подсвечено, длинные имена проверяются первыми. */
const MENTION_RE = computed(() => {
  const names = [...people.values()].map((one) => one.name.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  return names.length ? new RegExp(`(@(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))(?![\\p{L}\\p{N}])`, "giu") : null;
});
/* Разбор текста кэшируется: лента перерисовывается часто, а тексты те же. */
const partsCache = new Map<string, { text: string; link?: boolean; mention?: boolean }[]>();
watch(MENTION_RE, () => partsCache.clear());
function parts(text: string) {
  const hit = partsCache.get(text);
  if (hit) return hit;
  if (partsCache.size > 3000) partsCache.clear();
  const out: { text: string; link?: boolean; mention?: boolean }[] = [];
  text.split(URL_RE).forEach((chunk, i) => {
    if (i % 2 === 1 || !MENTION_RE.value || !chunk.includes("@")) return out.push({ text: chunk, link: i % 2 === 1 });
    chunk.split(MENTION_RE.value).forEach((piece, j) => out.push({ text: piece, mention: j % 2 === 1 }));
  });
  partsCache.set(text, out);
  return out;
}
const onlyEmoji = (text: string | null) => !!text && text.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s|‍|️)+$/u.test(text) && !/^[\d#*\s]+$/.test(text);

function imageBox(file: ChatFile, many: boolean) {
  if (many || !file.width || !file.height) return {};
  const width = Math.min(320, file.width);
  return { width: `${width}px`, aspectRatio: `${file.width} / ${file.height}` };
}
</script>

<script setup lang="ts">
import { Smile, SmilePlus, MoreHorizontal, Forward, Check, CheckCheck, Clock, AlertCircle, Download, FileText } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import EmojiPicker from "./EmojiPicker.vue";
import GifView from "./GifView.vue";
import Popover from "../Popover.vue";
import { apiUrl } from "../../lib/api";
import { QUICK } from "../../lib/emoji";
import { markdown as renderMarkdown } from "../../lib/markdown";
import { person, meId, clock, fileSize, type ChatMessage, type ChatUser } from "../../lib/messenger";

defineProps<{
  message: ChatMessage;
  head: boolean;
  /* Своё справа (раскладка «как в Telegram»). */
  right: boolean;
  /* Имя автора у первого сообщения серии. */
  author: boolean;
  active: boolean;
  menuOpen: boolean;
  read: boolean;
  readers?: ChatUser[];
  /* Пост Changelog: текст — Markdown. */
  markdown?: boolean;
}>();
const emit = defineEmits<{
  tap: [event: MouseEvent];
  quick: [event: MouseEvent];
  leave: [];
  menu: [event: MouseEvent, views: boolean];
  react: [emoji: string];
  jump: [id: number];
  view: [file: ChatFile];
  media: [];
  drop: [];
}>();

</script>

<template>
  <div
    :data-id="message.id"
    class="group/msg relative flex gap-2 rounded-xl transition-colors"
    :class="[right ? 'flex-row-reverse' : '', head ? '' : 'mt-0.5']"
    @click="emit('tap', $event)"
    @dblclick="emit('quick', $event)"
    @pointerleave="(event) => event.pointerType === 'mouse' && active && emit('leave')"
    @contextmenu="!message.deleted && !message.pending && emit('menu', $event, false)"
  >
    <div class="flex max-w-[min(540px,82%)] min-w-0 flex-col" :class="right ? 'items-end' : 'items-start'">
      <div
        class="relative min-w-0 rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-sm"
        :class="[
          message.deleted ? 'bg-surface-secondary text-muted italic' : message.userId === meId ? 'bubble-mine' : 'bg-surface',
          onlyEmoji(message.body) && !message.files.length && !message.replyTo ? '!bg-transparent !shadow-none text-[40px] leading-tight px-0' : '',
          message.gif && !message.deleted && !message.replyTo && !message.forwardedFrom ? '!bg-transparent !shadow-none !p-0' : '',
          message.failed ? 'ring-2 ring-danger/50' : '',
        ]"
      >
        <p v-if="head && author && !message.deleted" class="text-[13px] font-semibold" :style="{ color: `oklch(0.55 0.14 ${person(message.userId)?.hue ?? 220})` }">
          {{ message.userId ? person(message.userId)?.name ?? "Сотрудник" : "Korzilla 996" }}
        </p>
        <template v-if="message.deleted">Сообщение удалено</template>
        <template v-else>
          <p v-if="message.forwardedFrom" class="mb-0.5 flex items-center gap-1 text-[13px] text-accent"><Forward class="size-3.5" />Переслано от <b class="font-semibold">{{ person(message.forwardedFrom)?.name ?? "сотрудника" }}</b></p>
          <button v-if="message.replyTo" type="button" class="my-1 block w-full max-w-72 rounded-lg border-l-2 border-accent bg-black/5 px-2 py-1 text-left text-[13px] dark:bg-white/5" @click.stop="emit('jump', message.replyTo.id)">
            <span class="block font-semibold text-accent">{{ person(message.replyTo.userId)?.name ?? "Сотрудник" }}</span>
            <span class="block truncate text-muted">{{ message.replyTo.text }}</span>
          </button>
          <GifView v-if="message.gif" :gif="message.gif" class="my-0.5" @load="emit('media')" />

          <div v-if="message.files.some((f) => f.image)" class="my-1 grid gap-1" :class="message.files.filter((f) => f.image).length > 1 ? 'grid-cols-2' : ''">
            <button v-for="file in message.files.filter((f) => f.image)" :key="file.id" type="button" class="block max-w-[320px] overflow-hidden rounded-xl bg-black/5" :style="imageBox(file, message.files.filter((f) => f.image).length > 1)" @click.stop="emit('view', file)">
              <img :src="apiUrl(file.url)" :alt="file.name" class="size-full max-h-[360px] object-cover" :class="message.files.filter((f) => f.image).length > 1 ? 'aspect-square' : ''" loading="lazy" @load="emit('media')" />
            </button>
          </div>
          <component
            :is="message.pending ? 'div' : 'a'"
            v-for="file in message.files.filter((f) => !f.image || message.pending)"
            :key="file.id"
            :href="message.pending ? undefined : `${apiUrl(file.url)}?download=1`"
            class="my-1 flex max-w-72 items-center gap-2.5 rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5"
            :class="message.pending ? '' : 'hover:bg-black/10'"
            @click.stop
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FileText class="size-5" /></span>
            <span class="min-w-0 flex-1 text-[13px]"><span class="block truncate font-medium">{{ file.name }}</span><span class="text-muted">{{ fileSize(file.size) }}</span></span>
            <Download v-if="!message.pending" class="size-4 shrink-0 text-muted" />
          </component>
          <div v-if="message.pending && message.files.length && !message.failed" class="my-1 h-1 overflow-hidden rounded-full bg-black/10"><div class="h-full bg-accent transition-[width]" :style="{ width: `${Math.round((message.progress ?? 0) * 100)}%` }" /></div>

          <div v-if="message.body && markdown" class="md-post break-words" v-html="renderMarkdown(message.body)" />
          <p v-else-if="message.body" class="break-words whitespace-pre-wrap">
            <template v-for="(part, i) in parts(message.body)" :key="i"><a v-if="part.link" :href="part.text" target="_blank" rel="noopener noreferrer" class="link break-all" @click.stop>{{ part.text }}</a><span v-else-if="part.mention" class="font-medium text-accent">{{ part.text }}</span><template v-else>{{ part.text }}</template></template>
          </p>
        </template>
        <span class="float-right mt-1 ml-2 flex items-center gap-1 text-[11px] leading-4 text-muted not-italic select-none" :class="onlyEmoji(message.body) ? 'text-xs' : ''">
          <span v-if="message.editedAt && !message.deleted">изм.</span>
          {{ clock(message.at) }}
          <template v-if="message.userId === meId && !message.deleted">
            <AlertCircle v-if="message.failed" class="size-3.5 text-danger" />
            <Clock v-else-if="message.pending" class="size-3" />
            <CheckCheck v-else-if="read" class="size-4 text-sky-500 dark:text-sky-400" aria-label="Прочитано" />
            <Check v-else class="size-3.5" aria-label="Доставлено" />
          </template>
        </span>
        <!-- Реакция — кружок в нижнем углу пузыря, только при наведении. -->
        <template v-if="!message.deleted && !message.pending">
        <!-- Наведение на кружок — быстрые реакции; в конце, за чертой, «ещё» —
             вложенная панель со всеми эмодзи по группам. -->
        <Popover hover class="!absolute -bottom-2.5 z-10 transition-opacity" :class="[right ? '-left-3' : '-right-3', active ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 has-[[aria-expanded=true]]:opacity-100']" align="center" up width="w-auto">
          <template #trigger="{ toggle, open }">
            <button type="button" class="msg-side-btn !size-7" aria-label="Поставить реакцию" title="Реакция" :aria-expanded="open" @click="toggle"><Smile class="size-4" /></button>
          </template>
          <template #default="{ close }">
            <!-- Вся строка — якорь панели всех реакций: она встаёт ровно над
                 строкой и той же ширины. Открывается наведением на «ещё». -->
            <Popover hover="manual" match-width align="center" up width="">
              <template #trigger="{ toggle: more, open: full, hoverIn, hoverOut }">
                <div class="flex items-center gap-0.5">
                  <button v-for="emoji in QUICK.slice(0, 7)" :key="emoji" type="button" class="flex size-9 items-center justify-center rounded-full text-[22px] leading-none transition hover:scale-125 hover:bg-default" :aria-label="`Реакция ${emoji}`" @click="close(); emit('react', emoji)">{{ emoji }}</button>
                  <span class="mx-1 h-6 w-px bg-separator" aria-hidden="true" />
                  <button type="button" class="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-default hover:text-foreground" :class="full ? 'bg-default text-foreground' : ''" aria-label="Все реакции" title="Все реакции" :aria-expanded="full" @click="full || more()" @pointerenter="hoverIn" @pointerleave="hoverOut"><SmilePlus class="size-5" /></button>
                </div>
              </template>
              <template #default="{ close: closeFull }">
                <EmojiPicker class="!w-full" @pick="(emoji) => { closeFull(); close(); emit('react', emoji); }" />
              </template>
            </Popover>
          </template>
        </Popover>
        </template>
      </div>

      <p v-if="message.failed" class="mt-1 text-xs text-danger">
        Не отправлено · <button type="button" class="underline" @click.stop="emit('drop')">убрать</button>
      </p>

      <div v-if="message.reactions.length" class="mt-1 flex flex-wrap gap-1">
        <button
          v-for="one in message.reactions"
          :key="one.emoji"
          type="button"
          class="flex h-6 items-center gap-1 rounded-full border px-1.5 text-sm transition"
          :class="one.users.includes(meId) ? 'border-accent bg-accent-soft text-accent-soft-foreground' : 'border-separator bg-surface hover:border-accent/50'"
          :title="one.users.map((id) => person(id)?.name ?? 'Сотрудник').join(', ')"
          @click.stop="emit('react', one.emoji)"
        >
          <span class="leading-none">{{ one.emoji }}</span><span class="text-xs font-medium tabular-nums">{{ one.users.length }}</span>
        </button>
      </div>
      <!-- Кто дочитал до этого сообщения. -->
      <button
        v-if="readers?.length"
        type="button"
        class="mt-1 flex items-center -space-x-1.5 rounded-full p-0.5 transition hover:bg-black/5"
        :title="`Просмотрели: ${readers!.map((one) => one.name).join(', ')}`"
        @click.stop="emit('menu', $event, true)"
      >
        <ChatFace v-for="one in readers!.slice(0, 3)" :key="one.id" :user="one" size="xs" class="!size-[18px] !text-[8px] ring-2 ring-[var(--surface-secondary)]" />
        <span v-if="readers!.length > 3" class="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-default px-1 text-[10px] font-semibold text-muted ring-2 ring-[var(--surface-secondary)]">+{{ readers!.length - 3 }}</span>
      </button>
    </div>

    <!-- Сбоку пузыря при наведении: «⋯» — все действия (то же — правый
         щелчок). Ответ — двойной щелчок по сообщению. -->
    <div
      v-if="!message.deleted && !message.pending"
      class="flex shrink-0 flex-col pt-0.5 transition-opacity"
      :class="active || menuOpen ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100'"
      @click.stop
      @dblclick.stop
    >
      <button
        type="button"
        class="msg-side-btn"
        aria-label="Действия с сообщением"
        title="Действия"
        @click="emit('menu', $event, false)"
      ><MoreHorizontal class="size-[18px]" /></button>
    </div>
  </div>
</template>
