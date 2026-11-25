import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { cruise, type IConfiguration, type ICruiseResult } from "dependency-cruiser";
import { describe, expect, test } from "vite-plus/test";

import dependencyCruiserConfig from "../dependency-cruiser.config";

const productionRoots = ["apps", "benchmarks", "packages", "registry", "tools"];
const invalidFixtureRoot = "tests/fixtures/dependency-boundaries";
const calendarReactDeepImportFixture =
  "tests/fixtures/dependency-boundaries/consumer/calendar-react-deep-import.ts";
const registryCoreImportFixture =
  "tests/fixtures/dependency-boundaries/registry/calendar/core-import.ts";
const registryTestsFixture =
  "tests/fixtures/dependency-boundaries/registry/tests/harness-import.ts";
const registrySourceTestingFixture =
  "tests/fixtures/dependency-boundaries/registry/calendar/testing-import.ts";
const testingInternalsFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-testing/src/internals-import.ts";
// The 2.0 planes (primitives, React and Solid integrations, ui-sdk): each fixture imports what its
// workspace may, then what it may not.
const primitivesFrameworkFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-primitives/src/framework-import.ts";
const solidReactFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-solid/src/react-import.ts";
const reactSolidFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-react/src/solid-import.ts";
const coreUiSdkFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-core/src/ui-sdk-import.ts";
const registryUiSdkFixture =
  "tests/fixtures/dependency-boundaries/registry/calendar/ui-sdk-import.ts";
const demoSolidFixture = "tests/fixtures/dependency-boundaries/apps/demo/src/solid-import.ts";
const solidDemoFixture = "tests/fixtures/dependency-boundaries/apps/demo-solid/src/main.ts";
const testingUiSdkFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-testing/src/ui-sdk-import.ts";
const pointerFrameworkFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-dnd/src/framework-import.ts";
const testingAgentTestFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-testing/tests/agent-import.ts";
// Rules 12 to 14 as architecture.md states them: the primitives import nothing else, the packages'
// tests are bound as their source is, and no package imports ui-sdk's date entries.
const primitivesNpmFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-primitives/src/npm-import.ts";
const primitivesTestsFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-primitives/tests/integration-import.ts";
const solidTestsFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-solid/tests/react-integration-import.ts";
const reactTestsFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-react/tests/solid-integration-import.ts";
const reactDateEntriesFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-react/src/date-entries-import.ts";
const solidDateEntriesFixture =
  "tests/fixtures/dependency-boundaries/packages/calendar-solid/src/date-entries-import.ts";

const expectedWorkspaceDependencies = {
  "@moltenship/calendar": [
    "@moltenship/calendar-core",
    "@moltenship/calendar-dnd",
    "@moltenship/calendar-react",
    "@moltenship/calendar-temporal",
  ],
  "@moltenship/calendar-core": ["@moltenship/calendar-temporal"],
  "@moltenship/calendar-dnd": ["@moltenship/calendar-core", "@moltenship/calendar-temporal"],
  "@moltenship/calendar-dnd-kit": ["@moltenship/calendar-core", "@moltenship/calendar-dnd"],
  "@moltenship/calendar-primitives": ["@moltenship/calendar-core", "@moltenship/calendar-temporal"],
  "@moltenship/calendar-react": [
    "@moltenship/calendar-core",
    "@moltenship/calendar-dnd",
    "@moltenship/calendar-primitives",
    "@moltenship/calendar-temporal",
  ],
  "@moltenship/calendar-recurrence": ["@moltenship/calendar-core", "@moltenship/ics"],
  "@moltenship/calendar-solid": [
    "@moltenship/calendar-core",
    "@moltenship/calendar-primitives",
    "@moltenship/calendar-temporal",
  ],
  "@moltenship/calendar-temporal": [],
  "@moltenship/calendar-testing": ["@moltenship/calendar", "@moltenship/calendar-recurrence"],
  "@moltenship/ics": [],
  benchmark: [
    "@moltenship/calendar-core",
    "@moltenship/calendar-recurrence",
    "@moltenship/calendar-temporal",
  ],
  demo: ["@moltenship/calendar", "@moltenship/calendar-dnd-kit", "@moltenship/calendar-recurrence"],
  registry: [],
  "registry-source": ["@moltenship/calendar"],
  showcase: [
    "@moltenship/calendar",
    "@moltenship/calendar-dnd-kit",
    "@moltenship/calendar-recurrence",
    "@moltenship/ics",
  ],
  "ssr-fixture": ["@moltenship/calendar"],
} as const;

const workspaceManifestPaths = [
  "apps/demo/package.json",
  "apps/showcase/package.json",
  "apps/ssr-fixture/package.json",
  "benchmarks/package.json",
  "packages/calendar/package.json",
  "packages/calendar-core/package.json",
  "packages/calendar-dnd/package.json",
  "packages/calendar-dnd-kit/package.json",
  "packages/calendar-primitives/package.json",
  "packages/calendar-react/package.json",
  "packages/calendar-recurrence/package.json",
  "packages/calendar-solid/package.json",
  "packages/calendar-temporal/package.json",
  "packages/calendar-testing/package.json",
  "packages/ics/package.json",
  "registry/package.json",
  "tools/registry/package.json",
] as const;

// Every package workspace has the publishable shape. tests/package-metadata.test.ts owns the list of
// packages that publish.
const publishableManifestPaths = [
  "packages/calendar/package.json",
  "packages/calendar-core/package.json",
  "packages/calendar-dnd/package.json",
  "packages/calendar-dnd-kit/package.json",
  "packages/calendar-primitives/package.json",
  "packages/calendar-react/package.json",
  "packages/calendar-recurrence/package.json",
  "packages/calendar-solid/package.json",
  "packages/calendar-temporal/package.json",
  "packages/calendar-testing/package.json",
  "packages/ics/package.json",
] as const;

async function cruiseWithArchitectureRules(roots: string[]) {
  const { forbidden, options } = dependencyCruiserConfig satisfies IConfiguration;
  const result = await cruise(roots, {
    ...options,
    ruleSet: { forbidden },
    validate: true,
  });

  expect(typeof result.output).not.toBe("string");
  return result.output as ICruiseResult;
}

/** The `to.path` patterns of one of the config's forbidden rules. */
function targetPatterns(name: string): string[] {
  const rule = dependencyCruiserConfig.forbidden.find((candidate) => candidate.name === name);
  const to = (rule as { readonly to?: { readonly path?: string | string[] } } | undefined)?.to;
  return [to?.path ?? []].flat();
}

describe("workspace boundaries", { concurrent: false }, () => {
  // Cruising every workspace takes a few seconds alone, and longer under a full parallel run.
  test("production source obeys the dependency rules", async () => {
    const result = await cruiseWithArchitectureRules(productionRoots);

    expect(result.summary.violations).toEqual([]);
  }, 30_000);

  test("a deliberately invalid deep import fails the boundary rule", async () => {
    const result = await cruiseWithArchitectureRules([invalidFixtureRoot]);
    const violatedRules = result.summary.violations.map(({ rule }) => rule.name);

    expect(violatedRules).toContain("no-calendar-temporal-deep-imports");
    expect(violatedRules).toContain("no-package-source-specifiers");
  });

  test("registry source may not reach past the calendar facade", async () => {
    const result = await cruiseWithArchitectureRules([registryCoreImportFixture]);
    const violatedRules = result.summary.violations.map(({ rule }) => rule.name);

    expect(violatedRules).toEqual(["registry-source-uses-calendar-facade"]);
  });

  test("registry tests may also use the test harness, and registry source may not", async () => {
    const tests = await cruiseWithArchitectureRules([registryTestsFixture]);
    const source = await cruiseWithArchitectureRules([registrySourceTestingFixture]);
    const violations = (result: ICruiseResult) =>
      result.summary.violations.map(({ rule, to }) => `${rule.name} ${to}`);

    expect(violations(tests)).toEqual([
      "registry-tests-use-the-facade-and-the-harness @moltenship/calendar-core",
    ]);
    expect(violations(source)).toEqual([
      "registry-source-uses-calendar-facade @moltenship/calendar-testing",
    ]);
  });

  test("the test harness imports only the facade and recurrence", async () => {
    const result = await cruiseWithArchitectureRules([testingInternalsFixture]);
    const violations = result.summary.violations.map(({ rule, to }) => `${rule.name} ${to}`);

    expect(violations).toEqual(["testing-uses-public-entry-points @moltenship/calendar-core"]);
  });

  describe("the primitives, the integrations and ui-sdk", () => {
    const violations = async (fixture: string) =>
      (await cruiseWithArchitectureRules([fixture])).summary.violations
        .map(({ rule, to }) => `${rule.name} ${to}`)
        .sort();

    test("the primitives import no framework and nothing of ours past the engine", async () => {
      expect(await violations(primitivesFrameworkFixture)).toEqual([
        "no-react-in-primitives-or-solid @ui-sdk/react",
        "no-react-in-primitives-or-solid react",
        "only-calendar-solid-imports-solid solid-js",
        "primitives-build-on-the-engine @moltenship/calendar-react",
        "primitives-import-no-framework @ui-sdk/react",
        "primitives-import-no-framework react",
        "primitives-import-no-framework solid-js",
      ]);
    });

    test("the pointer adapter imports no framework, no ui-sdk and nothing of ours past the engine", async () => {
      expect(await violations(pointerFrameworkFixture)).toEqual([
        "only-calendar-solid-imports-solid solid-js",
        "only-primitives-and-integrations-import-ui-sdk @ui-sdk/core",
        "pointer-adapter-builds-on-the-engine @moltenship/calendar-primitives",
        "pointer-adapter-builds-on-the-engine @moltenship/calendar-react",
        "pointer-adapter-imports-no-framework @ui-sdk/core",
        "pointer-adapter-imports-no-framework react",
        "pointer-adapter-imports-no-framework solid-js",
      ]);
    });

    test("the Solid integration imports no React, React integration, facade or ui-sdk internals", async () => {
      expect(await violations(solidReactFixture)).toEqual([
        "no-react-in-primitives-or-solid react",
        "no-ui-sdk-internals @ui-sdk/core/internal/store",
        "solid-integration-builds-on-the-primitives @moltenship/calendar",
        "solid-integration-builds-on-the-primitives @moltenship/calendar-react",
      ]);
    });

    test("the React integration imports neither Solid nor the Solid integration", async () => {
      expect(await violations(reactSolidFixture)).toEqual([
        "only-calendar-solid-imports-solid @ui-sdk/solid",
        "only-calendar-solid-imports-solid solid-js",
        "react-integration-builds-on-the-primitives @moltenship/calendar-solid",
      ]);
    });

    test("ui-sdk and Solid stay out of the engine, registry source and the React demo", async () => {
      expect(await violations(coreUiSdkFixture)).toEqual([
        "only-calendar-solid-imports-solid solid-js",
        "only-primitives-and-integrations-import-ui-sdk @ui-sdk/core",
      ]);
      expect(await violations(registryUiSdkFixture)).toEqual([
        "only-calendar-solid-imports-solid @solidjs/web",
        "only-primitives-and-integrations-import-ui-sdk @ui-sdk/core/agent",
      ]);
      expect(await violations(demoSolidFixture)).toEqual([
        "only-calendar-solid-imports-solid solid-js",
        "only-primitives-and-integrations-import-ui-sdk @ui-sdk/react",
      ]);
    });

    test("the Solid demo may use Solid and ui-sdk's public entries", async () => {
      expect(await violations(solidDemoFixture)).toEqual([]);
    });

    test("calendar-testing's tests may drive an agent bridge, and its source may not", async () => {
      expect(await violations(testingAgentTestFixture)).toEqual([]);
      expect(await violations(testingUiSdkFixture)).toEqual([
        "only-primitives-and-integrations-import-ui-sdk @ui-sdk/react/agent",
      ]);
    });

    test("the primitives' source imports nothing past the engine and ui-sdk's core", async () => {
      expect(await violations(primitivesNpmFixture)).toEqual([
        "primitives-import-nothing-else fs",
        "primitives-import-nothing-else lodash",
      ]);
    });

    test("the primitives' tests may add the test tooling, and no integration or other package", async () => {
      expect(await violations(primitivesTestsFixture)).toEqual([
        "no-react-in-primitives-or-solid react",
        "primitives-build-on-the-engine @moltenship/calendar-react",
        "primitives-import-no-framework react",
        "primitives-tests-import-nothing-else lodash",
      ]);
    });

    test("the integrations' tests import neither the other integration nor what carries it", async () => {
      expect(await violations(solidTestsFixture)).toEqual([
        "no-react-in-primitives-or-solid @ui-sdk/react/agent",
        "solid-integration-builds-on-the-primitives @moltenship/calendar",
        "solid-integration-builds-on-the-primitives @moltenship/calendar-dnd-kit",
        "solid-integration-builds-on-the-primitives @moltenship/calendar-react",
        "solid-integration-builds-on-the-primitives @moltenship/calendar-testing",
      ]);
      expect(await violations(reactTestsFixture)).toEqual([
        "only-calendar-solid-imports-solid @ui-sdk/solid",
        "react-integration-tests-import-no-solid-integration @moltenship/calendar-solid",
      ]);
    });

    test("no package imports ui-sdk's date entries", async () => {
      expect(await violations(reactDateEntriesFixture)).toEqual([
        "no-ui-sdk-date-entries @ui-sdk/core/calendar",
        "no-ui-sdk-date-entries @ui-sdk/core/date",
        "no-ui-sdk-date-entries @ui-sdk/core/date-picker",
        "no-ui-sdk-date-entries @ui-sdk/react/calendar",
      ]);
      expect(await violations(solidDateEntriesFixture)).toEqual([
        "no-ui-sdk-date-entries @ui-sdk/solid/time-input",
        "no-ui-sdk-date-entries @ui-sdk/solid/timeline",
      ]);
    });

    // The fixtures can't resolve npm packages, so they test specifiers. Production imports resolve
    // to files in pnpm's store, which the same rules must match.
    test.each([
      [
        "no-react-in-primitives-or-solid",
        "node_modules/.pnpm/react@19.3.1/node_modules/react/index.js",
      ],
      [
        "only-calendar-solid-imports-solid",
        "node_modules/.pnpm/solid-js@2.0.3/node_modules/solid-js/dist/solid.js",
      ],
      [
        "only-primitives-and-integrations-import-ui-sdk",
        "node_modules/.pnpm/@ui-sdk+core@0.1.0-beta.16/node_modules/@ui-sdk/core/dist/index.js",
      ],
      [
        "primitives-import-no-framework",
        "node_modules/.pnpm/@ui-sdk+react@0.1.0-beta.16_react@19.3.1/node_modules/@ui-sdk/react/dist/index.js",
      ],
      [
        "no-ui-sdk-date-entries",
        "node_modules/.pnpm/@ui-sdk+core@0.1.0-beta.16/node_modules/@ui-sdk/core/dist/components/date-input/time-input.js",
      ],
      [
        "no-ui-sdk-date-entries",
        "node_modules/.pnpm/@ui-sdk+core@0.1.0-beta.16/node_modules/@ui-sdk/core/dist/foundation/date/date.d.ts",
      ],
      [
        "no-ui-sdk-date-entries",
        "node_modules/.pnpm/@ui-sdk+solid@0.1.0-beta.16_solid-js@2.0.3/node_modules/@ui-sdk/solid/dist/solid/calendar.jsx",
      ],
    ])("%s also matches a resolved import, %s", (name, resolved) => {
      const patterns = targetPatterns(name);

      expect(patterns.some((pattern) => new RegExp(pattern).test(resolved))).toBe(true);
    });

    test("ui-sdk's other entries aren't date entries, resolved or not", () => {
      const patterns = targetPatterns("no-ui-sdk-date-entries");
      const others = [
        "@ui-sdk/core",
        "@ui-sdk/core/observe",
        "@ui-sdk/react/button",
        "@ui-sdk/solid/date-picker-like",
        "node_modules/.pnpm/@ui-sdk+core@0.1.0-beta.16/node_modules/@ui-sdk/core/dist/index.js",
        "node_modules/.pnpm/@ui-sdk+react@0.1.0-beta.16_react@19.3.1/node_modules/@ui-sdk/react/dist/button.js",
      ];

      expect(
        others.filter((path) => patterns.some((pattern) => new RegExp(pattern).test(path))),
      ).toEqual([]);
    });

    test("the primitives may import ui-sdk's core, resolved or not", () => {
      const patterns = targetPatterns("primitives-import-no-framework");
      const core = [
        "@ui-sdk/core",
        "@ui-sdk/core/agent",
        "node_modules/.pnpm/@ui-sdk+core@0.1.0-beta.16/node_modules/@ui-sdk/core/dist/index.js",
      ];

      expect(
        core.filter((path) => patterns.some((pattern) => new RegExp(pattern).test(path))),
      ).toEqual([]);
    });

    test("only the primitives, the integrations and what re-exports them declare ui-sdk, and only calendar-solid Solid", async () => {
      const frameworks = {
        react: /^(?:react|react-dom|@ui-sdk\/react)$/u,
        solid: /^(?:solid-js|@solidjs\/.+|@ui-sdk\/solid)$/u,
        "ui-sdk": /^@ui-sdk\//u,
      };
      // By manifest path; the Solid demo joins workspaceManifestPaths when it lands.
      const allowed: Record<keyof typeof frameworks, (path: string) => boolean> = {
        react: (path) => !/^packages\/calendar-(?:primitives|solid)\//u.test(path),
        solid: (path) => /^(?:packages\/calendar-solid|apps\/demo-solid)\//u.test(path),
        // The docs site creates an agent bridge for its live examples (architecture.md, rule 14).
        // The facade and the testing package re-export the React integration, so they carry its
        // peers, as they carry React; their source still imports no ui-sdk (the cruiser's rule).
        "ui-sdk": (path) =>
          /^(?:packages\/calendar(?:-(?:primitives|react|solid|testing))?|apps\/(?:demo-solid|showcase))\//u.test(
            path,
          ),
      };
      const problems: string[] = [];

      for (const manifestPath of workspaceManifestPaths) {
        const manifest = JSON.parse(await readFile(join(process.cwd(), manifestPath), "utf8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          name: string;
          peerDependencies?: Record<string, string>;
        };
        const declared = Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
          ...manifest.peerDependencies,
        });
        for (const [framework, pattern] of Object.entries(frameworks) as [
          keyof typeof frameworks,
          RegExp,
        ][]) {
          for (const dependency of declared.filter((name) => pattern.test(name))) {
            if (!allowed[framework](manifestPath)) problems.push(`${manifest.name}: ${dependency}`);
          }
        }
      }

      expect(problems).toEqual([]);
    });
  });

  test("a calendar React source import fails the boundary rule", async () => {
    const result = await cruiseWithArchitectureRules([calendarReactDeepImportFixture]);
    const violatedRules = result.summary.violations.map(({ rule }) => rule.name);

    expect(violatedRules).toContain("no-package-source-specifiers");
  });

  test("workspace manifests encode only the approved import direction", async () => {
    const actualDependencies = Object.fromEntries(
      await Promise.all(
        workspaceManifestPaths.map(async (manifestPath) => {
          const manifest = JSON.parse(
            await readFile(join(process.cwd(), manifestPath), "utf8"),
          ) as {
            dependencies?: Record<string, string>;
            name: string;
          };
          const workspaceDependencies = Object.entries(manifest.dependencies ?? {})
            .filter(([, version]) => version.startsWith("workspace:"))
            .map(([name]) => name)
            .sort();

          return [manifest.name, workspaceDependencies] as const;
        }),
      ),
    );

    expect(actualDependencies).toEqual(expectedWorkspaceDependencies);
  });

  // The packed tarballs' side of this is `release:exports` (publint, are-the-types-wrong).
  test("packages export their source in the workspace and their build when published", async () => {
    const manifests = await Promise.all(
      publishableManifestPaths.map(async (manifestPath) =>
        JSON.parse(await readFile(join(process.cwd(), manifestPath), "utf8")),
      ),
    );

    for (const manifest of manifests) {
      expect(manifest.exports["."]).toBe("./src/index.ts");
      expect(manifest.publishConfig.exports["."]).toEqual({
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      });
    }
  });

  test.each(["calendar-core", "calendar-temporal", "ics"])(
    "%s compiles without DOM or ambient package types",
    async (packageName) => {
      const tsconfig = JSON.parse(
        await readFile(join(process.cwd(), "packages", packageName, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: { lib: string[]; types: string[] } };

      expect(tsconfig.compilerOptions.lib).toEqual(["ESNext"]);
      expect(tsconfig.compilerOptions.types).toEqual([]);
    },
  );

  // The primitives may use DOM types, since slots bind elements, but no framework's JSX.
  test("calendar-primitives compiles without JSX or ambient package types", async () => {
    const tsconfig = JSON.parse(
      await readFile(join(process.cwd(), "packages/calendar-primitives/tsconfig.json"), "utf8"),
    ) as { compilerOptions: Record<string, unknown> };

    expect(tsconfig.compilerOptions.types).toEqual([]);
    expect(tsconfig.compilerOptions).not.toHaveProperty("jsx");
    expect(tsconfig.compilerOptions).not.toHaveProperty("jsxImportSource");
  });
});
