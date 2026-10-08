import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: { oxc: true },
    entry: ["src/index.ts"],
    tsconfig: "tsconfig.build.json",
  },
  test: {
    environment: "jsdom",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
});
