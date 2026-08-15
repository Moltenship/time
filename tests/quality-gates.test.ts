import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

interface WorkflowStep {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
}

interface Workflow {
  readonly concurrency?: {
    readonly "cancel-in-progress"?: boolean;
    readonly group?: string;
  };
  readonly jobs?: Record<string, { readonly steps?: readonly WorkflowStep[] }>;
  readonly permissions?: Record<string, string>;
}

const expectedGateCommands = [
  "vp install --frozen-lockfile",
  "vp run ci:check",
  "vp run ci:build",
  "vp run ci:test",
  "vp run ssr:smoke",
  "vp run registry:smoke",
  "vp run package:graph",
] as const;

describe("CI quality gate contract", () => {
  test("workflow uses the supported Vite+ setup and locally reproducible named tasks", async () => {
    const workflow = parse(await readFile(".github/workflows/ci.yml", "utf8")) as Workflow;
    const steps = workflow.jobs?.["quality-gates"]?.steps ?? [];

    expect(steps.map(({ uses }) => uses).filter(Boolean)).toEqual([
      "actions/checkout@v6",
      "voidzero-dev/setup-vp@v1",
    ]);
    expect(steps.find(({ uses }) => uses === "voidzero-dev/setup-vp@v1")?.with).toMatchObject({
      "node-version": "26",
      cache: true,
    });
    expect(steps.map(({ run }) => run).filter(Boolean)).toEqual(expectedGateCommands);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toMatchObject({
      group: "${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    });
  });

  test("the default ready command delegates to every named gate", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      readonly scripts: Record<string, string>;
    };

    for (const command of expectedGateCommands.slice(1)) {
      expect(manifest.scripts.ready).toContain(command);
    }
  });
});
