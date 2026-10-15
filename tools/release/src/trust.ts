import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { gte } from "semver";

import { npmRegistry as registry } from "./config";
import { parseArguments, readPublishedPackages, run, runMain, runOrThrow } from "./workspace";

/** The trusted publisher every package gets: this repository's release workflow, no environment. */
export const trustedPublisher = { repository: "Moltenship/time", workflow: "release.yml" } as const;

/** `npm trust` came in npm 11.15. */
const npmTrust = "11.15.0";

/** Whether `npm trust list --json` already shows this repository's release workflow. */
export function trustsRelease(listed: string): boolean {
  return listed.includes(trustedPublisher.repository) && listed.includes(trustedPublisher.workflow);
}

/**
 * The owner's one-time setup (docs/internal/releasing.md): a trusted publisher for the release
 * workflow on each of the nine packages, through `npm trust github`, so the workflow publishes
 * without a token. With `--disallow-tokens`, each package also requires 2FA and refuses tokens
 * (`npm access set mfa=publish`), which trusted publishing isn't subject to. Asks for npm's login
 * and 2FA: once, with the browser's "skip 2FA for 5 minutes". Safe to run again.
 */
async function setUp(options: { readonly disallowTokens: boolean; readonly dryRun: boolean }) {
  // Outside the workspace, whose devEngines pins pnpm, which npm refuses to run under.
  const cwd = await mkdtemp(join(tmpdir(), "moltenship-trust-"));
  const npm = (args: readonly string[]) =>
    runOrThrow("npm", [...args, "--registry", registry], { cwd, inherit: true });
  try {
    const version = (await runOrThrow("npm", ["--version"], { cwd })).stdout.trim();
    if (!gte(version, npmTrust)) {
      throw new Error(
        `npm ${version} has no npm trust; it needs ${npmTrust}: npm install -g npm@latest`,
      );
    }
    if ((await run("npm", ["whoami", "--registry", registry], { cwd })).code !== 0) {
      await npm(["login", "--auth-type", "web"]);
    }
    const names = (await readPublishedPackages()).map(({ manifest }) => manifest.name);
    for (const name of names) {
      const listed = await run("npm", ["trust", "list", name, "--json", "--registry", registry], {
        cwd,
      });
      if (trustsRelease(listed.stdout)) {
        console.log(
          `${name} trusts ${trustedPublisher.repository}'s ${trustedPublisher.workflow} already.`,
        );
        continue;
      }
      await npm([
        "trust",
        "github",
        name,
        "--file",
        trustedPublisher.workflow,
        "--repo",
        trustedPublisher.repository,
        "--allow-publish",
        "--yes",
        ...(options.dryRun ? ["--dry-run"] : []),
      ]);
      // npm's docs pace a loop of npm trust calls at two seconds.
      await sleep(2_000);
    }
    if (options.disallowTokens) {
      for (const name of names) {
        if (options.dryRun) console.log(`Would run npm access set mfa=publish ${name}`);
        else await npm(["access", "set", "mfa=publish", name]);
      }
    }
    console.log(
      `\nDone. npm drops a trusted publisher that hasn't published within 48 hours, so release within two days: vp run release.`,
    );
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

runMain(import.meta, async () => {
  const { flags } = parseArguments(process.argv.slice(2), ["disallow-tokens", "dry-run"]);
  await setUp({ disallowTokens: flags.has("disallow-tokens"), dryRun: flags.has("dry-run") });
});
