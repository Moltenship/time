import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: { generator: "tsgo" },
    entry: ["src/index.ts"],
  },
});
