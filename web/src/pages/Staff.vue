<!-- Сотрудники: все учётки портала, кроме уволенных (они — вкладкой
     «Уволенные», как в Битрикс24). Выключенные без пометки — с чипом
     «Нет входа»: заведены (например, из Битрикса), но ещё не включены.
     Отделы вкладками — из поля «отдел» учёток, карточки или таблица, поиск
     по имени, должности и почте. Щелчок открывает профиль. -->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { LayoutGrid, Table2, Crown, MessageSquare } from "@lucide/vue";
import PageHead from "../components/PageHead.vue";
import Segmented from "../components/Segmented.vue";
import SearchBox from "../components/SearchBox.vue";
import DataTable from "../components/DataTable.vue";
import ChatFace from "../components/messenger/ChatFace.vue";
import { people, meId, enabled, loadPeople, startDirect, type ChatUser } from "../lib/messenger";
import { plural } from "../lib/format";
import { daysToBirthday } from "../lib/profile";
import { pageRoute, setQuery, navigate } from "../lib/router";
/* Свой адрес: фоновый раздел не реагирует на чужие ?open и фильтры. */
const route = pageRoute();
import { local } from "../lib/prefs";
import { toast } from "../lib/toast";
import type { Column } from "../lib/move";

const ROLE: Record<string, string> = { owner: "Владелец", admin: "Администратор", staff: "Сотрудник" };
const NO_DEPT = "Без отдела";

const loading = ref(!people.size);
const failed = ref(false);
onMounted(async () => {
  if (!enabled.value) return void (loading.value = false);
  try {
    await loadPeople();
  } catch {
    failed.value = !people.size;
  } finally {
    loading.value = false;
  }
});

const fired = computed(() => route.value.query.get("fired") === "1");
const working = computed(() => [...people.values()].filter((one) => !one.fired).length);
const firedCount = computed(() => [...people.values()].filter((one) => one.fired).length);
const STATES = computed(() => [
  { key: "0", label: "Работают", count: working.value },
  { key: "1", label: "Уволенные", count: firedCount.value },
]);
const staff = computed(() => [...people.values()].filter((one) => !!one.fired === fired.value).sort((a, b) => a.name.localeCompare(b.name, "ru")));
const deptOf = (one: ChatUser) => one.department?.trim() || NO_DEPT;
const departments = computed(() => [...new Set(staff.value.map(deptOf))].sort((a, b) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b, "ru"))));
const roleOf = (one: ChatUser) => one.roleLabel ?? ROLE[one.role ?? "staff"] ?? ROLE.staff;

const dept = computed(() => {
  const asked = route.value.query.get("dept") ?? "";
  return departments.value.includes(asked) ? asked : "all";
});
const text = computed({ get: () => route.value.query.get("q") ?? "", set: (q) => setQuery({ q }) });
const view = local<"cards" | "table">("staff.view", "cards");

const tabs = computed(() => [{ key: "all", label: "Все", count: staff.value.length }, ...departments.value.map((name) => ({ key: name, label: name, count: staff.value.filter((one) => deptOf(one) === name).length }))]);
const visible = computed(() => {
  const words = text.value.trim().toLowerCase();
  return staff.value.filter((one) => (dept.value === "all" || deptOf(one) === dept.value) && (!words || `${one.name} ${one.position ?? ""} ${one.department ?? ""} ${one.email ?? ""}`.toLowerCase().includes(words)));
});
const sub = computed(() => {
  const count = plural(staff.value.length, "сотрудник", "сотрудника", "сотрудников");
  const named = departments.value.filter((one) => one !== NO_DEPT).length;
  return named ? `${count} в ${plural(named, "отделе", "отделах", "отделах")}` : count;
});

const TABLE: Column<ChatUser>[] = [
  { key: "name", label: "Сотрудник", sort: (one) => one.name, class: "min-w-[260px]" },
  { key: "dept", label: "Отдел", sort: (one) => deptOf(one) },
  { key: "email", label: "Почта или логин" },
  { key: "role", label: "Доступ", sort: (one) => roleOf(one) },
];

/* Старые ссылки «?open=5» ведут в профиль. */
const asked = route.value.query.get("open");
if (asked) navigate("/profile", { id: asked }, { replace: true });
const open = (one: ChatUser) => navigate("/profile", { id: one.id });
const isMail = (value?: string) => !!value && value.includes("@");

async function write(one: ChatUser) {
  try {
    const chat = await startDirect(one.id);
    navigate("/messenger", { chat: chat.id });
  } catch {
    toast("Не получилось открыть чат", "danger");
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHead title="Сотрудники" :sub="loading ? 'Загрузка…' : sub">
      <template #toolbar>
        <Segmented v-if="firedCount" label="Сотрудники" :items="STATES" :model-value="fired ? '1' : '0'" @update:model-value="(key) => setQuery({ fired: key === '1' ? '1' : null, dept: null })" />
        <Segmented v-if="departments.length > 1" label="Отделы" :items="tabs" :model-value="dept" @update:model-value="(key) => setQuery({ dept: key === 'all' ? null : key })" />
        <SearchBox v-model="text" placeholder="Имя, должность или почта" class="w-full min-w-0 sm:w-auto sm:flex-1" />
        <div class="toggle-button-group toggle-button-group--horizontal" role="radiogroup" aria-label="Вид">
          <button type="button" role="radio" class="toggle-button toggle-button--sm toggle-button--icon-only" :aria-checked="view === 'cards'" :data-selected="view === 'cards' ? 'true' : undefined" aria-label="Карточки" @click="view = 'cards'"><LayoutGrid class="size-4" /></button>
          <button type="button" role="radio" class="toggle-button toggle-button--sm toggle-button--icon-only" :aria-checked="view === 'table'" :data-selected="view === 'table' ? 'true' : undefined" aria-label="Таблица" @click="view = 'table'"><Table2 class="size-4" /></button>
        </div>
      </template>
    </PageHead>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-5 photo-scroll">
      <div v-if="view === 'cards'" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        <div v-for="one in visible" :key="one.id" class="sheet group relative flex flex-col items-center rounded-2xl p-5 text-center shadow-surface transition hover:-translate-y-0.5 hover:shadow-md">
          <button type="button" class="absolute inset-0 rounded-2xl" :aria-label="`Профиль: ${one.name}`" @click="open(one)" />
          <ChatFace :user="one" size="xl" class="pointer-events-none" />
          <p class="pointer-events-none mt-3 flex items-center gap-1 font-semibold">{{ one.name }}<Crown v-if="one.role === 'owner'" class="size-3.5 text-warning" aria-label="Владелец" /></p>
          <p v-if="one.position" class="pointer-events-none text-sm text-muted">{{ one.position }}</p>
          <p class="pointer-events-none mt-0.5 text-xs text-muted">{{ deptOf(one) }}</p>
          <span class="pointer-events-none mt-3 flex flex-wrap justify-center gap-1.5">
            <span v-if="one.status" class="chip chip--sm chip--soft chip--accent"><span class="chip__label">{{ one.status.emoji }} {{ one.status.text }}</span></span>
            <span v-else class="chip chip--sm chip--soft" :class="one.role === 'staff' ? 'chip--default' : 'chip--accent'"><span class="chip__label">{{ roleOf(one) }}</span></span>
            <span v-if="one.fired" class="chip chip--sm chip--soft chip--danger"><span class="chip__label">Уволен</span></span>
            <span v-else-if="!one.active" class="chip chip--sm chip--soft chip--warning" title="Учётка заведена, но выключена: включить можно в «Настройках»"><span class="chip__label">Нет входа</span></span>
            <span v-if="one.id === meId" class="chip chip--sm chip--soft chip--success"><span class="chip__label">Это вы</span></span>
            <span v-else-if="daysToBirthday(one.birthday) === 0" class="chip chip--sm chip--soft chip--success"><span class="chip__label">🎂 День рождения</span></span>
          </span>
          <button v-if="one.id !== meId && one.active" type="button" class="button button--ghost button--sm button--icon-only absolute top-2 right-2 opacity-0 transition group-hover:opacity-100 focus:opacity-100" :aria-label="`Написать: ${one.name}`" title="Написать" @click="write(one)"><MessageSquare class="size-4" /></button>
        </div>
      </div>
      <DataTable v-else :columns="TABLE" :rows="visible" :key-of="(one) => String(one.id)" label="Сотрудники" class="sheet" @open="open">
        <template #name="{ row }">
          <span class="flex items-center gap-3">
            <ChatFace :user="row" size="sm" />
            <span><span class="block font-medium">{{ row.name }}</span><span v-if="row.position" class="block text-xs text-muted">{{ row.position }}</span></span>
          </span>
        </template>
        <template #dept="{ row }">{{ deptOf(row) }}</template>
        <template #email="{ row }"><a v-if="isMail(row.email)" :href="`mailto:${row.email}`" class="link" @click.stop>{{ row.email }}</a><span v-else class="text-muted">{{ row.email }}</span></template>
        <template #role="{ row }"><span class="inline-flex items-center gap-1.5">{{ roleOf(row) }}<span v-if="row.fired" class="chip chip--sm chip--soft chip--danger"><span class="chip__label">Уволен</span></span><span v-else-if="!row.active" class="chip chip--sm chip--soft chip--warning"><span class="chip__label">Нет входа</span></span></span></template>
      </DataTable>
      <p v-if="!loading && !visible.length" class="on-photo py-16 text-center">{{ failed ? "Не получилось загрузить сотрудников" : !enabled ? "Сотрудники видны после входа" : "Никого не нашлось" }}</p>
    </div>

  </div>
</template>
