<!-- Системное сообщение: событие чата пилюлей по центру, как в Telegram.
     Имена — ссылки на профиль сотрудника, время — в подсказке. Текст
     собирается из meta; старые сообщения — из body. -->
<script setup lang="ts">
import { computed } from "vue";
import { person, clock, type ChatMessage } from "../../lib/messenger";
import { href } from "../../lib/router";

const props = defineProps<{ message: ChatMessage }>();

type Part = { text: string } | { user: number } | { strong: string };

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
const name = (id: number) => person(id)?.name ?? "Сотрудник";
</script>

<template>
  <!-- Как в Telegram: компактная полупрозрачная пилюля по центру ленты. -->
  <div class="my-2.5 flex justify-center px-4">
    <p class="max-w-[min(520px,88%)] rounded-[14px] bg-black/22 px-3 py-[5px] text-center text-[13.5px] leading-[18px] font-medium text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.12)] backdrop-blur-sm dark:bg-white/10" :title="clock(message.at)">
      <template v-if="parts">
        <template v-for="(part, i) in parts" :key="i">
          <a v-if="'user' in part" :href="href('/staff', { open: part.user })" class="font-semibold underline decoration-white/50 underline-offset-2 transition-colors hover:decoration-white" :title="`Профиль: ${name(part.user)}`" @click.stop>{{ name(part.user) }}</a>
          <b v-else-if="'strong' in part" class="font-semibold">{{ part.strong }}</b>
          <template v-else>{{ part.text }}</template>
        </template>
      </template>
      <template v-else>{{ message.body }}</template>
    </p>
  </div>
</template>
