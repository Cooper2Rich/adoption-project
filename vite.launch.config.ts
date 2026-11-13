import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  server: {
    // Evidence/trace writes must not feed back into owned browser dev servers.
    // Keep source watching enabled; these trees contain generated artifacts only.
    watch: {
      ignored: [
        "**/.codex/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
  },
  plugins: [
    react(),
    {
      name: "launch-homepage",
      generateBundle: {
        order: "post",
        handler(_, bundle) {
          const html = bundle["launch-preview.html"];
          if (html?.type !== "asset")
            throw new Error("Launch homepage HTML was not emitted");
          this.emitFile({
            type: "asset",
            fileName: "index.html",
            source: html.source,
          });
        },
      },
    },
  ],
  optimizeDeps: {
    entries: ["launch-preview.html"],
    include: ["react", "react-dom/client", "convex/react", "convex/server"],
  },
  build: {
    outDir: "launch-site",
    rollupOptions: { input: "launch-preview.html" },
  },
});
