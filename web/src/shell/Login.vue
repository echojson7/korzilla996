<!-- Вход сотрудника: выбранное фото во весь экран (полный размер), форма —
     стеклянная карточка по центру. Учётки заводят администраторы. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Eye, EyeOff, Lock, Moon, Sun, User } from "@lucide/vue";
import { login, ApiError } from "../lib/api";
import { auth } from "../lib/session";
import { backdrop, fullPhoto, theme } from "../lib/look";
import Brand from "../components/Brand.vue";

const email = ref("");
const password = ref("");
const shown = ref(false);
const error = ref("");
const busy = ref(false);

const bg = computed(() => {
  const one = fullPhoto(backdrop.value);
  return { backgroundColor: one.color, backgroundImage: one.image };
});

const dark = ref(document.documentElement.classList.contains("dark"));
function flipTheme() {
  dark.value = !dark.value;
  theme.value = dark.value ? "dark" : "light";
}

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
  <main class="login" :style="bg">
    <form class="login__form" novalidate @submit.prevent="submit">
      <header class="flex flex-col items-center gap-2 pb-2 text-center">
        <h1 class="text-[30px] leading-none"><Brand /></h1>
        <p class="text-sm text-muted">Вход в портал компании</p>
      </header>

      <label class="flex flex-col gap-1.5">
        <span class="label">Логин или почта</span>
        <span class="login__field">
          <User class="login__icon" :size="18" aria-hidden="true" />
          <input
            v-model="email"
            class="input input--secondary input--full-width"
            autocomplete="username"
            placeholder="name@korzilla.ru"
            :aria-invalid="error ? 'true' : undefined"
            required
            autofocus
          />
        </span>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="label">Пароль</span>
        <span class="login__field">
          <Lock class="login__icon" :size="18" aria-hidden="true" />
          <input
            v-model="password"
            class="input input--secondary input--full-width pr-11"
            :type="shown ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="••••••••"
            :aria-invalid="error ? 'true' : undefined"
            required
          />
          <button
            type="button"
            class="login__eye"
            :aria-label="shown ? 'Скрыть пароль' : 'Показать пароль'"
            @click="shown = !shown"
          >
            <EyeOff v-if="shown" :size="18" />
            <Eye v-else :size="18" />
          </button>
        </span>
      </label>

      <p v-if="error" class="-mt-1 text-sm text-danger" role="alert">{{ error }}</p>

      <button
        class="button button--primary button--lg button--full-width mt-1"
        :disabled="busy || !email.trim() || !password"
        :data-pending="busy ? 'true' : undefined"
      >
        {{ busy ? "Входим…" : "Войти" }}
      </button>

      <p class="text-center text-xs leading-relaxed text-muted">
        Нет учётки или забыли пароль — напишите администратору портала.
      </p>
    </form>

    <div class="flex items-start justify-center">
      <button
        type="button"
        class="login__theme button button--icon-only button--md"
        :aria-label="dark ? 'Светлая тема' : 'Тёмная тема'"
        :title="dark ? 'Светлая тема' : 'Тёмная тема'"
        @click="flipTheme"
      >
        <Sun v-if="dark" :size="18" />
        <Moon v-else :size="18" />
      </button>
    </div>
  </main>
</template>

<style scoped>
.login {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  grid-template-rows: max(0px, calc(50dvh - 240px)) auto 1fr;
  justify-items: center;
  padding: 16px;
  overflow-y: auto;
  background-size: cover;
  background-position: center;
  color: var(--foreground);
}
.login::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: radial-gradient(ellipse at center, oklch(0 0 0 / 0.1), oklch(0 0 0 / 0.35));
}
.dark .login::before {
  background: radial-gradient(ellipse at center, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.55));
}
.login__form {
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 380px;
  padding: 32px 28px 24px;
  border-radius: 24px;
  background: color-mix(in oklab, var(--surface) 90%, transparent);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid color-mix(in oklab, white 35%, transparent);
  box-shadow: 0 24px 60px -12px oklch(0 0 0 / 0.35);
}
.dark .login__form {
  border-color: color-mix(in oklab, white 10%, transparent);
}
.login__form .input {
  height: 44px;
  border-radius: 12px;
  padding-left: 40px;
}
.login__field {
  position: relative;
  display: block;
}
.login__icon {
  position: absolute;
  left: 13px;
  top: 50%;
  translate: 0 -50%;
  color: var(--muted);
  pointer-events: none;
}
.login__eye {
  position: absolute;
  right: 6px;
  top: 50%;
  translate: 0 -50%;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--muted);
}
.login__eye:hover {
  background: var(--default);
  color: var(--foreground);
}
.login__form .button--lg {
  height: 44px;
  border-radius: 12px;
}
.login > div {
  grid-row: 3;
}
.login__theme {
  margin-top: 20px;
  color: white;
  background: oklch(0 0 0 / 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.login__theme:hover {
  background: oklch(0 0 0 / 0.4);
}
</style>
