import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "runtime-entry.js"),
      name: "MindARRuntime",
      formats: ["iife"],
      fileName: "mindar-runtime",
    },
    outDir: resolve(__dirname, "../public/runtime"),
    target: "es2020",
  },
});
