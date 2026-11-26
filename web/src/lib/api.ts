/* Сервер портала — Laravel рядом со сборкой: /996/portal/ → /996/index.php/api.
   Без index.php в адресе Caddy стенда увёл бы запрос в чужой Laravel.
   Ответы { data }, ошибки формы — 422 { message, errors }. */

export const BASE = new URL("../index.php/api", location.href).pathname;
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

/* Отправка формы с файлами (multipart). onProgress — доля 0…1. */
export function upload<T>(path: string, form: FormData, onProgress?: (part: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.setRequestHeader("X-CSRF-TOKEN", csrf);
    if (onProgress) xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => {
      let json: { data?: T; message?: string; errors?: Record<string, string[]> } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json?.data as T);
      else reject(new ApiError(xhr.status, xhr.status === 413 ? { message: "Файл слишком большой для сервера" } : json));
    };
    xhr.onerror = () => reject(new ApiError(0, { message: "Нет связи с сервером" }));
    xhr.send(form);
  });
}

/* Полный адрес ресурса API (картинки, файлы). */
export const apiUrl = (path: string) => `${BASE}/${path}`;

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
