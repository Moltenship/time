import { describe, expect, test } from "vite-plus/test";

import { satisfies } from "semver";

import { checkProblems, type CheckFacts } from "../src/ci";
import { trustFromResponse, type Trust } from "../src/oidc";
import { distTagNpmRange } from "../src/next-tag";
import { pinnedNpm } from "../src/npm";
import { trustedPublishingNpm } from "../src/publish";
import { allowsDistTag, distTagReport, trustsRelease } from "../src/trust";

const trusted: Trust = { verdict: "trusted" };

const ready: CheckFacts = {
  version: "1.0.0-rc.2",
  current: "1.0.0-rc.1",
  ref: "refs/heads/main",
  sha: "a".repeat(40),
  mainVersion: "1.0.0-rc.1",
  served: [],
  trust: new Map([
    ["@x/a", trusted],
    ["@x/b", trusted],
  ]),
};

describe("the release workflow's check", () => {
  test("lets a new version through from main, with every package trusting the workflow", () => {
    expect(checkProblems(ready)).toEqual({ blockers: [], problems: [] });
  });

  test("stops a stable version whose docs would still install @next, and no pre-release", () => {
    const taggedDocs = ["docs/setup.md:12", "packages/ics/README.md:16"];
    const stable = { ...ready, version: "1.0.0", taggedDocs };

    expect(checkProblems(stable)).toEqual({
      blockers: [],
      problems: [
        "1.0.0 is a stable version, which npm serves as latest, but these lines still install @next, the pre-release tag, or say it is a pre-release: docs/setup.md:12, packages/ics/README.md:16. Take that out of them, or put a docs page's sentence in <PreRelease>.",
      ],
    });
    expect(checkProblems({ ...stable, taggedDocs: [] }).problems).toEqual([]);
    expect(checkProblems({ ...ready, taggedDocs }).problems).toEqual([]);
  });

  test("stops even a dry run on a version that doesn't go up", () => {
    expect(checkProblems({ ...ready, version: "1.0.0-rc.1" }).blockers).toEqual([
      "1.0.0-rc.1 must be above 1.0.0-rc.1, the version the packages have.",
    ]);
  });

  test.each<[string, Partial<CheckFacts>, string]>([
    [
      "another branch",
      { ref: "refs/heads/feature" },
      "A release runs from main, not refs/heads/feature.",
    ],
    [
      "main moving between the check and the start",
      { expected: "b".repeat(40) },
      "This run builds on aaaaaaa, not bbbbbbb, the commit vp run release checked",
    ],
    [
      "a release landing while it queued",
      { mainVersion: "1.0.0-rc.2" },
      "main is at 1.0.0-rc.2 now, not 1.0.0-rc.1 as when this run started",
    ],
    [
      "a tag that exists",
      { remoteTag: "e5272cdbff099a2c0d8e06e3415f154eee2a22c5" },
      "v1.0.0-rc.2 is on GitHub already, at e5272cd. Pick a version above 1.0.0-rc.2.",
    ],
    [
      "a version npm has",
      { served: ["@x/a"] },
      "npm already has 1.0.0-rc.2 of @x/a. If a release run published them and failed later, vp run release 1.0.0-rc.2 runs its failed jobs again",
    ],
    [
      "a package without a trusted publisher",
      {
        trust: new Map<string, Trust>([
          ["@x/a", trusted],
          ["@x/b", { verdict: "untrusted", detail: "npm answered 404" }],
        ]),
      },
      "npm has no trusted publisher for this workflow on @x/b (npm answered 404). Set them up once: vp run release:trust",
    ],
    [
      "npm not answering",
      {
        trust: new Map<string, Trust>([["@x/a", { verdict: "error", detail: "npm answered 503" }]]),
      },
      "Can't ask npm about @x/a: npm answered 503",
    ],
  ])("stops a release, and has a dry run report, %s", (_, change, message) => {
    const { blockers, problems } = checkProblems({ ...ready, ...change });

    expect(blockers).toEqual([]);
    expect(problems).toEqual([expect.stringContaining(message)]);
  });
});

describe("npm's answer to a trusted publisher's token exchange", () => {
  test("trusts the workflow when it hands out a token", () => {
    expect(trustFromResponse(201, '{"token":"npm_x"}')).toEqual({ verdict: "trusted" });
    expect(trustFromResponse(200, "{}").verdict).toBe("error");
  });

  test("doesn't on a 401, 403 or 404, and can't say on anything else", () => {
    expect(trustFromResponse(404, '{"message":"No trusted publisher"}')).toEqual({
      verdict: "untrusted",
      detail: "npm answered 404: No trusted publisher",
    });
    expect(trustFromResponse(403, "")).toEqual({
      verdict: "untrusted",
      detail: "npm answered 403",
    });
    expect(trustFromResponse(429, "").verdict).toBe("error");
    expect(trustFromResponse(503, "Service Unavailable")).toEqual({
      verdict: "error",
      detail: "npm answered 503: Service Unavailable",
    });
  });
});

describe("the owner's one-time setup", () => {
  test("skips a package whose trusted publisher is this repository's release workflow", () => {
    expect(
      trustsRelease('[{"type":"github","repository":"Moltenship/time","file":"release.yml"}]'),
    ).toBe(true);
    expect(
      trustsRelease('[{"type":"github","repository":"Moltenship/time","file":"ci.yml"}]'),
    ).toBe(false);
    expect(trustsRelease("")).toBe(false);
  });

  test("reads whether the trusted publisher allows npm dist-tag from npm trust list --json", () => {
    const listed = (permissions: readonly string[]) =>
      JSON.stringify({
        type: "github",
        repository: "Moltenship/time",
        file: "release.yml",
        permissions,
      });

    expect(allowsDistTag(listed(["createPackage", "manageDistTags"]))).toBe(true);
    expect(allowsDistTag(listed(["createPackage"]))).toBe(false);
    expect(allowsDistTag('{"type":"github","repository":"Moltenship/time"}')).toBeUndefined();
    expect(distTagReport(["@x/a", "@x/b"], [])).toEqual([
      expect.stringContaining('"Allow npm dist-tag" is off on @x/a, @x/b.'),
    ]);
    expect(distTagReport([], [])).toEqual([]);
  });
});

describe("the npm a release runs", () => {
  test("is the one the lockfile pins, and publishes and moves dist-tags through trusted publishing", () => {
    expect(pinnedNpm.command[0]).toBe(process.execPath);
    expect(pinnedNpm.command[1]).toMatch(/[/\\]npm[/\\]bin[/\\]npm-cli\.js$/u);
    expect(satisfies(pinnedNpm.version, `>=${trustedPublishingNpm}`)).toBe(true);
    expect(satisfies(pinnedNpm.version, distTagNpmRange)).toBe(true);
  });
});
