<!-- Вход сотрудника: карточка на фоне фото. Учётки заводит только консоль. -->
<script setup lang="ts">
import { ref } from "vue";
import { login, ApiError } from "../lib/api";
import { auth } from "../lib/session";
import Logo from "../components/Logo.vue";

const email = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    auth.me = await login(email.value.trim(), password.value);
  } catch (err) {
    error.value = err instanceof ApiError ? err.first : "Нет связи с сервером. Попробуйте ещё раз.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="photo-shade flex h-full items-center justify-center p-4">
    <form class="card card--default w-full max-w-[26rem] gap-5 p-7 shadow-overlay" @submit.prevent="submit">
      <div class="flex items-center gap-3">
        <Logo class="size-12 shrink-0" />
        <div>
          <h1 class="font-brand text-[22px] leading-none tracking-[0.01em]">Korzilla <span class="opacity-55">996</span></h1>
          <p class="mt-1.5 text-sm text-muted">Портал компании</p>
        </div>
      </div>
      <label class="flex flex-col gap-1.5">
        <span class="label">Почта или логин</span>
        <input v-model="email" class="input input--full-width" autocomplete="username" required autofocus />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="label">Пароль</span>
        <input v-model="password" class="input input--full-width" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <button class="button button--primary button--lg button--full-width" :disabled="busy" :data-pending="busy ? 'true' : undefined">
        {{ busy ? "Входим…" : "Войти" }}
      </button>
      <p class="text-center text-xs text-muted">Нет учётки — попросите администратора портала.</p>
    </form>
  </div>
</template>
