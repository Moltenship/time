import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { publishedPackages } from "../src/config";
import { assertVersion, setVersion, sharedVersion } from "../src/version";
import type { WorkspacePackage } from "../src/workspace";

function at(name: string, version: string): WorkspacePackage {
  return { directory: name, budgets: {}, path: `/packages/${name}`, manifest: { name, version } };
}

describe("versions", () => {
  test("versions must be plain semver", () => {
    expect(() => assertVersion("1.0.0-rc.1")).not.toThrow();
    expect(() => assertVersion("v1.0.0")).toThrow("isn't a semver version");
    expect(() => assertVersion("1.0")).toThrow("isn't a semver version");
  });

  test("published packages share one version", () => {
    expect(sharedVersion([at("@x/a", "1.0.0"), at("@x/b", "1.0.0")])).toBe("1.0.0");
    expect(() => sharedVersion([at("@x/a", "1.0.0"), at("@x/b", "1.0.1")])).toThrow(
      "must share one version",
    );
  });

  test("the bump sets every published manifest, and only to a greater version", async () => {
    const root = await mkdtemp(join(tmpdir(), "release-version-"));
    try {
      for (const { directory } of publishedPackages) {
        await mkdir(join(root, "packages", directory), { recursive: true });
        const manifest = {
          name: `@moltenship/${directory}`,
          version: "1.0.0-rc.1",
          private: false,
        };
        await writeFile(
          join(root, "packages", directory, "package.json"),
          JSON.stringify(manifest),
        );
      }

      await expect(setVersion("1.0.0-rc.1", root)).rejects.toThrow("must be greater");
      const written = await setVersion("1.0.0-rc.2", root);

      expect(written).toHaveLength(publishedPackages.length);
      for (const file of written) {
        const text = await readFile(join(root, file), "utf8");
        expect(JSON.parse(text)).toEqual({
          name: expect.any(String),
          version: "1.0.0-rc.2",
          private: false,
        });
        expect(text.endsWith("}\n")).toBe(true);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
