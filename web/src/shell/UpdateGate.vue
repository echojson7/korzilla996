<!-- Портал обновлён: окно поверх всего, интерфейс под ним недоступен,
     пока страницу не перезагрузят. -->
<script setup lang="ts">
import { onMounted, ref, watch, nextTick } from "vue";
import { RefreshCw } from "@lucide/vue";
import { outdated, reloadFresh, watchUpdates } from "../lib/update";

const button = ref<HTMLButtonElement | null>(null);
const busy = ref(false);

onMounted(watchUpdates);
watch(outdated, (on) => {
  const app = document.getElementById("app");
  /* Всё остальное — недоступно ни мышью, ни клавиатурой, ни читалкой. */
  if (app) app.inert = on;
  if (on) nextTick(() => button.value?.focus());
});

function reload() {
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
        <div class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <RefreshCw class="size-6" />
        </div>
        <h2 id="update-title" class="text-lg font-semibold">Портал обновлён</h2>
        <p id="update-text" class="mt-1 text-sm text-muted">Вышла новая версия. Обновите страницу, чтобы продолжить работу.</p>
        <button ref="button" type="button" class="button button--primary mt-5 w-full" :disabled="busy" @click="reload">
          <RefreshCw class="size-4" :class="{ 'animate-spin': busy }" />Обновить страницу
        </button>
      </div>
    </div>
  </Teleport>
</template>
