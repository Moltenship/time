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
      a11y: "vp run a11y#test",
      "package:graph": ["vp run check:boundaries", "vp test tests/quality-gates.test.ts"],
      "showcase:source": "vp run showcase#source:generate",
      "showcase:types": "vp run showcase#types:check",
      "showcase:test": "vp run showcase#test",
      "showcase:links": "vp run showcase:source && vp run showcase#links:check",
      "showcase:build": "vp run showcase#build",
      "showcase:search": "vp run showcase:build && vp run showcase#search:check",
      "showcase:gate":
        "vp run showcase:types && vp run showcase:test && vp run showcase:links && vp run showcase:search",
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
      "react:store": [
        "vp run calendar-react#check",
        "vp run calendar-react#test",
        "vp run calendar-react#build",
      ],
      "react:factory": [
        "vp run calendar-react#check",
        "vp run calendar-react#test",
        "vp run calendar-react#build",
        "vp run calendar#check",
        "vp run calendar#test",
        "vp run calendar#build",
      ],
      "react:gate": [
        "vp check",
        "vp run calendar-react#test:gate",
        "vp run react:factory",
        "vp run ssr:smoke",
        "vp run check:boundaries",
      ],
    },
  },
});
