import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

import { firefoxJob } from "../src/release";

interface Step {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
  readonly env?: Record<string, string>;
}

interface Job {
  readonly name?: string;
  readonly if?: string;
  readonly "runs-on"?: string;
  readonly "timeout-minutes"?: number;
  readonly environment?: string;
  readonly permissions?: Record<string, string>;
  readonly steps: readonly Step[];
}

interface Workflow {
  readonly permissions: Record<string, string>;
  readonly jobs: Record<string, Job>;
}

const workflows = resolve(import.meta.dirname, "../../../.github/workflows");

const runs = (job: Job | undefined) => job?.steps.map(({ run }) => run).filter(Boolean);

describe("no workflow publishes", () => {
  test("no workflow publishes: the owner releases from a laptop with vp run release", async () => {
    const files = await readdir(workflows);

    expect(files).not.toContain("release.yml");
    for (const file of files) {
      const text = await readFile(resolve(workflows, file), "utf8");
      // No npm credentials and no publish step. (Pullfrog's workflow mints an OIDC token of its
      // own, so id-token alone says nothing.)
      expect(text, file).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|environment: npm/);
      expect(text, file).not.toMatch(/\bpublish\b/);
    }
  });

  test("CI's on-demand release-gate job rehearses the gate on a fresh runner, read-only", async () => {
    const ci = parse(await readFile(resolve(workflows, "ci.yml"), "utf8")) as Workflow;
    const rehearsal = ci.jobs["release-gate"];

    expect(rehearsal?.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(rehearsal?.["runs-on"]).toBe("ubuntu-latest");
    expect(rehearsal?.["timeout-minutes"]).toBe(30);
    // Firefox and WebKit too: Playwright's Firefox doesn't start on macOS 27 (#182).
    expect(runs(rehearsal)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps --only-shell chromium firefox webkit",
      "vp run release:gate",
      "vp run --last-details",
    ]);
    expect(rehearsal?.environment).toBeUndefined();
    expect(rehearsal?.permissions).toBeUndefined();
    expect(ci.permissions).toEqual({ contents: "read" });
    for (const step of rehearsal?.steps ?? []) {
      expect(step.run ?? "").not.toContain("${{");
      if (step.uses?.startsWith("actions/checkout@")) {
        expect(step.with?.["persist-credentials"]).toBe(false);
      }
    }
  });

  test("the release command checks for CI's Firefox job by the name ci.yml gives it", async () => {
    const ci = parse(await readFile(resolve(workflows, "ci.yml"), "utf8")) as Workflow;

    expect(ci.jobs.browsers?.name).toBe(firefoxJob);
    expect(runs(ci.jobs.browsers)).toContain("vp run browsers");
  });
});
