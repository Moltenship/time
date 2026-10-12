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
  | {
      readonly command: string | readonly string[];
      readonly dependsOn?: readonly string[];
    };

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

const commandsOf = (task: Task): readonly string[] =>
  typeof task === "string" ? [task] : "command" in task ? [task.command].flat() : task;
const dependenciesOf = (task: Task): readonly string[] =>
  typeof task === "object" && "dependsOn" in task ? (task.dependsOn ?? []) : [];

/** A tier or a group of steps: it only depends on its steps, and says so when they pass. */
const isGroup = (task: Task) =>
  dependenciesOf(task).length > 0 &&
  commandsOf(task).every((command) => command.startsWith("echo "));

/**
 * Every step a task runs, all the way down: the tasks it depends on, the tasks and package tasks
 * (`pkg#task`) its commands run with `vp run`, and the commands themselves.
 */
function stepsOf(name: string): Set<string> {
  const task = tasks[name];
  if (task === undefined) throw new Error(`no root task named ${name}`);
  const direct = [
    ...dependenciesOf(task),
    ...commandsOf(task)
      .flatMap((command) => command.split("&&"))
      .map((command) => command.trim())
      .filter((command) => !isGroup(task) || !command.startsWith("echo "))
      .map((command) => /^vp run(?: -\S+)* ([\w:#@./-]+)/u.exec(command)?.[1] ?? command),
  ];
  return new Set(direct.flatMap((step) => (step in tasks ? [step, ...stepsOf(step)] : [step])));
}

/** The steps that do work, without the groups around them. */
const work = (name: string) =>
  [...stepsOf(name)].filter((step) => !(step in tasks) || !isGroup(tasks[step]!));

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
      "vp run --last-details",
    ]);
    expect(Object.keys(workflow.jobs ?? {})).toEqual([
      "quality-gates",
      "accessibility",
      "browsers",
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
      "vp run --last-details",
    ]);
  });

  test("Firefox and WebKit, part of the full gate, run on demand in a job of their own", async () => {
    const job = (await readWorkflow()).jobs?.browsers as
      | { readonly if?: string; readonly steps?: readonly WorkflowStep[] }
      | undefined;

    expect(job?.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(job?.steps?.map(({ run }) => run).filter(Boolean)).toEqual([
      "vp install --frozen-lockfile",
      "vp exec --filter a11y playwright install --with-deps firefox webkit",
      "vp run browsers",
      "vp run --last-details",
    ]);
    expect(work("ready:full")).toContain("browsers");
  });

  test("a pull request's two jobs are `vp run ready`, which runs every named gate", () => {
    expect(tasks["ready"]).toMatchObject({ dependsOn: ["ready:checks", "a11y"] });
    expect([...stepsOf("ready")]).toEqual(expect.arrayContaining([...prGates]));
  });

  test("the full gate runs every step the PR tier runs", () => {
    const full = new Set(work("ready:full"));

    expect(work("ready").filter((step) => !full.has(step))).toEqual([]);
    expect([...full]).toEqual(
      expect.arrayContaining([
        "a11y:ci-speed",
        "showcase:types",
        "showcase#search:check",
        "registry:e2e",
      ]),
    );
  });

  test("the PR tier runs every step the quick tier runs", () => {
    const pr = new Set(work("ready"));
    const quick = commandsOf(tasks["ready:quick"]!).map(
      (command) => /^vp run ([\w:#@./-]+)$/u.exec(command)?.[1] ?? command,
    );

    expect(quick.filter((step) => !pr.has(step))).toEqual([]);
  });

  test("groups only gather steps, so the comparison sees every one", () => {
    for (const name of ["ready", "ready:checks", "ready:full"]) {
      expect(isGroup(tasks[name]!)).toBe(true);
    }
  });
});
