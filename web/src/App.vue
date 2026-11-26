<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import Shell from "./shell/Shell.vue";
import UpdateGate from "./shell/UpdateGate.vue";
import { auth } from "./lib/session";

/* Экран входа нужен редко — отдельным куском. */
const Login = defineAsyncComponent(() => import("./shell/Login.vue"));
</script>

<template>
  <template v-if="auth.ready">
    <Shell v-if="auth.me" />
    <Login v-else />
  </template>
  <UpdateGate />
</template>
