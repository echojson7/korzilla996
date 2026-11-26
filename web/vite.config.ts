import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

/* Кириллический Onest — в <head> сразу, а не после разбора всего CSS:
   иначе первый кадр рисуется запасным шрифтом и текст «прыгает». */
function preloadFont(): Plugin {
  return {
    name: "preload-onest",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const file = Object.keys(ctx.bundle ?? {}).find((name) => /onest-cyrillic-wght-normal-.*\.woff2$/.test(name));
      return file ? [{ tag: "link", attrs: { rel: "preload", href: `./${file}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" }] : [];
    },
  };
}

/* Портал собирается в public/portal: на стенде его отдаёт Caddy как обычные
   файлы из /portal/; адреса относительные, чтобы работать и из подпапки.
   Vue отдельным куском: он общий для всех разделов и долго лежит в кэше. */
export default defineConfig({
  base: "./",
  plugins: [vue(), tailwindcss(), preloadFont()],
  build: {
    outDir: "../public/portal",
    emptyOutDir: true,
    target: "es2022",
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "vue", test: /node_modules[\\/]@?vue/ }],
        },
      },
    },
  },
  server: {
    proxy: { "/index.php": "http://127.0.0.1:8000" },
  },
});
