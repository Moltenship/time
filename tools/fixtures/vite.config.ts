import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: { generator: "oxc" },
    entry: ["src/index.ts"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
});
