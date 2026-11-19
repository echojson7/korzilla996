/* Настройки пользователя в localStorage: тема, фон, свёрнутое меню, вид задач. */

import { ref, watch, type Ref } from "vue";

export function local<T>(key: string, fallback: T): Ref<T> {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(`k996.${key}`);
    if (raw != null) initial = JSON.parse(raw) as T;
  } catch {
    /* битое значение — берём по умолчанию */
  }
  const value = ref(initial) as Ref<T>;
  watch(value, (next) => {
    try {
      localStorage.setItem(`k996.${key}`, JSON.stringify(next));
    } catch {
      /* приватный режим — настройка просто не запомнится */
    }
  }, { deep: true });
  return value;
}
