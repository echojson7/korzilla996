import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

/* Портал собирается в public/portal: на стенде его отдаёт Caddy как обычные
   файлы из /portal/; адреса относительные, чтобы работать и из подпапки.
   Vue отдельным куском: он общий для всех разделов и долго лежит в кэше. */
export default defineConfig({
  base: "./",
  plugins: [vue(), tailwindcss()],
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
