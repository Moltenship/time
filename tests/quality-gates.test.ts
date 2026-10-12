import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";
import { parse } from "yaml";

import config from "../vite.config";

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

type Task =
  | string
  | readonly string[]
  | { readonly command: string; readonly dependsOn?: string[] };

const tasks = (config.run?.tasks ?? {}) as Record<string, Task>;

/** The named gates every PR runs, before the tiers grew around them. */
const prGates = [
  "ci:check",
  "ci:build",
  "ci:test",
  "react:gate",
  "ssr:smoke",
  "registry:smoke",
  "package:graph",
  "a11y",
] as const;

/**
 * Every root task a task runs: those it depends on and those its command runs with `vp run`,
 * all the way down.
 */
function stepsOf(name: string): Set<string> {
  const task = tasks[name];
  if (task === undefined) throw new Error(`no root task named ${name}`);
  const commands =
    typeof task === "string" ? [task] : "command" in task ? [task.command] : [...task];
  const direct = [
    ...(typeof task === "object" && "dependsOn" in task ? (task.dependsOn ?? []) : []),
    ...commands
      .flatMap((command) => command.split("&&"))
      .map((command) => /^vp run ([\w:-]+)$/u.exec(command.trim())?.[1])
      .filter((step): step is string => step !== undefined && step in tasks),
  ];
  return new Set(direct.flatMap((step) => [step, ...stepsOf(step)]));
}

async function readWorkflow(): Promise<Workflow> {
  return parse(await readFile(".github/workflows/ci.yml", "utf8")) as Workflow;
}

describe("CI quality gate contract", () => {
  test("workflow uses the supported Vite+ setup and locally reproducible named tasks", async () => {
    const workflow = await readWorkflow();
    const steps = workflow.jobs?.["quality-gates"]?.steps ?? [];

    expect(steps.map(({ uses }) => uses).filter(Boolean)).toEqual([
      "actions/checkout@v6",
      "voidzero-dev/setup-vp@v1.21.1",
    ]);
    expect(steps.find(({ uses }) => uses === "voidzero-dev/setup-vp@v1.21.1")?.with).toMatchObject({
      "node-version": "26",
      cache: true,
    });
    expect(steps.map(({ run }) => run).filter(Boolean)).toEqual([
      "vp install --frozen-lockfile",
      "vp run ready:checks",
    ]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toMatchObject({
      group: "${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress": true,
    });
  });

  test("a separate job runs the axe checks in Chromium", async () => {
    const steps = (await readWorkflow()).jobs?.accessibility?.steps ?? [];

    expect(steps.map(({ run }) => run).filter(Boolean)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps --only-shell chromium",
      "vp run a11y",
    ]);
  });

  test("CI's two jobs are `vp run ready`, which runs every named gate", () => {
    expect(tasks["ready"]).toMatchObject({ dependsOn: ["ready:checks", "a11y"] });
    expect([...stepsOf("ready")]).toEqual(expect.arrayContaining([...prGates]));
  });

  test("the full gate runs every step the PR tier runs", () => {
    // Tiers group steps differently, so only the steps that do the work are compared.
    const work = (name: string) =>
      [...stepsOf(name)].filter((step) => {
        const task = tasks[step];
        return typeof task !== "object" || !("dependsOn" in task);
      });
    const full = new Set(work("ready:full"));

    expect(work("ready").filter((step) => !full.has(step))).toEqual([]);
    expect([...full]).toEqual(
      expect.arrayContaining(["a11y:ci-speed", "showcase:types", "showcase:links"]),
    );
  });
});
