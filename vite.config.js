import { defineConfig } from "vite";
import { resolve } from "path";

// Two pages: operator (index.html) and network/manager (manager.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        operator: resolve(__dirname, "index.html"),
        manager: resolve(__dirname, "manager.html"),
      },
    },
  },
});
