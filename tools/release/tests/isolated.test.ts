import { delimiter, join } from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

import {
  isolatedEnvironment,
  lacksMetadata,
  lockfileProblems,
  withTarballs,
  workspaceSettings,
} from "../src/isolated";

const tarballs = new Map([
  ["@moltenship/calendar", "/release/tarballs/moltenship-calendar-1.0.0.tgz"],
  ["@moltenship/calendar-core", "/release/tarballs/moltenship-calendar-core-1.0.0.tgz"],
]);

const packed = [
  { name: "@moltenship/calendar", file: "moltenship-calendar-1.0.0.tgz", integrity: "sha512-a" },
  {
    name: "@moltenship/calendar-core",
    file: "moltenship-calendar-core-1.0.0.tgz",
    integrity: "sha512-b",
  },
];

/** A lockfile as pnpm 12 writes it: the package manager's own lockfile first. */
function lockfile(packages: Record<string, string | undefined>): string {
  const entries = Object.entries(packages)
    .map(
      ([key, integrity]) =>
        `  '${key}':\n    resolution: {${integrity ? `integrity: ${integrity}, ` : ""}tarball: file:x.tgz}\n`,
    )
    .join("\n");
  return `---\nlockfileVersion: '9.0'\n\npackages:\n\n  pnpm@12.10.1:\n    resolution: {integrity: sha512-pnpm}\n\n---\nlockfileVersion: '9.0'\n\npackages:\n\n${entries}`;
}

describe("a copy on the dry run's tarballs", () => {
  test("swaps workspace dependencies for tarballs and keeps the rest", () => {
    expect(
      withTarballs(
        {
          name: "showcase",
          private: true,
          dependencies: { "@moltenship/calendar": "workspace:*", react: "catalog:" },
          devDependencies: { registry: "workspace:*", vite: "catalog:" },
        },
        tarballs,
        ["registry"],
      ),
    ).toEqual({
      name: "showcase",
      private: true,
      dependencies: {
        "@moltenship/calendar": "file:/release/tarballs/moltenship-calendar-1.0.0.tgz",
        react: "catalog:",
      },
      devDependencies: { vite: "catalog:" },
    });
  });

  test("a workspace dependency that doesn't publish and isn't dropped fails", () => {
    expect(() =>
      withTarballs({ name: "showcase", devDependencies: { registry: "workspace:*" } }, tarballs),
    ).toThrow("showcase depends on registry, a workspace package that doesn't publish");
  });

  test("keeps the workspace's pnpm settings and sends every @moltenship package to its tarball", () => {
    const settings = parse(
      workspaceSettings(
        'packages:\n  - apps/*\n  - packages/*\ncatalog:\n  react: 19.3.0\noverrides:\n  vite@*: "catalog:"\nallowBuilds:\n  esbuild: true\n',
        ["apps/ssr-fixture"],
        tarballs,
      ),
    ) as Record<string, unknown>;

    expect(settings).toEqual({
      packages: ["apps/ssr-fixture"],
      catalog: { react: "19.3.0" },
      overrides: {
        "vite@*": "catalog:",
        "@moltenship/calendar": "file:/release/tarballs/moltenship-calendar-1.0.0.tgz",
        "@moltenship/calendar-core": "file:/release/tarballs/moltenship-calendar-core-1.0.0.tgz",
      },
      allowBuilds: { esbuild: true },
    });
  });

  const workspaceLockfile = lockfile({
    "react@19.3.0": "sha512-react",
    "scheduler@0.28.0": "sha512-scheduler",
  });
  const expected = ["@moltenship/calendar"];

  test("a lockfile with the tarballs' hashes and the workspace's other packages passes", () => {
    const installed = lockfile({
      "@moltenship/calendar@file:../release/moltenship-calendar-1.0.0.tgz": "sha512-a",
      "@moltenship/calendar-core@file:../release/moltenship-calendar-core-1.0.0.tgz": "sha512-b",
      "react@19.3.0": "sha512-react",
    });

    expect(
      lockfileProblems({ lockfile: installed, packages: packed, expected, workspaceLockfile }),
    ).toEqual([]);
  });

  test("a package with another hash, one the dry run didn't pack, or one missing fails", () => {
    const installed = lockfile({
      "@moltenship/calendar-core@1.0.0": "sha512-npm",
      "@moltenship/calendar-extra@1.0.0": "sha512-c",
    });

    expect(
      lockfileProblems({ lockfile: installed, packages: packed, expected, workspaceLockfile }),
    ).toEqual([
      "@moltenship/calendar-core is installed with sha512-npm, not the dry run's sha512-b",
      "@moltenship/calendar-extra is installed, but the dry run didn't pack it",
      "@moltenship/calendar isn't installed from the dry run's tarball",
    ]);
  });

  test("a third-party package the workspace doesn't lock, or locks with another hash, fails", () => {
    const installed = lockfile({
      "@moltenship/calendar@file:../release/moltenship-calendar-1.0.0.tgz": "sha512-a",
      "react@19.4.0": "sha512-newer",
      "scheduler@0.28.0": "sha512-other",
    });

    expect(
      lockfileProblems({ lockfile: installed, packages: packed, expected, workspaceLockfile }),
    ).toEqual([
      "react@19.4.0 isn't in the workspace's lockfile",
      "scheduler@0.28.0 has another hash than the workspace's",
    ]);
  });

  test("commands find the copy's binaries first and never the workspace's", () => {
    const root = "/work/time";
    const environment = isolatedEnvironment(
      "/tmp/copy/apps/showcase",
      {
        PATH: [
          `${root}/node_modules/.bin`,
          `${root}/tools/release/node_modules/.bin`,
          "/usr/bin",
        ].join(delimiter),
        HOME: "/home/me",
      },
      root,
    );

    expect(environment.PATH).toBe(
      [join("/tmp/copy/apps/showcase", "node_modules", ".bin"), "/usr/bin"].join(delimiter),
    );
    expect(environment).toMatchObject({ HOME: "/home/me", NEXT_TELEMETRY_DISABLED: "1" });
  });
});

describe("an offline install that a cold cache can't do", () => {
  test("lacks a package's metadata, or the pinned pnpm's, and nothing else", () => {
    expect(lacksMetadata("ERR_PNPM_NO_OFFLINE_META  Failed to resolve react@19.3.0 offline")).toBe(
      true,
    );
    // From CI's release-gate job on a fresh runner, run 38359030353.
    expect(
      lacksMetadata(
        "Error: ERR_PNPM_BAD_CONFIG_DEP\n  × resolve package manager dependencies\n  ╰─▶ Failed to resolve config dependency pnpm@12.10.1: Failed to resolve\n      pnpm@12.10.1 in package mirror",
      ),
    ).toBe(true);
    // A cause pnpm frames with box-drawing characters, split across lines.
    expect(
      lacksMetadata(
        "ERR_PNPM_BAD_CONFIG_DEP\n  ├─▶ Failed to resolve pnpm@12.10.1 in package\n  │   mirror",
      ),
    ).toBe(true);
    expect(lacksMetadata("ERR_PNPM_BAD_CONFIG_DEP  a config dependency has no integrity")).toBe(
      false,
    );
    expect(lacksMetadata("ERR_PNPM_FETCH_404  Not Found")).toBe(false);
  });
});
