import { describe, expect, test } from "vite-plus/test";

import { assertVersion, changelogSection, releaseChangelog, sharedVersion } from "../src/version";
import type { WorkspacePackage } from "../src/workspace";

const changelog = `# Changelog

Intro.

## Unreleased

- A new thing.
- A fix.

## 0.9.0 (2026-01-01)

- Older notes.
`;

function at(name: string, version: string): WorkspacePackage {
  return { directory: name, budgets: {}, path: `/packages/${name}`, manifest: { name, version } };
}

describe("versions and changelog", () => {
  test("release moves the Unreleased notes under the version and opens a new section", () => {
    const released = releaseChangelog(changelog, "1.0.0-rc.1", "2026-10-12");

    expect(released).toContain("## Unreleased\n\n## 1.0.0-rc.1 (2026-10-12)\n\n- A new thing.");
    expect(changelogSection(released, "Unreleased")).toBe("");
    expect(changelogSection(released, "1.0.0-rc.1")).toBe("- A new thing.\n- A fix.");
    expect(changelogSection(released, "1.0.0")).toBeUndefined();
    expect(changelogSection(released, "0.9.0")).toBe("- Older notes.");
  });

  test("release refuses empty notes and versions it already has", () => {
    const empty = releaseChangelog(changelog, "1.0.0", "2026-10-12");

    expect(() => releaseChangelog(empty, "1.0.1", "2026-10-13")).toThrow("nothing under");
    expect(() => releaseChangelog(changelog, "0.9.0", "2026-10-12")).toThrow(
      "already has a section",
    );
    expect(() => releaseChangelog("# Changelog\n", "1.0.0", "2026-10-12")).toThrow(
      'no "## Unreleased"',
    );
  });

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
});
