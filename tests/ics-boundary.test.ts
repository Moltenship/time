import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const packageRoot = join(process.cwd(), "packages/ics");

async function readSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => readFile(join(entry.parentPath, entry.name), "utf8")),
  );
}

describe("ics runtime boundary", () => {
  test("reads no clock or host time zone and uses no legacy Date or polyfill", async () => {
    const source = (await readSources(join(packageRoot, "src"))).join("\n");

    expect(source).not.toMatch(/\bTemporal\.Now\b/u);
    expect(source).not.toMatch(/\bDate\b/u);
    expect(source).not.toMatch(/\bIntl\b/u);
    expect(source).not.toContain("polyfill");
  });

  test("ships without dependencies and with self-contained declarations", async () => {
    const manifestPath = join(packageRoot, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      readonly dependencies?: Record<string, string>;
      readonly peerDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});

    const packDestination = await mkdtemp(join(tmpdir(), "time-ics-package-"));
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
      await execFileAsync("tar", ["-xzf", archivePath, "-C", packDestination]);
      const packedDeclarations = await readFile(
        join(packDestination, "package/dist/index.d.mts"),
        "utf8",
      );
      expect(packedDeclarations).toContain("Temporal.ZonedDateTime");
      expect(packedDeclarations).not.toContain("@standard-schema/spec");
      expect(packedDeclarations).not.toContain("temporal-spec");

      const consumerPath = join(packDestination, "consumer.mts");
      await writeFile(
        consumerPath,
        [
          'import type { IcsEvent, IcsParser, StandardSchemaV1 } from "./package/dist/index.mjs";',
          "declare const event: IcsEvent;",
          "declare const parser: IcsParser;",
          "const start = event.start;",
          'const instant: Temporal.Instant | undefined = start.kind === "utc" ? start.instant : undefined;',
          "const schema: StandardSchemaV1<string, unknown> = parser;",
          "void instant;",
          "void schema;",
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
});
