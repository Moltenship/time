import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { tarballProblems } from "../src/exports";

const execFileAsync = promisify(execFile);
let workspace: string;

interface TarballOptions {
  readonly name?: string;
  readonly files?: Record<string, string>;
  readonly manifest?: Record<string, unknown>;
  readonly license?: boolean;
}

/** Writes a package and packs it the way npm lays tarballs out: everything under `package/`. */
async function tarball(id: string, options: TarballOptions = {}): Promise<string> {
  const root = join(workspace, id);
  const files: Record<string, string> = {
    "dist/index.mjs": "export const answer = 42;\n",
    "dist/index.d.mts": "export declare const answer = 42;\n",
    ...options.files,
  };
  if (options.license !== false) files.LICENSE = "MIT License\n";
  const manifest = {
    name: options.name ?? "@moltenship/example",
    version: "1.0.0",
    license: "MIT",
    type: "module",
    sideEffects: false,
    files: ["dist"],
    exports: {
      ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
      "./package.json": "./package.json",
    },
    ...options.manifest,
  };
  files["package.json"] = JSON.stringify(manifest, null, 2);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, "package", path)), { recursive: true });
    await writeFile(join(root, "package", path), text);
  }
  const archive = join(root, "package.tgz");
  // COPYFILE_DISABLE keeps macOS tar from adding AppleDouble `._*` entries.
  await execFileAsync("tar", ["-czf", archive, "-C", root, "package"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  return archive;
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "release-exports-"));
});

afterAll(async () => {
  await rm(workspace, { force: true, recursive: true });
});

describe("export checks", () => {
  test("a well-formed ESM package passes", async () => {
    expect(await tarballProblems(await tarball("good"))).toEqual([]);
  }, 30_000);

  test("an export map pointing at a missing declaration file fails publint and attw", async () => {
    const problems = await tarballProblems(
      await tarball("missing-types", {
        manifest: {
          exports: {
            ".": { types: "./dist/missing.d.mts", import: "./dist/index.mjs" },
            "./package.json": "./package.json",
          },
        },
      }),
    );

    expect(
      problems.some(
        (problem) => problem.startsWith("publint:") && problem.includes("missing.d.mts"),
      ),
    ).toBe(true);
    expect(problems.some((problem) => problem.startsWith("are-the-types-wrong:"))).toBe(true);
  }, 30_000);

  test("CommonJS types for an ESM file fail attw", async () => {
    const problems = await tarballProblems(
      await tarball("false-cjs", {
        files: { "dist/index.d.cts": "export declare const answer = 42;\n" },
        manifest: {
          exports: {
            ".": { types: "./dist/index.d.cts", import: "./dist/index.mjs" },
            "./package.json": "./package.json",
          },
        },
      }),
    );

    expect(problems.some((problem) => problem.includes("FalseCJS"))).toBe(true);
  }, 30_000);

  test("a tarball without LICENSE fails", async () => {
    expect(await tarballProblems(await tarball("no-license", { license: false }))).toContain(
      "the tarball has no LICENSE",
    );
  }, 30_000);

  test("a base package that imports the pointer adapter fails", async () => {
    const problems = await tarballProblems(
      await tarball("base-with-adapter", {
        name: "@moltenship/calendar-core",
        manifest: { dependencies: { "@moltenship/calendar-dnd": "1.0.0" } },
        files: {
          "dist/index.mjs": 'export { attachCalendarPointer } from "@moltenship/calendar-dnd";\n',
          "dist/index.d.mts": 'export { attachCalendarPointer } from "@moltenship/calendar-dnd";\n',
        },
      }),
    );

    expect(problems).toContain("depends on the optional adapter @moltenship/calendar-dnd");
    expect(problems).toContain(
      "dist/index.mjs imports the optional adapter @moltenship/calendar-dnd",
    );
  }, 30_000);

  test.each([
    ["React", "@moltenship/calendar-react"],
    ["Solid", "@moltenship/calendar-solid"],
  ])(
    "the %s integration may bind the pointer adapter, and no other optional adapter",
    async (_, name) => {
      const problems = await tarballProblems(
        await tarball(`integration-${name.split("-").at(-1)}`, {
          name,
          manifest: {
            dependencies: {
              "@moltenship/calendar-dnd": "1.0.0",
              "@moltenship/calendar-dnd-kit": "1.0.0",
            },
          },
          files: {
            "dist/index.mjs":
              'import { attachCalendarPointer } from "@moltenship/calendar-dnd";\nexport const attach = attachCalendarPointer;\n',
            "dist/index.d.mts": "export declare const attach: unknown;\n",
          },
        }),
      );

      expect(problems.filter((problem) => problem.includes("adapter"))).toEqual([
        "depends on the optional adapter @moltenship/calendar-dnd-kit",
      ]);
    },
    30_000,
  );

  test("the facade may re-export the pointer adapter", async () => {
    const problems = await tarballProblems(
      await tarball("facade", {
        name: "@moltenship/calendar",
        manifest: { dependencies: { "@moltenship/calendar-dnd": "1.0.0" } },
        files: {
          "dist/index.mjs": 'export { attachCalendarPointer } from "@moltenship/calendar-dnd";\n',
          "dist/index.d.mts": 'export { attachCalendarPointer } from "@moltenship/calendar-dnd";\n',
        },
      }),
    );

    expect(problems.filter((problem) => problem.includes("adapter"))).toEqual([]);
  }, 30_000);

  test("the facade ships its docs and its skill", async () => {
    const shipped = {
      "docs/llms.txt": "# Moltenship Time\n",
      "docs/index.md": "# Introduction\n",
      "skills/moltenship-time/SKILL.md": "---\nname: moltenship-time\n---\n",
    };
    const manifest = { files: ["dist", "docs", "skills"] };

    expect(
      await tarballProblems(
        await tarball("facade-with-docs", {
          name: "@moltenship/calendar",
          files: shipped,
          manifest,
        }),
      ),
    ).toEqual([]);
    expect(
      await tarballProblems(
        await tarball("facade-without-docs", { name: "@moltenship/calendar", manifest }),
      ),
    ).toEqual([
      "the tarball has no docs/llms.txt",
      "the tarball has no docs/index.md",
      "the tarball has no skills/moltenship-time/SKILL.md",
    ]);
  }, 30_000);

  test("a stable version's Markdown installs no @next, and a pre-release's may", async () => {
    const files = {
      "README.md": "# Example\n\n```bash\npnpm add @moltenship/example@next\n```\n",
      "docs/installation.md": "Time 2.0 is a pre-release on npm's `next` tag.\n",
      "skills/time/SKILL.md": "pnpm add @moltenship/example\n",
    };
    const packed = { files: ["dist", "docs", "skills"] };

    expect(
      await tarballProblems(
        await tarball("tagged-stable", { files, manifest: { ...packed, version: "2.0.0" } }),
      ),
    ).toEqual([
      "2.0.0 is a stable version, but these lines install @next or call it a pre-release: README.md:4",
      "2.0.0 is a stable version, but these lines install @next or call it a pre-release: docs/installation.md:1",
    ]);
    expect(
      await tarballProblems(
        await tarball("tagged-beta", { files, manifest: { ...packed, version: "2.0.0-beta.2" } }),
      ),
    ).toEqual([]);
  }, 30_000);

  test("another package needs no docs or skill", async () => {
    expect(
      await tarballProblems(await tarball("no-docs", { name: "@moltenship/calendar-core" })),
    ).toEqual([]);
  }, 30_000);
});
