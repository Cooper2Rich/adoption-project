import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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
