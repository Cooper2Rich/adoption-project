import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: process.env.PUBLIC_DEMO_BASE_PATH || "/adoption-project/",
  resolve: {
    alias: {
      "./media-samples.ts": fileURLToPath(
        new URL("./src/public-demo/media.ts", import.meta.url),
      ),
      "node:crypto": fileURLToPath(
        new URL("./src/public-demo/platform-crypto.ts", import.meta.url),
      ),
      "node:fs": fileURLToPath(
        new URL("./src/public-demo/media.ts", import.meta.url),
      ),
    },
  },
  build: {
    outDir: "public-site",
    rollupOptions: { input: "public-demo.html" },
  },
});
