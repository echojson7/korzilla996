<!-- Системное сообщение: событие чата карточкой во всю ширину ленты —
     значок события, текст, где имена — ссылки на профиль сотрудника,
     и время. Текст собирается из meta; старые сообщения — из body. -->
<script setup lang="ts">
import { computed } from "vue";
import { Sparkles, UserPlus, UserMinus, LogOut, LogIn, PencilLine, ImageIcon, Info } from "@lucide/vue";
import ChatFace from "./ChatFace.vue";
import { person, clock, type ChatMessage } from "../../lib/messenger";
import { href } from "../../lib/router";

const props = defineProps<{ message: ChatMessage }>();

type Part = { text: string } | { user: number } | { strong: string };
const ICON = { created: Sparkles, added: UserPlus, removed: UserMinus, left: LogOut, joined: LogIn, renamed: PencilLine, cover: ImageIcon } as const;
const TONE: Record<string, string> = { created: "bg-accent-soft text-accent", added: "bg-success/15 text-success", joined: "bg-success/15 text-success", removed: "bg-danger/12 text-danger", left: "bg-warning/15 text-warning", renamed: "bg-accent-soft text-accent", cover: "bg-accent-soft text-accent" };

const event = computed(() => String(props.message.meta?.event ?? ""));
const users = computed(() => (Array.isArray(props.message.meta?.users) ? (props.message.meta!.users as number[]) : []));
const actor = computed(() => props.message.userId);

function list(ids: number[]): Part[] {
  const out: Part[] = [];
  ids.forEach((id, i) => {
    if (i) out.push({ text: i === ids.length - 1 ? " и " : ", " });
    out.push({ user: id });
  });
  return out;
}
const parts = computed<Part[] | null>(() => {
  const who: Part[] = actor.value ? [{ user: actor.value }] : [{ text: "Кто-то" }];
  const body = props.message.body ?? "";
  switch (event.value) {
    case "created": return [...who, { text: " создаёт чат " }, { strong: `«${body.match(/«(.*)»/)?.[1] ?? ""}»` }];
    case "added": return [...who, { text: " добавляет в чат " }, ...list(users.value)];
    case "removed": return [...who, { text: " исключает из чата " }, ...list(users.value)];
    case "left": return [...who, { text: " выходит из чата" }];
    case "joined": return [...who, { text: " присоединяется к обсуждению" }];
    case "renamed": return [...who, { text: " переименовывает чат в " }, { strong: `«${String(props.message.meta?.title ?? "")}»` }];
    case "cover": return [...who, { text: body.includes("убирает") ? " убирает обложку чата" : " меняет обложку чата" }];
    default: return null;
  }
});
const icon = computed(() => ICON[event.value as keyof typeof ICON] ?? Info);
const tone = computed(() => TONE[event.value] ?? "bg-default text-muted");
const name = (id: number) => person(id)?.name ?? "Сотрудник";
</script>

<template>
  <div class="my-3 flex justify-start">
    <div class="flex w-full max-w-[min(620px,100%)] items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full" :class="tone"><component :is="icon" class="size-[18px]" /></span>
      <ChatFace v-if="actor && person(actor)" :user="person(actor)" size="sm" class="hidden sm:inline-flex" />
      <p class="min-w-0 flex-1 text-[15px] leading-snug text-foreground">
        <template v-if="parts">
          <template v-for="(part, i) in parts" :key="i">
            <a v-if="'user' in part" :href="href('/staff', { open: part.user })" class="font-semibold text-accent underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent" :title="`Профиль: ${name(part.user)}`" @click.stop>{{ name(part.user) }}</a>
            <b v-else-if="'strong' in part" class="font-semibold">{{ part.strong }}</b>
            <template v-else>{{ part.text }}</template>
          </template>
        </template>
        <template v-else>{{ message.body }}</template>
      </p>
      <span class="shrink-0 self-end text-xs text-muted tabular-nums">{{ clock(message.at) }}</span>
    </div>
  </div>
</template>
