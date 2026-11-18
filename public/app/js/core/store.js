/* Выбор пользователя в localStorage под общей приставкой (app.storageKey).
   Хранилище недоступно (приватный режим, запрет) — выбор живёт до перезагрузки. */

let prefix = "kza";
const memory = new Map();

export function usePrefix(next) {
  prefix = next || prefix;
}

export function read(key, fallback) {
  const name = `${prefix}.${key}`;
  try {
    const raw = localStorage.getItem(name);
    return raw == null ? (memory.has(name) ? memory.get(name) : fallback) : JSON.parse(raw);
  } catch {
    return memory.has(name) ? memory.get(name) : fallback;
  }
}

export function write(key, value) {
  const name = `${prefix}.${key}`;
  memory.set(name, value);
  try { localStorage.setItem(name, JSON.stringify(value)); } catch {}
}
