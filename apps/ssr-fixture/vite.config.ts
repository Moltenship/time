import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
      onlyBundle: false,
    },
    dts: false,
    entry: ["src/index.ts"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
  run: {
    tasks: {
      test: {
        command: "vp test",
        dependsOn: [{ task: "build", from: "dependencies" }],
      },
      smoke: {
        command:
          'vp test tests/ssr-fixture.test.ts --run -t "renders, hydrates, interacts, and unmounts"',
        dependsOn: [{ task: "build", from: "dependencies" }],
      },
      "fixture:bad-hydration": {
        command: "SSR_KNOWN_BAD=hydration vp test tests/fixtures/known-bad-runner.test.ts --run",
        cache: false,
        dependsOn: [{ task: "build", from: "dependencies" }],
      },
      "fixture:bad-browser-global": {
        command:
          "SSR_KNOWN_BAD=browser-global vp test tests/fixtures/known-bad-runner.test.ts --run",
        cache: false,
      },
    },
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    include: ["tests/**/*.test.ts"],
  },
});
