import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { suggestVersion } from "../src/notes";
import { runOrThrow } from "../src/workspace";
import {
  bumpsOnly,
  ciState,
  pushRuleProblems,
  releaseStage,
  releaseSubject,
  type Checkout,
  type WorkflowRun,
} from "../src/release";

const main = "a".repeat(40);
const bumped = "b".repeat(40);

/** A clean checkout of main, at 1.0.0-rc.1, before anything of 1.0.0-rc.2. */
const fresh: Checkout = {
  branch: "main",
  clean: true,
  head: main,
  subject: "feat(react): add a hook (#260)",
  bumpsOnly: false,
  originMain: main,
  headOnMain: true,
  current: "1.0.0-rc.1",
  served: "none",
  tagInHistory: false,
};

describe("where a release starts", () => {
  test("bumps on a clean main that is origin/main", () => {
    expect(releaseStage(fresh, "1.0.0-rc.2")).toEqual({
      stage: { kind: "bump" },
      blockers: [],
      problems: [],
    });
  });

  test("a dry run can go on from a branch or an unpushed commit; a release can't", () => {
    const branch = { ...fresh, branch: "feature", head: bumped, headOnMain: false };

    expect(releaseStage(branch, "1.0.0-rc.2")).toEqual({
      stage: { kind: "bump" },
      blockers: [],
      problems: [
        "The checkout is on feature, not main.",
        "HEAD has commits origin/main doesn't. Land them through a PR first.",
      ],
    });
    expect(releaseStage({ ...fresh, head: bumped }, "1.0.0-rc.2").problems).toEqual([
      "HEAD is behind origin/main. Pull first.",
    ]);
  });

  test("stops even a dry run on changes, a version that doesn't go up, or a tag that exists", () => {
    expect(releaseStage({ ...fresh, clean: false }, "1.0.0-rc.2").blockers).toEqual([
      "The working tree has changes. Commit or stash them first.",
    ]);
    expect(releaseStage(fresh, "1.0.0-rc.0").blockers).toEqual([
      "1.0.0-rc.0 must be above the current 1.0.0-rc.1.",
    ]);
    // rc.1 is released at an older commit, which HEAD has.
    expect(
      releaseStage(
        { ...fresh, remoteTag: bumped, localTag: bumped, tagInHistory: true },
        "1.0.0-rc.1",
      ).stage,
    ).toEqual({ kind: "tagged", commit: bumped });
    expect(
      releaseStage({ ...fresh, current: "1.0.0-rc.2", remoteTag: bumped }, "1.0.0-rc.2").blockers,
    ).toEqual(["v1.0.0-rc.2 exists already, at bbbbbbb. Pick a version above 1.0.0-rc.2."]);
    expect(
      releaseStage({ ...fresh, remoteTag: bumped, tagInHistory: true }, "1.0.0-rc.2").blockers,
    ).toEqual(["v1.0.0-rc.2 exists already, at bbbbbbb. Pick a version above 1.0.0-rc.2."]);
    expect(
      releaseStage(
        { ...fresh, current: "1.0.0-rc.2", localTag: main, remoteTag: bumped, tagInHistory: true },
        "1.0.0-rc.2",
      ).blockers,
    ).toEqual(["v1.0.0-rc.2 is aaaaaaa here, but bbbbbbb on GitHub."]);
  });

  test("picks up from the release commit a stopped run left, before or after its tag", () => {
    const stopped = {
      ...fresh,
      head: bumped,
      subject: releaseSubject("1.0.0-rc.2"),
      bumpsOnly: true,
      headOnMain: false,
      current: "1.0.0-rc.2",
    };

    expect(releaseStage(stopped, "1.0.0-rc.2")).toEqual({
      stage: { kind: "bumped", commit: bumped },
      blockers: [],
      problems: [],
    });
    expect(
      releaseStage({ ...stopped, localTag: bumped, tagInHistory: true }, "1.0.0-rc.2"),
    ).toEqual({ stage: { kind: "tagged", commit: bumped }, blockers: [], problems: [] });
  });

  test("won't take a commit titled as the release that changes more than the versions", () => {
    const titled = {
      ...fresh,
      head: bumped,
      subject: releaseSubject("1.0.0-rc.2"),
      headOnMain: false,
      current: "1.0.0-rc.2",
    };

    expect(releaseStage(titled, "1.0.0-rc.2").blockers).toEqual([
      "HEAD is titled chore(release): v1.0.0-rc.2, but it changes more than the nine versions.",
    ]);
  });

  test("won't bump to a version npm serves, from a release this checkout didn't make", () => {
    expect(releaseStage({ ...fresh, served: "some" }, "1.0.0-rc.2").blockers).toEqual([
      "npm already serves 1.0.0-rc.2, from a release this checkout has no commit or tag for. Finish it from the checkout that published it, or pick a version above 1.0.0-rc.2.",
    ]);
  });

  test("finishes from the tagged release commit checked out on its own", () => {
    const detached = {
      ...fresh,
      branch: "",
      head: bumped,
      headOnMain: true,
      current: "1.0.0-rc.2",
      remoteTag: bumped,
      tagInHistory: true,
    };

    expect(releaseStage(detached, "1.0.0-rc.2")).toEqual({
      stage: { kind: "tagged", commit: bumped },
      blockers: [],
      problems: [],
    });
    expect(releaseStage({ ...detached, head: main }, "1.0.0-rc.2").problems).toEqual([
      "The checkout is on a detached HEAD, not main.",
    ]);
  });

  test("releases a version bump that landed on main through a PR", () => {
    expect(releaseStage({ ...fresh, current: "1.0.0-rc.2" }, "1.0.0-rc.2").stage).toEqual({
      kind: "bumped",
      commit: main,
    });
    expect(
      releaseStage(
        { ...fresh, current: "1.0.0-rc.2", head: bumped, headOnMain: false },
        "1.0.0-rc.2",
      ).blockers,
    ).toEqual([
      "The packages are at 1.0.0-rc.2 already, but HEAD is neither its release commit nor origin/main.",
    ]);
  });

  test("the release commit is a Conventional Commit", () => {
    expect(releaseSubject("1.0.0-rc.2")).toBe("chore(release): v1.0.0-rc.2");
  });
});

describe("a release commit", () => {
  test("changes only the versions of the published manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "release-commit-"));
    const git = (...args: string[]) => runOrThrow("git", args, { cwd: root });
    const manifest = (version: string, extra = "") =>
      `{\n  "name": "@x/a",\n  "version": "${version}",\n  "private": false${extra}\n}\n`;
    const commit = async (subject: string) => {
      await git("add", "-A");
      await git(
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "--no-verify",
        "-m",
        subject,
      );
    };
    try {
      await git("init", "--quiet");
      await writeFile(join(root, "a.json"), manifest("1.0.0-rc.1"));
      await writeFile(join(root, "b.json"), manifest("1.0.0-rc.1"));
      await commit("feat: start");

      await writeFile(join(root, "a.json"), manifest("1.0.0-rc.2"));
      await writeFile(join(root, "b.json"), manifest("1.0.0-rc.2"));
      await commit("chore(release): v1.0.0-rc.2");
      expect(await bumpsOnly(["a.json", "b.json"], root)).toBe(true);
      // Every manifest, and nothing else.
      expect(await bumpsOnly(["a.json", "b.json", "c.json"], root)).toBe(false);

      await writeFile(join(root, "a.json"), manifest("1.0.0-rc.3", ',\n  "main": "x.js"'));
      await writeFile(join(root, "b.json"), manifest("1.0.0-rc.3"));
      await commit("chore(release): v1.0.0-rc.3");
      expect(await bumpsOnly(["a.json", "b.json"], root)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
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
      "main's rules would refuse a direct push of the release commit: pull_request, required_status_checks.",
    ]);
    expect(pushRuleProblems([], true)).toEqual([
      "main has branch protection, which may refuse a direct push of the release commit.",
    ]);
  });
});

describe("CI on the release's commit", () => {
  const run = (status: string, conclusion: string, databaseId = 1): WorkflowRun => ({
    databaseId,
    status,
    conclusion,
    url: `https://github.com/Moltenship/time/actions/runs/${databaseId}`,
  });

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
