import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { constants, release as osRelease } from "node:os";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { gt, valid } from "semver";

import { releaseDirectory } from "./config";
import { createGitHubRelease, releaseTag } from "./github-release";
import { changedArtifacts, distTag, manifestPath, readManifest } from "./manifest";
import {
  commitsBetween,
  generateNotes,
  previousTag,
  suggestVersion,
  type VersionSuggestion,
} from "./notes";
import { interactive, npmUser, publish } from "./publish";
import { checkPublished, fetchPackument, waitForPublished, type Packument } from "./published";
import { assertVersion, setVersion, sharedVersion } from "./version";
import {
  gitState,
  isOnMain,
  parseArguments,
  readPublishedPackages,
  run,
  runMain,
  runOrThrow,
  step,
  workspaceRoot,
  type RunOptions,
} from "./workspace";

/** The release commit's subject, a Conventional Commit as AGENTS.md asks. */
export const releaseSubject = (version: string) => `chore(release): v${version}`;

const short = (commit: string) => commit.slice(0, 7);

/** What the checkout and GitHub say, as `releaseStage` reads it. */
export interface Checkout {
  /** Empty on a detached HEAD. */
  readonly branch: string;
  readonly clean: boolean;
  readonly head: string;
  /** HEAD's subject line. */
  readonly subject: string;
  /** Whether HEAD changes nothing but the nine manifests' `version` lines. */
  readonly bumpsOnly: boolean;
  readonly originMain: string;
  /** Whether HEAD is origin/main or one of its ancestors. */
  readonly headOnMain: boolean;
  /** The version the published packages share. */
  readonly current: string;
  /** How many of the nine npm serves at the version. */
  readonly served: "none" | "some" | "all";
  /** The commit `v<version>` points at here, and on GitHub; undefined without one. */
  readonly localTag?: string;
  readonly remoteTag?: string;
  /** Whether that commit is HEAD or one of its ancestors. */
  readonly tagInHistory: boolean;
}

export type Stage =
  /** Bump the versions in a new release commit on HEAD. */
  | { readonly kind: "bump" }
  /** The packages are at the version in `commit`, which no tag names yet: a release commit a stopped run left, or a version bump that landed on main. */
  | { readonly kind: "bumped"; readonly commit: string }
  /** `v<version>` names `commit`: a run tagged it and stopped later. */
  | { readonly kind: "tagged"; readonly commit: string };

export interface StagePlan {
  readonly stage?: Stage;
  /** Stop even a dry run. */
  readonly blockers: readonly string[];
  /** Stop a release; a dry run lists them and goes on. */
  readonly problems: readonly string[];
}

/**
 * Where a release of `version` starts from this checkout: a new release commit, or the commit an
 * earlier run left, so a rerun picks up where it stopped.
 */
export function releaseStage(checkout: Checkout, version: string): StagePlan {
  const blockers: string[] = [];
  const problems: string[] = [];
  const tag = releaseTag(version);
  if (checkout.branch !== "main") {
    problems.push(`The checkout is on ${checkout.branch || "a detached HEAD"}, not main.`);
  }
  if (!checkout.clean) blockers.push("The working tree has changes. Commit or stash them first.");

  const { localTag, remoteTag } = checkout;
  if (localTag && remoteTag && localTag !== remoteTag) {
    blockers.push(`${tag} is ${short(localTag)} here, but ${short(remoteTag)} on GitHub.`);
  }
  const tagged = remoteTag ?? localTag;
  if (tagged !== undefined) {
    if (checkout.current !== version || !checkout.tagInHistory) {
      const above =
        valid(checkout.current) && gt(checkout.current, version) ? checkout.current : version;
      blockers.push(`${tag} exists already, at ${short(tagged)}. Pick a version above ${above}.`);
    }
    return { stage: { kind: "tagged", commit: tagged }, blockers, problems };
  }

  if (checkout.current === version) {
    if (checkout.subject === releaseSubject(version)) {
      if (!checkout.bumpsOnly) {
        blockers.push(
          `HEAD is titled ${releaseSubject(version)}, but it changes more than the nine versions.`,
        );
      }
      return { stage: { kind: "bumped", commit: checkout.head }, blockers, problems };
    }
    if (checkout.head === checkout.originMain) {
      return { stage: { kind: "bumped", commit: checkout.head }, blockers, problems };
    }
    blockers.push(
      `The packages are at ${version} already, but HEAD is neither its release commit nor origin/main.`,
    );
    return { blockers, problems };
  }
  if (valid(checkout.current) && !gt(version, checkout.current)) {
    blockers.push(`${version} must be above the current ${checkout.current}.`);
  }
  if (checkout.served !== "none") {
    blockers.push(
      `npm already serves ${version}, from a release this checkout has no commit or tag for. Finish it from the checkout that published it, or pick a version above ${version}.`,
    );
  }
  if (checkout.head !== checkout.originMain) {
    problems.push(
      checkout.headOnMain
        ? "HEAD is behind origin/main. Pull first."
        : "HEAD has commits origin/main doesn't. Land them through a PR first.",
    );
  }
  return { stage: { kind: "bump" }, blockers, problems };
}

/** A rule that would refuse a direct push of the release commit to main. */
const pushBlockingRules = new Set([
  "pull_request",
  "required_status_checks",
  "required_signatures",
  "required_deployments",
  "merge_queue",
  "update",
]);

/** What in main's rules (`GET /repos/{owner}/{repo}/rules/branches/main`) would refuse the push. */
export function pushRuleProblems(
  rules: readonly { readonly type: string }[],
  classicProtection: boolean,
): string[] {
  const blocking = [...new Set(rules.map(({ type }) => type))].filter((type) =>
    pushBlockingRules.has(type),
  );
  const problems: string[] = [];
  if (blocking.length > 0) {
    problems.push(
      `main's rules would refuse a direct push of the release commit: ${blocking.join(", ")}.`,
    );
  }
  if (classicProtection) {
    problems.push(
      "main has branch protection, which may refuse a direct push of the release commit.",
    );
  }
  return problems;
}

/** One run of the CI workflow, as `gh run list --json` prints it. */
export interface WorkflowRun {
  readonly databaseId: number;
  readonly status: string;
  readonly conclusion: string;
  readonly url: string;
}

export type CiState = "passed" | "running" | "failed" | "missing";

/**
 * CI's verdict from its runs on one commit, newest first: the newest that wasn't cancelled or
 * skipped, since a newer push cancels an older run.
 */
export function ciState(runs: readonly WorkflowRun[]): { state: CiState; run?: WorkflowRun } {
  const run = runs.find(
    ({ status, conclusion }) =>
      status !== "completed" || (conclusion !== "cancelled" && conclusion !== "skipped"),
  );
  if (!run) return { state: "missing" };
  if (run.status !== "completed") return { state: "running", run };
  return { state: run.conclusion === "success" ? "passed" : "failed", run };
}

/** CI's job that runs Firefox and WebKit, on demand (ci.yml). */
export const firefoxJob = "Firefox and WebKit";

/**
 * Playwright's Firefox doesn't start on macOS 27 (#182), so `vp run browsers` leaves it out there,
 * by the same test as tools/a11y/vite.config.ts. Then the release needs CI's run of it.
 */
const firefoxStarts = !(process.platform === "darwin" && Number(osRelease().split(".")[0]) >= 27);

async function ciRuns(commit: string, event?: string): Promise<WorkflowRun[]> {
  const args = ["run", "list", "--workflow", "ci.yml", "--commit", commit, "--limit", "20"];
  if (event) args.push("--event", event);
  const { stdout } = await runOrThrow("gh", [
    ...args,
    "--json",
    "databaseId,status,conclusion,url",
  ]);
  return JSON.parse(stdout) as WorkflowRun[];
}

/** The Firefox job of the newest dispatched CI run on `commit` that ran it. */
async function firefoxState(commit: string): Promise<{ state: CiState; url?: string }> {
  for (const run of await ciRuns(commit, "workflow_dispatch")) {
    const { stdout } = await runOrThrow("gh", [
      "run",
      "view",
      String(run.databaseId),
      "--json",
      "jobs",
    ]);
    const job = (
      JSON.parse(stdout) as {
        jobs: { name: string; status: string; conclusion: string; url: string }[];
      }
    ).jobs.find(({ name }) => name === firefoxJob);
    if (!job) continue;
    const verdict = ciState([{ ...job, databaseId: run.databaseId }]);
    if (verdict.state === "missing") continue;
    return { state: verdict.state, url: job.url };
  }
  return { state: "missing" };
}

/** Polls `check` until it isn't running, or 40 minutes pass. */
async function waitFor(
  label: string,
  check: () => Promise<{ state: CiState; url?: string }>,
): Promise<{ state: CiState; url?: string }> {
  const deadline = Date.now() + 40 * 60_000;
  let said = false;
  for (;;) {
    const result = await check();
    if (result.state !== "running") return result;
    if (Date.now() > deadline)
      throw new Error(`${label} still runs after 40 minutes: ${result.url}`);
    if (!said) console.log(`Waiting for ${label}: ${result.url ?? "starting"}`);
    said = true;
    await sleep(30_000);
  }
}

/**
 * CI on the commit the release builds on: green, and, where Firefox can't start here, a dispatched
 * run's Firefox job too. Returns what's wrong now, and a wait for what still runs. A release starts
 * the dispatched run when there is none and CI hasn't failed; a dry run only says so.
 */
async function checkCi(
  commit: string,
  dryRun: boolean,
): Promise<{ problems: string[]; wait: () => Promise<void> }> {
  const problems: string[] = [];
  const waits: (() => Promise<void>)[] = [];
  const ci = ciState(await ciRuns(commit));
  if (ci.state === "passed") console.log(`CI passed on ${short(commit)}: ${ci.run!.url}`);
  else if (ci.state === "failed") problems.push(`CI failed on ${short(commit)}: ${ci.run!.url}`);
  else if (ci.state === "missing") problems.push(`CI hasn't run on ${short(commit)}.`);
  else {
    console.log(`CI is still running on ${short(commit)}: ${ci.run!.url}`);
    waits.push(async () => {
      const done = await waitFor("CI", async () => ciState(await ciRuns(commit)));
      if (done.state !== "passed")
        throw new Error(`CI ${done.state} on ${short(commit)}: ${done.url}`);
    });
  }

  if (!firefoxStarts && problems.length === 0) {
    const firefox = await firefoxState(commit);
    if (firefox.state === "passed") console.log(`CI's Firefox job passed on ${short(commit)}.`);
    else if (firefox.state === "failed") {
      problems.push(`CI's Firefox job failed on ${short(commit)}: ${firefox.url}`);
    } else if (firefox.state === "missing" && dryRun) {
      console.log(
        `Firefox can't start here (#182), and no dispatched CI run has tested ${short(commit)} in it: a release would start CI's Firefox job and wait for it.`,
      );
    } else {
      if (firefox.state === "missing") {
        console.log("Firefox can't start here (#182): starting CI's Firefox job on main.");
        await runOrThrow("gh", ["workflow", "run", "ci.yml", "--ref", "main"]);
      }
      const started = Date.now();
      waits.push(async () => {
        const done = await waitFor("CI's Firefox job", async () => {
          const state = await firefoxState(commit);
          // A run GitHub hasn't listed yet.
          if (state.state === "missing" && Date.now() - started < 5 * 60_000)
            return { state: "running" };
          return state;
        });
        if (done.state !== "passed") {
          throw new Error(`CI's Firefox job ${done.state} on ${short(commit)}: ${done.url ?? ""}`);
        }
      });
    }
  }
  return {
    problems,
    wait: async () => {
      for (const wait of waits) await wait();
    },
  };
}

/** git, never asking for credentials in the terminal: a prompt nobody answers would hang. */
const gitNetwork = (args: readonly string[], options: RunOptions = {}) =>
  run("git", args, { ...options, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });

async function gitNetworkOrThrow(args: readonly string[], options: RunOptions = {}) {
  const result = await gitNetwork(args, options);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${result.code})\n${result.stderr.trim()}`);
  }
  return result;
}

const revParse = async (ref: string) => (await runOrThrow("git", ["rev-parse", ref])).stdout.trim();

const isAncestor = async (commit: string, of: string) =>
  (await run("git", ["merge-base", "--is-ancestor", commit, of])).code === 0;

/** The commit a local tag names, or undefined without one. */
async function localTagCommit(tag: string): Promise<string | undefined> {
  const result = await run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

/** The commit a tag on GitHub names, through an annotated tag; undefined without one. */
async function remoteTagCommit(tag: string): Promise<string | undefined> {
  const { stdout } = await gitNetworkOrThrow([
    "ls-remote",
    "origin",
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  const lines = stdout.trim().split("\n").filter(Boolean);
  const peeled = lines.find((line) => line.endsWith("^{}")) ?? lines[0];
  return peeled?.split("\t")[0];
}

/** Whether HEAD changes only the `version` line of each published manifest, as a bump does. */
export async function bumpsOnly(
  manifests: readonly string[],
  root = workspaceRoot,
): Promise<boolean> {
  const numstat = await run("git", ["diff", "--numstat", "HEAD^", "HEAD"], { cwd: root });
  if (numstat.code !== 0) return false;
  const changed = numstat.stdout.trim().split("\n").filter(Boolean);
  if (changed.length !== manifests.length) return false;
  if (
    !changed.every((line) => manifests.includes(line.split("\t")[2]!) && line.startsWith("1	1	"))
  ) {
    return false;
  }
  const diff = await runOrThrow("git", ["diff", "--unified=0", "HEAD^", "HEAD"], { cwd: root });
  return diff.stdout
    .split("\n")
    .filter((line) => /^[-+](?![-+])/.test(line))
    .every((line) => /^[-+]\s*"version": "[^"]+",?$/.test(line));
}

async function readCheckout(
  version: string,
  current: string,
  packages: readonly { readonly name: string; readonly manifest: string }[],
): Promise<Checkout> {
  const { head, clean } = await gitState();
  const found = await packuments(packages.map(({ name }) => name));
  const served = [...found.values()].filter((packument) => packument?.versions?.[version]).length;
  const originMain = await revParse("origin/main");
  const tag = releaseTag(version);
  const localTag = await localTagCommit(tag);
  const remoteTag = await remoteTagCommit(tag);
  const tagged = remoteTag ?? localTag;
  const subject = (await runOrThrow("git", ["log", "-1", "--format=%s"])).stdout.trim();
  return {
    branch: (await runOrThrow("git", ["branch", "--show-current"])).stdout.trim(),
    clean,
    head,
    subject,
    bumpsOnly:
      subject === releaseSubject(version) &&
      (await bumpsOnly(packages.map(({ manifest }) => manifest))),
    originMain,
    headOnMain: await isAncestor(head, originMain),
    current,
    served: served === 0 ? "none" : served === packages.length ? "all" : "some",
    localTag,
    remoteTag,
    tagInHistory: tagged !== undefined && (await isAncestor(tagged, head)),
  };
}

/**
 * npm and GitHub logins: who publishes, and whether gh and git can push and write the release.
 * `gh` says whether gh is logged in at all; without it, nothing else on GitHub can be checked.
 */
async function accountProblems(needNpm: boolean): Promise<{ problems: string[]; gh: boolean }> {
  const problems: string[] = [];
  const user = needNpm ? await npmUser() : undefined;
  if (!needNpm) console.log("npm serves all nine already: no npm login needed.");
  else if (user) console.log(`npm: logged in as ${user}.`);
  else problems.push("npm: not logged in. Run `vp exec pnpm login`, which opens the browser.");
  const push = await gitNetwork([
    "push",
    "--dry-run",
    "--quiet",
    "origin",
    "origin/main:refs/heads/main",
  ]);
  if (push.code !== 0) {
    problems.push(`git: can't push to origin. ${push.stderr.trim().split("\n").at(-1) ?? ""}`);
  }
  if ((await run("gh", ["auth", "status"])).code !== 0) {
    problems.push("GitHub: gh isn't logged in. Run `gh auth login`.");
    return { problems, gh: false };
  }
  const write = await run("gh", ["api", "repos/{owner}/{repo}", "--jq", ".permissions.push"]);
  if (write.stdout.trim() === "true") console.log("GitHub: gh and git can push to the repository.");
  else problems.push("GitHub: your gh login can't push to the repository.");
  return { problems, gh: true };
}

/** Whether main's rules let the release commit land by a direct push. Reads; changes nothing. */
async function pushProblems(): Promise<string[]> {
  const rules = await runOrThrow("gh", ["api", "repos/{owner}/{repo}/rules/branches/main"]);
  const branch = await runOrThrow("gh", [
    "api",
    "repos/{owner}/{repo}/branches/main",
    "--jq",
    ".protected",
  ]);
  const problems = pushRuleProblems(
    JSON.parse(rules.stdout) as { type: string }[],
    branch.stdout.trim() === "true",
  );
  if (problems.length === 0)
    console.log("main takes a direct push: no rule or protection refuses it.");
  if (
    (JSON.parse(rules.stdout) as { type: string }[]).some(
      ({ type }) => type === "required_linear_history",
    )
  ) {
    console.log(
      "main requires a linear history: if main moves while the release publishes, the push can't merge, and stops.",
    );
  }
  return problems;
}

/** Whether `tag` has a GitHub release; undefined when GitHub can't say. */
async function githubReleaseExists(tag: string): Promise<boolean | undefined> {
  const result = await run("gh", ["release", "view", tag, "--json", "tagName"]);
  if (result.code === 0) return true;
  return /release not found/i.test(result.stderr) ? false : undefined;
}

/**
 * The version to release: the argument, or the owner's pick from a suggestion. A version whose
 * GitHub release isn't out yet is suggested again, to finish it; otherwise the commits since the
 * last tag decide (notes.ts).
 */
async function chooseVersion(current: string, dryRun: boolean): Promise<string> {
  let suggestion: VersionSuggestion;
  if (current !== "0.0.0" && (await githubReleaseExists(releaseTag(current))) === false) {
    suggestion = {
      version: current,
      reason: `${releaseTag(current)} has no GitHub release yet: finish it`,
      alternatives: [],
    };
  } else {
    const from = await previousTag("HEAD");
    suggestion = suggestVersion(current, from ? await commitsBetween(from, "HEAD") : []);
  }
  const choices = [suggestion.version, ...suggestion.alternatives];
  if (!interactive()) {
    if (!dryRun) {
      const others = suggestion.alternatives.length
        ? `; or ${suggestion.alternatives.join(", ")}`
        : "";
      throw new Error(
        `Say which version: vp run release <version>. Suggested: ${suggestion.version} (${suggestion.reason})${others}.`,
      );
    }
    console.log(
      `No version given, so the dry run takes ${suggestion.version} (${suggestion.reason}).`,
    );
    return suggestion.version;
  }
  console.log(`\n${suggestion.reason}.`);
  choices.forEach((choice, index) =>
    console.log(`  ${index + 1}) ${choice}${index === 0 ? " (suggested)" : ""}`),
  );
  const answer = await ask(`Version [${suggestion.version}]: `);
  if (answer === "") return suggestion.version;
  return choices[Number(answer) - 1] ?? answer;
}

async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim();
  } finally {
    prompt.close();
  }
}

/** What this checkout's release has done, in `.release/release.json`. */
interface ReleaseState {
  readonly version: string;
  /** The release commit the gate passed on. */
  readonly commit: string;
  /** The sha256 of `.release/manifest.json` that gate wrote. */
  readonly manifest: string;
  /** Set right before the first request that changes anything on npm. */
  readonly publishing?: boolean;
}

const statePath = join(workspaceRoot, releaseDirectory, "release.json");

async function readState(): Promise<ReleaseState | undefined> {
  return readFile(statePath, "utf8")
    .then((text) => JSON.parse(text) as ReleaseState)
    .catch(() => undefined);
}

const writeState = (state: ReleaseState) =>
  writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

async function manifestHash(): Promise<string | undefined> {
  const text = await readFile(manifestPath).catch(() => undefined);
  return text && createHash("sha256").update(text).digest("hex");
}

/**
 * Whether the release gate passed on `commit` for `version`, and its manifest and tarballs are
 * still the ones it checked: not rewritten since by another dry run.
 */
async function gatePassed(version: string, commit: string): Promise<boolean> {
  const state = await readState();
  if (state?.version !== version || state.commit !== commit) return false;
  if ((await manifestHash()) !== state.manifest) return false;
  const manifest = await readManifest();
  if (manifest?.version !== version || manifest.commit !== commit) return false;
  return (await changedArtifacts(manifest)).length === 0;
}

/** npm's document for each published package. */
async function packuments(names: readonly string[]): Promise<Map<string, Packument | undefined>> {
  const found = new Map<string, Packument | undefined>();
  for (const name of names) found.set(name, await fetchPackument(name));
  return found;
}

/** Whether npm serves every package at the version, with the gate's tarballs, already. */
async function servedAlready(version: string, tag: string): Promise<boolean> {
  const manifest = await readManifest();
  if (!manifest) return false;
  const found = await packuments(manifest.packages.map(({ name }) => name));
  const check = checkPublished(manifest, { version, tag, staged: false }, found);
  return check.problems.length === 0 && check.pending.length === 0;
}

/**
 * Pushes the release commit to main and its tag. If main moved while the release published, it
 * merges the release into main as a PR would, so main's history stays first and the tag stays on
 * the commit the gate checked, and pushes that. A merge that conflicts stops, with the steps.
 */
async function push(tag: string, version: string): Promise<void> {
  const refs = ["HEAD:refs/heads/main", `refs/tags/${tag}`];
  if ((await gitNetwork(["push", "--atomic", "origin", ...refs], { inherit: true })).code === 0) {
    return;
  }
  await gitNetworkOrThrow(["fetch", "--quiet", "origin", "main"]);
  if (await isOnMain("HEAD")) {
    await gitNetworkOrThrow(["push", "origin", `refs/tags/${tag}`], { inherit: true });
    return;
  }
  if (await isAncestor("origin/main", "HEAD")) {
    throw new Error(
      `git push failed, though main hasn't moved (see above). Run vp run release ${version} again to push.`,
    );
  }
  console.log("main moved while the release published: merging the release into it.");
  const release = await revParse("HEAD");
  await runOrThrow("git", ["reset", "--quiet", "--keep", "origin/main"]);
  const merged = await run(
    "git",
    ["merge", "--no-ff", "-m", `chore(release): merge v${version} into main`, tag],
    { inherit: true },
  );
  if (merged.code !== 0) {
    await run("git", ["merge", "--abort"]);
    await run("git", ["reset", "--quiet", "--keep", release]);
    throw new Error(
      `The release conflicts with what main has gained since. Merge it by hand: git reset --keep origin/main, git merge --no-ff ${tag}, resolve and commit, git push --atomic origin HEAD:main ${tag}. Then run vp run release ${version} again to finish.`,
    );
  }
  await gitNetworkOrThrow(["push", "--atomic", "origin", ...refs], { inherit: true });
}

export interface ReleaseOptions {
  /** Asked for, with a suggestion, when missing. */
  readonly version?: string;
  /** npm dist-tag; `next` for prereleases and `latest` otherwise. */
  readonly tag?: string;
  /** Everything but publishing, pushing and the GitHub release; the checkout ends as it began. */
  readonly dryRun: boolean;
  /** Release without typing the version to confirm. */
  readonly yes: boolean;
}

/**
 * Releases the nine packages from this laptop: checks the checkout, the logins and CI; bumps the
 * versions in a release commit; runs the release gate on it; tags it; stages the tarballs the
 * gate checked and approves them with one 2FA; pushes the commit and tag; checks what npm serves;
 * writes the GitHub release from the Conventional Commits; and installs the release from npm into
 * clean apps. Until it starts publishing, a failure or an interrupt leaves the checkout as it
 * was. After, run it again: it picks up where it stopped. See docs/internal/releasing.md.
 */
export async function release(options: ReleaseOptions): Promise<void> {
  const { dryRun } = options;
  const wouldStop: string[] = [];
  /** A release stops on these; a dry run lists them and goes on. */
  const report = (problems: readonly string[]) => {
    if (problems.length === 0) return;
    if (!dryRun) throw new Error(`Not releasing:\n- ${problems.join("\n- ")}`);
    for (const problem of problems) console.log(`✗ ${problem} A release would stop here.`);
    wouldStop.push(...problems);
  };

  // origin/main, and the release tags the notes start from. A local tag that differs from
  // GitHub's stays as it is, and the checks name it if it's this release's.
  await gitNetworkOrThrow(["fetch", "--quiet", "origin", "main"]);
  await gitNetwork(["fetch", "--quiet", "origin", "refs/tags/v*:refs/tags/v*"]);
  const packages = await readPublishedPackages();
  const manifests = packages.map(({ directory }) => join("packages", directory, "package.json"));
  const current = sharedVersion(packages);
  const version = options.version ?? (await chooseVersion(current, dryRun));
  assertVersion(version);
  const npmTag = distTag(version, options.tag);
  const tag = releaseTag(version);

  const { stage, checkout, publishing, ci } = await step(
    `Check what releasing ${version} needs`,
    async () => {
      const read = await readCheckout(
        version,
        current,
        packages.map(({ manifest }, index) => ({
          name: manifest.name,
          manifest: manifests[index]!,
        })),
      );
      const plan = releaseStage(read, version);
      const state = await readState();
      const blockers = [...plan.blockers];
      if (state?.publishing && state.version !== version) {
        blockers.push(
          `${state.version} is still publishing from this checkout. Finish it (vp run release ${state.version}), or delete .release/release.json if you've given it up.`,
        );
      }
      if (blockers.length > 0 || !plan.stage) {
        throw new Error(`Not releasing ${version}:\n- ${blockers.join("\n- ")}`);
      }
      const found = plan.stage;
      const commit = found.kind === "bump" ? read.head : found.commit;
      // Once anything may be on npm, a rerun only finishes: CI and the gate passed before.
      const started =
        read.remoteTag !== undefined ||
        read.served !== "none" ||
        (state?.publishing === true && state.version === version && state.commit === commit);
      console.log(
        found.kind === "bump"
          ? `${current} → ${version}, from ${short(read.head)}, to npm's "${npmTag}" tag.`
          : `${version} is bumped at ${short(found.commit)}${found.kind === "tagged" ? `, tagged ${tag}` : ""}${started ? ", and publishing has started" : ""}: picking up from there.`,
      );
      report(plan.problems);
      const accounts = await accountProblems(read.served !== "all");
      report(accounts.problems);
      if (read.served !== "all" && !interactive()) {
        report([
          "npm's 2FA needs a terminal: run this in one, or through .claude/skills/release/terminal.sh.",
        ]);
      }
      if (!accounts.gh) {
        report(["GitHub: main's rules and CI can't be checked without gh."]);
        return { stage: found, checkout: read, publishing: started, ci: undefined };
      }
      report(await pushProblems());
      if (started) {
        return { stage: found, checkout: read, publishing: started, ci: undefined };
      }
      // CI checks the newest commit of the release that's on GitHub.
      const ciCommit =
        found.kind === "bump" || (await isOnMain(commit)) ? commit : await revParse(`${commit}^`);
      const checked = await checkCi(ciCommit, dryRun);
      report(checked.problems);
      return { stage: found, checkout: read, publishing: started, ci: checked };
    },
  );

  if (!dryRun && !options.yes && (await ask(`Type ${version} to release it: `)) !== version) {
    throw new Error("Not confirmed. Nothing changed.");
  }

  const branch = checkout.branch;
  /** What this run changed locally, for `restore`. */
  const created = { detached: false, bump: false, commit: false, tag: false };
  const aborter = new AbortController();
  let commit = stage.kind === "bump" ? "" : stage.commit;
  let notes: string;
  // A dry run always ends as it began; a release, until it starts publishing.
  let undo = dryRun || !publishing;
  let restoring: Promise<void> | undefined;
  /** Puts the checkout back as it was; nothing has left this machine. Runs once. */
  const restore = () =>
    (restoring ??= (async () => {
      const done: string[] = [];
      if (created.tag && (await run("git", ["tag", "-d", tag])).code === 0) done.push("tag");
      if (created.bump) {
        await run("git", ["reset", "--quiet", "--", ...manifests]);
        await run("git", ["checkout", "--quiet", "--", ...manifests]);
        done.push("version bump");
      }
      // A release commits on the branch, which goes back only if nothing landed on top meanwhile.
      if (created.commit && !dryRun) {
        const parent = await run("git", ["rev-parse", "HEAD^"]);
        const back =
          parent.stdout.trim() === checkout.head
            ? await run("git", ["reset", "--quiet", "--keep", checkout.head])
            : { code: 1, stdout: "", stderr: "HEAD moved past the release commit" };
        if (back.code === 0) done.push("release commit");
        else console.error(`Couldn't undo the release commit: ${back.stderr.trim()}`);
      }
      // A dry run commits on a detached HEAD, and goes back to the branch.
      if (created.detached) {
        const back = await run(
          "git",
          branch ? ["switch", "--quiet", branch] : ["checkout", "--quiet", checkout.head],
        );
        if (back.code === 0) done.push("detached release commit");
        else console.error(`Couldn't go back to ${branch || checkout.head}: ${back.stderr.trim()}`);
      }
      if (done.length > 0) console.log(`\nUndid the local ${done.join(", ")}.`);
    })());
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const interrupted = (signal: NodeJS.Signals) => {
    const code = 128 + constants.signals[signal];
    // Stop the gate, and write nothing to a terminal that may be gone.
    aborter.abort();
    for (const stream of [process.stdout, process.stderr]) stream.on("error", () => {});
    if (!undo) process.exit(code);
    void restore().finally(() => process.exit(code));
  };
  for (const signal of signals) process.on(signal, interrupted);

  try {
    if (stage.kind === "bump") {
      commit = await step(`Bump the packages to ${version}`, async () => {
        // A dry run leaves the branch where it is.
        if (dryRun) {
          created.detached = true;
          await runOrThrow("git", ["switch", "--quiet", "--detach"]);
        }
        created.bump = true;
        await setVersion(version);
        await runOrThrow("git", ["add", "--", ...manifests]);
        await runOrThrow("git", ["commit", "--quiet", "-m", releaseSubject(version)], {
          inherit: true,
          signal: aborter.signal,
        });
        created.bump = false;
        created.commit = true;
        return revParse("HEAD");
      });
    }

    await step("Release gate", async () => {
      if (await gatePassed(version, commit)) {
        console.log(`The gate passed on ${short(commit)} already; its tarballs are unchanged.`);
        return;
      }
      if (commit !== (await revParse("HEAD"))) {
        throw new Error(
          publishing
            ? `${version} is partly or fully published from ${short(commit)}, but .release/ no longer holds what its gate checked, and HEAD isn't ${short(commit)} to run the gate again. Check out ${short(commit)} (git switch --detach ${short(commit)}), run this again, then switch back.`
            : `${tag} is at ${short(commit)}, and this checkout has no passing gate for it. Only the checkout that started that release can finish it.`,
        );
      }
      // Publishing that started stays marked while the gate runs again, since npm may have some.
      if (!publishing) await rm(statePath, { force: true });
      await runOrThrow("vp", ["run", "release:gate"], {
        env: { ...process.env, RELEASE_VERSION: version },
        inherit: true,
        signal: aborter.signal,
      });
      await writeState({
        version,
        commit,
        manifest: (await manifestHash())!,
        ...(publishing ? { publishing: true } : {}),
      });
    });

    if (!dryRun && ci) await step("Wait for CI", ci.wait);

    await step(`Tag ${short(commit)} ${tag}`, async () => {
      if ((await localTagCommit(tag)) === commit) {
        console.log(`${tag} is there already.`);
        return;
      }
      await runOrThrow("git", ["tag", "-a", tag, "-m", tag, commit]);
      created.tag = true;
    });

    notes = await step("Write the release notes from the commits", async () => {
      const from = await previousTag(commit, tag);
      const token = (await run("gh", ["auth", "token"])).stdout.trim() || undefined;
      const text = from ? await generateNotes({ from, to: tag, token }) : "The first release.\n";
      const file = join(workspaceRoot, releaseDirectory, "notes.md");
      await writeFile(file, text);
      console.log(`${text}\n(${relative(workspaceRoot, file)})`);
      return text;
    });

    if (dryRun) {
      await step("Check what publishing would do", async () => {
        report(await publish({ version, tag: options.tag, dryRun: true }));
      });
      console.log(`\nDry run of ${version} done. Nothing was published or pushed.`);
      console.log(
        `A release would now stage the tarballs and approve them with one 2FA, push main and ${tag}, check what npm serves, write the ${tag} GitHub release${version.includes("-") ? " as a prerelease" : ""}, and install it from npm into clean apps.`,
      );
      if (wouldStop.length > 0) {
        console.log(`\nA release would have stopped at:\n- ${wouldStop.join("\n- ")}`);
      }
      return;
    }

    if (await servedAlready(version, npmTag)) {
      console.log(`\nnpm serves all ${version} packages already; not publishing again.`);
    } else {
      await step("Publish to npm", () =>
        publish({
          version,
          tag: options.tag,
          // From the first upload on, a rerun picks up where this one stopped.
          onUpload: async () => {
            undo = false;
            const state = await readState();
            if (state) await writeState({ ...state, publishing: true });
          },
        }),
      );
    }
    undo = false;
  } finally {
    if (undo) await restore();
    for (const signal of signals) process.off(signal, interrupted);
  }

  await step(`Push main and ${tag}`, () => push(tag, version));
  await step("Check what npm serves", () =>
    waitForPublished({ version, tag: options.tag, staged: true }),
  );
  await step("Write the GitHub release", () => createGitHubRelease({ version, notes }));
  await step("Install the release from npm into clean apps", () =>
    runOrThrow("vp", ["run", "registry:e2e"], {
      env: { ...process.env, REGISTRY_E2E_PACKAGES: "npm" },
      inherit: true,
    }),
  );
  const state = await readState();
  if (state?.publishing) await writeState({ ...state, publishing: false });
  console.log(`\nReleased ${version}.`);
  console.log(
    `Its GitHub release has the notes generated from the commits. Rewrite them into the polished notes with /release in Claude Code, or by hand: gh release edit ${tag} --notes-file <file>.`,
  );
}

runMain(import.meta, async () => {
  const { flags, positionals } = parseArguments(
    process.argv.slice(2),
    ["dry-run", "yes"],
    ["tag"],
    { positionals: true },
  );
  if (positionals.length > 1) {
    throw new Error("Usage: vp run release [<version>] [--dry-run] [--tag <dist-tag>] [--yes]");
  }
  await release({
    version: positionals[0],
    tag: typeof flags.get("tag") === "string" ? (flags.get("tag") as string) : undefined,
    dryRun: flags.has("dry-run"),
    yes: flags.has("yes"),
  });
});
