import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vite-plus/test";

import { publishedPackages } from "../tools/release/src/config";

const execFileAsync = promisify(execFile);

// Directories under packages/ that publish to npm. calendar-testing stays private until after 1.0 (#45).
const publishedPackageDirectories = publishedPackages.map(({ directory }) => directory);

interface PackageManifest {
  readonly bugs?: { readonly url?: string };
  readonly homepage?: string;
  readonly license?: string;
  readonly name: string;
  readonly private?: boolean;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly repository?: {
    readonly directory?: string;
    readonly type?: string;
    readonly url?: string;
  };
}

async function readManifest(directory: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(join("packages", directory, "package.json"), "utf8"));
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

// Other test files rebuild some packages with `vp pack`, which empties `dist` while it runs. pnpm
// checks every listed file even in a dry run, so a pack that lands in that window fails; try again.
async function packedFiles(directory: string, attempts = 3): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("vp", ["pm", "pack", "--", "--dry-run", "--json"], {
      cwd: join(process.cwd(), "packages", directory),
    });
    const { files } = JSON.parse(stdout) as { readonly files: readonly { path: string }[] };
    return files.map(({ path }) => path);
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return packedFiles(directory, attempts - 1);
  }
}

describe("published package metadata", () => {
  test("the root LICENSE is MIT", async () => {
    const license = await readFile("LICENSE", "utf8");

    expect(license.startsWith("MIT License\n")).toBe(true);
    expect(license).toMatch(/^Copyright \(c\) \d{4} \S.*$/m);
  });

  test("only the published packages are public", async () => {
    // A folder left behind by another branch has only ignored files, such as dist or node_modules.
    const directories = [];
    for (const entry of await readdir("packages", { withFileTypes: true })) {
      if (entry.isDirectory() && (await exists(join("packages", entry.name, "package.json")))) {
        directories.push(entry.name);
      }
    }

    for (const directory of directories) {
      const manifest = await readManifest(directory);
      const published = publishedPackageDirectories.includes(directory);

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
      expect(manifest.bugs).toEqual({ url: "https://github.com/Moltenship/time/issues" });
      // `pnpm publish` in the package folder fails, so nothing skips the release dry run.
      expect(manifest.scripts?.prepublishOnly).toMatch(/release:publish.*&& exit 1$/);

      // The homepage is a docs page that exists in the showcase.
      const page = /^https:\/\/moltenship-time\.vercel\.app\/docs(?:\/(.+))?$/.exec(
        manifest.homepage ?? "",
      );
      expect(page, manifest.homepage).not.toBeNull();
      const content = join("apps/showcase/content/docs", page![1] ?? "index");
      expect(
        (await exists(`${content}.mdx`)) || (await exists(join(content, "index.mdx"))),
        manifest.homepage,
      ).toBe(true);
    },
  );

  // pnpm adds the workspace root LICENSE to a tarball when no packed file's path contains "license"
  // or "licence", in any case.
  test("every published tarball contains LICENSE", async () => {
    const tarballs = await Promise.all(
      publishedPackageDirectories.map(
        async (directory) => [directory, await packedFiles(directory)] as const,
      ),
    );

    for (const [directory, files] of tarballs) {
      expect(files, directory).toContain("LICENSE");
    }
  }, 30_000);
});
