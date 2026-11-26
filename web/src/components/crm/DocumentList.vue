<!-- Документы сделки или лида (из шаблонов: договоры, КП, акты). PDF
     открывается в новой вкладке, Word скачивается. -->
<script setup lang="ts">
import { FileText, Download } from "@lucide/vue";
import { apiUrl } from "../../lib/api";
import type { CrmDocument } from "../../lib/crm";

defineProps<{ rows: CrmDocument[] }>();
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("ru-RU") : "");
const size = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`);
</script>

<template>
  <div class="divide-y divide-separator">
    <div v-for="one in rows" :key="one.id" class="flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
      <FileText class="size-4 shrink-0 text-muted" />
      <span class="min-w-0 flex-1">
        <a v-if="one.file" :href="apiUrl(`crm/documents/${one.id}/file`)" target="_blank" rel="noopener" class="link block truncate font-medium">{{ one.title }}</a>
        <span v-else class="block truncate font-medium">{{ one.title }}</span>
        <span class="block truncate text-xs text-muted">{{ [one.template, day(one.createdAt), one.file ? size(one.file.size) : "файл не сохранился"].filter(Boolean).join(" · ") }}</span>
      </span>
      <a v-if="one.file" :href="apiUrl(`crm/documents/${one.id}/file?download=1`)" class="button button--ghost button--sm button--icon-only" aria-label="Скачать" title="Скачать"><Download class="size-4" /></a>
    </div>
  </div>
</template>
