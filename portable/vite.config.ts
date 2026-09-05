import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const portableDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(portableDir, "..");

export default defineConfig({
  root: portableDir,
  base: "./",
  publicDir: path.join(projectDir, "public"),
  plugins: [react()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      "@": projectDir,
    },
  },
  build: {
    outDir: path.join(projectDir, "portable-dist", "app"),
    emptyOutDir: true,
    cssCodeSplit: false,
    target: "es2020",
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});
