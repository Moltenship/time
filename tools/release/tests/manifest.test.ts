import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { changedArtifacts, readCheckedManifest, type ReleaseManifest } from "../src/manifest";
import { integrityOf } from "../src/pack";
import { gitState } from "../src/workspace";

let root: string;
let directories: { tarballs: string; registry: string };

/** A dry run's output in a temporary folder: one tarball, one registry file and the manifest. */
async function dryRun(commit?: string): Promise<{ path: string; manifest: ReleaseManifest }> {
  await writeFile(join(directories.tarballs, "moltenship-ics-1.0.0.tgz"), "tarball");
  await writeFile(join(directories.registry, "calendar.json"), "{}");
  const manifest: ReleaseManifest = {
    status: "passed",
    version: "1.0.0",
    commit: commit ?? (await gitState()).head,
    clean: true,
    createdAt: "2026-10-13T00:00:00.000Z",
    checks: [],
    packages: [
      {
        name: "@moltenship/ics",
        file: "moltenship-ics-1.0.0.tgz",
        integrity: await integrityOf(join(directories.tarballs, "moltenship-ics-1.0.0.tgz")),
      },
    ],
    registry: [
      {
        file: "calendar.json",
        integrity: await integrityOf(join(directories.registry, "calendar.json")),
      },
    ],
  };
  const path = join(root, "manifest.json");
  await writeFile(path, JSON.stringify(manifest));
  return { path, manifest };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "release-manifest-"));
  directories = { tarballs: join(root, "tarballs"), registry: join(root, "registry") };
  await mkdir(directories.tarballs);
  await mkdir(directories.registry);
});

afterEach(() => rm(root, { force: true, recursive: true }));

describe("the dry run's artifacts, as consumers read them", () => {
  test("a dry run of HEAD whose files are unchanged passes", async () => {
    const { path, manifest } = await dryRun();

    await expect(readCheckedManifest({ path, directories })).resolves.toEqual(manifest);
  });

  test("no manifest, or one from another commit, fails", async () => {
    await expect(
      readCheckedManifest({ path: join(root, "missing.json"), directories }),
    ).rejects.toThrow("No dry-run manifest. Run vp run release:dry-run first.");

    const { path } = await dryRun("0".repeat(40));
    await expect(readCheckedManifest({ path, directories })).rejects.toThrow(
      `The dry run checked commit ${"0".repeat(40)}, but HEAD is`,
    );
  });

  test("a tarball or registry file that changed or went missing fails", async () => {
    const { path, manifest } = await dryRun();
    await writeFile(join(directories.tarballs, "moltenship-ics-1.0.0.tgz"), "repacked");
    await rm(join(directories.registry, "calendar.json"));

    expect(await changedArtifacts(manifest, directories)).toEqual([
      "tarballs/moltenship-ics-1.0.0.tgz",
      "registry/calendar.json",
    ]);
    await expect(readCheckedManifest({ path, directories })).rejects.toThrow(
      "Changed after the dry run: tarballs/moltenship-ics-1.0.0.tgz, registry/calendar.json. Run it again.",
    );
  });
});
