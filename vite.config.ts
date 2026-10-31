import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: "app",
  base: "/app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": path.resolve("app/src") },
  },
  build: {
    outDir: "../dist/app",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 20,
            },
            {
              name: "motion",
              test: /node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
