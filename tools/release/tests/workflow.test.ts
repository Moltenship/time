import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

interface Step {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
}

interface Workflow {
  readonly on: Record<
    string,
    { readonly inputs?: Record<string, { readonly required?: boolean }> }
  >;
  readonly permissions: Record<string, string>;
  readonly concurrency: { readonly group: string; readonly "cancel-in-progress": boolean };
  readonly jobs: Record<string, { readonly if?: string; readonly steps: readonly Step[] }>;
}

const workflowPath = resolve(import.meta.dirname, "../../../.github/workflows/release.yml");

async function readWorkflow(): Promise<Workflow> {
  return parse(await readFile(workflowPath, "utf8")) as Workflow;
}

describe("release workflow contract", () => {
  test("runs only when started by hand, with the version as a required input", async () => {
    const workflow = await readWorkflow();

    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch?.inputs?.version?.required).toBe(true);
    expect(workflow.on.workflow_dispatch?.inputs?.tag?.required).toBe(false);
    expect(workflow.concurrency).toEqual({ group: "release", "cancel-in-progress": false });
  });

  test("reads the repository and signs provenance, nothing more", async () => {
    expect((await readWorkflow()).permissions).toEqual({ contents: "read", "id-token": "write" });
  });

  test("publishes only from main, through the same local tasks", async () => {
    const workflow = await readWorkflow();
    const [job] = Object.values(workflow.jobs);

    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    expect(job?.if).toBe("github.ref == 'refs/heads/main'");
    expect(job?.steps.map(({ run }) => run).filter(Boolean)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps --only-shell chromium",
      "vp run ready",
      'vp run release:dry-run --version "$VERSION"',
      'vp run release:publish --version "$VERSION" ${TAG:+--tag "$TAG"} --provenance --yes',
    ]);
  });

  test("passes inputs through the environment, never into the script text", async () => {
    for (const step of Object.values((await readWorkflow()).jobs).flatMap(({ steps }) => steps)) {
      expect(step.run ?? "").not.toContain("${{");
    }
  });
});
