import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    dts: false,
    entry: ["core/index.ts", "react/index.ts", "run.ts"],
    tsconfig: "tsconfig.build.json",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  run: {
    tasks: {
      core: {
        cache: false,
        command: "node --expose-gc dist/core/index.mjs --mode=full --gated",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      gated: {
        cache: false,
        command: "node --expose-gc dist/run.mjs --mode=full --gated",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      react: {
        cache: false,
        command: "node dist/react/index.mjs --mode=full",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
      smoke: {
        cache: false,
        command: "node dist/run.mjs --mode=smoke",
        dependsOn: ["build", { task: "build", from: "dependencies" }],
      },
    },
  },
});
