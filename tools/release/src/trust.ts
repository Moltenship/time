import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { gte } from "semver";

import { npmRegistry as registry } from "./config";
import { pinnedNpm } from "./npm";
import { parseArguments, readPublishedPackages, run, runMain, runOrThrow } from "./workspace";

/** The trusted publisher every package gets: this repository's release workflow, no environment. */
export const trustedPublisher = { repository: "Moltenship/time", workflow: "release.yml" } as const;

/** `npm trust` came in npm 11.15. The pinned npm (`npm.ts`) is later. */
const npmTrust = "11.15.0";

/** Whether `npm trust list --json` already shows this repository's release workflow. */
export function trustsRelease(listed: string): boolean {
  return listed.includes(trustedPublisher.repository) && listed.includes(trustedPublisher.workflow);
}

/**
 * Whether the trusted publisher `npm trust list --json` shows lets the workflow move dist-tags:
 * "Allow npm dist-tag" on npmjs.com, `manageDistTags` among its permissions, as npm's API docs
 * name it (api-docs.npmjs.com, Trust). Undefined when the
 * output lists no permissions, as from an npm that doesn't print them.
 */
export function allowsDistTag(listed: string): boolean | undefined {
  if (/"manageDistTags"/u.test(listed)) return true;
  return /"permissions"/u.test(listed) ? false : undefined;
}

/** The permissions npm trust list --json printed, as they came, so a misread name shows. */
function permissionsOf(listed: string): string {
  return listed.match(/"permissions"\s*:\s*\[[^\]]*\]/u)?.[0].replace(/\s+/gu, " ") ?? "none";
}

/** What the owner reads about the dist-tag setting, given the packages without it. */
export function distTagReport(
  missing: readonly string[],
  unknown: readonly string[],
): readonly string[] {
  const lines: string[] = [];
  if (missing.length > 0) {
    lines.push(
      `"Allow npm dist-tag" is off on ${missing.join(", ")}. npm trust can't turn it on: on npmjs.com, each package's Settings → Trusted publishing → the GitHub Actions configuration → "Allow npm dist-tag". Until then a stable release leaves moving next on them to you, with the command to run.`,
    );
  }
  if (unknown.length > 0) {
    lines.push(
      `npm didn't say whether ${unknown.join(", ")} allow npm dist-tag; look on npmjs.com.`,
    );
  }
  return lines;
}

/**
 * The owner's one-time setup (docs/internal/releasing.md): a trusted publisher for the release
 * workflow on each of the eleven packages, through `npm trust github`, so the workflow publishes
 * without a token. With `--disallow-tokens`, each package also requires 2FA and refuses tokens
 * (`npm access set mfa=publish`), which trusted publishing isn't subject to. Asks for npm's login
 * and 2FA: once, with the browser's "skip 2FA for 5 minutes". Safe to run again.
 */
async function setUp(options: { readonly disallowTokens: boolean; readonly dryRun: boolean }) {
  // Outside the workspace, whose devEngines pins pnpm, which npm refuses to run under.
  const cwd = await mkdtemp(join(tmpdir(), "moltenship-trust-"));
  const [node, ...cli] = pinnedNpm.command;
  const npmArgs = (args: readonly string[]) => [...cli, ...args, "--registry", registry];
  const npm = (args: readonly string[]) => runOrThrow(node, npmArgs(args), { cwd, inherit: true });
  try {
    if (!gte(pinnedNpm.version, npmTrust)) {
      throw new Error(`npm ${pinnedNpm.version} has no npm trust; it needs ${npmTrust}.`);
    }
    if ((await run(node, npmArgs(["whoami"]), { cwd })).code !== 0) {
      await npm(["login", "--auth-type", "web"]);
    }
    const names = (await readPublishedPackages()).map(({ manifest }) => manifest.name);
    const noDistTag: string[] = [];
    const unknownDistTag: string[] = [];
    for (const name of names) {
      const list = () => run(node, npmArgs(["trust", "list", name, "--json"]), { cwd });
      let listed = await list();
      if (listed.code !== 0) {
        // npm asks for 2FA only on a terminal: once more in it, then the captured call again.
        await run(node, npmArgs(["trust", "list", name]), { cwd, inherit: true });
        listed = await list();
      }
      if (listed.code !== 0) {
        const why = `${listed.stdout}\n${listed.stderr}`.trim();
        if (!options.dryRun) throw new Error(`npm trust list ${name} failed:\n${why}`);
        console.log(`Couldn't list ${name}'s trusted publisher: ${why}`);
        unknownDistTag.push(name);
        continue;
      }
      if (trustsRelease(listed.stdout)) {
        console.log(
          `${name} trusts ${trustedPublisher.repository}'s ${trustedPublisher.workflow} already.`,
        );
        const allows = allowsDistTag(listed.stdout);
        if (allows === false) {
          noDistTag.push(name);
          console.log(`  Its permissions: ${permissionsOf(listed.stdout)}.`);
        }
        if (allows === undefined) unknownDistTag.push(name);
        continue;
      }
      // A configuration npm trust adds publishes only.
      noDistTag.push(name);
      const args = [
        "trust",
        "github",
        name,
        "--file",
        trustedPublisher.workflow,
        "--repo",
        trustedPublisher.repository,
        "--allow-publish",
        "--yes",
      ];
      // npm trust doesn't promise to honor --dry-run, so a dry run only says what it would run.
      if (options.dryRun) {
        console.log(`Would run: npm ${args.join(" ")}`);
        continue;
      }
      const added = await run(node, npmArgs(args), { cwd, inherit: true });
      if (added.code !== 0) {
        throw new Error(
          `npm trust github failed for ${name}. If it has another trusted publisher, npm allows one: list it (npm trust list ${name}), revoke it (npm trust revoke ${name} --id <id>), and run this again.`,
        );
      }
      // npm's docs pace a loop of npm trust calls at two seconds.
      await sleep(2_000);
    }
    if (options.disallowTokens) {
      for (const name of names) {
        if (options.dryRun) console.log(`Would run npm access set mfa=publish ${name}`);
        else await npm(["access", "set", "mfa=publish", name]);
      }
    }
    for (const line of distTagReport(noDistTag, unknownDistTag)) console.log(`\n${line}`);
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
