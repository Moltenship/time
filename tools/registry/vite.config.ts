import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      onlyBundle: false,
    },
    dts: { generator: "tsgo" },
    entry: ["src/index.ts"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  run: {
    tasks: {
      test: "vp test",
      smoke: "node --import tsx src/smoke.ts",
      // Never cached: it rewrites apps/showcase/public/r, which it also reads, and it is fast.
      site: { command: "node --import tsx src/build-cli.ts", cache: false },
      e2e: { command: "node --import tsx src/e2e.ts", cache: false },
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
