import { describe, expect, test } from "vite-plus/test";

import { suggestVersion } from "../src/notes";
import {
  ciState,
  nextStep,
  publishJob,
  publishStarted,
  pushRuleProblems,
  runTitle,
  type WorkflowRun,
} from "../src/release";

const run = (status: string, conclusion: string, databaseId = 1): WorkflowRun => ({
  databaseId,
  status,
  conclusion,
  url: `https://github.com/Moltenship/time/actions/runs/${databaseId}`,
});

describe("what a release does about a version's runs", () => {
  test("starts a run when there's none", () => {
    expect(nextStep([], false)).toEqual({ action: "dispatch" });
  });

  test("watches one that's going, and stops at one that released", () => {
    expect(nextStep([run("in_progress", ""), run("completed", "failure", 2)], true)).toEqual({
      action: "watch",
      run: run("in_progress", ""),
    });
    expect(nextStep([run("completed", "success")], false)).toEqual({
      action: "released",
      run: run("completed", "success"),
    });
  });

  test("runs a failed run's jobs again once it started publishing, and starts afresh before", () => {
    expect(nextStep([run("completed", "failure")], true)).toEqual({
      action: "rerun",
      run: run("completed", "failure"),
    });
    expect(nextStep([run("completed", "cancelled")], true).action).toBe("rerun");
    // Nothing reached npm: a new run starts from main as it is, with whatever fixed it.
    expect(nextStep([run("completed", "failure")], false)).toEqual({ action: "dispatch" });
  });

  test("a run started publishing once its publish job ran, whatever came of it", () => {
    const job = (status: string, conclusion: string) => ({
      databaseId: 1,
      name: publishJob,
      status,
      conclusion,
    });

    expect(publishStarted([job("completed", "failure")])).toBe(true);
    expect(publishStarted([job("completed", "success")])).toBe(true);
    expect(publishStarted([job("completed", "skipped")])).toBe(false);
    expect(publishStarted([{ ...job("completed", "failure"), name: "Release gate" }])).toBe(false);
  });

  test("a run's title names the version, and a dry run says so", () => {
    expect(runTitle("1.0.0-rc.2", false)).toBe("Release v1.0.0-rc.2");
    expect(runTitle("1.0.0-rc.2", true)).toBe("Release v1.0.0-rc.2 (dry run)");
  });
});

describe("main's rules", () => {
  test("only rules that refuse a fast-forward push stop the release", () => {
    expect(pushRuleProblems([], false)).toEqual([]);
    expect(pushRuleProblems([{ type: "deletion" }, { type: "non_fast_forward" }], false)).toEqual(
      [],
    );
    expect(
      pushRuleProblems([{ type: "pull_request" }, { type: "required_status_checks" }], false),
    ).toEqual([
      "main's rules would refuse the release workflow's push of the release commit: pull_request, required_status_checks.",
    ]);
    expect(pushRuleProblems([], true)).toEqual([
      "main has branch protection, which may refuse the release workflow's push of the release commit.",
    ]);
  });
});

describe("CI on the commit a release starts from", () => {
  test("reads the newest run that wasn't cancelled", () => {
    expect(ciState([]).state).toBe("missing");
    expect(ciState([run("completed", "success")]).state).toBe("passed");
    expect(ciState([run("in_progress", ""), run("completed", "success", 2)]).state).toBe("running");
    expect(ciState([run("completed", "cancelled"), run("completed", "success", 2)])).toEqual({
      state: "passed",
      run: run("completed", "success", 2),
    });
    expect(ciState([run("completed", "failure"), run("completed", "success", 2)]).state).toBe(
      "failed",
    );
  });
});

describe("the suggested version", () => {
  const commits = (...types: string[]) =>
    types.map((type) => ({ type: type.replace("!", ""), isBreaking: type.endsWith("!") }));

  test("a prerelease moves to the next one, with the stable version beside it", () => {
    expect(suggestVersion("1.0.0-rc.1", commits("feat!", "fix"))).toEqual({
      version: "1.0.0-rc.2",
      reason:
        "1 breaking change, 1 other commit since 1.0.0-rc.1; the next prerelease, or 1.0.0 when it's ready",
      alternatives: ["1.0.0"],
    });
  });

  test("a stable version bumps by the commits: breaking, feature, or the rest", () => {
    expect(suggestVersion("1.2.3", commits("feat!", "feat", "fix")).version).toBe("2.0.0");
    expect(suggestVersion("1.2.3", commits("feat", "fix"))).toEqual({
      version: "1.3.0",
      reason: "1 feature, 1 other commit since 1.2.3: a minor release",
      alternatives: ["1.2.4", "2.0.0", "1.3.0-rc.1"],
    });
    expect(suggestVersion("1.2.3", commits("fix", "docs")).version).toBe("1.2.4");
    expect(suggestVersion("1.2.3", []).version).toBe("1.2.4");
    // Before 1.0, a breaking change takes a minor release.
    expect(suggestVersion("0.4.1", commits("fix!")).version).toBe("0.5.0");
  });
});
