import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: { onlyBundle: false },
    dts: { tsgo: true },
    entry: ["src/index.ts"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  run: {
    tasks: {
      test: "vp test",
      smoke: "node --import tsx src/smoke.ts",
      "fixture:known-bad": {
        command: "node --import tsx src/known-bad.ts",
        cache: false,
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
