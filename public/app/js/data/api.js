/* JSON API движка korzillaX для admin2: /admin/api/v1.

   Один клиент на все экраны: CSRF-токен из bootstrap, ответы JSON, ошибки —
   ApiError со статусом, текстом для человека, кодом отказа и ошибками полей.
   Контракт ответа (AdminApi в движке):
     200 { data, meta? } / 201 { data } / 204 — успех;
     401 — не вошли, 403 — нет права, 404 — нет объекта (или он чужого сайта);
     422 { message, errors } — ошибка формы, 422 { message, code } — отказ по смыслу.

   bootstrap() — один ответ при загрузке: сайт, кто вошёл и его права,
   включённые модули, типы страниц, токен формы. null — движка нет (витрина,
   другой хост) или не вошли: экраны остаются на демо. */

/* Портал: сервер — Laravel рядом с приложением (public/index.php), адрес
   считается от страницы: /996/app/ → /996/index.php/api. */
const BASE = new URL("../index.php/api", location.href).pathname;

let csrf = "";
let engine = null;

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code ?? null;
    this.errors = body?.errors ?? {};
  }

  /* Первая ошибка поля — для тоста, когда поля на экране нет. */
  get first() {
    return Object.values(this.errors)[0]?.[0] ?? this.message;
  }
}

export async function api(method, path, body) {
  const headers = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
  if (method !== "GET") headers["X-CSRF-TOKEN"] = csrf;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}/${path}`, {
    method,
    headers,
    credentials: "same-origin",
    redirect: "error",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const json = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  if (!response.ok) throw new ApiError(response.status, json);
  return json?.data ?? null;
}

/* Данные движка, если админка открыта на сайте и администратор вошёл. */
export async function bootstrap() {
  try {
    engine = await api("GET", "bootstrap");
    csrf = engine.csrf;
  } catch {
    engine = null;
  }
  return engine;
}

export const getEngine = () => engine;

/* Состояние входа: { admin | null, configured, site_name, csrf }. null — движка
   нет (витрина на другом хосте): входить некуда, админка на демо. */
export async function session() {
  try {
    const state = await api("GET", "auth");
    csrf = state.csrf;
    /* Вошедший сотрудник — он же «движок» для выхода из аккаунта. */
    engine = state.admin ? { me: state.admin } : null;
    return state;
  } catch {
    return null;
  }
}

/* Вход по почте и паролю администратора сайта — тем же учёткам, что
   у старой админки. Ошибка — ApiError: 422 с errors.email, 429 — частые попытки. */
export async function login(email, password) {
  const state = await api("POST", "auth/login", { email, password });
  csrf = state.csrf;
  return state.admin;
}

export async function logout() {
  await api("POST", "auth/logout");
  engine = null;
}
