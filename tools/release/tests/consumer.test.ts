import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { stringify } from "yaml";

import { adapterBundleProblems, lockedVersions, runtimeProblems } from "../src/consumer";

let consumer: string;

/** Writes a package straight into the consumer's node_modules, as an install would. */
async function installed(
  name: string,
  files: Record<string, string>,
  manifest: Record<string, unknown> = {},
) {
  const root = join(consumer, "node_modules", name);
  const all = {
    "package.json": JSON.stringify({
      name,
      version: "1.0.0",
      type: "module",
      sideEffects: false,
      ...manifest,
    }),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

const sealed = { exports: { ".": "./dist/index.mjs", "./package.json": "./package.json" } };

beforeAll(async () => {
  consumer = await mkdtemp(join(tmpdir(), "release-consumer-"));
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );

  await installed("@x/sealed", { "dist/index.mjs": "export const sealed = true;\n" }, sealed);
  // No exports map: every file in the package can be imported.
  await installed(
    "@x/open",
    { "dist/index.mjs": "export const open = true;\n" },
    { main: "./dist/index.mjs" },
  );

  await installed(
    "@x/core",
    { "dist/index.mjs": 'export function core() { return "core"; }\n' },
    sealed,
  );
  await installed(
    "@x/adapter",
    {
      "dist/index.mjs": 'export function pointer() { return "adapter code that must not leak"; }\n',
    },
    sealed,
  );
  await installed(
    "@x/facade",
    {
      "dist/index.mjs": 'export { core } from "@x/core";\nexport { pointer } from "@x/adapter";\n',
    },
    sealed,
  );
  // Runs adapter code when imported, so bundlers must keep the adapter.
  await installed(
    "@x/leaky-facade",
    {
      "dist/index.mjs":
        'import { pointer } from "@x/adapter";\nexport { core } from "@x/core";\nexport { pointer };\nglobalThis.pointerName = pointer();\n',
    },
    { ...sealed, sideEffects: true },
  );
});

afterAll(async () => {
  await rm(consumer, { force: true, recursive: true });
});

describe("clean-consumer checks", () => {
  test("a package that lets consumers deep-import its files fails", async () => {
    expect(await runtimeProblems(consumer, ["@x/sealed", "@x/open"])).toEqual([
      "@x/open: a deep import of dist/index.mjs gave allowed, not ERR_PACKAGE_PATH_NOT_EXPORTED",
    ]);
  });

  test("a package that can't be imported fails", async () => {
    const problems = await runtimeProblems(consumer, ["@x/not-installed"]);

    expect(problems[0]).toMatch(/^@x\/not-installed: import failed: /);
  });

  test("a facade whose other exports tree-shake the adapter away passes", async () => {
    expect(await adapterBundleProblems(consumer, "@x/facade", "@x/adapter")).toEqual([]);
  }, 30_000);

  test("a facade that keeps the adapter in its base bundle fails", async () => {
    const problems = await adapterBundleProblems(consumer, "@x/leaky-facade", "@x/adapter");

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^@x\/leaky-facade without its pointer exports still bundles \d+ bytes of @x\/adapter$/,
    );
  }, 30_000);
});

describe("the clean consumer's pinned versions", () => {
  const workspaceLockfile = stringify({
    lockfileVersion: "9.0",
    packages: {
      "@moltenship/calendar@file:packages/calendar": {
        resolution: { directory: "packages/calendar" },
      },
      "@types/react@19.3.0": { resolution: { integrity: "sha512-types" } },
      "csstype@3.2.3": { resolution: { integrity: "sha512-csstype" } },
      "semver@6.3.1": { resolution: { integrity: "sha512-six" } },
      "semver@7.8.0": { resolution: { integrity: "sha512-seven" } },
      "some-tool@https://codeload.github.com/x/y/tar.gz/abc": { resolution: { tarball: "x" } },
    },
  });

  test("pins each third-party package the workspace locks at one version", () => {
    expect(lockedVersions(workspaceLockfile)).toEqual({
      "@types/react": "19.3.0",
      csstype: "3.2.3",
    });
  });
});
