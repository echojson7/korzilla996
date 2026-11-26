<!-- Кроп аватара: картинку двигают пальцем или мышью, масштаб — ползунком,
     колесом или щипком. Круг показывает, что будет видно. Режем в браузере
     в квадрат до 1024 px (WebP), сервер делает из него размеры. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ZoomIn, ZoomOut, RotateCcw } from "@lucide/vue";
import Modal from "../messenger/Modal.vue";

const props = defineProps<{ file: File | null; busy?: boolean; progress?: number }>();
const emit = defineEmits<{ close: []; done: [image: Blob] }>();

const VIEW = 288;
const MAX_ZOOM = 5;
const url = ref<string | null>(null);
const img = ref<HTMLImageElement | null>(null);
const natural = ref({ w: 0, h: 0 });
const zoom = ref(1);
const offset = ref({ x: 0, y: 0 });
const failed = ref(false);
const preview = ref<HTMLCanvasElement | null>(null);

watch(() => props.file, (file) => {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = file ? URL.createObjectURL(file) : null;
  natural.value = { w: 0, h: 0 };
  zoom.value = 1;
  offset.value = { x: 0, y: 0 };
  failed.value = false;
}, { immediate: true });
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value));

/* base — масштаб «закрыть круг целиком», дальше — zoom сверху. */
const base = computed(() => (natural.value.w ? VIEW / Math.min(natural.value.w, natural.value.h) : 1));
const scale = computed(() => base.value * zoom.value);
const style = computed(() => ({
  width: `${natural.value.w * scale.value}px`,
  height: `${natural.value.h * scale.value}px`,
  transform: `translate(calc(-50% + ${offset.value.x}px), calc(-50% + ${offset.value.y}px))`,
}));

function clamp(next: { x: number; y: number }) {
  const maxX = Math.max(0, (natural.value.w * scale.value - VIEW) / 2);
  const maxY = Math.max(0, (natural.value.h * scale.value - VIEW) / 2);
  return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
}
function setZoom(value: number, around?: { x: number; y: number }) {
  const prev = scale.value;
  zoom.value = Math.min(MAX_ZOOM, Math.max(1, value));
  /* Масштаб вокруг точки под курсором/пальцами, а не вокруг центра. */
  const k = scale.value / prev;
  const at = around ?? { x: 0, y: 0 };
  offset.value = clamp({ x: at.x + (offset.value.x - at.x) * k, y: at.y + (offset.value.y - at.y) * k });
}

function onLoad() {
  const el = img.value!;
  natural.value = { w: el.naturalWidth, h: el.naturalHeight };
  void nextTick(draw);
}

/* Перетаскивание и щипок. */
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0;
const box = ref<HTMLElement | null>(null);
const local = (event: PointerEvent | WheelEvent) => {
  const rect = box.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left - VIEW / 2, y: event.clientY - rect.top - VIEW / 2 };
};
function down(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) pinch = distance();
}
function distance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function move(event: PointerEvent) {
  const last = pointers.get(event.pointerId);
  if (!last) return;
  if (pointers.size === 1) {
    offset.value = clamp({ x: offset.value.x + event.clientX - last.x, y: offset.value.y + event.clientY - last.y });
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2 && pinch) {
    const now = distance();
    setZoom(zoom.value * (now / pinch));
    pinch = now;
  }
}
function up(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = 0;
}
function wheel(event: WheelEvent) {
  setZoom(zoom.value * Math.exp(-event.deltaY * 0.0015), local(event));
}
function key(event: KeyboardEvent) {
  const step = event.shiftKey ? 30 : 8;
  const map: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (map[event.key]) {
    event.preventDefault();
    offset.value = clamp({ x: offset.value.x + map[event.key][0], y: offset.value.y + map[event.key][1] });
  } else if (event.key === "+" || event.key === "=") setZoom(zoom.value * 1.1);
  else if (event.key === "-") setZoom(zoom.value / 1.1);
}

/* Квадрат в координатах исходной картинки. */
function source() {
  const side = VIEW / scale.value;
  const cx = natural.value.w / 2 - offset.value.x / scale.value;
  const cy = natural.value.h / 2 - offset.value.y / scale.value;
  return { sx: cx - side / 2, sy: cy - side / 2, side };
}
function paint(canvas: HTMLCanvasElement, out: number, fill = false) {
  const { sx, sy, side } = source();
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (fill) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out, out);
  }
  ctx.drawImage(img.value!, sx, sy, side, side, 0, 0, out, out);
}
let frame = 0;
function draw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => preview.value && img.value && natural.value.w && paint(preview.value, 112));
}
watch([zoom, offset], draw);

const toBlob = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
async function save() {
  if (!img.value || !natural.value.w) return;
  const out = Math.round(Math.min(1024, Math.max(256, source().side)));
  const canvas = document.createElement("canvas");
  paint(canvas, out);
  let blob = await toBlob(canvas, "image/webp");
  /* Safari не умеет WebP в canvas — тогда JPEG на белом. */
  if (!blob || blob.type !== "image/webp") {
    paint(canvas, out, true);
    blob = await toBlob(canvas, "image/jpeg");
  }
  if (blob) emit("done", blob);
}
</script>

<template>
  <Modal :open="!!file" title="Новый аватар" width="max-w-[400px]" @close="emit('close')">
    <p v-if="failed" class="py-8 text-center text-sm text-danger">Не получилось открыть картинку. Подойдут JPEG, PNG или WebP.</p>
    <div v-else class="flex flex-col items-center gap-4">
      <div
        ref="box"
        class="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-neutral-900 outline-none select-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent"
        :style="{ width: `${VIEW}px`, height: `${VIEW}px` }"
        tabindex="0"
        aria-label="Область кадра: двигайте стрелками, масштаб — плюс и минус"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @wheel.prevent="wheel"
        @keydown="key"
      >
        <img v-if="url" ref="img" :src="url" alt="" draggable="false" class="pointer-events-none absolute top-1/2 left-1/2 max-w-none" :class="natural.w ? '' : 'opacity-0'" :style="style" @load="onLoad" @error="failed = true" />
        <div class="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ring-2 ring-white/85" />
      </div>

      <div class="flex w-full items-center gap-3">
        <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Мельче" @click="setZoom(zoom / 1.2)"><ZoomOut class="size-4" /></button>
        <input type="range" class="min-w-0 flex-1 accent-[var(--accent)]" min="1" :max="MAX_ZOOM" step="0.01" :value="zoom" aria-label="Масштаб" @input="setZoom(Number(($event.target as HTMLInputElement).value))" />
        <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Крупнее" @click="setZoom(zoom * 1.2)"><ZoomIn class="size-4" /></button>
        <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Сбросить" title="Сбросить" @click="zoom = 1; offset = { x: 0, y: 0 }"><RotateCcw class="size-4" /></button>
      </div>

      <div class="flex w-full items-center gap-3 rounded-2xl bg-default/60 p-3">
        <canvas ref="preview" class="size-14 shrink-0 rounded-full" aria-hidden="true" />
        <p class="text-xs text-muted">Так аватар будет выглядеть в чатах, задачах и списке сотрудников. Двигайте картинку, чтобы лицо было в круге.</p>
      </div>
    </div>
    <template #footer>
      <span v-if="busy && progress != null" class="mr-auto text-xs text-muted tabular-nums">Загрузка {{ Math.round(progress * 100) }}%</span>
      <button type="button" class="button button--secondary" :disabled="busy" @click="emit('close')">Отмена</button>
      <button type="button" class="button button--primary" :disabled="busy || failed || !natural.w" @click="save">{{ busy ? "Сохраняем…" : "Сохранить" }}</button>
    </template>
  </Modal>
</template>
