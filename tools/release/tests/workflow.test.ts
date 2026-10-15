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

/** The jobs that can mint an OIDC token or write to the repository. */
const privileged = ["check", "publish", "finish"];

describe("the release workflow", () => {
  test("is the file each package's trusted publisher names, started by hand, one at a time", async () => {
    const workflow = await read(trustedPublisher.workflow);
    const inputs = workflow.on.workflow_dispatch?.inputs;

    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(inputs?.version).toMatchObject({ required: true, type: "string" });
    expect(inputs?.["dry-run"]).toMatchObject({ type: "boolean", default: false });
    expect(inputs?.commit).toMatchObject({ required: false, type: "string" });
    // Releases queue one behind another; dry runs apart, so one never displaces a release.
    expect(workflow.concurrency).toEqual({
      group: "${{ inputs.dry-run && 'release-dry-run' || 'release' }}",
      "cancel-in-progress": false,
    });
    // `vp run release` finds a version's runs by this title.
    expect(workflow["run-name"]).toBe(
      "Release v${{ inputs.version }}${{ inputs.dry-run && ' (dry run)' || '' }}",
    );
    expect(runTitle("1.0.0", true)).toBe("Release v1.0.0 (dry run)");
  });

  test("checks, gates, publishes, pushes, then installs; a dry run takes jobs without credentials", async () => {
    const { jobs } = await read("release.yml");

    expect(Object.keys(jobs)).toEqual([
      "check",
      "gate",
      "publish",
      "publish-dry-run",
      "finish",
      "finish-dry-run",
      "install",
    ]);
    expect(jobs.gate?.needs).toBe("check");
    expect(jobs.publish?.needs).toBe("gate");
    expect(jobs.publish?.name).toBe(publishJob);
    expect(jobs.finish?.needs).toBe("publish");
    expect(jobs.install?.needs).toBe("finish");
    expect(jobs["publish-dry-run"]?.needs).toBe("gate");
    expect(jobs["finish-dry-run"]?.needs).toBe("publish-dry-run");
    for (const name of ["publish", "finish", "install"]) {
      expect(jobs[name]?.if, name).toBe("${{ !inputs.dry-run }}");
    }
    for (const name of ["publish-dry-run", "finish-dry-run"]) {
      expect(jobs[name]?.if, name).toBe("${{ inputs.dry-run }}");
      expect(jobs[name]?.permissions, name).toBeUndefined();
      expect(jobs[name]?.steps.at(-1)?.env?.DRY_RUN, name).toBe("true");
    }
    // The jobs that publish and push never take the dry-run input: a dry run doesn't reach them.
    for (const name of ["publish", "finish"]) {
      expect(jobs[name]?.steps.at(-1)?.env?.DRY_RUN, name).toBeUndefined();
    }
  });

  test("only the check and publish jobs can mint an OIDC token, and only finish can write", async () => {
    const workflow = await read("release.yml");
    const { jobs } = workflow;

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(jobs.check?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(jobs.publish?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(jobs.finish?.permissions).toEqual({ contents: "write" });
    for (const [name, job] of Object.entries(jobs)) {
      if (!privileged.includes(name)) expect(job.permissions, name).toBeUndefined();
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
  });

  test("the jobs with credentials pin their actions, use no cache, and run no install scripts", async () => {
    const { jobs } = await read("release.yml");

    for (const name of [...privileged, "publish-dry-run", "finish-dry-run"]) {
      const job = jobs[name]!;
      for (const { uses } of job.steps) {
        if (uses) expect(uses, name).toMatch(/@[0-9a-f]{40}$/);
      }
      expect(job.steps.find(({ uses }) => uses?.includes("setup-vp"))?.with?.cache, name).toBe(
        false,
      );
      expect(runs(job)?.[0], name).toBe("vp install --frozen-lockfile --ignore-scripts");
    }
  });

  test("runs the release's own steps with node, and the gate through its task", async () => {
    const { jobs } = await read("release.yml");
    const step = (name: string) => `node --import tsx src/ci.ts ${name}`;

    expect(runs(jobs.check)?.at(-1)).toBe(step("check"));
    expect(runs(jobs.gate)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps --only-shell chromium firefox webkit",
      step("prepare"),
      "vp run release:gate",
      "vp run --last-details",
      step("package"),
    ]);
    expect(jobs.gate?.steps.find(({ run }) => run === "vp run release:gate")?.env).toEqual({
      RELEASE_VERSION: "${{ inputs.version }}",
    });
    for (const name of ["publish", "publish-dry-run"]) {
      expect(runs(jobs[name])?.at(-1), name).toBe(step("publish"));
    }
    for (const name of ["finish", "finish-dry-run"]) {
      expect(runs(jobs[name])?.at(-1), name).toBe(step("finish"));
    }
    for (const job of Object.values(jobs)) {
      for (const { run, ...rest } of job.steps) {
        if (run?.includes("src/ci.ts")) {
          expect((rest as { "working-directory"?: string })["working-directory"]).toBe(
            "tools/release",
          );
        }
      }
    }
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
    for (const name of ["publish", "publish-dry-run", "finish", "finish-dry-run"]) {
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
    expect(runs(rehearsal)).toEqual(runs(gate)?.filter((run) => !run?.includes("src/ci.ts")));
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
      if (file !== "release.yml") expect(text, file).not.toMatch(/\bpublish\b|src\/ci\.ts/);
    }
  });
});
