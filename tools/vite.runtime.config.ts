import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  plugins: [{
    name: "mindar-disposable-resize-listener",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("mind-ar/src/image-target/three.js")) return;
      // MindAR 1.2.5 does not retain the listener, so stop() cannot remove it.
      const original = "window.addEventListener('resize', this.resize.bind(this));";
      if (!code.includes(original)) throw new Error("MindAR resize hook changed; review the lifecycle patch");
      return code.replace(original, "this._boundResize = this.resize.bind(this); window.addEventListener('resize', this._boundResize);");
    },
  }],
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
