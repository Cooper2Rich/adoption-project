import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["launch-preview.html"],
    include: ["react", "react-dom/client", "convex/react", "convex/server"],
  },
  build: {
    outDir: "launch-site",
    rollupOptions: { input: "launch-preview.html" },
  },
});
