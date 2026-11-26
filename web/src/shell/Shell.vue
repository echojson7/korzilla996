<!-- Оболочка: меню слева, шапка, раздел. Разделы держатся в KeepAlive:
     возврат в уже открытый раздел мгновенный и с тем же скроллом. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Sidebar from "./Sidebar.vue";
import Topbar from "./Topbar.vue";
import Palette from "./Palette.vue";
import ChatRail from "./ChatRail.vue";
import Toasts from "../components/Toasts.vue";
import { route } from "../lib/router";
import { views, pageOf, warmUp } from "../pages";
import { local } from "../lib/prefs";

const collapsed = local("collapsed", false);
const mobileOpen = ref(false);
const searching = ref(false);

const view = computed(() => views.get(pageOf(route.value.path).path));
watch(() => route.value.path, () => {
  document.title = `${pageOf(route.value.path).title} — Korzilla 996`;
}, { immediate: true });

const onKey = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "k" || event.code === "KeyK")) {
    event.preventDefault();
    searching.value = !searching.value;
  }
};
onMounted(() => {
  document.addEventListener("keydown", onKey);
  warmUp();
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="photo-shade flex h-full">
    <Sidebar :collapsed="collapsed" :mobile-open="mobileOpen" @toggle="collapsed = !collapsed" @close-mobile="mobileOpen = false" />
    <div class="flex min-w-0 flex-1 flex-col">
      <Topbar @menu="mobileOpen = true" @search="searching = true" />
      <main class="min-h-0 flex-1">
        <KeepAlive :max="6">
          <component :is="view" :key="pageOf(route.path).path" />
        </KeepAlive>
      </main>
    </div>
    <ChatRail />
    <Palette :open="searching" @close="searching = false" />
    <Toasts />
  </div>
</template>
