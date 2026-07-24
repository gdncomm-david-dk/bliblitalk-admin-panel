import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5184,
    proxy: {
      // Backend now owns the /api prefix itself (mounts at /api/public, /api/admin) —
      // forward as-is, no path rewrite.
      "/api": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
