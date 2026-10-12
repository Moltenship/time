import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { measureSizes, sizeFailures } from "../src/size";
import { dependencyOrder, publishedEntryPoints, readPublishedPackages } from "../src/workspace";

const exportsMap = {
  ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
  "./package.json": "./package.json",
};

describe("size budgets", () => {
  test("an entry point over its raw or gzip budget fails", () => {
    const measurement = { name: "@x/a", subpath: ".", file: "dist/index.mjs", raw: 101, gzip: 51 };

    expect(sizeFailures([{ ...measurement, budget: { raw: 100, gzip: 60 } }])).toEqual([
      "@x/a is 101 bytes raw, over its 100 budget",
    ]);
    expect(sizeFailures([{ ...measurement, budget: { raw: 200, gzip: 50 } }])).toEqual([
      "@x/a is 51 bytes gzip, over its 50 budget",
    ]);
    expect(sizeFailures([{ ...measurement, budget: { raw: 101, gzip: 51 } }])).toEqual([]);
  });

  test("an entry point without a budget fails", () => {
    expect(
      sizeFailures([{ name: "@x/a", subpath: "./extra", file: "dist/extra.mjs", raw: 1, gzip: 1 }]),
    ).toEqual(["@x/a/extra has no size budget in tools/release/src/config.ts"]);
  });

  test("measures each published entry point's emitted file", async () => {
    const root = await mkdtemp(join(tmpdir(), "release-size-"));
    try {
      await mkdir(join(root, "packages/heavy/dist"), { recursive: true });
      await writeFile(
        join(root, "packages/heavy/package.json"),
        JSON.stringify({
          name: "@x/heavy",
          version: "1.0.0",
          publishConfig: { exports: exportsMap },
        }),
      );
      // Random bytes don't compress, so the gzip size is about the raw size.
      await writeFile(join(root, "packages/heavy/dist/index.mjs"), randomBytes(4096));
      const packages = await readPublishedPackages(root, [
        { directory: "heavy", budgets: { ".": { raw: 8192, gzip: 1024 } } },
      ]);
      const [measurement] = await measureSizes(packages);

      expect(measurement).toMatchObject({ name: "@x/heavy", subpath: ".", raw: 4096 });
      expect(sizeFailures([measurement!])).toEqual([
        `@x/heavy is ${measurement!.gzip} bytes gzip, over its 1024 budget`,
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("a missing build is an error, not a pass", async () => {
    const root = await mkdtemp(join(tmpdir(), "release-size-"));
    try {
      await mkdir(join(root, "packages/unbuilt"), { recursive: true });
      await writeFile(
        join(root, "packages/unbuilt/package.json"),
        JSON.stringify({
          name: "@x/unbuilt",
          version: "1.0.0",
          publishConfig: { exports: exportsMap },
        }),
      );
      const packages = await readPublishedPackages(root, [
        { directory: "unbuilt", budgets: { ".": { raw: 1, gzip: 1 } } },
      ]);

      await expect(measureSizes(packages)).rejects.toThrow("Build the packages first");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("packages come after the published packages they depend on", () => {
    const at = (name: string, dependencies: string[] = [], peers: string[] = []) => ({
      manifest: {
        name,
        version: "1.0.0",
        dependencies: Object.fromEntries(dependencies.map((dependency) => [dependency, "1.0.0"])),
        peerDependencies: Object.fromEntries(peers.map((peer) => [peer, "1.0.0"])),
      },
    });
    const order = dependencyOrder([
      at("@x/facade", ["@x/react", "@x/core", "react"]),
      at("@x/react", ["@x/core"], ["react"]),
      at("@x/core", ["@x/temporal"]),
      at("@x/temporal"),
    ]).map(({ manifest }) => manifest.name);

    expect(order).toEqual(["@x/temporal", "@x/core", "@x/react", "@x/facade"]);
    expect(() => dependencyOrder([at("@x/a", ["@x/b"]), at("@x/b", ["@x/a"])])).toThrow("cycle");
  });

  test("every published entry point has a budget", async () => {
    for (const entry of await readPublishedPackages()) {
      for (const subpath of publishedEntryPoints(entry.manifest).keys()) {
        expect(entry.budgets[subpath], `${entry.manifest.name} ${subpath}`).toBeDefined();
      }
    }
  });
});
