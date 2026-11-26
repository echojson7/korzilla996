<!-- Информационное окно «Нет доступа» / «Не найдено» / «Не получилось
     открыть». Одно на весь портал: задача, чат, сделка, профиль, раздел.
     Встаёт на место содержимого внутри обычного контейнера (окно задачи,
     полноэкранный чат), после скелетона. Ничего о самой сущности не
     показывает: только вид и номер из адреса. Состояние — lib/denied. -->
<script setup lang="ts">
import { computed } from "vue";
import { Lock, SearchX, CloudOff, RotateCw } from "@lucide/vue";
import type { Denied, DeniedWhat } from "../lib/denied";

const props = withDefaults(defineProps<{ state: Denied; what: DeniedWhat; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ retry: [] }>();

const NOUN: Record<DeniedWhat, { this: string; gone: string; open: string; hint: string }> = {
  task: { this: "к этой задаче", gone: "Задача не найдена", open: "задачу", hint: "Задачу видят постановщик, ответственный, соисполнители и наблюдатели. Попросите постановщика добавить вас." },
  chat: { this: "к этому чату", gone: "Чат не найден", open: "чат", hint: "Переписку видят только участники чата. Попросите кого-нибудь из них добавить вас." },
  deal: { this: "к этой сделке", gone: "Сделка не найдена", open: "сделку", hint: "Сделки открыты не всем ролям. Доступ выдаёт администратор портала." },
  profile: { this: "к этому профилю", gone: "Сотрудник не найден", open: "профиль", hint: "Профили сотрудников закрыты для вашей роли. Доступ выдаёт администратор портала." },
  process: { this: "к этому процессу", gone: "Процесс не найден", open: "процесс", hint: "Бизнес-процессы открыты не всем ролям. Доступ выдаёт администратор портала." },
  section: { this: "к этому разделу", gone: "Раздел не найден", open: "раздел", hint: "Раздел закрыт для вашей роли. Доступ выдаёт администратор портала." },
};

const FEMININE = new Set<DeniedWhat>(["task", "deal"]);

const look = computed(() => {
  const noun = NOUN[props.what];
  if (props.state === "forbidden") return { icon: Lock, tone: "danger", title: `У вас нет доступа ${noun.this}`, text: noun.hint };
  if (props.state === "not_found") return { icon: SearchX, tone: "default", title: noun.gone, text: `Возможно, ${FEMININE.has(props.what) ? "её" : "его"} удалили или ссылка неверная.` };
  return { icon: CloudOff, tone: "warning", title: `Не получилось открыть ${noun.open}`, text: "Проверьте связь и попробуйте ещё раз." };
});
</script>

<template>
  <div role="alert" class="no-access flex flex-col items-center justify-center text-center" :class="compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14'">
    <span class="no-access__icon flex items-center justify-center rounded-full" :class="[compact ? 'size-12' : 'size-16', `no-access__icon--${look.tone}`]">
      <component :is="look.icon" :class="compact ? 'size-6' : 'size-8'" aria-hidden="true" />
    </span>
    <p class="font-semibold text-foreground" :class="compact ? 'text-base' : 'text-lg'">{{ look.title }}</p>
    <p class="max-w-sm text-sm text-muted">{{ look.text }}</p>
    <div v-if="state === 'error' || $slots.default" class="mt-1 flex flex-wrap items-center justify-center gap-2">
      <button v-if="state === 'error'" type="button" class="button button--secondary button--sm" @click="emit('retry')"><RotateCw class="size-4" />Ещё раз</button>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.no-access__icon { background: var(--default); color: var(--muted); }
.no-access__icon--danger { background: color-mix(in oklab, var(--danger) 12%, transparent); color: var(--danger); }
.no-access__icon--warning { background: color-mix(in oklab, var(--warning) 14%, transparent); color: var(--warning); }
</style>
