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
      // The quality gate's three tiers; AGENTS.md says which one a change runs. Steps that write
      // or read generated files (`dist`, `.next`, `.source`) run one after another in a
      // `gate:serial` lane. The rest run beside it.
      // The link check compiles every docs page, so MDX that wouldn't build fails here too.
      "ready:quick": ["vp run showcase:links", "vp check", "vp test"],
      // What every PR runs. CI runs `ready:checks` and `a11y` as two jobs.
      ready: {
        command: "echo ready: every PR check passed",
        cache: false,
        dependsOn: ["ready:checks", "a11y"],
      },
      "ready:checks": {
        command: "echo ready:checks passed",
        cache: false,
        dependsOn: ["registry:smoke", "gate:serial"],
      },
      // The release gate: everything `ready` runs, the a11y suite at CI's speed, the docs site's
      // types and search, and the registry installed into clean apps.
      "ready:full": {
        command: "echo ready:full: the release gate passed",
        cache: false,
        dependsOn: ["registry:smoke", "a11y", "a11y:ci-speed", "gate:serial:full"],
      },
      "gate:serial":
        "vp run showcase:links && vp run ci:check && vp run ci:build && vp run ci:test && vp run react:gate && vp run ssr:smoke && vp run package:graph",
      // `ci:build` has built the docs site, so search checks that build. The registry's install
      // test packs the packages and installs them into clean apps; it needs the network.
      "gate:serial:full":
        "vp run gate:serial && vp run showcase:types && vp run showcase#search:check && vp run registry:e2e",
      "ci:check": "vp check",
      "ci:test": "vp test",
      "ci:build": "vp run -r build",
      "ssr:smoke": "vp run ssr-fixture#smoke",
      "registry:smoke": "vp run registry#smoke",
      "registry:build": "vp run registry#site",
      "registry:e2e": "vp run registry#e2e",
      a11y: "vp run a11y#test",
      // The a11y suite with Chromium slowed down to a CI runner's speed. Never replayed: it's what
      // to run when CI and local disagree, and a timing race can pass once by luck.
      "a11y:ci-speed": { command: "vp test --mode ci-speed", cwd: "tools/a11y", cache: false },
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
      "recurrence:gate": [
        "vp check",
        "vp test packages/calendar-recurrence benchmarks/tests/recurrence.test.ts registry/tests/recurrence-scope-dialog.test.tsx registry/tests/announcements.test.ts tests/dependency-boundaries.test.ts",
        "vp run a11y#test tests/recurrence-scope-dialog.a11y.tsx tests/recurrence-scope-dialog-week.a11y.tsx",
        "vp run --no-cache benchmark#recurrence",
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
