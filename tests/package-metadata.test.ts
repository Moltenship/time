import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);

// Directories under packages/ that publish to npm. calendar-testing stays private until after 1.0 (#45).
const publishedPackageDirectories = [
  "calendar",
  "calendar-core",
  "calendar-dnd",
  "calendar-react",
  "calendar-recurrence",
  "calendar-temporal",
  "ics",
] as const;

interface PackageManifest {
  readonly bugs?: { readonly url?: string };
  readonly homepage?: string;
  readonly license?: string;
  readonly name: string;
  readonly private?: boolean;
  readonly repository?: {
    readonly directory?: string;
    readonly type?: string;
    readonly url?: string;
  };
}

async function readManifest(directory: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(join("packages", directory, "package.json"), "utf8"));
}

describe("published package metadata", () => {
  test("the root LICENSE is MIT", async () => {
    const license = await readFile("LICENSE", "utf8");

    expect(license.startsWith("MIT License\n")).toBe(true);
    expect(license).toMatch(/^Copyright \(c\) \d{4} \S.*$/m);
  });

  test("only the published packages are public", async () => {
    const directories = (await readdir("packages", { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const directory of directories) {
      const manifest = await readManifest(directory);
      const published = (publishedPackageDirectories as readonly string[]).includes(directory);

      expect(manifest.private === true, manifest.name).toBe(!published);
    }
  });

  test.each(publishedPackageDirectories)(
    "%s links its license, source, docs and issues",
    async (directory) => {
      const manifest = await readManifest(directory);

      expect(manifest.license).toBe("MIT");
      expect(manifest.repository).toEqual({
        type: "git",
        url: "git+https://github.com/Moltenship/time.git",
        directory: `packages/${directory}`,
      });
      expect(manifest.homepage).toMatch(/^https:\/\/moltenship-time\.vercel\.app\/docs(\/|$)/);
      expect(manifest.bugs).toEqual({ url: "https://github.com/Moltenship/time/issues" });
    },
  );

  // pnpm adds the workspace root LICENSE to a tarball when the package has none of its own.
  test("every published tarball contains LICENSE", async () => {
    const tarballs = await Promise.all(
      publishedPackageDirectories.map(async (directory) => {
        const { stdout } = await execFileAsync("vp", ["pm", "pack", "--", "--dry-run", "--json"], {
          cwd: join(process.cwd(), "packages", directory),
        });
        const { files } = JSON.parse(stdout) as { readonly files: readonly { path: string }[] };

        return [directory, files.map(({ path }) => path)] as const;
      }),
    );

    for (const [directory, files] of tarballs) {
      expect(files, directory).toContain("LICENSE");
    }
  }, 30_000);
});
