import { copyFile, mkdir, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
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
const sourceTests = ["tests/anatomy.test.ts", "tests/recurrence-examples.test.ts"];

/** Vitest's count of passed tests, or the output's last line. */
export function outcome(output: string): string | undefined {
  const tests = /^\s*Tests\s+(.+)$/mu.exec(output)?.[1];
  if (tests) return `tests: ${tests.trim()}`;
  const pages = /Generating static pages.*\((\d+)\/\1\)/u.exec(output)?.[1];
  if (pages) return `${pages} pages generated`;
  return output.trim().split("\n").at(-1)?.trim() || undefined;
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
    // The fixture's own tests: render, hydrate, interact and unmount, and its known-bad cases fail.
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
    run: async ({ step, note }) => {
      await step("shadcn add, typecheck and build", async () => {
        const result = await run("vp", ["run", "registry:e2e"], {
          env: {
            ...process.env,
            REGISTRY_E2E_PACKAGES: "local",
            REGISTRY_E2E_TARBALLS: tarballDirectory,
          },
        });
        if (result.code !== 0) {
          throw new Error(
            `vp run registry:e2e exited with ${result.code}\n${lastLines(`${result.stdout}\n${result.stderr}`)}`,
          );
        }
        note(/^REGISTRY_E2E .*$/mu.exec(result.stdout)?.[0]);
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
    note: (message) => {
      if (message) console.log(`[${consumer.name}] ${message}`);
    },
    isolate: async (directories, options) => {
      const root = await temporaryRoot(consumer.name);
      copies.push(root);
      return isolatedWorkspace({ root, directories, manifest, drop: options?.drop });
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
  console.log(
    `Release artifacts: ${manifest.packages.length} tarballs and ${manifest.registry?.length ?? 0} registry files for ${manifest.version}, from the dry run of ${manifest.commit.slice(0, 12)}.`,
  );

  const started = performance.now();
  const results = await Promise.all(
    selected.map((consumer) => runConsumer(consumer, manifest, keep)),
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
