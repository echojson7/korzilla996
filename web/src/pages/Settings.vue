<!-- Настройки портала (владелец и администраторы): сотрудники и их роли,
     учётки (завести, выключить, новый пароль) и наборы прав по разделам,
     как в Битрикс24: уровни «нет / свои / отдела / все». Сервер проверяет
     всё сам (AccessController), здесь — только удобная форма.
     Вкладка — ?tab=roles, открытая роль — ?role=<id>. -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import UiSelect from "../components/UiSelect.vue";
import { Plus, KeyRound, Power, Copy, Trash2, ShieldCheck, Crown, Save, UserX } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import SearchBox from "../components/SearchBox.vue";
import Segmented from "../components/Segmented.vue";
import Modal from "../components/messenger/Modal.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import { api, ApiError, type Level } from "../lib/api";
import { auth, refreshSession } from "../lib/session";
import { isOwner } from "../lib/access";
import { pageRoute, setQuery, navigate } from "../lib/router";
/* Свой адрес: фоновый раздел не реагирует на чужие ?open и фильтры. */
const route = pageRoute();
import { plural } from "../lib/format";
import { toast } from "../lib/toast";
import type { ChatUser } from "../lib/messenger";

type Perms = Record<string, Record<string, Level>>;
interface Schema { [section: string]: { title: string; actions: Record<string, { title: string; levels: Level[] }> } }
interface RoleItem { id: number; key: string; name: string; system: boolean; editable: boolean; permissions: Perms; users: number }
interface Person extends ChatUser { roleLabel: string; since: string | null }
interface State { schema: Schema; roles: RoleItem[]; users: Person[]; departments: string[] }

const state = ref<State | null>(null);
const loading = ref(true);
const failed = ref("");

async function load() {
  try {
    state.value = await api<State>("GET", "access");
    failed.value = "";
  } catch (error) {
    failed.value = error instanceof ApiError && error.status === 403 ? "Настройки — только для владельца и администраторов" : "Не получилось загрузить настройки";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const errorText = (error: unknown) => (error instanceof ApiError ? error.first : "Нет связи с сервером");
const meId = computed(() => auth.me?.id ?? 0);
const owner = computed(() => isOwner());

const tab = computed(() => (route.value.query.get("tab") === "roles" ? "roles" : "staff"));
const tabs = computed(() => [
  { key: "staff", label: "Сотрудники", count: state.value?.users.filter((one) => one.active).length },
  { key: "roles", label: "Роли и права", count: state.value?.roles.length },
]);

/* ---------- Сотрудники ---------- */

const text = ref("");
const showOff = ref(false);
const people = computed(() => {
  const words = text.value.trim().toLowerCase();
  return (state.value?.users ?? []).filter((one) => (showOff.value || !one.fired) && (!words || `${one.name} ${one.email} ${one.position ?? ""} ${one.department ?? ""} ${one.roleLabel}`.toLowerCase().includes(words)));
});
const offCount = computed(() => state.value?.users.filter((one) => one.fired).length ?? 0);
const ownersLeft = computed(() => state.value?.users.filter((one) => one.active && one.role === "owner").length ?? 0);

/* Что можно сделать с учёткой: владельцев трогает только владелец. */
const locked = (one: Person) => one.role === "owner" && !owner.value;
const roleChoices = (one: Person) => (state.value?.roles ?? []).filter((role) => role.key !== "owner" || owner.value || one.role === "owner");
const busy = reactive(new Set<number>());

function put(person: Person) {
  if (!state.value) return;
  const at = state.value.users.findIndex((one) => one.id === person.id);
  if (at >= 0) state.value.users[at] = person;
  else state.value.users.unshift(person);
}

async function patchUser(one: Person, patch: { role?: string; active?: boolean; fired?: boolean }, done: string) {
  busy.add(one.id);
  try {
    put(await api<Person>("PATCH", `access/users/${one.id}`, patch));
    toast(done, "success");
    if (one.id === meId.value) await refreshSession();
    void recount();
  } catch (error) {
    toast(errorText(error), "danger");
  } finally {
    busy.delete(one.id);
  }
}

async function recount() {
  try {
    const fresh = await api<State>("GET", "access");
    if (state.value) state.value.roles = fresh.roles;
  } catch {
    /* счётчики подождут */
  }
}

const setRole = (one: Person, key: string) => {
  if (key === one.role) return;
  const name = state.value?.roles.find((role) => role.key === key)?.name ?? key;
  void patchUser(one, { role: key }, `${one.name}: роль «${name}»`);
};

/* Подтверждение для выключения и нового пароля. */
const asking = ref<{ kind: "off" | "fire" | "password"; person: Person } | null>(null);
const shownPassword = ref<{ name: string; login: string; password: string } | null>(null);

async function confirmAsk() {
  const ask = asking.value;
  if (!ask) return;
  asking.value = null;
  if (ask.kind === "off") return patchUser(ask.person, { active: false }, `${ask.person.name}: учётка выключена`);
  if (ask.kind === "fire") return patchUser(ask.person, { fired: true }, `${ask.person.name}: уволен`);
  busy.add(ask.person.id);
  try {
    const out = await api<{ password: string }>("POST", `access/users/${ask.person.id}/password`);
    shownPassword.value = { name: ask.person.name, login: ask.person.email ?? "", password: out.password };
  } catch (error) {
    toast(errorText(error), "danger");
  } finally {
    busy.delete(ask.person.id);
  }
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast("Скопировано", "success");
  } catch {
    toast("Не получилось скопировать — выделите и скопируйте вручную", "danger");
  }
}

/* Новая учётка. */
const adding = ref(false);
const draft = reactive({ email: "", name: "", role: "staff", position: "", department: "" });
const draftError = ref("");
const saving = ref(false);
function openAdd() {
  Object.assign(draft, { email: "", name: "", role: "staff", position: "", department: "" });
  draftError.value = "";
  adding.value = true;
}
async function addUser() {
  saving.value = true;
  draftError.value = "";
  try {
    const out = await api<{ user: Person; password: string }>("POST", "access/users", { ...draft });
    put(out.user);
    adding.value = false;
    shownPassword.value = { name: out.user.name, login: out.user.email ?? draft.email, password: out.password };
    void recount();
  } catch (error) {
    draftError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

/* ---------- Роли и права ---------- */

const roles = computed(() => state.value?.roles ?? []);
const openedId = computed(() => Number(route.value.query.get("role")) || roles.value.find((one) => one.key === "staff")?.id || roles.value[0]?.id || 0);
const opened = computed(() => roles.value.find((one) => one.id === openedId.value) ?? null);

/* Правка набора — копия, «Сохранить» отправляет целиком. */
const edit = reactive<{ name: string; permissions: Perms }>({ name: "", permissions: {} });
const clone = (perms: Perms): Perms => JSON.parse(JSON.stringify(perms));
watch(opened, (role) => {
  edit.name = role?.name ?? "";
  edit.permissions = role ? clone(role.permissions) : {};
}, { immediate: true });
const dirty = computed(() => !!opened.value && (edit.name.trim() !== opened.value.name || JSON.stringify(edit.permissions) !== JSON.stringify(opened.value.permissions)));

const LEVEL: Record<Level, string> = { none: "Нет", own: "Свои", dept: "Отдела", all: "Все" };
const levelItems = (levels: Level[]) => levels.map((key) => ({ key, label: levels.length === 2 && key === "all" ? "Да" : LEVEL[key] }));
const setLevel = (section: string, action: string, value: string) => {
  edit.permissions[section] = { ...(edit.permissions[section] ?? {}), [action]: value as Level };
};
/* Весь раздел разом: всё «нет» или всё по максимуму. */
const setSection = (section: string, max: boolean) => {
  const def = state.value?.schema[section];
  if (!def) return;
  edit.permissions[section] = Object.fromEntries(Object.entries(def.actions).map(([key, one]) => [key, max ? one.levels[one.levels.length - 1] : "none"]));
};

const rolePut = (role: RoleItem) => {
  if (!state.value) return;
  const at = state.value.roles.findIndex((one) => one.id === role.id);
  if (at >= 0) state.value.roles[at] = role;
  else state.value.roles.push(role);
};

async function saveRole() {
  const role = opened.value;
  if (!role) return;
  saving.value = true;
  try {
    const out = await api<RoleItem>("PATCH", `access/roles/${role.id}`, { ...(role.system ? {} : { name: edit.name.trim() }), permissions: edit.permissions });
    rolePut(out);
    if (!role.system && out.name !== role.name) for (const one of state.value?.users ?? []) if (one.role === role.key) one.roleLabel = out.name;
    toast(`Права роли «${out.name}» сохранены`, "success");
  } catch (error) {
    toast(errorText(error), "danger");
  } finally {
    saving.value = false;
  }
}

const creating = ref(false);
const newRole = reactive({ name: "", from: "staff" });
function openCreate() {
  newRole.name = "";
  newRole.from = opened.value?.editable ? opened.value.key : "staff";
  draftError.value = "";
  creating.value = true;
}
async function createRole() {
  saving.value = true;
  draftError.value = "";
  try {
    const base = roles.value.find((one) => one.key === newRole.from);
    const out = await api<RoleItem>("POST", "access/roles", { name: newRole.name.trim(), permissions: base?.permissions });
    rolePut(out);
    creating.value = false;
    setQuery({ tab: "roles", role: out.id });
  } catch (error) {
    draftError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

const removing = ref(false);
async function removeRole() {
  const role = opened.value;
  removing.value = false;
  if (!role) return;
  try {
    await api("DELETE", `access/roles/${role.id}`);
    toast(`Роль «${role.name}» удалена`, "success");
    setQuery({ role: null });
    await load();
  } catch (error) {
    toast(errorText(error), "danger");
  }
}

const sub = computed(() => {
  if (loading.value) return "Загрузка…";
  if (!state.value) return "";
  const active = state.value.users.filter((one) => one.active).length;
  return `${plural(active, "сотрудник", "сотрудника", "сотрудников")} · ${plural(state.value.roles.length, "роль", "роли", "ролей")}`;
});
const usersOf = (role: RoleItem) => plural(role.users, "сотрудник", "сотрудника", "сотрудников");
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Настройки" :sub="sub">
      <template #toolbar>
        <Segmented label="Раздел настроек" :items="tabs" :model-value="tab" @update:model-value="(key) => setQuery({ tab: key === 'staff' ? null : key })" />
        <template v-if="tab === 'staff' && state">
          <SearchBox v-model="text" placeholder="Имя, логин, отдел или роль" class="w-full min-w-0 sm:w-auto sm:flex-1" />
          <button v-if="offCount" type="button" class="button button--secondary button--sm" @click="showOff = !showOff">{{ showOff ? "Скрыть уволенных" : `Уволенные: ${offCount}` }}</button>
          <button type="button" class="button button--primary button--sm ml-auto" @click="openAdd"><Plus class="size-4" />Сотрудник</button>
        </template>
        <button v-else-if="tab === 'roles' && state" type="button" class="button button--primary button--sm ml-auto" @click="openCreate"><Plus class="size-4" />Новая роль</button>
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <p v-if="loading" class="on-photo py-16 text-center">Загрузка…</p>
      <p v-else-if="failed" class="on-photo py-16 text-center">{{ failed }}</p>

      <!-- Сотрудники и роли -->
      <section v-else-if="tab === 'staff' && state" class="sheet overflow-hidden rounded-2xl shadow-surface">
        <div class="hidden grid-cols-[minmax(220px,1.6fr)_minmax(140px,1fr)_minmax(150px,1fr)_200px_auto] gap-3 border-b border-separator px-4 py-2 text-xs font-medium text-muted md:grid">
          <span>Сотрудник</span><span>Отдел</span><span>Логин</span><span>Роль</span><span class="w-[88px]" />
        </div>
        <div v-for="one in people" :key="one.id" class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-separator px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(220px,1.6fr)_minmax(140px,1fr)_minmax(150px,1fr)_200px_auto]" :class="one.active ? '' : 'opacity-60'">
          <button type="button" class="flex min-w-0 items-center gap-3 text-left" @click="navigate('/profile', { id: one.id })">
            <ChatFace :user="one" size="sm" />
            <span class="min-w-0">
              <span class="flex items-center gap-1 truncate font-medium">{{ one.name }}<Crown v-if="one.role === 'owner'" class="size-3.5 shrink-0 text-warning" aria-label="Владелец" /><span v-if="one.id === meId" class="chip chip--sm chip--soft chip--success ml-1"><span class="chip__label">Вы</span></span></span>
              <span class="block truncate text-xs text-muted">{{ one.position || "Без должности" }}</span>
            </span>
          </button>
          <span class="hidden truncate text-sm md:block">{{ one.department || "—" }}</span>
          <span class="hidden truncate text-sm text-muted md:block">{{ one.email }}</span>
          <span class="col-span-2 flex items-center gap-2 md:col-span-1">
            <UiSelect
              class="w-full"
              :model-value="one.role"
              :disabled="locked(one) || !one.active || busy.has(one.id)"
              :aria-label="`Роль: ${one.name}`"
              :title="locked(one) ? 'Владельцев меняет только владелец' : undefined"
              @change="(v: string) => setRole(one, v)"
            >
              <option v-for="role in roleChoices(one)" :key="role.key" :value="role.key" :disabled="one.role === 'owner' && role.key !== 'owner' && ownersLeft <= 1">{{ role.name }}</option>
            </UiSelect>
            <span v-if="one.fired" class="chip chip--sm chip--soft chip--danger shrink-0"><span class="chip__label">Уволен</span></span>
            <span v-else-if="!one.active" class="chip chip--sm chip--soft chip--danger shrink-0"><span class="chip__label">Выключена</span></span>
          </span>
          <span class="col-start-2 row-start-1 flex justify-end gap-1 md:col-start-auto md:row-start-auto">
            <button type="button" class="button button--ghost button--sm button--icon-only" :disabled="locked(one) || one.id === meId || !one.active || busy.has(one.id)" aria-label="Новый пароль" title="Новый пароль" @click="asking = { kind: 'password', person: one }"><KeyRound class="size-4" /></button>
            <button
              v-if="one.active"
              type="button"
              class="button button--ghost button--sm button--icon-only text-danger"
              :disabled="locked(one) || one.id === meId || busy.has(one.id) || (one.role === 'owner' && ownersLeft <= 1)"
              aria-label="Выключить учётку"
              title="Выключить учётку"
              @click="asking = { kind: 'off', person: one }"
            ><Power class="size-4" /></button>
            <button
              v-if="!one.fired"
              type="button"
              class="button button--ghost button--sm button--icon-only text-danger"
              :disabled="locked(one) || one.id === meId || busy.has(one.id) || (one.role === 'owner' && ownersLeft <= 1)"
              aria-label="Уволен"
              title="Отметить: уволен"
              @click="asking = { kind: 'fire', person: one }"
            ><UserX class="size-4" /></button>
            <button v-if="!one.active" type="button" class="button button--ghost button--sm" :disabled="locked(one) || busy.has(one.id)" @click="patchUser(one, { active: true }, one.fired ? `${one.name}: снова в команде, учётка включена` : `${one.name}: учётка включена`)">Включить</button>
          </span>
        </div>
        <p v-if="!people.length" class="px-4 py-10 text-center text-muted">Никого не нашлось</p>
      </section>

      <!-- Роли и права -->
      <div v-else-if="tab === 'roles' && state" class="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav class="sheet h-max rounded-2xl p-2 shadow-surface" aria-label="Роли">
          <button
            v-for="role in roles"
            :key="role.id"
            type="button"
            class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors"
            :class="role.id === openedId ? 'bg-accent-soft text-accent-soft-foreground' : 'hover:bg-default'"
            :aria-current="role.id === openedId ? 'true' : undefined"
            @click="setQuery({ role: role.id })"
          >
            <Crown v-if="role.key === 'owner'" class="size-4 shrink-0 text-warning" />
            <ShieldCheck v-else class="size-4 shrink-0" :class="role.editable ? 'text-muted' : 'text-accent'" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ role.name }}</span>
              <span class="block text-xs text-muted">{{ usersOf(role) }}</span>
            </span>
          </button>
        </nav>

        <section v-if="opened" class="sheet min-w-0 rounded-2xl p-4 shadow-surface md:p-5">
          <div class="flex flex-wrap items-center gap-2">
            <input v-if="!opened.system" v-model="edit.name" class="input min-w-0 flex-1 text-lg font-semibold" maxlength="80" aria-label="Название роли" />
            <h2 v-else class="min-w-0 flex-1 truncate text-lg font-semibold">{{ opened.name }}</h2>
            <template v-if="opened.editable">
              <button v-if="!opened.system" type="button" class="button button--ghost button--sm text-danger" @click="removing = true"><Trash2 class="size-4" />Удалить</button>
              <button type="button" class="button button--primary button--sm" :disabled="!dirty || saving" @click="saveRole"><Save class="size-4" />Сохранить</button>
            </template>
          </div>
          <p class="mt-1 text-sm text-muted">
            <template v-if="opened.key === 'owner'">Все права. Назначает и снимает владельцев только владелец, последнего владельца понизить нельзя.</template>
            <template v-else-if="opened.key === 'admin'">Все права, кроме действий с владельцами: настройки, роли, учётки.</template>
            <template v-else-if="opened.key === 'staff'">Набор по умолчанию: его получают новые сотрудники и те, чью роль удалили.</template>
            <template v-else>Своя роль. Настройки и права ей недоступны: их правят только владелец и администраторы.</template>
            «Свои» — где сотрудник участник или автор, «Отдела» — его отдела, «Все» — любые.
          </p>

          <div class="mt-4 flex flex-col gap-3">
            <div v-for="(def, section) in state.schema" :key="section" class="rounded-2xl border border-separator p-3 md:p-4">
              <div class="mb-2 flex items-center gap-2">
                <h3 class="min-w-0 flex-1 font-semibold">{{ def.title }}</h3>
                <template v-if="opened.editable">
                  <button type="button" class="button button--ghost button--sm" @click="setSection(String(section), true)">Всё</button>
                  <button type="button" class="button button--ghost button--sm" @click="setSection(String(section), false)">Ничего</button>
                </template>
              </div>
              <div v-for="(one, action) in def.actions" :key="action" class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-separator py-2 first-of-type:border-t-0">
                <span class="min-w-0 flex-1 text-sm">{{ one.title }}</span>
                <Segmented
                  v-if="opened.editable"
                  :label="one.title"
                  :items="levelItems(one.levels)"
                  :model-value="edit.permissions[section]?.[action] ?? 'none'"
                  @update:model-value="(value) => setLevel(String(section), String(action), value)"
                />
                <span v-else class="chip chip--sm chip--soft chip--accent"><span class="chip__label">{{ one.levels.length === 2 ? "Да" : "Все" }}</span></span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Новая учётка -->
    <Modal :open="adding" title="Новый сотрудник" @close="adding = false">
      <form id="add-user" class="flex flex-col gap-3" @submit.prevent="addUser">
        <label class="flex flex-col gap-1 text-sm">Имя и фамилия<input v-model="draft.name" class="input" maxlength="120" required /></label>
        <label class="flex flex-col gap-1 text-sm">Почта или логин для входа<input v-model="draft.email" class="input" maxlength="255" autocomplete="off" required /></label>
        <label class="flex flex-col gap-1 text-sm">Роль
          <UiSelect v-model="draft.role" size="lg">
            <option v-for="role in roles.filter((one) => one.key !== 'owner' || owner)" :key="role.key" :value="role.key">{{ role.name }}</option>
          </UiSelect>
        </label>
        <label class="flex flex-col gap-1 text-sm">Должность<input v-model="draft.position" class="input" maxlength="120" /></label>
        <label class="flex flex-col gap-1 text-sm">Отдел<input v-model="draft.department" class="input" maxlength="120" list="settings-depts" /></label>
        <datalist id="settings-depts"><option v-for="one in state?.departments ?? []" :key="one" :value="one" /></datalist>
        <p class="text-xs text-muted">Пароль придумает портал и покажет один раз.</p>
        <p v-if="draftError" class="text-sm text-danger">{{ draftError }}</p>
      </form>
      <template #footer>
        <button type="button" class="button button--ghost" @click="adding = false">Отмена</button>
        <button type="submit" form="add-user" class="button button--primary" :disabled="saving">Завести учётку</button>
      </template>
    </Modal>

    <!-- Пароль — один раз -->
    <Modal :open="!!shownPassword" title="Пароль для входа" @close="shownPassword = null">
      <template v-if="shownPassword">
        <p class="text-sm">Передайте сотруднику <b>{{ shownPassword.name }}</b>. Больше пароль нигде не показывается, его можно только сменить.</p>
        <dl class="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-2xl bg-surface-secondary p-3 text-sm">
          <dt class="text-muted">Логин</dt><dd class="truncate font-mono">{{ shownPassword.login }}</dd>
          <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Скопировать логин" @click="copy(shownPassword.login)"><Copy class="size-4" /></button>
          <dt class="text-muted">Пароль</dt><dd class="truncate font-mono select-all">{{ shownPassword.password }}</dd>
          <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Скопировать пароль" @click="copy(shownPassword.password)"><Copy class="size-4" /></button>
        </dl>
      </template>
      <template #footer>
        <button type="button" class="button button--primary" @click="shownPassword = null">Готово</button>
      </template>
    </Modal>

    <!-- Подтверждения -->
    <Modal :open="!!asking" :title="asking?.kind === 'off' ? 'Выключить учётку?' : asking?.kind === 'fire' ? 'Отметить уволенным?' : 'Выдать новый пароль?'" @close="asking = null">
      <p v-if="asking?.kind === 'fire'" class="text-sm">У <b>{{ asking.person.name }}</b> появится пометка «Уволен», учётка выключится. Сделки, задачи и сообщения останутся за ним. Кнопка «Включить» вернёт его в команду.</p>
      <p v-else-if="asking?.kind === 'off'" class="text-sm"><b>{{ asking.person.name }}</b> сразу выйдет из портала и не сможет войти. Задачи, сообщения и история останутся. Включить учётку можно здесь же.</p>
      <p v-else-if="asking" class="text-sm">Старый пароль <b>{{ asking.person.name }}</b> перестанет работать, все входы закроются.</p>
      <template #footer>
        <button type="button" class="button button--ghost" @click="asking = null">Отмена</button>
        <button type="button" class="button" :class="asking?.kind === 'password' ? 'button--primary' : 'button--danger'" @click="confirmAsk">{{ asking?.kind === "off" ? "Выключить" : asking?.kind === "fire" ? "Уволен" : "Новый пароль" }}</button>
      </template>
    </Modal>

    <Modal :open="creating" title="Новая роль" @close="creating = false">
      <form id="new-role" class="flex flex-col gap-3" @submit.prevent="createRole">
        <label class="flex flex-col gap-1 text-sm">Название<input v-model="newRole.name" class="input" maxlength="80" placeholder="Например, «Менеджер продаж»" required /></label>
        <label class="flex flex-col gap-1 text-sm">Права взять из роли
          <UiSelect v-model="newRole.from" size="lg">
            <option v-for="role in roles.filter((one) => one.editable)" :key="role.key" :value="role.key">{{ role.name }}</option>
          </UiSelect>
        </label>
        <p v-if="draftError" class="text-sm text-danger">{{ draftError }}</p>
      </form>
      <template #footer>
        <button type="button" class="button button--ghost" @click="creating = false">Отмена</button>
        <button type="submit" form="new-role" class="button button--primary" :disabled="saving">Создать</button>
      </template>
    </Modal>

    <Modal :open="removing" title="Удалить роль?" @close="removing = false">
      <p v-if="opened" class="text-sm">Роль «{{ opened.name }}» пропадёт. {{ opened.users ? `${usersOf(opened)} получат роль «Сотрудник».` : "Сотрудников с ней нет." }}</p>
      <template #footer>
        <button type="button" class="button button--ghost" @click="removing = false">Отмена</button>
        <button type="button" class="button button--danger" @click="removeRole">Удалить</button>
      </template>
    </Modal>
  </div>
</template>
