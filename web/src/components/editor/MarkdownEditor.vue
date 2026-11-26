<!-- Визуальный редактор описаний (задачи, сделки): хранится Markdown, а на
     экране — обычный текст с оформлением, разметки не видно. Панель
     форматирования, списки, чек-лист, ссылки, картинки (кнопкой, вставкой
     из буфера и перетаскиванием). Тяжёлый — грузится отдельным куском
     (см. MarkdownField.vue).
     modelValue — Markdown; update:modelValue — по ходу набора (с задержкой),
     save — при уходе из поля, если текст поменялся. -->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import {
  Bold, Italic, Underline, Strikethrough, Heading2, Heading3, List, ListOrdered, ListChecks,
  Quote, Code, Link2, ImagePlus, Minus, Undo2, Redo2, Check, X,
} from "@lucide/vue";
import { upload, apiUrl } from "../../lib/api";
import { auth } from "../../lib/session";
import { toast } from "../../lib/toast";

/* fill — режим «на всю область»: панель видна всегда, поле растянуто,
   фокус сразу; Ctrl+Enter — submit, Esc — cancel. */
const props = withDefaults(defineProps<{ modelValue?: string | null; editable?: boolean; placeholder?: string; minHeight?: string; fill?: boolean }>(), {
  editable: true,
  fill: false,
  placeholder: "Описание…",
  minHeight: "120px",
});
const emit = defineEmits<{ "update:modelValue": [string]; save: [string]; submit: []; cancel: [] }>();

let last = props.modelValue ?? "";
let timer = 0;
const focused = ref(false);
const linking = ref(false);
const linkUrl = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

const editor = useEditor({
  content: props.modelValue ?? "",
  contentType: "markdown",
  editable: props.editable,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
    Markdown,
  ],
  editorProps: {
    attributes: { class: "md md-editor outline-none" },
    handlePaste: (_view, event) => takeImages(event.clipboardData?.files),
    handleDrop: (_view, event) => takeImages((event as DragEvent).dataTransfer?.files),
  },
  onUpdate: () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => emit("update:modelValue", markdown()), 250);
  },
  onCreate: ({ editor: made }) => {
    if (props.fill) made.commands.focus("end");
  },
  onFocus: () => (focused.value = true),
  onBlur: () => {
    focused.value = false;
    commit();
  },
});

const markdown = () => (editor.value?.isEmpty ? "" : (editor.value?.getMarkdown() ?? "").trim());

function commit() {
  const text = markdown();
  clearTimeout(timer);
  emit("update:modelValue", text);
  if (text !== last) {
    last = text;
    emit("save", text);
  }
}

watch(() => props.modelValue, (next) => {
  const text = next ?? "";
  if (!editor.value || focused.value || text === markdown()) return;
  last = text;
  editor.value.commands.setContent(text, { contentType: "markdown", emitUpdate: false });
});
watch(() => props.editable, (on) => editor.value?.setEditable(on));
onBeforeUnmount(() => {
  if (focused.value) commit();
  clearTimeout(timer);
});

/* ---------- Картинки ---------- */

function takeImages(files: FileList | undefined | null) {
  const images = [...(files ?? [])].filter((file) => file.type.startsWith("image/"));
  if (!images.length || !props.editable) return false;
  images.forEach(insertImage);
  return true;
}

async function insertImage(file: File) {
  try {
    let src: string;
    if (auth.demo) {
      src = await new Promise<string>((done) => {
        const reader = new FileReader();
        reader.onload = () => done(String(reader.result));
        reader.readAsDataURL(file);
      });
    } else {
      const form = new FormData();
      form.append("file", file);
      const saved = await upload<{ name: string }>("editor-images", form);
      src = apiUrl(`editor-images/${saved.name}`);
    }
    editor.value?.chain().focus().setImage({ src, alt: file.name }).run();
    commit();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Картинка не загрузилась", "danger");
  }
}
function pickImage(event: Event) {
  const input = event.target as HTMLInputElement;
  [...(input.files ?? [])].forEach(insertImage);
  input.value = "";
}

/* ---------- Ссылки ---------- */

function openLink() {
  linkUrl.value = editor.value?.getAttributes("link").href ?? "";
  linking.value = true;
}
function applyLink() {
  const url = linkUrl.value.trim();
  const chain = editor.value?.chain().focus().extendMarkRange("link");
  if (!url) chain?.unsetLink().run();
  else chain?.setLink({ href: /^[a-z]+:|^\/|^#/i.test(url) ? url : `https://${url}` }).run();
  linking.value = false;
  commit();
}

type Tool = { icon: unknown; label: string; run: () => void; active?: () => boolean; gap?: boolean };
const c = () => editor.value!.chain().focus();
const is = (name: string, attrs?: Record<string, unknown>) => () => !!editor.value?.isActive(name, attrs);
const TOOLS: Tool[] = [
  { icon: Bold, label: "Жирный (Ctrl+B)", run: () => c().toggleBold().run(), active: is("bold") },
  { icon: Italic, label: "Курсив (Ctrl+I)", run: () => c().toggleItalic().run(), active: is("italic") },
  { icon: Underline, label: "Подчёркнутый (Ctrl+U)", run: () => c().toggleUnderline().run(), active: is("underline") },
  { icon: Strikethrough, label: "Зачёркнутый", run: () => c().toggleStrike().run(), active: is("strike") },
  { icon: Heading2, label: "Заголовок", run: () => c().toggleHeading({ level: 2 }).run(), active: is("heading", { level: 2 }), gap: true },
  { icon: Heading3, label: "Подзаголовок", run: () => c().toggleHeading({ level: 3 }).run(), active: is("heading", { level: 3 }) },
  { icon: List, label: "Список", run: () => c().toggleBulletList().run(), active: is("bulletList"), gap: true },
  { icon: ListOrdered, label: "Нумерованный список", run: () => c().toggleOrderedList().run(), active: is("orderedList") },
  { icon: ListChecks, label: "Чек-лист", run: () => c().toggleTaskList().run(), active: is("taskList") },
  { icon: Quote, label: "Цитата", run: () => c().toggleBlockquote().run(), active: is("blockquote"), gap: true },
  { icon: Code, label: "Код", run: () => c().toggleCodeBlock().run(), active: is("codeBlock") },
  { icon: Link2, label: "Ссылка", run: openLink, active: is("link") },
  { icon: ImagePlus, label: "Картинка", run: () => fileInput.value?.click() },
  { icon: Minus, label: "Разделитель", run: () => c().setHorizontalRule().run() },
  { icon: Undo2, label: "Отменить (Ctrl+Z)", run: () => c().undo().run(), gap: true },
  { icon: Redo2, label: "Повторить", run: () => c().redo().run() },
];
</script>

<template>
  <div
    class="md-box"
    :class="{ 'md-fill flex h-full min-h-0 flex-col': fill }"
    @keydown.ctrl.enter.prevent="fill && (commit(), emit('submit'))"
    @keydown.meta.enter.prevent="fill && (commit(), emit('submit'))"
    @keydown.esc="fill && !linking && emit('cancel')"
  >
    <div v-if="editable && editor" class="md-toolbar z-10 flex shrink-0 flex-wrap items-center gap-0.5 px-2 py-1" :class="fill ? 'px-4 py-1.5' : focused || linking ? 'visible' : 'invisible h-0 overflow-hidden py-0'">
      <template v-for="tool in TOOLS" :key="tool.label">
        <span v-if="tool.gap" class="mx-1 h-4 w-px bg-separator" />
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-muted hover:bg-default hover:text-foreground"
          :class="{ 'bg-accent-soft! text-accent!': tool.active?.() }"
          :title="tool.label"
          :aria-label="tool.label"
          @mousedown.prevent
          @click="tool.run"
        >
          <component :is="tool.icon" class="size-4" />
        </button>
      </template>
      <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="pickImage" />
    </div>
    <form v-if="linking" class="flex items-center gap-1.5 border-b border-separator px-2 pb-1.5" @submit.prevent="applyLink">
      <input v-model="linkUrl" class="input h-8 py-0 min-w-0 flex-1 text-sm" placeholder="Адрес ссылки, пусто — убрать" autofocus @keydown.esc="linking = false" />
      <button type="submit" class="button button--primary button--sm button--icon-only" aria-label="Готово"><Check class="size-4" /></button>
      <button type="button" class="button button--ghost button--sm button--icon-only" aria-label="Отмена" @click="linking = false"><X class="size-4" /></button>
    </form>
    <EditorContent
      :editor="editor"
      :class="fill ? 'min-h-0 flex-1 cursor-text overflow-y-auto px-6 py-5 thin-scroll' : 'px-4 py-3'"
      :style="{ minHeight: editable && !fill ? minHeight : undefined }"
      @click="editable && !focused && editor?.commands.focus('end')"
    />
  </div>
</template>
