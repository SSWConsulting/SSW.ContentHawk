import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(root, "scripts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./scripts/__tests__/setup.ts"],
  },
});