import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { gt } from "semver";

import { releaseDirectory } from "./config";
import { createGitHubRelease, releaseTag } from "./github-release";
import { manifestPath, readManifest } from "./manifest";
import { trustedPublishing, type Trust } from "./oidc";
import { publish } from "./publish";
import { fetchPackument, waitForPublished } from "./published";
import { assertVersion, releaseSubject, setVersion, sharedVersion } from "./version";
import {
  isOnMain,
  parseArguments,
  readPublishedPackages,
  run,
  runMain,
  runOrThrow,
  workspaceRoot,
} from "./workspace";

/**
 * The release workflow's steps (.github/workflows/release.yml), one subcommand each:
 *
 * - `check`: the version, the tag, npm, and npm's trusted publisher on each package, before
 *   anything else runs;
 * - `prepare`: bumps the nine manifests, commits and tags, inside the runner;
 * - `package`, after the gate: the release notes and a git bundle of the release commit, for the
 *   jobs after it;
 * - `publish`: the tarballs the gate checked, with npm trusted publishing;
 * - `finish`: waits for npm to serve them, pushes main and the tag, writes the GitHub release.
 *
 * Each reads VERSION and DRY_RUN from the environment. A dry run does everything but publish,
 * push and write the release, and reports what a release would stop at instead of stopping.
 */

const releaseFile = (name: string) => join(workspaceRoot, releaseDirectory, name);
const bundlePath = releaseFile("release.bundle");
const notesPath = releaseFile("notes.md");

/** The release commit's author and committer: GitHub Actions' bot. */
const bot = [
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
];

const revParse = async (ref: string) => (await runOrThrow("git", ["rev-parse", ref])).stdout.trim();

const isAncestor = async (commit: string, of: string) =>
  (await run("git", ["merge-base", "--is-ancestor", commit, of])).code === 0;

/** A line in the run's summary, and a warning on the run, as GitHub Actions shows them. */
async function annotate(message: string): Promise<void> {
  console.log(`::warning::${message.replaceAll("\n", "%0A")}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
  }
}

/** What a dry run reports and a release stops on. */
async function report(problems: readonly string[], dryRun: boolean): Promise<void> {
  if (problems.length === 0) return;
  if (!dryRun) throw new Error(`Not releasing:\n- ${problems.join("\n- ")}`);
  for (const problem of problems) await annotate(`A release would stop here: ${problem}`);
}

export interface CheckFacts {
  readonly version: string;
  /** The version the manifests share. */
  readonly current: string;
  /** The ref the run is on, such as `refs/heads/main`. */
  readonly ref: string;
  /** The commit `v<version>` names on GitHub, or undefined without one. */
  readonly remoteTag?: string;
  /** The packages npm serves at the version already. */
  readonly served: readonly string[];
  readonly trust: ReadonlyMap<string, Trust>;
}

/**
 * What stops a release before it starts. `blockers` stop a dry run too; `problems` stop a
 * release, and a dry run reports them.
 */
export function checkProblems(facts: CheckFacts): {
  readonly blockers: readonly string[];
  readonly problems: readonly string[];
} {
  const { version } = facts;
  const blockers: string[] = [];
  const problems: string[] = [];
  if (!gt(version, facts.current)) {
    blockers.push(`${version} must be above ${facts.current}, the version the packages have.`);
  }
  if (facts.ref !== "refs/heads/main") {
    problems.push(`A release runs from main, not ${facts.ref}.`);
  }
  if (facts.remoteTag !== undefined) {
    problems.push(
      `${releaseTag(version)} is on GitHub already, at ${facts.remoteTag.slice(0, 7)}. Pick a version above ${version}.`,
    );
  }
  if (facts.served.length > 0) {
    problems.push(
      `npm already has ${version} of ${facts.served.join(", ")}. If a release run published them and failed later, vp run release ${version} runs its failed jobs again; otherwise pick a version above ${version}.`,
    );
  }
  const untrusted = [...facts.trust].filter(([, trust]) => trust.verdict === "untrusted");
  if (untrusted.length > 0) {
    problems.push(
      `npm has no trusted publisher for this workflow on ${untrusted.map(([name]) => name).join(", ")} (${(untrusted[0]![1] as { detail: string }).detail}). Set them up once: vp run release:trust (docs/internal/releasing.md).`,
    );
  }
  for (const [name, trust] of facts.trust) {
    if (trust.verdict === "error") problems.push(`Can't ask npm about ${name}: ${trust.detail}`);
  }
  return { blockers, problems };
}

async function check(version: string, dryRun: boolean): Promise<void> {
  assertVersion(version);
  const packages = await readPublishedPackages();
  const names = packages.map(({ manifest }) => manifest.name);
  const tag = releaseTag(version);
  const listed = await runOrThrow("git", [
    "ls-remote",
    "origin",
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  const lines = listed.stdout.trim().split("\n").filter(Boolean);
  const remoteTag = (lines.find((line) => line.endsWith("^{}")) ?? lines[0])?.split("\t")[0];
  const served: string[] = [];
  for (const name of names) {
    if ((await fetchPackument(name))?.versions?.[version]) served.push(name);
  }
  const trust = await trustedPublishing(names);
  for (const [name, verdict] of trust) {
    console.log(
      `${name}: ${verdict.verdict === "trusted" ? "trusts this workflow" : verdict.detail}`,
    );
  }
  const { blockers, problems } = checkProblems({
    version,
    current: sharedVersion(packages),
    ref: process.env.GITHUB_REF ?? "",
    remoteTag,
    served,
    trust,
  });
  if (blockers.length > 0) throw new Error(`Not releasing ${version}:\n- ${blockers.join("\n- ")}`);
  await report(problems, dryRun);
  console.log(`Releasing ${version}${dryRun ? ", as a dry run" : ""}.`);
}

/** Bumps the nine manifests, commits `chore(release): v<version>` and tags it, in the runner. */
async function prepare(version: string): Promise<void> {
  const files = await setVersion(version);
  const tag = releaseTag(version);
  await runOrThrow("git", ["add", "--", ...files]);
  await runOrThrow("git", [
    ...bot,
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    releaseSubject(version),
  ]);
  await runOrThrow("git", [...bot, "tag", "--annotate", tag, "--message", tag]);
  console.log(`Committed ${releaseSubject(version)} as ${await revParse("HEAD")}, tagged ${tag}.`);
}

/**
 * After the gate: the release notes from the Conventional Commits since the last tag, and a git
 * bundle of the tag and its commit, which the jobs after this one fetch. Nothing is pushed yet.
 */
async function packageRelease(version: string): Promise<void> {
  const tag = releaseTag(version);
  const commit = await revParse(`${tag}^{commit}`);
  const manifest = await readManifest();
  if (manifest?.commit !== commit) {
    throw new Error(
      `The gate checked ${manifest?.commit ?? "nothing"}, not ${commit}, ${tag}'s commit.`,
    );
  }
  // Only here: changelogithub and what it brings never load in the jobs that can mint an OIDC
  // token or write to the repository.
  const { generateNotes, previousTag } = await import("./notes");
  const from = await previousTag(commit, tag);
  const notes = from
    ? await generateNotes({ from, to: tag, token: process.env.GH_TOKEN })
    : "The first release.\n";
  await writeFile(notesPath, notes);
  console.log(notes);
  await runOrThrow("git", ["bundle", "create", bundlePath, `refs/tags/${tag}`, `^${commit}^`]);
  console.log(`Bundled ${tag} at ${commit}.`);
}

/** Fetches the release commit and tag from the gate's bundle and checks the commit out. */
async function importRelease(version: string): Promise<string> {
  const tag = releaseTag(version);
  await runOrThrow("git", ["fetch", "--quiet", bundlePath, `refs/tags/${tag}:refs/tags/${tag}`]);
  const commit = await revParse(`${tag}^{commit}`);
  const manifest = await readManifest(manifestPath);
  if (manifest?.commit !== commit) {
    throw new Error(
      `The gate checked ${manifest?.commit ?? "nothing"}, not ${commit}, ${tag}'s commit.`,
    );
  }
  await runOrThrow("git", ["checkout", "--quiet", "--detach", commit]);
  return commit;
}

/**
 * Pushes the release commit to main and its tag, in one atomic push. If main moved while the
 * release ran, it merges the release into main as a PR would, so main's history comes first and
 * the tag stays on the commit the gate checked, and pushes that. A conflict stops it, with the
 * steps to finish by hand.
 */
async function push(tag: string, version: string): Promise<void> {
  const refs = ["HEAD:refs/heads/main", `refs/tags/${tag}`];
  if ((await run("git", ["push", "--atomic", "origin", ...refs], { inherit: true })).code === 0) {
    return;
  }
  await runOrThrow("git", ["fetch", "--quiet", "origin", "main"]);
  if (await isOnMain("HEAD")) {
    await runOrThrow("git", ["push", "origin", `refs/tags/${tag}`], { inherit: true });
    return;
  }
  if (await isAncestor("origin/main", "HEAD")) {
    throw new Error("git push failed, though main hasn't moved (see above).");
  }
  console.log("main moved while the release ran: merging the release into it.");
  await runOrThrow("git", ["checkout", "--quiet", "--detach", "origin/main"]);
  const merged = await run(
    "git",
    [...bot, "merge", "--no-ff", "-m", `chore(release): merge v${version} into main`, tag],
    { inherit: true },
  );
  if (merged.code !== 0) {
    await run("git", ["merge", "--abort"]);
    throw new Error(
      `The release conflicts with what main has gained since. Merge ${tag} into main by hand (git fetch origin ${tag}, git merge --no-ff ${tag}, push main and the tag), then vp run release ${version} runs this job again to finish.`,
    );
  }
  await runOrThrow("git", ["push", "--atomic", "origin", ...refs], { inherit: true });
}

async function publishRelease(version: string, dryRun: boolean): Promise<void> {
  await importRelease(version);
  await report(await publish({ version, dryRun }), dryRun);
}

async function finish(version: string, dryRun: boolean): Promise<void> {
  const commit = await importRelease(version);
  const tag = releaseTag(version);
  const notes = await readFile(notesPath, "utf8");
  if (!dryRun) {
    // npm first: main gets the new version, which the docs site's registry asks for, only once
    // npm serves it.
    await waitForPublished({ version, trusted: true });
    await push(tag, version);
    await createGitHubRelease({ version, notes });
    return;
  }
  await runOrThrow("git", ["fetch", "--quiet", "origin", "main"]);
  console.log(
    (await isAncestor("origin/main", commit))
      ? "A release would fast-forward main to the release commit and push the tag."
      : "main has moved past the release commit's parent: a release would merge the release into main, then push it and the tag.",
  );
  const pushed = await run("git", ["push", "--dry-run", "origin", `refs/tags/${tag}`]);
  if (pushed.code === 0) console.log(`This job can push ${tag}: git push --dry-run passed.`);
  else await report([`This job can't push ${tag}:\n${pushed.stderr.trim()}`], true);
  console.log(
    `A release would then write the ${tag} GitHub release${version.includes("-") ? ", as a prerelease" : ""}, with these notes:\n\n${notes}`,
  );
}

runMain(import.meta, async () => {
  const { positionals } = parseArguments(process.argv.slice(2), [], [], { positionals: true });
  const version = process.env.VERSION ?? "";
  const dryRun = process.env.DRY_RUN === "true";
  assertVersion(version);
  const [command] = positionals;
  if (command === "check") await check(version, dryRun);
  else if (command === "prepare") await prepare(version);
  else if (command === "package") await packageRelease(version);
  else if (command === "publish") await publishRelease(version, dryRun);
  else if (command === "finish") await finish(version, dryRun);
  else {
    throw new Error(
      "Usage: VERSION=<version> DRY_RUN=<true|false> vp run release:ci <check|prepare|package|publish|finish>",
    );
  }
});
