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
  "@moltenship/calendar-react": ["@moltenship/calendar-core", "@moltenship/calendar-temporal"],
  "@moltenship/calendar-recurrence": ["@moltenship/calendar-core", "@moltenship/ics"],
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
  "packages/calendar-react/package.json",
  "packages/calendar-recurrence/package.json",
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
  "packages/calendar-react/package.json",
  "packages/calendar-recurrence/package.json",
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
});
