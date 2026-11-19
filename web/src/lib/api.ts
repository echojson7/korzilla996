/* Сервер портала — Laravel рядом со сборкой: /996/portal/ → /996/index.php/api.
   Без index.php в адресе Caddy стенда увёл бы запрос в чужой Laravel.
   Ответы { data }, ошибки формы — 422 { message, errors }. */

const BASE = new URL("../index.php/api", location.href).pathname;
let csrf = "";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  constructor(status: number, body: { message?: string; errors?: Record<string, string[]> } | null) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.errors = body?.errors ?? {};
  }
  get first() {
    return Object.values(this.errors)[0]?.[0] ?? this.message;
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
  if (method !== "GET") headers["X-CSRF-TOKEN"] = csrf;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}/${path}`, {
    method, headers, credentials: "same-origin", redirect: "error",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null as T;
  const json = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  if (!response.ok) throw new ApiError(response.status, json);
  return json?.data as T;
}

export interface Me {
  name: string;
  initials: string;
  email: string;
  role: string;
  roleLabel: string;
  position: string | null;
  permissions: string[];
}
interface AuthState {
  admin: Me | null;
  csrf: string;
}

/* undefined — сервера нет (сборка открыта без Laravel): портал на демо. */
export async function session(): Promise<Me | null | undefined> {
  try {
    const state = await api<AuthState>("GET", "auth");
    csrf = state.csrf;
    return state.admin;
  } catch {
    return undefined;
  }
}

export async function login(email: string, password: string) {
  const state = await api<AuthState>("POST", "auth/login", { email, password });
  csrf = state.csrf;
  return state.admin;
}

export async function logout() {
  await api("POST", "auth/logout");
}
