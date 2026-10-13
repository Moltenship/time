import { describe, expect, test } from "vite-plus/test";

import { servedPackageProblems } from "../src/lockfile";

const served = new Map([
  ["@moltenship/calendar", "sha512-a"],
  ["@moltenship/calendar-core", "sha512-b"],
]);

function lockfile(packages: Record<string, string>): string {
  const entries = Object.entries(packages)
    .map(([key, integrity]) => `  '${key}':\n    resolution: {integrity: ${integrity}}\n`)
    .join("\n");
  return `lockfileVersion: '9.0'\n\npackages:\n\n${entries}`;
}

describe("the install test's lockfile check", () => {
  test("packages with the served tarballs' hashes pass", () => {
    const installed = lockfile({
      "@moltenship/calendar@1.0.0": "sha512-a",
      "@moltenship/calendar-core@1.0.0": "sha512-b",
      "react@19.3.0": "sha512-react",
    });

    expect(servedPackageProblems(installed, served, ["@moltenship/calendar"])).toEqual([]);
  });

  test("a package from elsewhere, such as npm, or none at all fails", () => {
    const installed = lockfile({
      "@moltenship/calendar-core@1.0.0": "sha512-npm",
      "@moltenship/ics@1.0.0": "sha512-c",
    });

    expect(servedPackageProblems(installed, served, ["@moltenship/calendar"])).toEqual([
      "@moltenship/calendar-core@1.0.0 is installed with sha512-npm, not the served tarball's",
      "@moltenship/ics@1.0.0 is installed, but the local registry has no @moltenship/ics",
      "pnpm-lock.yaml has no @moltenship/calendar",
    ]);
  });

  test("reads a lockfile with the package manager's own lockfile as a first document", () => {
    const installed = `---\nlockfileVersion: '9.0'\n\npackages:\n\n  pnpm@12.10.1:\n    resolution: {integrity: sha512-pnpm}\n\n---\n${lockfile({ "@moltenship/calendar@1.0.0": "sha512-a" })}`;

    expect(servedPackageProblems(installed, served, ["@moltenship/calendar"])).toEqual([]);
  });
});
