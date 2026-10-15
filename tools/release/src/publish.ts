import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { npmRegistry as registry } from "./config";
import { distTag, manifestPath, publishProblems, readManifest, tarballIntegrity } from "./manifest";
import { tarballDirectory } from "./pack";
import { gitState, isOnMain, readPublishedPackages, run, runOrThrow } from "./workspace";

/**
 * One staged version, as `pnpm stage list --json` prints the registry's listing. Every field is
 * optional: the registry doesn't pin its schema.
 */
export interface StagedVersion {
  readonly id?: string;
  readonly packageName?: string;
  readonly version?: string;
  readonly tag?: string;
  /** The tarball's SHA-1, in hex. */
  readonly shasum?: string;
}

/** What to do with a package npm doesn't serve yet. */
export type StagePlan =
  | { readonly action: "stage" }
  /** Staged already, with this tarball and tag: approve it. */
  | { readonly action: "approve"; readonly id: string }
  /** Staged already, with another tarball or tag, or one the listing doesn't describe. */
  | { readonly action: "conflict"; readonly ids: readonly string[] };

/**
 * Whether to stage a package, approve the version a run before staged, or stop. A staged
 * version's tarball and tag can't change, so one with another tarball or tag must be rejected
 * first, and one the listing doesn't fully describe can't be trusted.
 */
export function planStage(
  staged: readonly StagedVersion[],
  wanted: {
    readonly name: string;
    readonly version: string;
    readonly shasum: string;
    readonly tag: string;
  },
): StagePlan {
  const same = staged.filter(
    ({ id, packageName, version }) =>
      id !== undefined && packageName === wanted.name && version === wanted.version,
  );
  const match = same.find(({ shasum, tag }) => shasum === wanted.shasum && tag === wanted.tag);
  if (match) return { action: "approve", id: match.id! };
  if (same.length > 0) return { action: "conflict", ids: same.map(({ id }) => id!) };
  return { action: "stage" };
}

/** The stage id `pnpm stage publish --json` printed for one tarball, with its integrity. */
export function stagedFromSummary(
  stdout: string,
  name: string,
): { readonly stageId: string; readonly integrity?: string } {
  let summaries: Record<string, { stageId?: unknown; integrity?: unknown }>;
  try {
    summaries = JSON.parse(stdout) as typeof summaries;
  } catch {
    throw new Error(`pnpm stage publish didn't print JSON for ${name}:\n${stdout.trim()}`);
  }
  const summary = summaries[name];
  if (typeof summary?.stageId !== "string" || summary.stageId === "") {
    throw new Error(`pnpm stage publish printed no stage id for ${name}:\n${stdout.trim()}`);
  }
  return {
    stageId: summary.stageId,
    integrity: typeof summary.integrity === "string" ? summary.integrity : undefined,
  };
}

/**
 * The integrity npm records for this version, or undefined when npm doesn't have it. Throws when
 * the registry can't say.
 */
async function publishedIntegrity(
  name: string,
  version: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const result = await run("vp", ["pm", "view", `${name}@${version}`, "dist.integrity", "--json"], {
    env,
  });
  if (result.code === 0) {
    const integrity = result.stdout.trim() ? (JSON.parse(result.stdout) as unknown) : undefined;
    return typeof integrity === "string" ? integrity : undefined;
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (/ERR_PNPM_PACKAGE_NOT_FOUND|ERR_PNPM_FETCH_404|E404/.test(output)) return undefined;
  throw new Error(`Can't tell whether ${name}@${version} is on npm:\n${output.trim()}`);
}

async function shasumOf(path: string): Promise<string> {
  return createHash("sha1")
    .update(await readFile(path))
    .digest("hex");
}

/** Whether npm's 2FA can ask in this terminal: pnpm needs both ends to be one. */
export const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function confirm(question: string, expected: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim() === expected;
  } finally {
    prompt.close();
  }
}

/**
 * Runs `action` with an environment that always reaches the public registry, whatever a local
 * .npmrc says. pnpm reads pnpm_config_*; npm_config_* covers anything that shells out to npm. With
 * NODE_AUTH_TOKEN set, a throwaway npmrc reads the token from the environment, so it is never
 * written to disk.
 */
export async function withRegistry<T>(action: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_registry: registry,
    pnpm_config_registry: registry,
  };
  const configDirectory = process.env.NODE_AUTH_TOKEN
    ? await mkdtemp(join(tmpdir(), "moltenship-npmrc-"))
    : undefined;
  if (configDirectory) {
    const userconfig = join(configDirectory, ".npmrc");
    await writeFile(
      userconfig,
      `registry=${registry}\n//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\n`,
    );
    env.npm_config_userconfig = userconfig;
  }
  try {
    // A scoped line such as `@moltenship:registry=…` in an npmrc beats the default registry, so
    // check both.
    for (const key of ["registry", "@moltenship:registry"]) {
      const configured = (
        await runOrThrow("vp", ["pm", "config", "get", key], { env })
      ).stdout.trim();
      if (key !== "registry" && (configured === "" || configured === "undefined")) continue;
      if (configured.replace(/\/?$/, "/") !== registry) {
        throw new Error(`pnpm's ${key} is ${configured}, not ${registry}. Nothing was published.`);
      }
    }
    return await action(env);
  } finally {
    if (configDirectory) await rm(configDirectory, { force: true, recursive: true });
  }
}

/** The npm user pnpm publishes as, or undefined when it isn't logged in. */
export function npmUser(): Promise<string | undefined> {
  return withRegistry(async (env) => {
    const result = await run("vp", ["exec", "pnpm", "whoami", "--registry", registry], { env });
    return result.code === 0 ? result.stdout.trim() || undefined : undefined;
  });
}

const pnpm = (args: readonly string[]) => ["exec", "pnpm", ...args, "--registry", registry];

/**
 * Publishes the tarballs a passing gate checked, and nothing else, through npm's staged
 * publishing: each tarball is staged, which needs no 2FA, then one `pnpm stage approve` publishes
 * them all with a single 2FA, in dependency order. A staged version can't be installed until it's
 * approved, so a failure before the approval exposes nothing. Safe to run again: versions npm
 * serves are skipped, and a version a run before staged with the same tarball is approved, not
 * staged twice.
 *
 * It refuses unless the dry-run manifest matches HEAD, the version and every tarball, on a clean
 * tree on main or right on top of it. With `dryRun`, it checks all of that and npm's state, stages
 * nothing, and returns what a real run would refuse instead of throwing.
 */
export async function publish(options: {
  readonly version: string;
  readonly tag?: string;
  readonly yes: boolean;
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

  return withRegistry(async (env) => {
    // Look at all nine before publishing any. A version npm serves is skipped, but only if it is
    // the tarball the gate checked; otherwise npm would mix two builds.
    const pending: (typeof manifest.packages)[number][] = [];
    for (const entry of manifest.packages) {
      const current = await publishedIntegrity(entry.name, version, env);
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

    const listed = await run("vp", pnpm(["stage", "list", "--json"]), { env });
    if (listed.code !== 0) {
      const output = `${listed.stdout}\n${listed.stderr}`.trim();
      const reason = `Can't list npm's staged versions. Log in with \`npm login\`.\n${output}`;
      if (!options.dryRun) throw new Error(reason);
      return [...problems, reason];
    }
    const staged = JSON.parse(listed.stdout) as StagedVersion[];
    const plans = await Promise.all(
      pending.map(async (entry) => {
        const tarball = join(tarballDirectory, entry.file);
        const wanted = { name: entry.name, version, shasum: await shasumOf(tarball), tag };
        return { ...entry, tarball, plan: planStage(staged, wanted) };
      }),
    );
    const conflicts = plans.flatMap(({ name, plan }) =>
      plan.action === "conflict" ? plan.ids.map((id) => `${name}: vp pm stage reject ${id}`) : [],
    );
    if (conflicts.length > 0) {
      throw new Error(
        `npm has ${version} staged with another tarball or tag, or one its listing doesn't describe. Reject each, then run again. Nothing was published.\n- ${conflicts.join("\n- ")}`,
      );
    }

    const toStage = plans.filter(({ plan }) => plan.action === "stage");
    const summary = `${pending.length} packages at ${version} with the "${tag}" tag`;
    log(`Ready to publish ${summary}:`);
    for (const { file, plan } of plans) {
      log(`  ${file}${plan.action === "approve" ? `, staged already (${plan.id})` : ""}`);
    }
    if (options.dryRun) {
      log(`A release would stage ${toStage.length} and approve ${pending.length} with one 2FA.`);
      return problems;
    }
    if (!interactive() && !process.env.PNPM_CONFIG_OTP) {
      throw new Error(
        "Approving needs npm's 2FA, and pnpm asks for it only in a terminal. Run this in a terminal, or under `script -q /dev/null`, as /release does. Nothing was published.",
      );
    }
    if (!options.yes && !(await confirm(`Type ${version} to publish: `, version))) {
      throw new Error(
        "Not confirmed. Nothing was published. (Pass --yes when there is no terminal.)",
      );
    }

    const ids: string[] = [];
    for (const { name, tarball, integrity, plan } of plans) {
      if (plan.action === "approve") {
        ids.push(plan.id);
        continue;
      }
      const { stdout } = await runOrThrow(
        "vp",
        pnpm([
          "stage",
          "publish",
          tarball,
          "--tag",
          tag,
          "--access",
          "public",
          "--no-git-checks",
          "--json",
        ]),
        { env },
      );
      const result = stagedFromSummary(stdout, name);
      if (result.integrity !== undefined && result.integrity !== integrity) {
        throw new Error(
          `pnpm staged ${name} as ${result.integrity}, not the tarball the gate checked (${integrity}). Reject stage ${result.stageId} before anything else.`,
        );
      }
      log(`Staged ${name}@${version} as ${result.stageId}.`);
      ids.push(result.stageId);
    }

    log(`\nApproving ${ids.length} staged packages: npm asks for 2FA once.`);
    await runOrThrow("vp", pnpm(["stage", "approve", ...ids, "--yes"]), { env, inherit: true });
    log(`Published ${summary}.`);
    return problems;
  });
}
