import { defineConfig } from "vite-plus";

const staticCheckIgnorePatterns = [".github/**", "*.md", "**/*.md"];
// This fixture must stay invalid; the focused boundary test asserts its exact failure.
const invalidBoundaryFixturePattern = "tests/fixtures/dependency-boundaries/**";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: staticCheckIgnorePatterns,
  },
  lint: {
    ignorePatterns: [...staticCheckIgnorePatterns, invalidBoundaryFixturePattern],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
    tasks: {
      "ci:check": "vp check",
      "ci:test": "vp test",
      "ci:build": "vp run -r build",
      "ssr:smoke": "vp run ssr-fixture#smoke",
      "registry:smoke": "vp run registry#smoke",
      "package:graph": ["vp run check:boundaries", "vp test tests/quality-gates.test.ts"],
      "engine:correctness":
        "vp test packages/calendar-temporal/tests packages/calendar-core/tests benchmarks/tests/harness.test.ts tools/fixtures/tests",
      "engine:contracts":
        "vp test tests/temporal-utilities-boundary.test.ts tests/dependency-boundaries.test.ts",
      "engine:build": ["vp run calendar-temporal#build", "vp run calendar-core#build"],
      "engine:gate": [
        "vp check",
        "vp run engine:correctness",
        "vp run engine:contracts",
        "vp run engine:build",
        "vp run --no-cache benchmark#core",
      ],
    },
  },
});
