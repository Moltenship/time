import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gte } from "semver";

import { npmRegistry as registry } from "./config";
import { distTag, manifestPath, publishProblems, readManifest, tarballIntegrity } from "./manifest";
import { tarballDirectory } from "./pack";
import { fetchPackument } from "./published";
import { gitState, isOnMain, readPublishedPackages, runOrThrow } from "./workspace";

/** The first npm that publishes through trusted publishing (docs.npmjs.com/trusted-publishers). */
export const trustedPublishingNpm = "11.5.1";

/**
 * Publishes the tarballs the release gate checked, and nothing else, with npm trusted publishing:
 * npm trades the job's OIDC token for a short-lived publish token and signs provenance, so there
 * is no npm token anywhere. The release workflow's publish job runs it, after the gate.
 *
 * It refuses unless the dry-run manifest matches HEAD, the version and every tarball, on a clean
 * tree on main or right on top of it. Safe to run again: a version npm serves is skipped when it's
 * the tarball the gate checked, and stops the run when it isn't, so the nine on npm never mix two
 * builds. With `dryRun`, it checks all of that and npm's state, publishes nothing, and returns what
 * a release would refuse instead of throwing.
 */
export async function publish(options: {
  readonly version: string;
  readonly tag?: string;
  readonly dryRun?: boolean;
  readonly manifestFile?: string;
  readonly log?: (line: string) => void;
}): Promise<readonly string[]> {
  const { version, log = console.log } = options;
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  const git = await gitState();
  const packages = await readPublishedPackages();
  const problems = publishProblems({
    manifest,
    version,
    head: git.head,
    clean: git.clean,
    onMain: (await isOnMain(git.head)) || (await isOnMain(`${git.head}^`)),
    expectedPackages: packages.map(({ manifest: { name } }) => name),
    tarballIntegrity: await tarballIntegrity(manifest),
  });
  if (!manifest || (problems.length > 0 && !options.dryRun)) {
    throw new Error(`Refusing to publish:\n- ${problems.join("\n- ")}`);
  }
  const tag = distTag(version, options.tag);

  // npm runs outside the workspace, whose devEngines pins pnpm, and reads an empty npmrc: no
  // token, no project or user config, and the public registry.
  const cwd = await mkdtemp(join(tmpdir(), "moltenship-publish-"));
  const userconfig = join(cwd, ".npmrc");
  await writeFile(userconfig, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_registry: registry,
    npm_config_userconfig: userconfig,
  };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  try {
    const npm = (await runOrThrow("npm", ["--version"], { cwd, env })).stdout.trim();
    if (!gte(npm, trustedPublishingNpm)) {
      throw new Error(
        `npm ${npm} can't publish through trusted publishing; it needs ${trustedPublishingNpm}.`,
      );
    }

    // Look at all nine before publishing any.
    const pending: (typeof manifest.packages)[number][] = [];
    for (const entry of manifest.packages) {
      const current = (await fetchPackument(entry.name))?.versions?.[version]?.dist?.integrity;
      if (current === undefined) pending.push(entry);
      else if (current !== entry.integrity) {
        throw new Error(
          `${entry.name}@${version} is already on npm with different contents (${current}). Release a new version instead. Nothing was published.`,
        );
      } else log(`${entry.name}@${version} is on npm already; skipping it.`);
    }
    if (pending.length === 0) {
      log(`npm serves all ${manifest.packages.length} packages at ${version} already.`);
      return problems;
    }

    const summary = `${pending.length} packages at ${version} with the "${tag}" tag`;
    log(`Ready to publish ${summary}, through trusted publishing, with provenance:`);
    for (const { file } of pending) log(`  ${file}`);
    if (options.dryRun) {
      log(`A release would publish them now, with npm ${npm}.`);
      return problems;
    }
    for (const { name, file } of pending) {
      await runOrThrow(
        "npm",
        [
          "publish",
          join(tarballDirectory, file),
          "--access",
          "public",
          "--tag",
          tag,
          "--provenance",
          "--registry",
          registry,
        ],
        { cwd, env, inherit: true },
      );
      log(`Published ${name}@${version}.`);
    }
    log(`Published ${summary}.`);
    return problems;
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}
