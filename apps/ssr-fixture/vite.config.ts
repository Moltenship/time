import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
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
    include: ["tests/**/*.test.ts"],
  },
});
