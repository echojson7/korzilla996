<!-- Плитка клиента в карточке сделки или лида, как в Битрикс24: аватар,
     название (щелчок — карточка клиента), подпись (отрасль, должность),
     под ней основной телефон, почта и сайт. Остальные номера — под «+N».
     Справа — слот действий (сменить, отвязать). -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Phone, Mail, Globe, MapPin, Copy } from "@lucide/vue";
import Avatar from "./Avatar.vue";
import { tel, mail, site, siteText, kindOf, copy } from "./links";
import { toast } from "../../lib/toast";
import type { Contact } from "../../lib/crm";

const props = defineProps<{
  kind: "company" | "person";
  title: string;
  sub?: string | null;
  phones?: Contact[];
  emails?: Contact[];
  webs?: Contact[];
  address?: string | null;
  badge?: string | null;
  openable?: boolean;
}>();
const emit = defineEmits<{ open: [] }>();
const all = ref(false);
const phones = computed(() => (all.value ? props.phones ?? [] : (props.phones ?? []).slice(0, 1)));
const emails = computed(() => (all.value ? props.emails ?? [] : (props.emails ?? []).slice(0, 1)));
const webs = computed(() => (all.value ? props.webs ?? [] : (props.webs ?? []).slice(0, 1)));
const rest = computed(() => Math.max(0, (props.phones?.length ?? 0) - 1) + Math.max(0, (props.emails?.length ?? 0) - 1) + Math.max(0, (props.webs?.length ?? 0) - 1));
const copied = (text: string) => copy(text, () => toast("Скопировано", "success"));
</script>

<template>
  <div class="tile group/tile">
    <button v-if="openable" type="button" class="shrink-0 self-start" :aria-label="`Открыть: ${title}`" @click="emit('open')"><Avatar :name="title" :kind="kind" /></button>
    <Avatar v-else :name="title" :kind="kind" class="self-start" />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-start gap-2">
        <div class="min-w-0 flex-1">
          <button v-if="openable" type="button" class="block max-w-full truncate text-left font-medium hover:text-accent" @click="emit('open')">{{ title }}</button>
          <span v-else class="block truncate font-medium">{{ title }}</span>
          <span v-if="sub || badge" class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span v-if="sub" class="truncate">{{ sub }}</span>
            <span v-if="badge" class="chip chip--sm chip--soft chip--default shrink-0"><span class="chip__label">{{ badge }}</span></span>
          </span>
        </div>
        <div class="-mt-1 -mr-1 flex shrink-0 items-center"><slot name="actions" /></div>
      </div>
      <ul v-if="phones.length || emails.length || webs.length || (all && address)" class="mt-1.5 flex flex-col gap-0.5 text-sm">
        <li v-for="one in phones" :key="'p' + one.value" class="line">
          <Phone class="size-3.5 shrink-0 text-muted" /><a :href="tel(one.value)" class="truncate tabular-nums hover:text-accent">{{ one.value }}</a>
          <span v-if="all && kindOf(one)" class="text-xs text-muted">{{ kindOf(one) }}</span>
          <button type="button" class="copy" aria-label="Скопировать" title="Скопировать" @click="copied(one.value)"><Copy class="size-3.5" /></button>
        </li>
        <li v-for="one in emails" :key="'e' + one.value" class="line">
          <Mail class="size-3.5 shrink-0 text-muted" /><a :href="mail(one.value)" class="truncate hover:text-accent">{{ one.value }}</a>
          <button type="button" class="copy" aria-label="Скопировать" title="Скопировать" @click="copied(one.value)"><Copy class="size-3.5" /></button>
        </li>
        <li v-for="one in webs" :key="'w' + one.value" class="line">
          <Globe class="size-3.5 shrink-0 text-muted" /><a :href="site(one.value)" target="_blank" rel="noopener" class="truncate hover:text-accent">{{ siteText(one.value) }}</a>
        </li>
        <li v-if="all && address" class="line text-muted"><MapPin class="size-3.5 shrink-0" /><span class="truncate" :title="address">{{ address }}</span></li>
      </ul>
      <button v-if="rest || (address && !all)" type="button" class="mt-1 text-xs text-accent" @click="all = !all">{{ all ? "Свернуть" : rest ? `Ещё ${rest}${address ? " и адрес" : ""}` : "Адрес" }}</button>
    </div>
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--separator);
  border-radius: 0.875rem;
  background: var(--surface);
  transition: border-color 120ms, box-shadow 120ms;
}
.tile:hover {
  border-color: color-mix(in oklab, var(--accent) 35%, var(--separator));
}
.line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.5rem;
}
.copy {
  display: inline-flex;
  padding: 0.125rem;
  border-radius: 0.375rem;
  color: var(--muted);
  opacity: 0;
  transition: opacity 120ms;
}
.line:hover .copy,
.copy:focus-visible {
  opacity: 1;
}
.copy:hover {
  color: var(--foreground);
  background: var(--default);
}
</style>
