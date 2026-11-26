<!-- Всплывающая панель у кнопки: меню, выбор людей, смайлики, срок и т. п.
     Панель выносится в body (Teleport) и стоит поверх всего — карточек,
     чатов, окон. Положение считает Floating UI: если снизу (или справа)
     не помещается — открывается с другой стороны, к краю экрана не
     прилипает, высоту ограничивает видимой областью и прокручивается
     внутри. Следит за прокруткой и размером окна. Закрывается щелчком
     мимо и Esc (Esc закрывает только панель, не карточку под ней). -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { autoUpdate, computePosition, flip, offset, shift, size, type Placement } from "@floating-ui/dom";

const props = withDefaults(defineProps<{ align?: "left" | "right"; width?: string; up?: boolean }>(), { align: "right", width: "w-72", up: false });
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const placement = computed<Placement>(() => `${props.up ? "top" : "bottom"}-${props.align === "right" ? "end" : "start"}`);
const side = ref<"top" | "bottom">("bottom");
let stop: (() => void) | null = null;

/* Якорь — сама кнопка (первый ребёнок обёртки), а не вся обёртка. */
const anchor = () => (root.value?.firstElementChild as HTMLElement | null) ?? root.value;

async function place() {
  const ref_ = anchor();
  const el = panel.value;
  if (!ref_ || !el) return;
  const result = await computePosition(ref_, el, {
    strategy: "fixed",
    placement: placement.value,
    middleware: [
      offset(8),
      flip({ padding: 8, fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, availableWidth, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, Math.floor(availableHeight))}px`;
          elements.floating.style.maxWidth = `${Math.floor(availableWidth)}px`;
        },
      }),
    ],
  });
  Object.assign(el.style, { left: `${result.x}px`, top: `${result.y}px` });
  side.value = result.placement.startsWith("top") ? "top" : "bottom";
}

const outside = (event: Event) => {
  const target = event.target as Node;
  if (root.value?.contains(target) || panel.value?.contains(target)) return;
  /* Щелчок внутри другой открытой панели, вложенной в эту, — не закрываем. */
  if ((target as HTMLElement).closest?.("[data-popover]") && panel.value && (target as HTMLElement).closest("[data-popover]") !== panel.value) {
    const owner = (target as HTMLElement).closest("[data-popover]") as HTMLElement;
    if (owner.dataset.parent === panelId) return;
  }
  open.value = false;
};
const key = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  event.stopImmediatePropagation();
  open.value = false;
};
const panelId = Math.random().toString(36).slice(2);
const parentId = ref<string | undefined>(undefined);

watch(open, async (on) => {
  document[on ? "addEventListener" : "removeEventListener"]("pointerdown", outside, true);
  document[on ? "addEventListener" : "removeEventListener"]("keydown", key as EventListener, true);
  stop?.();
  stop = null;
  if (!on) return;
  parentId.value = (root.value?.closest("[data-popover]") as HTMLElement | null)?.dataset.id;
  await nextTick();
  const ref_ = anchor();
  if (ref_ && panel.value) stop = autoUpdate(ref_, panel.value, place);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", key as EventListener, true);
  stop?.();
});
const close = () => (open.value = false);
defineExpose({ close });
</script>

<template>
  <div ref="root" class="relative">
    <slot name="trigger" :open="open" :toggle="() => (open = !open)" />
    <Teleport to="body">
      <Transition name="pop">
        <div
          v-if="open"
          ref="panel"
          data-popover
          :data-id="panelId"
          :data-parent="parentId"
          class="popover-layer fixed top-0 left-0 overflow-y-auto overscroll-contain rounded-2xl bg-overlay p-1.5 text-overlay-foreground shadow-overlay thin-scroll"
          :class="[side === 'top' ? 'origin-bottom' : 'origin-top', width]"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
