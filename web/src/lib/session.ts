/* Кто вошёл. С сервером — учётка из /api/auth; без сервера (сборка
   открыта отдельно) — демо от имени директора. */

import { reactive } from "vue";
import { session as fetchSession, type Me } from "./api";
import { WHO, ME_ID } from "./data";

export const auth = reactive<{ ready: boolean; demo: boolean; me: Me | null }>({ ready: false, demo: false, me: null });

const demoMe = (): Me => ({
  name: WHO[ME_ID].name, initials: WHO[ME_ID].initials, email: WHO[ME_ID].email,
  role: "owner", roleLabel: "Владелец", position: WHO[ME_ID].role, permissions: ["*"],
});

export async function loadSession() {
  const me = await fetchSession();
  auth.demo = me === undefined;
  auth.me = me === undefined ? demoMe() : me;
  auth.ready = true;
}

/* Роль или права поменяли в настройках (событие access): перечитать, кто я.
   Учётку выключили — сервер ответит «не вошёл», и откроется экран входа. */
export async function refreshSession() {
  if (auth.demo) return;
  const me = await fetchSession();
  if (me !== undefined) auth.me = me;
}
