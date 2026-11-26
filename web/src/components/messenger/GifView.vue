<!-- GIF или стикер в ленте чата. GIF — видео mp4 (легче гифки), если сервис
     его дал; стикер — картинкой с прозрачностью, без пузыря. -->
<script setup lang="ts">
import { computed } from "vue";
import type { GifItem } from "../../lib/gifs";

const props = defineProps<{ gif: GifItem }>();
const emit = defineEmits<{ load: [] }>();

const sticker = computed(() => props.gif.type === "sticker");
const box = computed(() => {
  const { width, height } = props.gif.full;
  const max = sticker.value ? 160 : 280;
  if (!width || !height) return { width: `${max}px`, aspectRatio: "1 / 1" };
  const scale = Math.min(1, max / width, (sticker.value ? 160 : 320) / height);
  return { width: `${Math.round(width * scale)}px`, aspectRatio: `${width} / ${height}` };
});
</script>

<template>
  <div class="relative max-w-full overflow-hidden" :class="sticker ? '' : 'rounded-xl bg-black/5'" :style="box">
    <video v-if="gif.full.mp4 && !sticker" :src="gif.full.mp4" :poster="gif.preview.url" class="size-full object-cover" autoplay loop muted playsinline disablepictureinpicture :aria-label="gif.title || 'GIF'" @loadeddata="emit('load')" />
    <img v-else :src="gif.full.url" :alt="gif.title || (sticker ? 'Стикер' : 'GIF')" class="size-full" :class="sticker ? 'object-contain' : 'object-cover'" loading="lazy" @load="emit('load')" />
    <span v-if="!sticker" class="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1 text-[10px] font-semibold text-white">GIF</span>
  </div>
</template>
