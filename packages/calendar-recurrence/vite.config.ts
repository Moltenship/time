import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: { generator: "oxc" },
    entry: ["src/index.ts"],
    tsconfig: "tsconfig.build.json",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
});
