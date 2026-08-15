import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { cruise, type IConfiguration, type ICruiseResult } from "dependency-cruiser";
import { describe, expect, test } from "vite-plus/test";

import dependencyCruiserConfig from "../dependency-cruiser.config";

const productionRoots = ["apps", "benchmarks", "packages", "registry", "tools"];
const invalidFixtureRoot = "tests/fixtures/dependency-boundaries";
const execFileAsync = promisify(execFile);

const expectedWorkspaceDependencies = {
  "@moltenship/calendar": ["@moltenship/calendar-core", "@moltenship/calendar-react"],
  "@moltenship/calendar-core": ["@moltenship/calendar-temporal"],
  "@moltenship/calendar-dnd": ["@moltenship/calendar-core", "@moltenship/calendar-react"],
  "@moltenship/calendar-react": ["@moltenship/calendar-core"],
  "@moltenship/calendar-recurrence": ["@moltenship/calendar-core", "@moltenship/calendar-temporal"],
  "@moltenship/calendar-temporal": [],
  "@moltenship/calendar-testing": [
    "@moltenship/calendar",
    "@moltenship/calendar-dnd",
    "@moltenship/calendar-temporal",
  ],
  benchmark: ["@moltenship/calendar-core", "@moltenship/calendar-react", "fixtures"],
  fixtures: ["@moltenship/calendar-core"],
  registry: [],
  showcase: ["@moltenship/calendar"],
  "ssr-fixture": ["@moltenship/calendar"],
} as const;

const workspaceManifestPaths = [
  "apps/showcase/package.json",
  "apps/ssr-fixture/package.json",
  "benchmarks/package.json",
  "packages/calendar/package.json",
  "packages/calendar-core/package.json",
  "packages/calendar-dnd/package.json",
  "packages/calendar-react/package.json",
  "packages/calendar-recurrence/package.json",
  "packages/calendar-temporal/package.json",
  "packages/calendar-testing/package.json",
  "tools/fixtures/package.json",
  "tools/registry/package.json",
] as const;

const publishableManifestPaths = [
  "packages/calendar/package.json",
  "packages/calendar-core/package.json",
  "packages/calendar-dnd/package.json",
  "packages/calendar-react/package.json",
  "packages/calendar-recurrence/package.json",
  "packages/calendar-temporal/package.json",
  "packages/calendar-testing/package.json",
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

describe.sequential("workspace boundaries", () => {
  test("production source obeys the dependency rules", async () => {
    const result = await cruiseWithArchitectureRules(productionRoots);

    expect(result.summary.violations).toEqual([]);
  });

  test("a deliberately invalid deep import fails the boundary rule", async () => {
    const result = await cruiseWithArchitectureRules([invalidFixtureRoot]);
    const violatedRules = result.summary.violations.map(({ rule }) => rule.name);

    expect(violatedRules).toContain("no-calendar-temporal-deep-imports");
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

  test("declared workspace imports compile against source before packages are built", async () => {
    const manifests = await Promise.all(
      publishableManifestPaths.map(async (manifestPath) =>
        JSON.parse(await readFile(join(process.cwd(), manifestPath), "utf8")),
      ),
    );
    const fixturesManifest = JSON.parse(
      await readFile(join(process.cwd(), "tools/fixtures/package.json"), "utf8"),
    );

    for (const manifest of manifests) {
      expect(manifest.exports["."]).toBe("./src/index.ts");
      expect(manifest.publishConfig.exports["."]).toEqual({
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      });
    }

    expect(fixturesManifest.exports["."]).toEqual({
      types: "./src/index.ts",
      import: "./dist/index.mjs",
    });

    await Promise.all(
      ["packages/calendar-core", "benchmarks"].map((workspacePath) =>
        execFileAsync("vp", ["check"], { cwd: join(process.cwd(), workspacePath) }),
      ),
    );
  }, 30_000);

  test("packed publishable package exposes built runtime and declarations", async () => {
    const packageRoot = join(process.cwd(), "packages/calendar-temporal");
    const manifestPath = join(packageRoot, "package.json");
    const packDestination = await mkdtemp(join(tmpdir(), "time-package-"));
    const localManifestBeforePack = await readFile(manifestPath, "utf8");

    try {
      await execFileAsync("vp", ["pack"], { cwd: packageRoot });
      expect(await readFile(manifestPath, "utf8")).toBe(localManifestBeforePack);
      await execFileAsync("vp", ["pm", "pack", "--pack-destination", packDestination], {
        cwd: packageRoot,
      });

      const [archiveName] = (await readdir(packDestination)).filter((fileName) =>
        fileName.endsWith(".tgz"),
      );
      expect(archiveName).toBeDefined();

      const archivePath = join(packDestination, archiveName!);
      const { stdout: packedManifestText } = await execFileAsync("tar", [
        "-xOf",
        archivePath,
        "package/package.json",
      ]);
      const { stdout: packedDeclarations } = await execFileAsync("tar", [
        "-xOf",
        archivePath,
        "package/dist/index.d.mts",
      ]);
      const { stdout: archiveContents } = await execFileAsync("tar", ["-tf", archivePath]);
      const packedManifest = JSON.parse(packedManifestText);

      expect(packedManifest.exports["."]).toEqual({
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      });
      expect(packedManifest.dependencies ?? {}).toEqual({});
      expect(archiveContents).toContain("package/dist/index.d.mts");
      expect(archiveContents).toContain("package/dist/index.mjs");
      expect(packedDeclarations).toContain("Temporal.Instant");
      expect(packedDeclarations).not.toContain("temporal-spec");

      await execFileAsync("tar", ["-xzf", archivePath, "-C", packDestination]);
      const consumerPath = join(packDestination, "consumer.mts");
      await writeFile(
        consumerPath,
        [
          'import type { InstantInterval } from "./package/dist/index.mjs";',
          "declare const interval: InstantInterval;",
          "const start: Temporal.Instant = interval.start;",
          "void start;",
        ].join("\n"),
      );
      await execFileAsync(
        process.execPath,
        [
          join(process.cwd(), "node_modules/typescript/bin/tsc"),
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--target",
          "ES2023",
          "--lib",
          "ESNext",
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          consumerPath,
        ],
        { cwd: packDestination },
      );
    } finally {
      await rm(packDestination, { force: true, recursive: true });
    }
  }, 30_000);

  test("packed calendar core keeps its API public and its interval-tree seam private", async () => {
    const packageRoot = join(process.cwd(), "packages/calendar-core");
    const manifestPath = join(packageRoot, "package.json");
    const packDestination = await mkdtemp(join(tmpdir(), "time-core-package-"));
    const localManifestBeforePack = await readFile(manifestPath, "utf8");

    try {
      await execFileAsync("vp", ["pack"], { cwd: packageRoot });
      expect(await readFile(manifestPath, "utf8")).toBe(localManifestBeforePack);
      await execFileAsync("vp", ["pm", "pack", "--pack-destination", packDestination], {
        cwd: packageRoot,
      });

      const [archiveName] = (await readdir(packDestination)).filter((fileName) =>
        fileName.endsWith(".tgz"),
      );
      expect(archiveName).toBeDefined();

      const archivePath = join(packDestination, archiveName!);
      const { stdout: packedManifestText } = await execFileAsync("tar", [
        "-xOf",
        archivePath,
        "package/package.json",
      ]);
      const { stdout: packedDeclarations } = await execFileAsync("tar", [
        "-xOf",
        archivePath,
        "package/dist/index.d.mts",
      ]);
      const { stdout: archiveContents } = await execFileAsync("tar", ["-tf", archivePath]);
      const packedManifest = JSON.parse(packedManifestText) as {
        readonly dependencies?: Record<string, string>;
        readonly exports: Record<string, unknown>;
      };

      expect(packedManifest.exports["."]).toEqual({
        types: "./dist/index.d.mts",
        import: "./dist/index.mjs",
      });
      expect(packedManifest.dependencies).toEqual({
        "@flatten-js/interval-tree": "^2.0.3",
        "@moltenship/calendar-temporal": "0.0.0",
      });
      expect(archiveContents).toContain("package/dist/index.d.mts");
      expect(archiveContents).toContain("package/dist/index.mjs");
      expect(packedDeclarations).toContain("createEventSnapshot");
      expect(packedDeclarations).toContain("EventSnapshotQueryCacheStatistics");
      expect(packedDeclarations).not.toContain("@flatten-js/interval-tree");
      expect(packedDeclarations).not.toContain("/internal/");
    } finally {
      await rm(packDestination, { force: true, recursive: true });
    }
  }, 30_000);

  test("benchmark resolves the built fixtures package through its public entry point", async () => {
    await execFileAsync("vp", ["pack"], {
      cwd: join(process.cwd(), "tools/fixtures"),
    });

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'const target = import.meta.resolve("fixtures"); await import(target); console.log(target);',
      ],
      { cwd: join(process.cwd(), "benchmarks") },
    );

    expect(stdout.trim()).toBe(
      pathToFileURL(join(process.cwd(), "tools/fixtures/dist/index.mjs")).href,
    );
  }, 30_000);

  test.each(["calendar-core", "calendar-temporal"])(
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
