import type { RunResult } from "./workspace";

/** A workflow run's state, as `gh run view --json status,conclusion,url` prints it. */
export interface RunState {
  readonly status: string;
  readonly conclusion: string;
  readonly url: string;
}

/** What following a run needs from outside: `gh`, a pause, and the time. Tests give their own. */
export interface WatchContext {
  /** Runs `gh` with these arguments and resolves with its exit code and output. */
  readonly gh: (args: readonly string[], options?: { inherit?: boolean }) => Promise<RunResult>;
  readonly sleep: (milliseconds: number) => Promise<unknown>;
  readonly now: () => number;
}

export interface WatchLimits {
  /** How long GitHub may go without returning the run, at its start or later, before giving up. */
  readonly lookup: number;
  /** The pause between two lookups while GitHub doesn't return the run. */
  readonly retry: number;
  /** The pause before watching again when the watch stopped and the run is still going. */
  readonly rewatch: number;
}

export const watchLimits: WatchLimits = { lookup: 3 * 60_000, retry: 5_000, rewatch: 30_000 };

/** The run GitHub has under `id`, or nothing: it lists a run a moment after it starts one. */
async function viewRun(id: number, { gh }: WatchContext): Promise<RunState | undefined> {
  const result = await gh(["run", "view", String(id), "--json", "status,conclusion,url"]);
  if (result.code !== 0) return undefined;
  try {
    const state = JSON.parse(result.stdout) as Partial<RunState>;
    return typeof state.status === "string"
      ? { conclusion: state.conclusion ?? "", status: state.status, url: state.url ?? "" }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Follows run `id`, the one this command started or found, to its end, and returns how it ended.
 * It waits for GitHub to list the run first: right after `gh workflow run`, a lookup of the new
 * run can still answer 404. Then it shows the run's progress with `gh run watch`, and watches
 * again when that stops while the run is going. It throws when GitHub doesn't return the run for
 * `limits.lookup`, so no caller reports on a run it never saw.
 */
export async function followRun(
  id: number,
  context: WatchContext,
  limits: WatchLimits = watchLimits,
): Promise<RunState> {
  const { gh, sleep, now } = context;
  let seen = false;
  let watched = false;
  let lastAnswer = now();
  for (;;) {
    const state = await viewRun(id, context);
    if (state === undefined) {
      if (now() - lastAnswer >= limits.lookup) {
        const waited = `${Math.round(limits.lookup / 60_000)} minutes`;
        throw new Error(
          seen
            ? `GitHub stopped returning run ${id} for ${waited}, so its result is unknown. It may still be running: see the Actions tab, and run this again to pick it up.`
            : `GitHub doesn't list run ${id}, ${waited} after it started. Nothing is known about it: see the Actions tab.`,
        );
      }
      await sleep(limits.retry);
      continue;
    }
    seen = true;
    lastAnswer = now();
    if (state.status === "completed") return state;
    // The watch stopped while the run is going, on an error of its own: pause, then watch again.
    if (watched) await sleep(limits.rewatch);
    await gh(["run", "watch", String(id), "--interval", "30"], { inherit: true });
    watched = true;
    lastAnswer = now();
  }
}

/**
 * Whether a run passed. It throws for a run that hasn't ended or has no conclusion, so a report
 * never calls a run that is still going failed, or prints an empty conclusion.
 */
export function runPassed(state: RunState): boolean {
  if (state.status !== "completed" || state.conclusion === "") {
    throw new Error(
      `The run hasn't ended (status: ${state.status || "unknown"}, no conclusion), so there's no result to report${state.url ? `: ${state.url}` : "."}`,
    );
  }
  return state.conclusion === "success";
}

/** A release workflow run, as `gh run list --json` prints it, with what tells one start from another. */
export interface ListedRun {
  readonly databaseId: number;
  readonly displayTitle: string;
  readonly headBranch: string;
  readonly event: string;
  readonly createdAt: string;
}

/** How far GitHub's clock and the laptop's may differ. */
const clockSkew = 60_000;

/**
 * The run a `gh workflow run` at `since` started, among the workflow's runs: it has the title, it
 * was started by hand on `branch`, and it's no older than the command. An earlier run of the same
 * version, such as yesterday's dry run, doesn't match.
 */
export function startedRun<Run extends ListedRun>(
  runs: readonly Run[],
  wanted: { readonly title: string; readonly branch: string; readonly since: number },
): Run | undefined {
  return runs.find(
    (run) =>
      run.displayTitle === wanted.title &&
      run.headBranch === wanted.branch &&
      run.event === "workflow_dispatch" &&
      Date.parse(run.createdAt) >= wanted.since - clockSkew,
  );
}
