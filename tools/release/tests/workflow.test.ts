import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

interface Step {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
  readonly env?: Record<string, string>;
}

interface Job {
  readonly if?: string;
  readonly needs?: string;
  readonly environment?: string;
  readonly permissions?: Record<string, string>;
  readonly steps: readonly Step[];
}

interface Workflow {
  readonly on: Record<
    string,
    {
      readonly inputs?: Record<string, { readonly required?: boolean; readonly default?: unknown }>;
    }
  >;
  readonly permissions: Record<string, string>;
  readonly concurrency: { readonly group: string; readonly "cancel-in-progress": boolean };
  readonly jobs: Record<string, Job>;
}

const workflowPath = resolve(import.meta.dirname, "../../../.github/workflows/release.yml");

async function readWorkflow(): Promise<Workflow> {
  return parse(await readFile(workflowPath, "utf8")) as Workflow;
}

const runs = (job: Job | undefined) => job?.steps.map(({ run }) => run).filter(Boolean);

describe("release workflow contract", () => {
  test("runs only when started by hand; publishing is an explicit input that defaults to off", async () => {
    const workflow = await readWorkflow();
    const inputs = workflow.on.workflow_dispatch?.inputs;

    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(inputs?.version?.required).toBe(true);
    expect(inputs?.tag?.required).toBe(false);
    expect(inputs?.publish?.default).toBe(false);
    expect(workflow.concurrency).toEqual({ group: "release", "cancel-in-progress": false });
  });

  test("checks with read-only access, through the same tasks as a local release", async () => {
    const workflow = await readWorkflow();
    const verify = workflow.jobs.verify;

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(verify?.permissions).toBeUndefined();
    expect(verify?.if).toBe("github.ref == 'refs/heads/main'");
    expect(runs(verify)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps --only-shell chromium",
      "vp run a11y",
      "vp run release:gate",
      "vp run --last-details",
    ]);
    const gate = verify?.steps.find(({ run }) => run === "vp run release:gate");
    expect(gate?.env).toEqual({ RELEASE_VERSION: "${{ inputs.version }}" });
  });

  test("publishes the dry run's tarballs from a separate job that alone can sign provenance", async () => {
    const { jobs } = await readWorkflow();
    const publish = jobs.publish;

    expect(Object.keys(jobs)).toEqual(["verify", "publish"]);
    expect(publish?.needs).toBe("verify");
    expect(publish?.if).toBe("inputs.publish && github.ref == 'refs/heads/main'");
    expect(publish?.environment).toBe("npm");
    expect(publish?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(runs(publish)).toEqual([
      "vp install --frozen-lockfile --ignore-scripts",
      'vp run release:publish --version "$VERSION" ${TAG:+--tag "$TAG"} --provenance --yes',
    ]);
    const upload = jobs.verify?.steps.find(({ uses }) =>
      uses?.startsWith("actions/upload-artifact@"),
    );
    const download = publish?.steps.find(({ uses }) =>
      uses?.startsWith("actions/download-artifact@"),
    );
    expect(upload?.with).toMatchObject({
      name: "release",
      path: ".release/",
      "include-hidden-files": true,
    });
    expect(download?.with).toMatchObject({ name: "release", path: ".release" });
  });

  test("passes inputs through the environment, never into the script text", async () => {
    for (const step of Object.values((await readWorkflow()).jobs).flatMap(({ steps }) => steps)) {
      expect(step.run ?? "").not.toContain("${{");
      if (step.uses?.startsWith("actions/checkout@")) {
        expect(step.with?.["persist-credentials"]).toBe(false);
      }
    }
  });
});
