import { describe, expect, test } from "vite-plus/test";

import {
  followRun,
  runPassed,
  startedRun,
  watchLimits,
  type ListedRun,
  type RunState,
  type WatchContext,
} from "../src/watch";

const url = "https://github.com/Moltenship/time/actions/runs/7";
const notFound = { code: 1, stderr: "failed to get run: HTTP 404: Not Found", stdout: "" };
const answer = (status: string, conclusion: string) => ({
  code: 0,
  stderr: "",
  stdout: JSON.stringify({ conclusion, status, url }),
});

/**
 * `gh` with scripted answers to `gh run view`, the last one repeating, and a clock that only a
 * pause moves. `watch` says how each `gh run watch` ends: 0 when it saw the run finish.
 */
function github(views: readonly (typeof notFound)[], watch: () => number = () => 0) {
  const calls: string[] = [];
  let time = 0;
  let viewed = 0;
  const context: WatchContext = {
    gh: async (args, options) => {
      calls.push(args.slice(0, 3).join(" "));
      if (args[1] === "watch") {
        expect(options?.inherit).toBe(true);
        return { code: watch(), stderr: "", stdout: "" };
      }
      const view = views[Math.min(viewed, views.length - 1)]!;
      viewed += 1;
      return view;
    },
    now: () => time,
    sleep: async (milliseconds) => {
      calls.push(`sleep ${milliseconds}`);
      time += milliseconds;
    },
  };
  return { calls, context, elapsed: () => time };
}

describe("following the run a release started", () => {
  test("waits for GitHub to list the run, then watches it to its end", async () => {
    // The lookup right after `gh workflow run` answers 404, twice, before GitHub has the run.
    const { calls, context } = github([
      notFound,
      notFound,
      answer("queued", ""),
      answer("completed", "success"),
    ]);

    expect(await followRun(7, context)).toEqual({
      conclusion: "success",
      status: "completed",
      url,
    });
    expect(calls).toEqual([
      "run view 7",
      `sleep ${watchLimits.retry}`,
      "run view 7",
      `sleep ${watchLimits.retry}`,
      "run view 7",
      "run watch 7",
      "run view 7",
    ]);
  });

  test("returns a run that failed as failed", async () => {
    const { context } = github([answer("in_progress", ""), answer("completed", "failure")]);

    const ended = await followRun(7, context);
    expect(ended.conclusion).toBe("failure");
    expect(runPassed(ended)).toBe(false);
  });

  test("gives up on a run that never appears, and says nothing is known about it", async () => {
    const { calls, context, elapsed } = github([notFound]);

    await expect(followRun(7, context)).rejects.toThrow(/doesn't list run 7.*Nothing is known/u);
    expect(elapsed()).toBe(watchLimits.lookup);
    expect(calls).not.toContain("run watch 7");
  });

  test("an answer that isn't a run counts as no answer", async () => {
    const { context } = github([{ code: 0, stderr: "", stdout: "Bad gateway" }]);

    await expect(followRun(7, context)).rejects.toThrow(/doesn't list run 7/u);
  });

  test("watches again when the watch stops and the run is still going", async () => {
    const watches = [1, 0];
    const { calls, context } = github(
      [answer("in_progress", ""), answer("in_progress", ""), answer("completed", "success")],
      () => watches.shift() ?? 0,
    );

    expect(runPassed(await followRun(7, context))).toBe(true);
    expect(calls).toEqual([
      "run view 7",
      "run watch 7",
      "run view 7",
      `sleep ${watchLimits.rewatch}`,
      "run watch 7",
      "run view 7",
    ]);
  });

  test("gives up when GitHub stops returning a run it had, without calling it failed", async () => {
    const { context } = github([answer("in_progress", ""), notFound]);

    await expect(followRun(7, context)).rejects.toThrow(
      /stopped returning run 7.*still be running/u,
    );
  });

  test("doesn't watch a run that has ended already", async () => {
    const { calls, context } = github([answer("completed", "success")]);

    await followRun(7, context);
    expect(calls).toEqual(["run view 7"]);
  });
});

describe("a run's result", () => {
  const state = (status: string, conclusion: string): RunState => ({ conclusion, status, url });

  test("is passed for success alone", () => {
    expect(runPassed(state("completed", "success"))).toBe(true);
    for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "neutral"]) {
      expect(runPassed(state("completed", conclusion)), conclusion).toBe(false);
    }
  });

  test("is an error for an empty conclusion, never a report of how the run ended", () => {
    expect(() => runPassed(state("completed", ""))).toThrow(/hasn't ended.*no conclusion/u);
    expect(() => runPassed(state("queued", ""))).toThrow(/status: queued/u);
    expect(() => runPassed(state("in_progress", ""))).toThrow(url);
    // A status without an end is no result either, whatever the conclusion field holds.
    expect(() => runPassed(state("in_progress", "success"))).toThrow(/hasn't ended/u);
  });
});

describe("the run a start made, when gh doesn't print it", () => {
  const since = Date.parse("2026-11-25T12:00:00Z");
  const listed = (databaseId: number, overrides: Partial<ListedRun> = {}): ListedRun => ({
    createdAt: "2026-11-25T12:00:04Z",
    databaseId,
    displayTitle: "Release v2.0.0 (dry run)",
    event: "workflow_dispatch",
    headBranch: "fix/release-watch-run",
    ...overrides,
  });
  const wanted = { branch: "fix/release-watch-run", since, title: "Release v2.0.0 (dry run)" };

  test("has the title, the branch and a start no older than the command", () => {
    const runs = [
      listed(5, { displayTitle: "Release v2.0.0" }),
      listed(4, { headBranch: "main" }),
      listed(3),
      // Yesterday's dry run of the same version, from the same branch.
      listed(2, { createdAt: "2026-11-24T12:00:00Z" }),
    ];
    expect(startedRun(runs, wanted)?.databaseId).toBe(3);
  });

  test("is none while GitHub lists only older runs", () => {
    expect(startedRun([listed(2, { createdAt: "2026-11-25T11:50:00Z" })], wanted)).toBeUndefined();
    expect(startedRun([], wanted)).toBeUndefined();
  });

  test("allows for a laptop's clock that runs ahead of GitHub's", () => {
    expect(startedRun([listed(3, { createdAt: "2026-11-25T11:59:30Z" })], wanted)?.databaseId).toBe(
      3,
    );
  });
});
