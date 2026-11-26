<!-- Профиль сотрудника: свой или чужой (#/profile?id=5). Свой можно
     править (?edit=1): аватар с кропом, статус, контакты, о себе, день
     рождения, пароль. Должность и отдел правит администратор. -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  Phone, Mail, Send, MessageCircle, Cake, Building2, BriefcaseBusiness, ShieldCheck, CalendarDays, Pencil, MessageSquare,
  Camera, Trash2, Copy, KeyRound, Eye, EyeOff, ArrowLeft, X, AtSign, Users,
} from "@lucide/vue";
import Checkbox from "../components/Checkbox.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import AvatarCropper from "../components/profile/AvatarCropper.vue";
import { people, startDirect, loadPeople } from "../lib/messenger";
import {
  fetchProfile, saveProfile, uploadAvatar, removeAvatar, changePassword, avatarSrc, birthdayLabel, daysToBirthday, age,
  MESSENGERS, STATUSES, type Profile, type Messengers,
} from "../lib/profile";
import { auth } from "../lib/session";
import { ApiError } from "../lib/api";
import { route, setQuery, navigate, href } from "../lib/router";
import { plural, shortDate } from "../lib/format";
import { toast } from "../lib/toast";

const myId = computed(() => auth.me?.id ?? 0);
const id = computed(() => Number(route.value.query.get("id")) || myId.value);
const mine = computed(() => id.value === myId.value);
const admin = computed(() => !!profile.value?.org);
const editing = computed(() => route.value.query.get("edit") === "1" && !!profile.value?.form);

const profile = ref<Profile | null>(null);
const loading = ref(true);
const missing = ref(false);

async function load() {
  if (!id.value) return;
  loading.value = !profile.value || profile.value.id !== id.value;
  missing.value = false;
  try {
    profile.value = await fetchProfile(id.value);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) missing.value = true;
    else toast("Не получилось загрузить профиль", "danger");
  } finally {
    loading.value = false;
  }
}
watch(id, load, { immediate: true });
/* Профиль поменяли в другой вкладке или другой человек — в списке людей новая версия. */
watch(() => people.get(id.value)?.avatar, (avatar) => {
  if (profile.value && !editing.value && avatar !== profile.value.avatar) void load();
});

/* ---------- Просмотр ---------- */

const ROLE_TONE: Record<string, string> = { owner: "chip--warning", admin: "chip--accent", staff: "chip--default" };
const statusUntil = computed(() => (profile.value?.status?.until ? `до ${shortDate(new Date(profile.value.status.until))}` : ""));
const birthdayIn = computed(() => daysToBirthday(profile.value?.birthday));
const years = computed(() => age(profile.value?.birthdate));
const contacts = computed(() => {
  const one = profile.value;
  if (!one) return [];
  const out: { icon: typeof Phone; label: string; value: string; href: string | null; copy: string }[] = [];
  if (one.phone) out.push({ icon: Phone, label: "Телефон", value: one.phone, href: `tel:${one.phone.replace(/[^\d+]/g, "")}`, copy: one.phone });
  if (one.email?.includes("@")) out.push({ icon: Mail, label: "Почта", value: one.email, href: `mailto:${one.email}`, copy: one.email });
  for (const kind of MESSENGERS) {
    const value = one.messengers?.[kind.key];
    if (!value) continue;
    const icon = kind.key === "telegram" ? Send : kind.key === "whatsapp" ? MessageCircle : AtSign;
    const shown = kind.key === "telegram" || kind.key === "vk" ? `@${value}` : kind.key === "whatsapp" ? `+${value}` : value;
    out.push({ icon, label: kind.label, value: shown, href: kind.href(value), copy: shown });
  }
  return out;
});
const colleagues = computed(() => {
  const dept = profile.value?.department?.trim();
  if (!dept) return [];
  return [...people.values()].filter((one) => one.active && one.id !== profile.value!.id && one.department?.trim() === dept).sort((a, b) => a.name.localeCompare(b.name, "ru"));
});
if (!people.size) void loadPeople().catch(() => undefined);

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Скопировано");
  } catch {
    toast("Не получилось скопировать", "danger");
  }
}
async function write() {
  if (!profile.value) return;
  try {
    const chat = await startDirect(profile.value.id);
    navigate("/messenger", { chat: chat.id });
  } catch {
    toast("Не получилось открыть чат", "danger");
  }
}

/* ---------- Аватар ---------- */

const picker = ref<HTMLInputElement | null>(null);
const cropping = ref<File | null>(null);
const uploading = ref(false);
const progress = ref<number | undefined>();
function pick(event: Event) {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Это не картинка", "danger");
  if (file.size > 25 * 1024 * 1024) return toast("Картинка до 25 МБ", "danger");
  cropping.value = file;
}
async function upload(image: Blob) {
  if (!profile.value) return;
  uploading.value = true;
  progress.value = 0;
  try {
    profile.value = await uploadAvatar(profile.value.id, image, (part) => (progress.value = part));
    cropping.value = null;
    toast("Аватар обновлён", "success");
  } catch (error) {
    toast(error instanceof ApiError ? error.first : "Аватар не загрузился", "danger");
  } finally {
    uploading.value = false;
    progress.value = undefined;
  }
}
async function dropAvatar() {
  if (!profile.value) return;
  try {
    profile.value = await removeAvatar(profile.value.id);
  } catch {
    toast("Не получилось убрать аватар", "danger");
  }
}

/* ---------- Правка ---------- */

const form = reactive({
  name: "", position: "", department: "", phone: "", about: "", birthday: "", birthdayYearHidden: false,
  messengers: {} as Messengers, statusEmoji: "", statusText: "", statusUntil: "",
});
const errors = ref<Record<string, string[]>>({});
const saving = ref(false);
function fill() {
  const one = profile.value;
  if (!one?.form) return;
  Object.assign(form, {
    name: one.name, position: one.position ?? "", department: one.department ?? "", phone: one.phone ?? "", about: one.about ?? "",
    birthday: one.form.birthday ?? "", birthdayYearHidden: one.form.birthdayYearHidden,
    messengers: { ...one.messengers }, statusEmoji: one.form.status.emoji ?? "", statusText: one.form.status.text ?? "",
    statusUntil: one.form.status.until ? one.form.status.until.slice(0, 10) : "",
  });
  errors.value = {};
}
watch(editing, (on) => on && fill(), { immediate: true });
watch(() => profile.value?.id, () => editing.value && fill());

const departments = computed(() => [...new Set([...people.values()].map((one) => one.department?.trim()).filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "ru")));
const err = (key: string) => errors.value[key]?.[0];
function preset(one: { emoji: string; text: string }) {
  form.statusEmoji = one.emoji;
  form.statusText = one.text;
}
const clearStatus = () => Object.assign(form, { statusEmoji: "", statusText: "", statusUntil: "" });
const today = new Date().toISOString().slice(0, 10);

async function save() {
  if (!profile.value) return;
  saving.value = true;
  errors.value = {};
  try {
    const until = form.statusUntil ? new Date(`${form.statusUntil}T23:59:59`).toISOString() : null;
    profile.value = await saveProfile(profile.value.id, {
      name: form.name,
      ...(admin.value ? { position: form.position || null, department: form.department || null } : {}),
      phone: form.phone || null,
      messengers: form.messengers,
      about: form.about || null,
      birthday: form.birthday || null,
      birthdayYearHidden: form.birthdayYearHidden,
      status: form.statusEmoji || form.statusText ? { emoji: form.statusEmoji || null, text: form.statusText || null, until } : null,
    });
    toast("Профиль сохранён", "success");
    setQuery({ edit: null });
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) errors.value = error.errors;
    else toast("Не получилось сохранить", "danger");
  } finally {
    saving.value = false;
  }
}

/* ---------- Пароль ---------- */

const pass = reactive({ current: "", next: "", again: "", show: false, busy: false });
const passErrors = ref<Record<string, string[]>>({});
const strength = computed(() => {
  const value = pass.next;
  if (!value) return 0;
  let score = value.length >= 8 ? 1 : 0;
  if (value.length >= 12) score++;
  if (/[a-zа-я]/.test(value) && /[A-ZА-Я]/.test(value)) score++;
  if (/\d/.test(value) && /[^\p{L}\d]/u.test(value)) score++;
  return Math.max(1, score);
});
const STRENGTH = ["", "Слабый", "Так себе", "Хороший", "Надёжный"];
async function submitPassword() {
  passErrors.value = {};
  if (pass.next !== pass.again) return void (passErrors.value = { password: ["Пароли не совпадают"] });
  pass.busy = true;
  try {
    await changePassword(pass.current, pass.next);
    Object.assign(pass, { current: "", next: "", again: "", show: false });
    toast("Пароль изменён. На других устройствах нужно войти заново.", "success");
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) passErrors.value = error.errors;
    else toast("Не получилось сменить пароль", "danger");
  } finally {
    pass.busy = false;
  }
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto px-3 pt-2 pb-6 md:px-5 photo-scroll">
    <div class="mx-auto w-full max-w-[1040px]">
      <div class="on-photo flex items-center gap-2 pb-3">
        <a :href="href('/staff')" class="glass-light flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-sm"><ArrowLeft class="size-4" />Сотрудники</a>
      </div>

      <div v-if="loading" class="sheet animate-pulse rounded-3xl p-6 shadow-surface">
        <div class="flex items-center gap-5"><div class="size-28 rounded-full bg-default" /><div class="flex-1 space-y-3"><div class="h-6 w-1/3 rounded bg-default" /><div class="h-4 w-1/4 rounded bg-default" /></div></div>
      </div>
      <p v-else-if="missing || !profile" class="on-photo py-16 text-center">Такого сотрудника нет</p>

      <template v-else>
        <!-- Шапка профиля -->
        <section class="sheet relative overflow-hidden rounded-3xl shadow-surface">
          <div class="pointer-events-none absolute inset-x-0 top-0 h-28 hue-soft opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]" :style="{ '--hue': profile.hue }" aria-hidden="true" />
          <div class="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-end md:p-6">
            <div class="group relative size-28 shrink-0 self-center sm:self-auto">
              <img v-if="profile.avatar" :src="avatarSrc(profile.avatar, 112)!" alt="" class="size-28 rounded-full object-cover shadow-md ring-4 ring-surface" />
              <ChatFace v-else :user="profile" size="xl" class="size-28! text-4xl! shadow-md ring-4 ring-surface" />
              <button v-if="profile.form" type="button" class="absolute right-0.5 bottom-0.5 flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md ring-2 ring-surface transition hover:scale-105" aria-label="Сменить аватар" title="Сменить аватар" @click="picker?.click()"><Camera class="size-4" /></button>
            </div>
            <div class="min-w-0 flex-1 text-center sm:text-left">
              <h1 class="text-2xl leading-tight font-semibold tracking-tight md:text-[28px]">{{ profile.name }}</h1>
              <p class="mt-1 text-muted">{{ [profile.position, profile.department].filter(Boolean).join(" · ") || "Сотрудник" }}</p>
              <div class="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <span v-if="profile.status" class="chip chip--sm chip--soft chip--accent"><span class="chip__label">{{ profile.status.emoji }} {{ profile.status.text }}<template v-if="statusUntil"> · {{ statusUntil }}</template></span></span>
                <span class="chip chip--sm chip--soft" :class="ROLE_TONE[profile.role ?? 'staff']"><span class="chip__label">{{ profile.roleLabel }}</span></span>
                <span v-if="!profile.active" class="chip chip--sm chip--soft chip--danger"><span class="chip__label">Учётка выключена</span></span>
                <span v-if="birthdayIn === 0" class="chip chip--sm chip--soft chip--success"><span class="chip__label">🎂 Сегодня день рождения</span></span>
              </div>
            </div>
            <div class="flex shrink-0 flex-wrap justify-center gap-2">
              <button v-if="!mine" type="button" class="button button--primary" @click="write"><MessageSquare class="size-4" />Написать</button>
              <a v-if="!mine && profile.phone" :href="`tel:${profile.phone.replace(/[^\d+]/g, '')}`" class="button button--secondary"><Phone class="size-4" />Позвонить</a>
              <template v-if="profile.form">
                <button v-if="!editing" type="button" class="button button--secondary" @click="setQuery({ edit: 1 })"><Pencil class="size-4" />{{ mine ? "Изменить профиль" : "Изменить" }}</button>
                <button v-else type="button" class="button button--ghost" @click="setQuery({ edit: null })"><X class="size-4" />Закрыть правку</button>
              </template>
            </div>
          </div>
          <input ref="picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic" class="hidden" @change="pick" />
        </section>

        <!-- Просмотр -->
        <div v-if="!editing" class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
          <div class="flex min-w-0 flex-col gap-3">
            <section class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-3 text-sm font-semibold text-muted">Контакты</h2>
              <ul v-if="contacts.length" class="-mx-2">
                <li v-for="one in contacts" :key="one.label" class="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-default/70">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-default text-muted"><component :is="one.icon" class="size-4" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs text-muted">{{ one.label }}</span>
                    <a v-if="one.href" :href="one.href" class="block truncate font-medium hover:text-accent" :target="one.href.startsWith('http') ? '_blank' : undefined" rel="noopener">{{ one.value }}</a>
                    <span v-else class="block truncate font-medium">{{ one.value }}</span>
                  </span>
                  <button type="button" class="button button--ghost button--sm button--icon-only opacity-0 group-hover:opacity-100 focus:opacity-100" :aria-label="`Скопировать: ${one.label}`" @click="copy(one.copy)"><Copy class="size-4" /></button>
                </li>
              </ul>
              <p v-else class="text-sm text-muted">{{ mine ? "Добавьте телефон и мессенджеры, чтобы коллегам было проще связаться." : "Контакты не указаны." }}</p>
            </section>

            <section class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-2 text-sm font-semibold text-muted">О себе</h2>
              <p v-if="profile.about" class="leading-relaxed whitespace-pre-line">{{ profile.about }}</p>
              <p v-else class="text-sm text-muted">{{ mine ? "Расскажите о себе: чем занимаетесь, с какими вопросами к вам идти." : "Пока ничего о себе не написано." }}</p>
              <button v-if="mine && !profile.about" type="button" class="link mt-2 text-sm" @click="setQuery({ edit: 1 })">Заполнить</button>
            </section>
          </div>

          <div class="flex min-w-0 flex-col gap-3">
            <section class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-3 text-sm font-semibold text-muted">Подробнее</h2>
              <dl class="space-y-3 text-sm">
                <div v-if="profile.department" class="flex gap-3"><Building2 class="mt-0.5 size-4 shrink-0 text-muted" /><div><dt class="text-xs text-muted">Отдел</dt><dd><a :href="href('/staff', { dept: profile.department })" class="font-medium hover:text-accent">{{ profile.department }}</a></dd></div></div>
                <div v-if="profile.position" class="flex gap-3"><BriefcaseBusiness class="mt-0.5 size-4 shrink-0 text-muted" /><div><dt class="text-xs text-muted">Должность</dt><dd class="font-medium">{{ profile.position }}</dd></div></div>
                <div v-if="profile.birthday" class="flex gap-3"><Cake class="mt-0.5 size-4 shrink-0 text-muted" /><div><dt class="text-xs text-muted">День рождения</dt><dd class="font-medium">{{ birthdayLabel(profile.birthday) }}<span v-if="years != null" class="font-normal text-muted"> · {{ plural(years, "год", "года", "лет") }}</span></dd><dd v-if="birthdayIn && birthdayIn <= 30" class="text-xs text-success">через {{ plural(birthdayIn, "день", "дня", "дней") }}</dd></div></div>
                <div class="flex gap-3"><ShieldCheck class="mt-0.5 size-4 shrink-0 text-muted" /><div><dt class="text-xs text-muted">Доступ</dt><dd class="font-medium">{{ profile.roleLabel }}</dd></div></div>
                <div v-if="profile.since" class="flex gap-3"><CalendarDays class="mt-0.5 size-4 shrink-0 text-muted" /><div><dt class="text-xs text-muted">На портале</dt><dd class="font-medium">с {{ new Date(profile.since).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) }}</dd></div></div>
              </dl>
            </section>

            <section v-if="colleagues.length" class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><Users class="size-4" />Коллеги по отделу</h2>
              <a v-for="one in colleagues.slice(0, 8)" :key="one.id" :href="href('/profile', { id: one.id })" class="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-default/70">
                <ChatFace :user="one" size="sm" />
                <span class="min-w-0"><span class="block truncate text-sm font-medium">{{ one.name }}</span><span v-if="one.position" class="block truncate text-xs text-muted">{{ one.position }}</span></span>
              </a>
              <a v-if="colleagues.length > 8" :href="href('/staff', { dept: profile.department })" class="link mt-1 block text-sm">Все {{ colleagues.length + 1 }}</a>
            </section>
          </div>
        </div>

        <!-- Правка -->
        <form v-else class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_340px]" novalidate @submit.prevent="save">
          <div class="flex min-w-0 flex-col gap-3">
            <section class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-4 font-semibold">Основное</h2>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="textfield sm:col-span-2" :data-invalid="err('name') ? 'true' : undefined">
                  <label class="label" for="pf-name">Имя и фамилия</label>
                  <input id="pf-name" v-model="form.name" class="input input--full-width" maxlength="120" autocomplete="name" required />
                  <p v-if="err('name')" class="field-error" data-visible="true">{{ err("name") }}</p>
                </div>
                <div class="textfield" :data-invalid="err('position') ? 'true' : undefined">
                  <label class="label" for="pf-position">Должность</label>
                  <input id="pf-position" v-model="form.position" class="input input--full-width" maxlength="120" :disabled="!admin" />
                  <p v-if="err('position')" class="field-error" data-visible="true">{{ err("position") }}</p>
                  <p v-else-if="!admin" class="description">Меняет администратор</p>
                </div>
                <div class="textfield">
                  <label class="label" for="pf-dept">Отдел</label>
                  <input id="pf-dept" v-model="form.department" class="input input--full-width" maxlength="120" list="pf-depts" :disabled="!admin" />
                  <datalist id="pf-depts"><option v-for="one in departments" :key="one" :value="one" /></datalist>
                  <p v-if="!admin" class="description">Меняет администратор</p>
                </div>
                <div class="textfield" :data-invalid="err('birthday') ? 'true' : undefined">
                  <label class="label" for="pf-bday">День рождения</label>
                  <input id="pf-bday" v-model="form.birthday" type="date" class="input input--full-width" :max="today" min="1920-01-01" />
                  <p v-if="err('birthday')" class="field-error" data-visible="true">{{ err("birthday") }}</p>
                </div>
                <div class="flex items-end pb-2.5">
                  <Checkbox v-model="form.birthdayYearHidden" :disabled="!form.birthday"><span class="text-sm">Не показывать год</span></Checkbox>
                </div>
              </div>
            </section>

            <section class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-4 font-semibold">Контакты</h2>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="textfield" :data-invalid="err('phone') ? 'true' : undefined">
                  <label class="label" for="pf-phone">Телефон</label>
                  <input id="pf-phone" v-model="form.phone" type="tel" class="input input--full-width" placeholder="+7 900 000-00-00" maxlength="40" autocomplete="tel" />
                  <p v-if="err('phone')" class="field-error" data-visible="true">{{ err("phone") }}</p>
                </div>
                <div class="textfield">
                  <label class="label">Почта или логин</label>
                  <input :value="profile.email" class="input input--full-width" disabled />
                  <p class="description">Логин для входа, меняет администратор</p>
                </div>
                <div v-for="kind in MESSENGERS" :key="kind.key" class="textfield">
                  <label class="label" :for="`pf-${kind.key}`">{{ kind.label }}</label>
                  <input :id="`pf-${kind.key}`" v-model="form.messengers[kind.key]" class="input input--full-width" :placeholder="kind.placeholder" maxlength="120" />
                </div>
              </div>
            </section>

            <section class="sheet rounded-3xl p-5 shadow-surface">
              <div class="textfield" :data-invalid="err('about') ? 'true' : undefined">
                <label class="label font-semibold" for="pf-about">О себе</label>
                <textarea id="pf-about" v-model="form.about" class="textarea textarea--full-width min-h-28" maxlength="2000" rows="4" placeholder="Чем занимаетесь, с какими вопросами к вам идти, как удобнее связаться" />
                <p class="description text-right tabular-nums">{{ form.about.length }} / 2000</p>
                <p v-if="err('about')" class="field-error" data-visible="true">{{ err("about") }}</p>
              </div>
            </section>
          </div>

          <div class="flex min-w-0 flex-col gap-3">
            <section class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-4 font-semibold">Аватар</h2>
              <div class="flex items-center gap-4">
                <ChatFace :user="profile" size="xl" />
                <div class="flex flex-col items-start gap-1.5">
                  <button type="button" class="button button--secondary button--sm" @click="picker?.click()"><Camera class="size-4" />{{ profile.avatar ? "Заменить" : "Загрузить" }}</button>
                  <button v-if="profile.avatar" type="button" class="button button--ghost button--sm text-danger" @click="dropAvatar"><Trash2 class="size-4" />Убрать</button>
                </div>
              </div>
              <p class="description mt-3">JPEG, PNG или WebP. Кадр выберете после загрузки.</p>
            </section>

            <section class="sheet rounded-3xl p-5 shadow-surface">
              <div class="mb-3 flex items-center gap-2">
                <h2 class="flex-1 font-semibold">Статус</h2>
                <button v-if="form.statusEmoji || form.statusText" type="button" class="link text-sm" @click="clearStatus">Сбросить</button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="one in STATUSES" :key="one.text" type="button" class="chip chip--soft transition" :class="form.statusText === one.text ? 'chip--accent ring-1 ring-accent' : 'chip--default hover:bg-default-hover'" @click="preset(one)"><span class="chip__label">{{ one.emoji }} {{ one.text }}</span></button>
              </div>
              <div class="mt-3 flex gap-2">
                <input v-model="form.statusEmoji" class="input w-14 text-center" maxlength="4" placeholder="🙂" aria-label="Значок статуса" />
                <input v-model="form.statusText" class="input min-w-0 flex-1" maxlength="80" placeholder="Свой статус" aria-label="Текст статуса" />
              </div>
              <div class="textfield mt-3">
                <label class="label" for="pf-until">Показывать до</label>
                <input id="pf-until" v-model="form.statusUntil" type="date" class="input input--full-width" :min="today" :disabled="!form.statusEmoji && !form.statusText" />
                <p class="description">Пусто — пока не сбросите сами</p>
              </div>
            </section>

            <div class="sheet sticky bottom-0 flex items-center justify-end gap-2 rounded-3xl p-3 shadow-surface">
              <button type="button" class="button button--ghost" @click="setQuery({ edit: null })">Отмена</button>
              <button type="submit" class="button button--primary" :disabled="saving || !form.name.trim()">{{ saving ? "Сохраняем…" : "Сохранить" }}</button>
            </div>

            <section v-if="mine" class="sheet rounded-3xl p-5 shadow-surface">
              <h2 class="mb-4 flex items-center gap-2 font-semibold"><KeyRound class="size-4" />Пароль</h2>
              <div class="flex flex-col gap-3">
                <div class="textfield" :data-invalid="passErrors.current ? 'true' : undefined">
                  <label class="label" for="pf-cur">Текущий пароль</label>
                  <input id="pf-cur" v-model="pass.current" :type="pass.show ? 'text' : 'password'" class="input input--full-width" autocomplete="current-password" />
                  <p v-if="passErrors.current" class="field-error" data-visible="true">{{ passErrors.current[0] }}</p>
                </div>
                <div class="textfield" :data-invalid="passErrors.password ? 'true' : undefined">
                  <label class="label" for="pf-new">Новый пароль</label>
                  <div class="relative">
                    <input id="pf-new" v-model="pass.next" :type="pass.show ? 'text' : 'password'" class="input input--full-width pr-10" autocomplete="new-password" minlength="8" />
                    <button type="button" class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-foreground" :aria-label="pass.show ? 'Скрыть пароль' : 'Показать пароль'" @click="pass.show = !pass.show"><component :is="pass.show ? EyeOff : Eye" class="size-4" /></button>
                  </div>
                  <div v-if="pass.next" class="mt-1 flex items-center gap-2">
                    <span class="flex flex-1 gap-1"><span v-for="n in 4" :key="n" class="h-1 flex-1 rounded-full" :class="n <= strength ? (strength <= 1 ? 'bg-danger' : strength === 2 ? 'bg-warning' : 'bg-success') : 'bg-default'" /></span>
                    <span class="text-xs text-muted">{{ pass.next.length < 8 ? "Минимум 8 знаков" : STRENGTH[strength] }}</span>
                  </div>
                  <p v-if="passErrors.password" class="field-error" data-visible="true">{{ passErrors.password[0] }}</p>
                </div>
                <div class="textfield">
                  <label class="label" for="pf-again">Ещё раз</label>
                  <input id="pf-again" v-model="pass.again" :type="pass.show ? 'text' : 'password'" class="input input--full-width" autocomplete="new-password" @keydown.enter.prevent="submitPassword" />
                </div>
                <button type="button" class="button button--secondary self-start" :disabled="pass.busy || !pass.current || pass.next.length < 8 || !pass.again" @click="submitPassword">{{ pass.busy ? "Меняем…" : "Сменить пароль" }}</button>
                <p class="description">После смены на других устройствах нужно будет войти заново.</p>
              </div>
            </section>
          </div>
        </form>
      </template>
    </div>

    <AvatarCropper :file="cropping" :busy="uploading" :progress="progress" @close="!uploading && (cropping = null)" @done="upload" />
  </div>
</template>
