<!-- Выбор эмодзи: недавние сверху, дальше по группам. -->
<script setup lang="ts">
import { ref } from "vue";
import { EMOJI, recent, remember } from "../../lib/emoji";

const emit = defineEmits<{ pick: [emoji: string] }>();
const tab = ref(recent.value.length ? -1 : 0);
const pick = (emoji: string) => {
  remember(emoji);
  emit("pick", emoji);
};
</script>

<template>
  <div class="w-[320px] max-w-[calc(100vw-24px)]">
    <div class="flex gap-0.5 border-b border-separator px-1 pb-1.5">
      <button v-if="recent.length" type="button" class="rounded-lg px-2 py-1 text-xs" :class="tab === -1 ? 'bg-default font-semibold' : 'text-muted hover:bg-default'" @click="tab = -1">Недавние</button>
      <button v-for="(group, i) in EMOJI" :key="group.name" type="button" class="rounded-lg px-2 py-1 text-base" :class="tab === i ? 'bg-default' : 'hover:bg-default'" :title="group.name" @click="tab = i">{{ group.list[0] }}</button>
    </div>
    <div class="grid h-52 grid-cols-8 content-start gap-0.5 overflow-y-auto p-1 thin-scroll">
      <button v-for="emoji in tab === -1 ? recent : EMOJI[tab].list" :key="emoji" type="button" class="flex size-9 items-center justify-center rounded-lg text-[22px] leading-none transition hover:scale-110 hover:bg-default" @click="pick(emoji)">{{ emoji }}</button>
    </div>
  </div>
</template>
