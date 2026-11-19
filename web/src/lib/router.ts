/* Маршруты в адресе после # (#/tasks?view=board&open=501): портал лежит
   статикой в подпапке стенда, и сервер не знает путей приложения. */

import { shallowRef } from "vue";

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
