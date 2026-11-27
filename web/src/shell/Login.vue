<!-- Вход сотрудника: фото на весь экран (выбранное в портале, полный размер),
     над модалкой с формой — логотип, под ней — подпись и смена темы.
     Учётки и пароли выдают администраторы, регистрации и сброса нет. -->
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
const forgot = ref(false);
const error = ref("");
const busy = ref(false);

const photo = computed(() => {
  const one = fullPhoto(backdrop.value);
  return { backgroundColor: one.color, backgroundImage: one.image };
});
const year = new Date().getFullYear();

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
  <main class="login" :style="photo">
    <div class="login__stack">
      <div class="login__brand-light"><Brand /></div>

      <section class="login__card">
      <form class="login__form" novalidate @submit.prevent="submit">
        <header class="login__head">
          <h1 class="login__title">Вход в портал</h1>
          <p class="login__sub">Войдите под учётной записью сотрудника</p>
        </header>

        <label class="login__label">
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

        <div class="login__label">
          <div class="flex items-baseline justify-between">
            <label class="label" for="login-password">Пароль</label>
            <button type="button" class="login__link" @click="forgot = !forgot">Забыли пароль?</button>
          </div>
          <span class="login__field">
            <Lock class="login__icon" :size="18" aria-hidden="true" />
            <input
              id="login-password"
              v-model="password"
              class="input input--secondary input--full-width pr-11"
              :type="shown ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Ваш пароль"
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
          <p v-if="forgot" class="login__note">Пароль меняет администратор портала — напишите ему, и он выдаст новый.</p>
        </div>

        <p v-if="error" class="login__error" role="alert">{{ error }}</p>

        <button
          class="button button--primary button--lg button--full-width"
          :disabled="busy"
          :data-pending="busy ? 'true' : undefined"
        >
          {{ busy ? "Входим…" : "Войти" }}
        </button>
      </form>
      </section>

      <footer class="login__foot">
        <span>© {{ year }} Korzilla CRM</span>
        <button
          type="button"
          class="login__theme"
          :aria-label="dark ? 'Светлая тема' : 'Тёмная тема'"
          :title="dark ? 'Светлая тема' : 'Тёмная тема'"
          @click="flipTheme"
        >
          <Sun v-if="dark" :size="16" />
          <Moon v-else :size="16" />
        </button>
      </footer>
    </div>

  </main>
</template>

<style scoped>
/* Акцент входа — фирменный зелёный вместо синего (просьба пользователя):
   кнопка #82bd40 — между #87c540 и #7eb53f, белый текст читается; обводка
   фокуса — светлее, #87c540. */
.login {
  --accent: #82bd40;
  --accent-hover: #74ab36;
  --accent-foreground: #fff;
  --accent-soft: color-mix(in oklab, #87c540 16%, transparent);
  --accent-soft-foreground: #4d7a1c;
  --focus: #87c540;
  --field-border-focus: #87c540;
  --field-focus: #87c540;
  position: fixed;
  inset: 0;
  z-index: 10;
  overflow-y: auto;
  color: var(--foreground);
}

/* Общая форма */
.login__form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: 360px;
}
.login__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
}
.login__title {
  font-size: 28px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.login__sub {
  font-size: 14px;
  color: var(--muted);
}
.login__label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.login__form .input {
  height: 46px;
  border-radius: 12px;
  padding-left: 42px;
  font-size: 15px;
}
.login__form .button--lg {
  height: 46px;
  border-radius: 12px;
  margin-top: 4px;
  font-size: 15px;
}
.login__field {
  position: relative;
  display: block;
}
.login__icon {
  position: absolute;
  left: 14px;
  top: 50%;
  translate: 0 -50%;
  color: var(--muted);
  pointer-events: none;
}
.login__eye {
  position: absolute;
  right: 7px;
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
.login__link {
  font-size: 13px;
  color: #5f8f2a;
}
.dark .login__link {
  color: #9ccf62;
}
.login__link:hover {
  text-decoration: underline;
}
.login__note {
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted);
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--default);
}
.login__error {
  margin-top: -6px;
  font-size: 14px;
  color: var(--danger);
}
.login__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  font-size: 13px;
  color: var(--muted);
}
.login__theme {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  color: var(--muted);
}
.login__theme:hover {
  background: var(--default);
  color: var(--foreground);
}
.login__brand-light {
  font-size: 26px;
  color: white;
  filter: drop-shadow(0 2px 12px oklch(0 0 0 / 0.4));
}

/* Фото на весь экран, логотип и модалка по центру */
.login {
  display: grid;
  place-items: center;
  padding: 32px 16px;
  background-size: cover;
  background-position: center;
  background-color: var(--surface);
}
.login::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: radial-gradient(120% 90% at 50% 45%, oklch(0 0 0 / 0.12), oklch(0 0 0 / 0.45));
}
.dark .login::before {
  background: radial-gradient(120% 90% at 50% 45%, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.6));
}
.login__stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  width: 100%;
  max-width: 408px;
}
.login__card {
  width: 100%;
  padding: 48px 44px 44px;
  border-radius: 40px;
  background: var(--surface);
  border: 1px solid color-mix(in oklab, var(--foreground) 6%, transparent);
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.08),
    0 12px 24px -6px oklch(0 0 0 / 0.18),
    0 40px 80px -24px oklch(0 0 0 / 0.45);
}
.login__card .login__form {
  max-width: none;
}
.login__foot {
  padding: 0 6px;
  color: oklch(1 0 0 / 0.78);
  text-shadow: 0 1px 4px oklch(0 0 0 / 0.45);
}
.login__theme {
  color: white;
  background: oklch(0 0 0 / 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.login__theme:hover {
  background: oklch(0 0 0 / 0.38);
  color: white;
}
</style>
