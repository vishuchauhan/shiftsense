import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        manager: resolve(__dirname, "manager.html"), // legacy URL, redirects to #/network
      },
    },
  },
});
