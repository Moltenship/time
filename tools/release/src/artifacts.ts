import { copyFile, mkdir, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import { isolatedWorkspace, lastLines, temporaryRoot, type IsolatedWorkspace } from "./isolated";
import {
  changedArtifacts,
  readCheckedManifest,
  registryDirectory,
  type ReleaseManifest,
} from "./manifest";
import { tarballDirectory } from "./pack";
import { parseArguments, run, runMain } from "./workspace";

interface ConsumerContext {
  readonly manifest: ReleaseManifest;
  /** Runs one named step; a failure names it. */
  readonly step: <T>(name: string, action: () => Promise<T>) => Promise<T>;
  /** Logs what a step showed, such as how many tests passed. */
  readonly note: (message: string | undefined) => void;
  /** Whether to keep what a consumer made, even when it passes. */
  readonly keep: boolean;
  /** Copies workspace folders into a clean workspace on the dry run's tarballs, kept if a step fails. */
  readonly isolate: (
    directories: readonly string[],
    options?: { readonly drop?: readonly string[] },
  ) => Promise<IsolatedWorkspace>;
}

export interface Consumer {
  readonly name: string;
  readonly run: (context: ConsumerContext) => Promise<void>;
}

/** Docs tests that compare the docs with package source, which a copy on the tarballs doesn't have. */
const sourceTests = ["tests/anatomy-source.test.ts", "tests/recurrence-api-reference.test.ts"];

/** Vitest's count of passed tests, or the output's last line. */
export function outcome(output: string): string | undefined {
  const tests = /^\s*Tests\s+(.+)$/mu.exec(output)?.[1];
  if (tests) return `tests: ${tests.trim()}`;
  const pages = /Generating static pages.*\((\d+)\/\1\)/u.exec(output)?.[1];
  if (pages) return `${pages} pages generated`;
  return output.trim().split("\n").at(-1)?.trim() || undefined;
}

/** Ways the tarballs the registry's install test served differ from the dry run's. */
export function servedProblems(
  served: Readonly<Record<string, string>> | undefined,
  packages: ReleaseManifest["packages"],
): string[] {
  if (!served) return ["the install test didn't report the tarballs it served"];
  const problems: string[] = [];
  for (const { name, integrity } of packages) {
    if (served[name] === undefined) problems.push(`it didn't serve ${name}`);
    else if (served[name] !== integrity) {
      problems.push(`it served ${name} with ${served[name]}, not the dry run's ${integrity}`);
    }
  }
  for (const name of Object.keys(served)) {
    if (!packages.some((entry) => entry.name === name)) {
      problems.push(`it served ${name}, which the dry run didn't pack`);
    }
  }
  return problems;
}

/** The JSON after `<label> ` on a line of a command's output; undefined when there's none. */
function report<T>(output: string, label: string): T | undefined {
  const line = new RegExp(`^${label} (.*)$`, "mu").exec(output)?.[1];
  if (line === undefined) return undefined;
  try {
    return JSON.parse(line) as T;
  } catch {
    return undefined;
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * What uses the release artifacts. Each installs the dry run's tarballs, never workspace links,
 * and none packs again.
 */
export const consumers: readonly Consumer[] = [
  {
    // The fixture's own tests: render, hydrate, interact and unmount, its known-bad cases fail, and
    // its calendar hydrates through calendar-testing.
    name: "ssr-fixture",
    run: async ({ step, note, isolate }) => {
      const fixture = await step("install", () => isolate(["apps/ssr-fixture"]));
      await step("render and hydrate", async () =>
        note(outcome(await fixture.run("apps/ssr-fixture", "vp", ["test", "--run"]))),
      );
    },
  },
  {
    // The docs site and its live examples: a production build, every route rendered by
    // `next start`, and the docs tests that render the examples.
    name: "showcase",
    run: async ({ manifest, step, note, isolate }) => {
      const site = await step("install", async () => {
        // `registry` is the build tool for public/r; the dry run's registry stands in for it.
        const workspace = await isolate(["apps/showcase", "registry"], { drop: ["registry"] });
        const served = join(workspace.root, "apps/showcase/public/r");
        await mkdir(served, { recursive: true });
        for (const { file } of manifest.registry ?? []) {
          await copyFile(join(registryDirectory, file), join(served, file));
        }
        return workspace;
      });
      await step("build", async () => {
        await site.run("apps/showcase", "fumadocs-mdx", []);
        note(outcome(await site.run("apps/showcase", "next", ["build"])));
      });
      await step("render", async () => {
        const port = String(await freePort());
        note(
          outcome(
            await site.run("apps/showcase", process.execPath, ["scripts/verify-production.mjs"], {
              SHOWCASE_PORT: port,
            }),
          ),
        );
      });
      await step("test", async () => {
        const excluded = sourceTests.flatMap((test) => ["--exclude", test]);
        note(
          outcome(await site.run("apps/showcase", "vp", ["test", "tests", "--run", ...excluded])),
        );
      });
    },
  },
  {
    // #43's install test: `shadcn add` into clean Vite and Next.js apps, then a typecheck and a
    // build of each, with the tarballs served as the `@moltenship` packages. It needs the network
    // for npm and shadcn's own components.
    name: "registry",
    run: async ({ manifest, step, note, keep }) => {
      await step("shadcn add, typecheck and build", async () => {
        const result = await run("vp", ["run", "registry:e2e"], {
          env: {
            ...process.env,
            REGISTRY_E2E_PACKAGES: "local",
            REGISTRY_E2E_TARBALLS: tarballDirectory,
            REGISTRY_E2E_APPS: "vite,next",
            REGISTRY_E2E_KEEP: keep ? "1" : "failed",
          },
        });
        const kept = /^Kept .*$/mu.exec(result.stdout)?.[0];
        if (result.code !== 0) {
          const apps = report<{ app: string; step: string }[]>(
            result.stdout,
            "REGISTRY_E2E_FAILED",
          );
          const failed = apps?.map(({ app, step }) => `${app} at "${step}"`).join(", ");
          const output = failed ? result.stderr : `${result.stdout}\n${result.stderr}`;
          throw new Error(
            `${failed ? `${failed} failed` : `vp run registry:e2e exited with ${result.code}`}\n${lastLines(output, 300)}${kept ? `\n${kept}` : ""}`,
          );
        }
        const passed = report<{
          apps: { app: string; seconds: number }[];
          served?: Record<string, string>;
        }>(result.stdout, "REGISTRY_E2E");
        const problems = servedProblems(passed?.served, manifest.packages);
        if (problems.length > 0) {
          throw new Error(
            `The install test didn't run on the dry run's tarballs:\n- ${problems.join("\n- ")}`,
          );
        }
        note(passed?.apps.map(({ app, seconds }) => `${app} passed in ${seconds}s`).join(", "));
        if (kept) note(kept);
      });
    },
  },
];

interface StepRecord {
  readonly name: string;
  readonly seconds: number;
  readonly passed: boolean;
}

export interface ConsumerResult {
  readonly name: string;
  readonly seconds: number;
  readonly steps: readonly StepRecord[];
  /** Why it failed, naming the step. */
  readonly failure?: string;
}

const seconds = (since: number) => (performance.now() - since) / 1000;

async function runConsumer(
  consumer: Consumer,
  manifest: ReleaseManifest,
  keep: boolean,
): Promise<ConsumerResult> {
  const note = (message: string | undefined) => {
    if (message) console.log(`[${consumer.name}] ${message}`);
  };
  const started = performance.now();
  const steps: StepRecord[] = [];
  const copies: string[] = [];
  const context: ConsumerContext = {
    manifest,
    step: async (name, action) => {
      const stepStarted = performance.now();
      console.log(`[${consumer.name}] ${name}`);
      try {
        const result = await action();
        steps.push({ name, seconds: seconds(stepStarted), passed: true });
        return result;
      } catch (error) {
        steps.push({ name, seconds: seconds(stepStarted), passed: false });
        throw error;
      }
    },
    note,
    keep,
    isolate: async (directories, options) => {
      const root = await temporaryRoot(consumer.name);
      copies.push(root);
      const workspace = await isolatedWorkspace({
        root,
        directories,
        manifest,
        drop: options?.drop,
      });
      if (workspace.online) {
        note(
          "pnpm's cache lacked some metadata, so the install read it from npm; packages came from the store",
        );
      }
      return workspace;
    },
  };
  try {
    await consumer.run(context);
  } catch (error) {
    const failed = steps.findLast(({ passed }) => !passed)?.name ?? "setup";
    const message = error instanceof Error ? error.message : String(error);
    const kept = copies.map((copy) => `\nKept ${copy} to reproduce it.`).join("");
    return {
      name: consumer.name,
      seconds: seconds(started),
      steps,
      failure: `${consumer.name} failed at "${failed}": ${message}${kept}`,
    };
  }
  for (const copy of copies) {
    if (keep) console.log(`[${consumer.name}] kept ${copy}`);
    else await rm(copy, { force: true, recursive: true });
  }
  return { name: consumer.name, seconds: seconds(started), steps };
}

/** Runs `tasks`, at most `limit` at a time, and returns their results in order. */
async function inPool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Consumers to run at once: each builds an app, and the registry's builds two, so one per four
 * cores. A laptop runs all three; a 4-core CI runner runs them one after another.
 */
export const concurrency = (cores = availableParallelism()) => Math.max(1, Math.floor(cores / 4));

/** One line per consumer: its time and each step's. */
export function summary(results: readonly ConsumerResult[]): string {
  const width = Math.max(...results.map(({ name }) => name.length));
  return results
    .map(({ name, seconds, steps, failure }) => {
      const parts = steps.map(
        (step) => `${step.name} ${step.passed ? "" : "failed after "}${step.seconds.toFixed(1)}s`,
      );
      const time = `${seconds.toFixed(1)}s`.padStart(6);
      return `${failure ? "✗" : "✓"} ${name.padEnd(width)} ${time}  ${parts.join(" · ")}`;
    })
    .join("\n");
}

/**
 * Runs the consumers side by side against the tarballs and registry a dry run of `HEAD` checked,
 * after checking their hashes, and checks the hashes again at the end. Every consumer finishes, so
 * one failure doesn't hide another.
 */
export async function checkArtifacts({
  only = [],
  keep = false,
}: {
  /** Consumer names; all of them when empty. */
  readonly only?: readonly string[];
  /** Keep the copies, as a failure does. */
  readonly keep?: boolean;
} = {}): Promise<void> {
  const unknown = only.filter((name) => !consumers.some((consumer) => consumer.name === name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown consumer ${unknown.join(", ")}. Choose from ${consumers.map(({ name }) => name).join(", ")}.`,
    );
  }
  const selected = consumers.filter(({ name }) => only.length === 0 || only.includes(name));
  const manifest = await readCheckedManifest();
  const limit = concurrency();
  console.log(
    `Release artifacts: ${manifest.packages.length} tarballs and ${manifest.registry?.length ?? 0} registry files for ${manifest.version}, from the dry run of ${manifest.commit.slice(0, 12)}; ${limit} consumer${limit === 1 ? "" : "s"} at a time.`,
  );
  if (!manifest.clean) {
    console.log(
      "The dry run ran on a working tree with changes. Package edits since then aren't in its tarballs.",
    );
  }

  const started = performance.now();
  const results = await inPool(
    selected.map((consumer) => () => runConsumer(consumer, manifest, keep)),
    limit,
  );
  const changed = await changedArtifacts(manifest);
  console.log(`\n${summary(results)}`);

  const failures = results.flatMap(({ failure }) => (failure ? [failure] : []));
  if (changed.length > 0) failures.push(`Changed while the consumers ran: ${changed.join(", ")}`);
  if (failures.length > 0) throw new Error(`\n${failures.join("\n\n")}`);
  console.log(
    `\n${results.length === 1 ? "1 consumer" : `${results.length} consumers`} passed on the dry run's artifacts in ${seconds(started).toFixed(1)}s.`,
  );
}

runMain(import.meta, async () => {
  const { flags, positionals } = parseArguments(process.argv.slice(2), ["keep"], [], {
    positionals: true,
  });
  await checkArtifacts({ only: positionals, keep: flags.has("keep") });
});
