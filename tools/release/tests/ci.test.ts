import { describe, expect, test } from "vite-plus/test";

import { checkProblems, type CheckFacts } from "../src/ci";
import { trustFromResponse, type Trust } from "../src/oidc";
import { trustsRelease } from "../src/trust";

const trusted: Trust = { verdict: "trusted" };

const ready: CheckFacts = {
  version: "1.0.0-rc.2",
  current: "1.0.0-rc.1",
  ref: "refs/heads/main",
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

  test("doesn't on a 4xx, and can't say on anything else", () => {
    expect(trustFromResponse(404, '{"message":"No trusted publisher"}')).toEqual({
      verdict: "untrusted",
      detail: "npm answered 404: No trusted publisher",
    });
    expect(trustFromResponse(403, "")).toEqual({
      verdict: "untrusted",
      detail: "npm answered 403",
    });
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
});
