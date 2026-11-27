<!-- Меню чата по правому щелчку в списке, как в Telegram: открыть в новой
     вкладке, закрепить, прочитано/непрочитано, без звука, выйти. Положение —
     Floating UI от точки щелчка, как у меню сообщения. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ExternalLink, Pin, PinOff, MailOpen, Mail, BellOff, Bell, LogOut } from "@lucide/vue";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { href } from "../../lib/router";
import { toast } from "../../lib/toast";
import { ApiError } from "../../lib/api";
import { meId, togglePin, setChatFlags, markChatRead, removeMember, type ChatItem } from "../../lib/messenger";

const props = defineProps<{ chat: ChatItem; x: number; y: number }>();
const emit = defineEmits<{ close: [] }>();

const box = ref<HTMLElement | null>(null);
const pos = ref({ left: props.x, top: props.y });
const confirming = ref(false);
const unread = computed(() => props.chat.unread > 0 || !!props.chat.markedUnread);
/* Выйти — только из обычной группы: каналы портала и личные чаты остаются. */
const canLeave = computed(() => props.chat.type === "group" && !props.chat.general && !props.chat.changelog);

async function place() {
  await nextTick();
  const el = box.value;
  if (!el) return;
  const point = { getBoundingClientRect: () => ({ x: props.x, y: props.y, left: props.x, top: props.y, right: props.x, bottom: props.y, width: 0, height: 0 }) };
  const result = await computePosition(point, el, {
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [offset(4), flip({ padding: 8, fallbackPlacements: ["top-start", "bottom-end", "top-end"] }), shift({ padding: 8 })],
  });
  pos.value = { left: result.x, top: result.y };
}

function run(action: () => unknown) {
  emit("close");
  action();
}
function openTab() {
  window.open(`${location.pathname}${href("/messenger", { chat: props.chat.id })}`, "_blank", "noopener");
}
async function leave() {
  if (!confirming.value) return (confirming.value = true);
  emit("close");
  try {
    await removeMember(props.chat.id, meId.value);
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Не получилось выйти из чата", "danger");
  }
}

const outside = (event: Event) => !box.value?.contains(event.target as Node) && emit("close");
const key = (event: KeyboardEvent) => event.key === "Escape" && (event.stopPropagation(), emit("close"));
const close = () => emit("close");
onMounted(() => {
  place();
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("contextmenu", outside, true);
  });
  document.addEventListener("keydown", key, true);
  document.addEventListener("scroll", close, true);
  window.addEventListener("resize", close, { once: true });
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("contextmenu", outside, true);
  document.removeEventListener("keydown", key, true);
  document.removeEventListener("scroll", close, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="box"
      role="menu"
      :aria-label="`Действия с чатом ${chat.title}`"
      class="popover-layer fixed top-0 left-0 w-[248px] rounded-2xl bg-overlay p-1.5 text-overlay-foreground shadow-overlay"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
      @contextmenu.prevent
    >
      <button type="button" role="menuitem" class="menu-row" @click="run(openTab)"><ExternalLink class="size-[18px]" />Открыть в новой вкладке</button>
      <button type="button" role="menuitem" class="menu-row" @click="run(() => togglePin(chat))"><PinOff v-if="chat.pinned" class="size-[18px]" /><Pin v-else class="size-[18px]" />{{ chat.pinned ? "Открепить" : "Закрепить" }}</button>
      <button v-if="unread" type="button" role="menuitem" class="menu-row" @click="run(() => markChatRead(chat))"><MailOpen class="size-[18px]" />Отметить прочитанным</button>
      <button v-else type="button" role="menuitem" class="menu-row" @click="run(() => setChatFlags(chat, { unread: true }))"><Mail class="size-[18px]" />Отметить непрочитанным</button>
      <button type="button" role="menuitem" class="menu-row" @click="run(() => setChatFlags(chat, { muted: !chat.muted }))"><Bell v-if="chat.muted" class="size-[18px]" /><BellOff v-else class="size-[18px]" />{{ chat.muted ? "Включить уведомления" : "Без звука" }}</button>
      <template v-if="canLeave">
        <div class="mx-1 my-1 h-px bg-separator" />
        <button type="button" role="menuitem" class="menu-row text-danger hover:!bg-danger/10" @click="leave"><LogOut class="size-[18px]" />{{ confirming ? "Точно выйти? Нажмите ещё раз" : "Выйти из чата" }}</button>
      </template>
    </div>
  </Teleport>
</template>
<style scoped>
.menu-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  text-align: left;
  transition: background-color 120ms;
}
.menu-row:hover,
.menu-row:focus-visible {
  background: var(--default);
  outline: none;
}
</style>

