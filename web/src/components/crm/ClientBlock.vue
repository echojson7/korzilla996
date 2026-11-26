<!-- Блок «Клиент» в карточке сделки или лида, как в Битрикс24: плитка
     компании и плитки контактов с телефонами и почтой. Если можно
     менять — компанию выбирают из базы CRM, контакты добавляют, убирают
     и делают основным (первый — основной). Щелчок по названию открывает
     карточку клиента. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { Building2, Plus, Repeat2, Star, UserRound, X } from "@lucide/vue";
import Popover from "../Popover.vue";
import CardBlock from "../tasks/CardBlock.vue";
import ClientTile from "./ClientTile.vue";
import ClientPicker, { type PickedClient } from "./ClientPicker.vue";
import { navigate } from "../../lib/router";
import type { Contact } from "../../lib/crm";

export interface CompanyBrief { id: number; title: string; industry?: string | null; phones: Contact[]; emails: Contact[]; webs: Contact[]; address: string | null }
export interface ContactBrief { id: number; name: string; post: string | null; phones: Contact[]; emails: Contact[] }

const props = defineProps<{
  company: CompanyBrief | null;
  /** Название компании без привязки к базе (старые сделки, лиды). */
  companyText?: string | null;
  contacts: ContactBrief[];
  editable?: boolean;
}>();
const emit = defineEmits<{ company: [id: number | null]; contacts: [ids: number[]] }>();

const pickCompany = ref<InstanceType<typeof Popover> | null>(null);
const pickContact = ref<InstanceType<typeof Popover> | null>(null);
const ids = computed(() => props.contacts.map((one) => one.id));
const empty = computed(() => !props.company && !props.companyText && !props.contacts.length);

function setCompany(one: PickedClient | null) {
  pickCompany.value?.close();
  emit("company", one?.id ?? null);
}
function addContact(one: PickedClient) {
  pickContact.value?.close();
  emit("contacts", [...ids.value, one.id]);
}
const removeContact = (id: number) => emit("contacts", ids.value.filter((one) => one !== id));
const makeMain = (id: number) => emit("contacts", [id, ...ids.value.filter((one) => one !== id)]);
const openCompany = (id: number) => navigate("/clients", { open: `company:${id}` });
const openContact = (id: number) => navigate("/clients", { tab: "contacts", open: `contact:${id}` });
</script>

<template>
  <CardBlock :icon="Building2" title="Клиент">
    <template v-if="editable" #actions>
      <Popover v-if="!company" ref="pickCompany" width="w-80">
        <template #trigger="{ toggle }"><button type="button" class="button button--ghost button--sm" @click="toggle"><Plus class="size-3.5" />Компания</button></template>
        <ClientPicker kind="company" @pick="setCompany" />
      </Popover>
      <Popover ref="pickContact" width="w-80">
        <template #trigger="{ toggle }"><button type="button" class="button button--ghost button--sm -mr-2" @click="toggle"><Plus class="size-3.5" />Контакт</button></template>
        <ClientPicker kind="contact" :skip="ids" @pick="addContact" />
      </Popover>
    </template>

    <div class="flex flex-col gap-2">
      <ClientTile
        v-if="company"
        kind="company"
        :title="company.title"
        :sub="company.industry"
        :phones="company.phones"
        :emails="company.emails"
        :webs="company.webs"
        :address="company.address"
        openable
        @open="openCompany(company.id)"
      >
        <template v-if="editable" #actions>
          <Popover width="w-80">
            <template #trigger="{ toggle }"><button type="button" class="icon-act group-hover/tile:opacity-100" aria-label="Сменить компанию" title="Сменить компанию" @click="toggle"><Repeat2 class="size-4" /></button></template>
            <ClientPicker kind="company" :skip="[company.id]" @pick="setCompany" />
          </Popover>
          <button type="button" class="icon-act group-hover/tile:opacity-100" aria-label="Отвязать компанию" title="Отвязать компанию" @click="setCompany(null)"><X class="size-4" /></button>
        </template>
      </ClientTile>
      <ClientTile v-else-if="companyText" kind="company" :title="companyText" sub="Нет в базе компаний">
        <template v-if="editable" #actions>
          <Popover width="w-80">
            <template #trigger="{ toggle }"><button type="button" class="icon-act group-hover/tile:opacity-100" aria-label="Выбрать из базы" title="Выбрать компанию из базы" @click="toggle"><Repeat2 class="size-4" /></button></template>
            <ClientPicker kind="company" @pick="setCompany" />
          </Popover>
        </template>
      </ClientTile>

      <slot />

      <ClientTile
        v-for="(one, i) in contacts"
        :key="one.id"
        kind="person"
        :title="one.name"
        :sub="one.post"
        :badge="contacts.length > 1 && i === 0 ? 'основной' : null"
        :phones="one.phones"
        :emails="one.emails"
        openable
        @open="openContact(one.id)"
      >
        <template v-if="editable" #actions>
          <button v-if="i > 0" type="button" class="icon-act group-hover/tile:opacity-100" aria-label="Сделать основным" title="Сделать основным" @click="makeMain(one.id)"><Star class="size-4" /></button>
          <button type="button" class="icon-act group-hover/tile:opacity-100" aria-label="Убрать контакт" title="Убрать контакт" @click="removeContact(one.id)"><X class="size-4" /></button>
        </template>
      </ClientTile>

      <div v-if="empty && !$slots.default" class="flex flex-col items-center gap-1 rounded-xl border border-dashed border-separator px-4 py-5 text-center text-sm text-muted">
        <UserRound class="size-5" />
        <p>Клиент не указан</p>
        <p v-if="editable" class="text-xs">Выберите компанию или контакт из базы — кнопки справа вверху.</p>
      </div>
    </div>
  </CardBlock>
</template>

<style scoped>
.icon-act {
  display: inline-flex;
  padding: 0.3rem;
  border-radius: 0.5rem;
  color: var(--muted);
  opacity: 0;
  transition: opacity 120ms, background-color 120ms;
}
.icon-act:focus-visible {
  opacity: 1;
}
.icon-act:hover {
  color: var(--foreground);
  background: var(--default);
}
@media (hover: none) {
  .icon-act {
    opacity: 1;
  }
}
</style>
