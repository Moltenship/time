import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

import { publishJob, runTitle } from "../src/release";
import { trustedPublisher } from "../src/trust";

interface Step {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
  readonly env?: Record<string, string>;
}

interface Job {
  readonly name?: string;
  readonly needs?: string;
  readonly if?: string;
  readonly "runs-on"?: string;
  readonly "timeout-minutes"?: number;
  readonly environment?: string;
  readonly permissions?: Record<string, string>;
  readonly steps: readonly Step[];
}

interface Workflow {
  readonly "run-name"?: string;
  readonly on: Record<
    string,
    {
      readonly inputs?: Record<
        string,
        { readonly required?: boolean; readonly type?: string; readonly default?: unknown }
      >;
    }
  >;
  readonly permissions: Record<string, string>;
  readonly concurrency?: { readonly group: string; readonly "cancel-in-progress": boolean };
  readonly jobs: Record<string, Job>;
}

const workflows = resolve(import.meta.dirname, "../../../.github/workflows");

async function read(file: string): Promise<Workflow> {
  return parse(await readFile(resolve(workflows, file), "utf8")) as Workflow;
}

const runs = (job: Job | undefined) => job?.steps.map(({ run }) => run).filter(Boolean);

describe("the release workflow", () => {
  test("is the file each package's trusted publisher names, started by hand, one at a time", async () => {
    const workflow = await read(trustedPublisher.workflow);
    const inputs = workflow.on.workflow_dispatch?.inputs;

    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(inputs?.version).toMatchObject({ required: true, type: "string" });
    expect(inputs?.["dry-run"]).toMatchObject({ type: "boolean", default: false });
    expect(workflow.concurrency).toEqual({ group: "release", "cancel-in-progress": false });
    // `vp run release` finds a version's runs by this title.
    expect(workflow["run-name"]).toBe(
      "Release v${{ inputs.version }}${{ inputs.dry-run && ' (dry run)' || '' }}",
    );
    expect(runTitle("1.0.0", true)).toBe("Release v1.0.0 (dry run)");
  });

  test("checks, gates, publishes, pushes, then installs, each job after the one before", async () => {
    const { jobs } = await read("release.yml");

    expect(Object.keys(jobs)).toEqual(["check", "gate", "publish", "finish", "install"]);
    expect(jobs.gate?.needs).toBe("check");
    expect(jobs.publish?.needs).toBe("gate");
    expect(jobs.publish?.name).toBe(publishJob);
    expect(jobs.finish?.needs).toBe("publish");
    expect(jobs.install?.needs).toBe("finish");
    expect(jobs.install?.if).toBe("${{ !inputs.dry-run }}");
  });

  test("only the check and publish jobs can mint an OIDC token, and only finish can write", async () => {
    const workflow = await read("release.yml");
    const { jobs } = workflow;

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(jobs.check?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(jobs.gate?.permissions).toBeUndefined();
    expect(jobs.publish?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(jobs.finish?.permissions).toEqual({ contents: "write" });
    expect(jobs.install?.permissions).toBeUndefined();
    for (const [name, job] of Object.entries(jobs)) {
      // Trusted publishing needs no environment, and nothing waits for a reviewer.
      expect(job.environment, name).toBeUndefined();
      for (const step of job.steps) {
        // Inputs reach scripts through the environment, never their text.
        expect(step.run ?? "", name).not.toContain("${{");
        if (step.uses?.startsWith("actions/checkout@")) {
          expect(step.with?.["persist-credentials"], name).toBe(name === "finish");
        }
      }
    }
    // No install scripts where a job can publish or push.
    for (const name of ["check", "publish", "finish"]) {
      expect(runs(jobs[name])?.[0], name).toBe("vp install --frozen-lockfile --ignore-scripts");
    }
  });

  test("runs the steps through the same tasks as anywhere else", async () => {
    const { jobs } = await read("release.yml");

    expect(runs(jobs.check)).toContain("vp run release:ci check");
    expect(runs(jobs.gate)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps --only-shell chromium firefox webkit",
      "vp run release:ci prepare",
      "vp run release:gate",
      "vp run --last-details",
      "vp run release:ci package",
    ]);
    expect(jobs.gate?.steps.find(({ run }) => run === "vp run release:gate")?.env).toEqual({
      RELEASE_VERSION: "${{ inputs.version }}",
    });
    expect(runs(jobs.publish)?.at(-1)).toBe("vp run release:ci publish");
    expect(runs(jobs.finish)?.at(-1)).toBe("vp run release:ci finish");
    expect(runs(jobs.install)?.at(-1)).toBe("vp run registry:e2e");
    expect(jobs.install?.steps.at(-1)?.env).toEqual({ REGISTRY_E2E_PACKAGES: "npm" });

    // The gate's release, from one job to the next.
    const upload = jobs.gate?.steps.find(({ uses }) =>
      uses?.startsWith("actions/upload-artifact@"),
    );
    expect(upload?.with).toMatchObject({
      name: "release",
      path: ".release/",
      "include-hidden-files": true,
    });
    for (const name of ["publish", "finish"]) {
      const download = jobs[name]?.steps.find(({ uses }) =>
        uses?.startsWith("actions/download-artifact@"),
      );
      expect(download?.with, name).toMatchObject({ name: "release", path: ".release" });
    }
  });

  test("CI's on-demand release-gate job rehearses the gate on the same runner and setup", async () => {
    const ci = await read("ci.yml");
    const rehearsal = ci.jobs["release-gate"];
    const gate = (await read("release.yml")).jobs.gate;

    expect(rehearsal?.if).toBe("github.event_name == 'workflow_dispatch'");
    // The release job's steps, but the bump, the notes and the bundle.
    expect(runs(rehearsal)).toEqual(
      runs(gate)?.filter((run) => !run?.startsWith("vp run release:ci")),
    );
    expect(rehearsal?.["runs-on"]).toBe(gate?.["runs-on"]);
    expect(rehearsal?.["timeout-minutes"]).toBe(gate?.["timeout-minutes"]);
    const setup = (job: Job | undefined) =>
      job?.steps.find(({ uses }) => uses?.startsWith("voidzero-dev/setup-vp@"));
    expect(setup(rehearsal)).toEqual(setup(gate));
    expect(rehearsal?.permissions).toBeUndefined();
    expect(ci.permissions).toEqual({ contents: "read" });
  });

  test("nothing else publishes, and no workflow holds an npm token", async () => {
    for (const file of await readdir(workflows)) {
      const text = await readFile(resolve(workflows, file), "utf8");
      expect(text, file).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|environment: npm/);
      if (file !== "release.yml") expect(text, file).not.toMatch(/\bpublish\b|release:ci/);
    }
  });
});
