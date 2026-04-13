import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import { codeInspectorPlugin } from 'code-inspector-plugin'

export default defineConfig({
  plugins: [vue(), UnoCSS(), codeInspectorPlugin({
    bundler: 'vite',
    editor: 'code',
  }),],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
