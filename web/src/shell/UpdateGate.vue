<!-- Портал обновлён: окно поверх всего, интерфейс под ним недоступен,
     пока страницу не перезагрузят. Через 15 с перезагрузка сама. -->
<script setup lang="ts">
import { onMounted, ref, watch, nextTick } from "vue";

const WAIT = 15;
import { RefreshCw } from "@lucide/vue";
import { outdated, reloadFresh, watchUpdates } from "../lib/update";

const button = ref<HTMLButtonElement | null>(null);
const busy = ref(false);
const left = ref(WAIT);
let tick = 0;

onMounted(watchUpdates);
watch(outdated, (on) => {
  const app = document.getElementById("app");
  /* Всё остальное — недоступно ни мышью, ни клавиатурой, ни читалкой. */
  if (app) app.inert = on;
  if (!on) return;
  nextTick(() => button.value?.focus());
  left.value = WAIT;
  tick = window.setInterval(() => {
    left.value -= 1;
    if (left.value <= 0) {
      clearInterval(tick);
      reload();
    }
  }, 1000);
});

function reload() {
  if (busy.value) return;
  clearInterval(tick);
  busy.value = true;
  reloadFresh();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="outdated"
      class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-title"
      aria-describedby="update-text"
    >
      <div class="card w-full max-w-sm bg-surface p-6 text-center shadow-xl">
        <h2 id="update-title" class="text-lg font-semibold">Портал обновлён</h2>
        <p id="update-text" class="mt-1 text-sm text-muted">Вышла новая версия. Обновите страницу, чтобы продолжить работу. Через {{ WAIT }} секунд она обновится сама.</p>
        <button ref="button" type="button" class="button button--primary mt-5 w-full" :disabled="busy" @click="reload">
          <RefreshCw class="size-4" :class="{ 'animate-spin': busy }" />{{ busy ? "Обновляем…" : `Обновить страницу (${left})` }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
