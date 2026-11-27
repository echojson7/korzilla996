/* Маршруты в адресе после # (#/tasks?view=board&open=501): портал лежит
   статикой в подпапке стенда, и сервер не знает путей приложения. */

import { computed, shallowRef, type ComputedRef } from "vue";

export interface Route {
  path: string;
  query: URLSearchParams;
}
type Query = Record<string, string | number | null | undefined>;

function parse(): Route {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, search = ""] = raw.split("?");
  return { path: path.replace(/\/+$/, "") || "/", query: new URLSearchParams(search) };
}

export const route = shallowRef<Route>(parse());
window.addEventListener("hashchange", () => (route.value = parse()));

export function href(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value != null && value !== "") params.set(key, String(value));
  const search = params.toString();
  return `#${path}${search ? `?${search}` : ""}`;
}

export function navigate(path: string, query?: Query, { replace = false } = {}) {
  const next = href(path, query);
  if (replace) {
    history.replaceState(history.state, "", next);
    route.value = parse();
  } else location.hash = next;
}

/* Поменять часть параметров текущего адреса, остальные оставить. */
export function setQuery(patch: Query, { replace = true } = {}) {
  const query: Query = Object.fromEntries(route.value.query);
  Object.assign(query, patch);
  navigate(route.value.path, query, { replace });
}

/* Адрес глазами раздела. Разделы живут в KeepAlive, и фоновый раздел видел
   чужие параметры: открыли задачу (?open=25051) — фоновые «Смарт-процессы»
   или «Сделки» шли за своей карточкой 25051, получали 404, показывали
   «Не найдено» и сбрасывали ?open вместе с открытой задачей. Пока раздел
   в фоне, он видит свой последний адрес. */
export function pageRoute(path = route.value.path): ComputedRef<Route> {
  let last: Route = route.value.path === path ? route.value : { path, query: new URLSearchParams() };
  return computed(() => (route.value.path === path ? (last = route.value) : last));
}
