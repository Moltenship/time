import { setTimeout as sleep } from "node:timers/promises";

import { releaseTag } from "./github-release";
import { commitsBetween, previousTag, suggestVersion } from "./notes";
import { assertVersion, sharedVersion } from "./version";
import {
  gitState,
  parseArguments,
  readPublishedPackages,
  run,
  runMain,
  runOrThrow,
  step,
} from "./workspace";

const short = (commit: string) => commit.slice(0, 7);

const revParse = async (ref: string) => (await runOrThrow("git", ["rev-parse", ref])).stdout.trim();

/** The release workflow's run-name (release.yml): one version, and whether it's a dry run. */
export const runTitle = (version: string, dryRun: boolean) =>
  `Release v${version}${dryRun ? " (dry run)" : ""}`;

/** The release workflow's job that publishes to npm (release.yml). */
export const publishJob = "Publish to npm";

/** A run of a workflow, as `gh run list --json` prints it. */
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

/** A rule that would refuse the release workflow's push of the release commit to main. */
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
      `main's rules would refuse the release workflow's push of the release commit: ${blocking.join(", ")}.`,
    );
  }
  if (classicProtection) {
    problems.push(
      "main has branch protection, which may refuse the release workflow's push of the release commit.",
    );
  }
  return problems;
}

export type NextStep =
  | { readonly action: "dispatch" }
  /** A run of this version is going: watch it. */
  | { readonly action: "watch"; readonly run: WorkflowRun }
  /** It's released. */
  | { readonly action: "released"; readonly run: WorkflowRun }
  /** A run failed after it started publishing: run its failed jobs again, on the same commit. */
  | { readonly action: "rerun"; readonly run: WorkflowRun };

/** A release run, with whether its publish job ran: it may have published something. */
export interface ReleaseRun extends WorkflowRun {
  readonly publishStarted: boolean;
}

/**
 * What to do about a version, from its release runs, newest first. A run that's going is watched,
 * and one that succeeded means it's released. Of the runs that failed, the newest that got as far
 * as publishing runs its failed jobs again, on the same commit and tarballs, so npm never gets two
 * builds of one version; a later run that failed before publishing doesn't hide it. With none, a
 * new run starts from main as it is now, with whatever fixed the last one.
 */
export function nextStep(runs: readonly ReleaseRun[]): NextStep {
  const going = runs.find(({ status }) => status !== "completed");
  if (going) return { action: "watch", run: going };
  const released = runs.find(({ conclusion }) => conclusion === "success");
  if (released) return { action: "released", run: released };
  const published = runs.find(({ publishStarted }) => publishStarted);
  return published ? { action: "rerun", run: published } : { action: "dispatch" };
}

interface Job {
  readonly databaseId: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string;
}

/** Whether a run's publish job ran, whatever came of it: it may have published something. */
export const publishStarted = (jobs: readonly Job[]) =>
  jobs.some(
    ({ name, status, conclusion }) =>
      name === publishJob && status === "completed" && conclusion !== "skipped",
  );

async function jobsOf(run: number): Promise<Job[]> {
  const { stdout } = await runOrThrow("gh", ["run", "view", String(run), "--json", "jobs"]);
  return (JSON.parse(stdout) as { jobs: Job[] }).jobs;
}

/** `gh`'s output, or nothing when it fails. */
async function quietly(args: readonly string[]): Promise<string> {
  const result = await run("gh", args);
  return result.code === 0 ? result.stdout : "";
}

/** The release workflow's runs, newest first, with their titles. */
async function releaseRuns(): Promise<(WorkflowRun & { displayTitle: string })[]> {
  const { stdout } = await runOrThrow("gh", [
    "run",
    "list",
    "--workflow",
    "release.yml",
    "--limit",
    "100",
    "--json",
    "databaseId,status,conclusion,url,displayTitle",
  ]);
  return JSON.parse(stdout) as (WorkflowRun & { displayTitle: string })[];
}

/** One version's release runs, newest first, with whether each got as far as publishing. */
async function versionRuns(version: string): Promise<ReleaseRun[]> {
  const runs = (await releaseRuns()).filter(
    ({ displayTitle }) => displayTitle === runTitle(version, false),
  );
  return Promise.all(
    runs.map(async (run) => ({
      ...run,
      publishStarted:
        run.status === "completed" && run.conclusion !== "success"
          ? publishStarted(await jobsOf(run.databaseId))
          : false,
    })),
  );
}

async function ciRuns(commit: string): Promise<WorkflowRun[]> {
  const { stdout } = await runOrThrow("gh", [
    "run",
    "list",
    "--workflow",
    "ci.yml",
    "--commit",
    commit,
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion,url",
  ]);
  return JSON.parse(stdout) as WorkflowRun[];
}

/** CI on `commit`, waiting while it runs, up to 40 minutes. */
async function waitForCi(commit: string): Promise<{ state: CiState; run?: WorkflowRun }> {
  const deadline = Date.now() + 40 * 60_000;
  for (let said = false; ; said = true) {
    const ci = ciState(await ciRuns(commit));
    if (ci.state !== "running" || Date.now() > deadline) return ci;
    if (!said) console.log(`Waiting for CI on ${short(commit)}: ${ci.run!.url}`);
    await sleep(30_000);
  }
}

/** Whether main's rules let the release workflow push the release commit. Reads; changes nothing. */
async function pushProblems(): Promise<string[]> {
  const rules = await runOrThrow("gh", ["api", "repos/{owner}/{repo}/rules/branches/main"]);
  const branch = await runOrThrow("gh", [
    "api",
    "repos/{owner}/{repo}/branches/main",
    "--jq",
    ".protected",
  ]);
  return pushRuleProblems(
    JSON.parse(rules.stdout) as { type: string }[],
    branch.stdout.trim() === "true",
  );
}

/**
 * The checkout a release starts from: main, clean, and what GitHub has, with CI green on it. A
 * dry run starts from any pushed branch, and only reports CI and main's rules.
 */
async function preflight(dryRun: boolean): Promise<{ branch: string; head: string }> {
  const problems: string[] = [];
  const branch = (await runOrThrow("git", ["branch", "--show-current"])).stdout.trim();
  if (!branch) throw new Error("HEAD is detached. Check out main.");
  if (!dryRun && branch !== "main") problems.push(`The checkout is on ${branch}, not main.`);
  await runOrThrow("git", ["fetch", "--quiet", "origin", branch], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const { head, clean } = await gitState();
  if (!clean) problems.push("The working tree has changes. Commit or stash them first.");
  const remote = (
    await run("git", ["rev-parse", "--verify", "-q", `origin/${branch}`])
  ).stdout.trim();
  if (head !== remote) {
    problems.push(
      remote
        ? `HEAD (${short(head)}) isn't origin/${branch} (${short(remote)}): push or pull first.`
        : `${branch} isn't on GitHub. Push it first.`,
    );
  }
  if ((await run("gh", ["auth", "status"])).code !== 0) {
    problems.push("gh isn't logged in. Run gh auth login.");
    throw new Error(`Not releasing:\n- ${problems.join("\n- ")}`);
  }
  const write = await run("gh", ["api", "repos/{owner}/{repo}", "--jq", ".permissions.push"]);
  if (write.stdout.trim() !== "true") problems.push("Your gh login can't start workflows here.");

  // The release workflow pushes with GitHub's token, which starts no CI: on a release commit, or
  // its merge into main, CI is the commit's first parent's, which the release's gate built on.
  const subject = (await runOrThrow("git", ["log", "-1", "--format=%s", head])).stdout.trim();
  const ciCommit = /^chore\(release\): (?:v\S+|merge v\S+ into main)$/.test(subject)
    ? await revParse(`${head}^`)
    : head;
  const ci = dryRun ? ciState(await ciRuns(ciCommit)) : await waitForCi(ciCommit);
  if (ci.state === "passed") console.log(`CI passed on ${short(ciCommit)}.`);
  else {
    const what =
      ci.state === "missing"
        ? "hasn't run"
        : ci.state === "running"
          ? "is still running"
          : "failed";
    const problem = `CI ${what} on ${short(ciCommit)}${ci.run ? `: ${ci.run.url}` : "."}`;
    if (dryRun) console.log(`${problem} A release would stop here.`);
    else problems.push(problem);
  }
  const rules = await pushProblems();
  if (dryRun) for (const problem of rules) console.log(`${problem} A release would stop here.`);
  else problems.push(...rules);

  if (problems.length > 0) throw new Error(`Not releasing:\n- ${problems.join("\n- ")}`);
  return { branch, head };
}

/** The version to release: the argument, or the one the commits since the last tag suggest. */
async function chooseVersion(requested: string | undefined): Promise<string> {
  if (requested !== undefined) return requested;
  const current = sharedVersion(await readPublishedPackages());
  const from = await previousTag("HEAD");
  const suggestion = suggestVersion(current, from ? await commitsBetween(from, "HEAD") : []);
  console.log(`Releasing ${suggestion.version}: ${suggestion.reason}.`);
  return suggestion.version;
}

/** Starts the release workflow on `branch` and returns its run. */
async function dispatch(
  version: string,
  branch: string,
  commit: string,
  dryRun: boolean,
): Promise<number> {
  const started = Date.now();
  const { stdout } = await runOrThrow("gh", [
    "workflow",
    "run",
    "release.yml",
    "--ref",
    branch,
    "-f",
    `version=${version}`,
    "-f",
    `dry-run=${dryRun}`,
    "-f",
    `commit=${commit}`,
  ]);
  const printed = /actions\/runs\/(\d+)/.exec(stdout)?.[1];
  if (printed) return Number(printed);
  // An older gh prints nothing: find the run GitHub has just listed.
  while (Date.now() - started < 2 * 60_000) {
    const run = (await releaseRuns()).find(
      ({ displayTitle, status }) =>
        displayTitle === runTitle(version, dryRun) && status !== "completed",
    );
    if (run) return run.databaseId;
    await sleep(5_000);
  }
  throw new Error(
    "Started the release workflow, but GitHub doesn't list its run. See the Actions tab.",
  );
}

/** Says how a finished run went: the release, or the jobs that failed and their logs' last lines. */
async function summarize(id: number, version: string, dryRun: boolean): Promise<boolean> {
  const { stdout } = await runOrThrow("gh", [
    "run",
    "view",
    String(id),
    "--json",
    "conclusion,url,jobs",
  ]);
  const view = JSON.parse(stdout) as { conclusion: string; url: string; jobs: Job[] };
  if (view.conclusion === "success") {
    if (dryRun) {
      // What the run reported a release would stop at, as its warnings.
      const warnings: string[] = [];
      for (const job of view.jobs) {
        const annotations = await quietly([
          "api",
          `repos/{owner}/{repo}/check-runs/${job.databaseId}/annotations`,
          "--jq",
          '.[] | select(.annotation_level == "warning") | .message',
        ]);
        warnings.push(
          ...annotations.split("\n").filter((line) => line.startsWith("A release would")),
        );
      }
      console.log(`\nThe dry run of ${version} passed: ${view.url}`);
      console.log("Nothing was published, pushed or released.");
      if (warnings.length > 0) console.log(`\n${warnings.join("\n")}`);
      return true;
    }
    const url = await quietly([
      "release",
      "view",
      releaseTag(version),
      "--json",
      "url",
      "--jq",
      ".url",
    ]);
    console.log(`\nReleased ${version}: ${url.trim() || view.url}`);
    console.log(`npm: https://www.npmjs.com/package/@moltenship/calendar/v/${version}`);
    console.log(
      `Its notes are the ones generated from the commits; /release in Claude Code rewrites them, or: gh release edit ${releaseTag(version)} --notes-file <file>.`,
    );
    return true;
  }
  console.error(`\nThe release run of ${version} ended with ${view.conclusion}: ${view.url}`);
  for (const job of view.jobs) {
    if (job.conclusion === "failure" || job.conclusion === "cancelled") {
      console.error(`- ${job.name}: ${job.conclusion}`);
    }
  }
  const log = await quietly(["run", "view", String(id), "--log-failed"]);
  if (log) console.error(`\n${log.trim().split("\n").slice(-60).join("\n")}`);
  console.error(
    publishStarted(view.jobs) && !dryRun
      ? `\nIt failed after it started publishing. Fix what it says, then run vp run release ${version} again: it runs the failed jobs again, on the same commit.`
      : `\nNothing was published or pushed. Fix what it says (on main, through a PR, if the gate failed), then run vp run release ${version} again.`,
  );
  return false;
}

export interface ReleaseOptions {
  /** The suggestion from the commits since the last tag when missing. */
  readonly version?: string;
  /** Everything but publishing, pushing and the GitHub release, from any pushed branch. */
  readonly dryRun: boolean;
}

/**
 * Releases without asking anything: checks the checkout and CI, picks the version, starts the
 * release workflow on main, which bumps, gates, publishes through npm trusted publishing, pushes
 * and writes the GitHub release, and watches it to the end. For a version whose run failed after
 * it started publishing, it runs that run's failed jobs again; for one that failed before, it
 * starts a new run. See docs/internal/releasing.md.
 */
export async function release(options: ReleaseOptions): Promise<boolean> {
  const { dryRun } = options;
  if ((await run("gh", ["auth", "status"])).code !== 0) {
    throw new Error("gh isn't logged in. Run gh auth login.");
  }
  // The tags the suggestion counts from.
  await run("git", ["fetch", "--quiet", "origin", "refs/tags/v*:refs/tags/v*"], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const version = await chooseVersion(options.version);
  assertVersion(version);

  const id = await step(
    `Start the release of ${version}${dryRun ? ", as a dry run" : ""}`,
    async () => {
      // Finishing or reporting a release needs no checkout: only starting one does.
      const next: NextStep = dryRun ? { action: "dispatch" } : nextStep(await versionRuns(version));
      if (next.action === "released") {
        console.log(`${version} is released already: ${next.run.url}`);
        return next.run.databaseId;
      }
      if (next.action === "watch") {
        console.log(`A release of ${version} is running: ${next.run.url}`);
        return next.run.databaseId;
      }
      if (next.action === "rerun") {
        console.log(
          `Its run failed after it started publishing; running its failed jobs again: ${next.run.url}`,
        );
        await runOrThrow("gh", ["run", "rerun", String(next.run.databaseId), "--failed"]);
        // Until GitHub queues the jobs again, the run still reads as failed.
        for (let tries = 0; tries < 12; tries += 1) {
          const status = await quietly([
            "run",
            "view",
            String(next.run.databaseId),
            "--json",
            "status",
            "--jq",
            ".status",
          ]);
          if (status.trim() !== "completed") break;
          await sleep(5_000);
        }
        return next.run.databaseId;
      }
      if (!dryRun) {
        const other = (await releaseRuns()).find(
          ({ displayTitle, status }) =>
            !displayTitle.endsWith("(dry run)") && status !== "completed",
        );
        if (other) {
          throw new Error(
            `${other.displayTitle} is running: ${other.url}. Let it finish, then run this again.`,
          );
        }
      }
      const { branch, head } = await preflight(dryRun);
      const started = await dispatch(version, branch, head, dryRun);
      console.log(`Started: https://github.com/Moltenship/time/actions/runs/${started}`);
      return started;
    },
  );

  await step("Watch the release workflow", async () => {
    await run("gh", ["run", "watch", String(id), "--interval", "30"], { inherit: true });
  });
  return summarize(id, version, dryRun);
}

runMain(import.meta, async () => {
  const { flags, positionals } = parseArguments(process.argv.slice(2), ["dry-run"], [], {
    positionals: true,
  });
  if (positionals.length > 1) throw new Error("Usage: vp run release [<version>] [--dry-run]");
  if (!(await release({ version: positionals[0], dryRun: flags.has("dry-run") }))) {
    process.exitCode = 1;
  }
});
