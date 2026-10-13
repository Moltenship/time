import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { TestCase, TestModule, Vitest } from "vite-plus/test/node";

import { Watchdog } from "./watchdog";

const watchdog = new URL("./watchdog.ts", import.meta.url).pathname;

const file = (name: string) =>
  ({
    moduleId: `/repo/${name}`,
    project: { name: "chromium" },
    relativeModuleId: name,
  }) as never as TestModule;
const testIn = (module: TestModule, fullName: string) =>
  ({ fullName, module }) as never as TestCase;

function fakeVitest(config: { watch?: boolean; headless?: boolean; inspector?: boolean } = {}) {
  const cancelCurrentRun = vi.fn(async () => {});
  const vitest = {
    cancelCurrentRun,
    config: {
      browser: { headless: config.headless ?? true },
      inspector: { enabled: config.inspector ?? false },
      watch: config.watch ?? false,
    },
  } as never as Vitest;
  return { cancelCurrentRun, vitest };
}

/** Polls `check` until it passes, for at most `ms`. */
async function eventually(check: () => boolean | Promise<boolean>, ms = 5000) {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.reverse()) await step();
  cleanup = [];
  process.exitCode = undefined;
});

/** A file the watch writes its report to. */
async function reportFile() {
  const folder = await mkdtemp(join(tmpdir(), "time-watchdog-"));
  const path = join(folder, "report.txt");
  const fd = openSync(path, "w");
  cleanup.push(async () => {
    closeSync(fd);
    await rm(folder, { force: true, recursive: true });
  });
  return { fd, read: () => readFile(path, "utf8") };
}

describe("the browser runs' watchdog", () => {
  test("a run where no test finishes names what's still running, and is cancelled", async () => {
    const report = await reportFile();
    const { cancelCurrentRun, vitest } = fakeVitest();
    const dog = new Watchdog({ fd: report.fd, graceMs: 60_000, limitMs: 60_000, stallMs: 1000 });
    dog.onInit(vitest);
    cleanup.push(async () => dog.onTestRunEnd());

    dog.onTestRunStart();
    const stuck = file("tests/stuck.a11y.tsx");
    const waiting = file("tests/waiting.a11y.tsx");
    dog.onTestModuleQueued(stuck);
    dog.onTestModuleStart(stuck);
    dog.onTestCaseReady(testIn(stuck, "a view > hangs"));
    dog.onTestModuleQueued(waiting);

    await eventually(() => cancelCurrentRun.mock.calls.length > 0);
    const text = await report.read();
    expect(text).toContain("Watchdog: no test finished in");
    expect(text).toContain(
      "chromium  tests/stuck.a11y.tsx > a view > hangs: the last test the page reported starting",
    );
    expect(text).toContain("chromium  tests/waiting.a11y.tsx: queued, or in its setup or imports");
    expect(process.exitCode).toBe(1);
  });

  test("tests that keep finishing keep it quiet, and the end of the run stops it", async () => {
    const report = await reportFile();
    const { cancelCurrentRun, vitest } = fakeVitest();
    const dog = new Watchdog({ fd: report.fd, graceMs: 60_000, limitMs: 60_000, stallMs: 3000 });
    dog.onInit(vitest);

    dog.onTestRunStart();
    const module = file("tests/busy.a11y.tsx");
    dog.onTestModuleQueued(module);
    dog.onTestModuleStart(module);
    for (let step = 0; step < 6; step += 1) {
      const test = testIn(module, `test ${step}`);
      dog.onTestCaseReady(test);
      await new Promise((resolve) => setTimeout(resolve, 500));
      dog.onTestCaseResult(test);
    }
    dog.onTestModuleEnd(module);
    dog.onTestRunEnd();
    await new Promise((resolve) => setTimeout(resolve, 4000));

    expect(cancelCurrentRun).not.toHaveBeenCalled();
    expect(await report.read()).toBe("");
  });

  test.each([
    ["watch mode", { watch: true }],
    ["a headed browser", { headless: false }],
    ["a debugger", { inspector: true }],
  ] as const)("it doesn't watch in %s", async (_, config) => {
    const report = await reportFile();
    const { cancelCurrentRun, vitest } = fakeVitest(config);
    const dog = new Watchdog({ fd: report.fd, graceMs: 60_000, limitMs: 60_000, stallMs: 200 });
    dog.onInit(vitest);

    dog.onTestRunStart();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(cancelCurrentRun).not.toHaveBeenCalled();
    expect(await report.read()).toBe("");
  });

  test("a stuck main thread gets the report once, from the watch", async () => {
    const script = `
      import { Watchdog } from ${JSON.stringify(watchdog)};
      const dog = new Watchdog({ graceMs: 3500, limitMs: 60_000, stallMs: 1000 });
      dog.onInit({ cancelCurrentRun: async () => {}, config: { browser: { headless: true }, inspector: {}, watch: false } });
      dog.onTestRunStart();
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
    `;
    const run = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    cleanup.push(async () => {
      if (run.exitCode === null) run.kill("SIGKILL");
    });
    let stderr = "";
    run.stderr.on("data", (chunk) => (stderr += chunk));
    await new Promise((resolve) => run.on("close", resolve));

    expect(stderr.split("Still running:").length - 1).toBe(1);
    expect(stderr).toContain("so it's killed");
  }, 20_000);

  test("a run that doesn't stop is killed, with the processes it started", async () => {
    // A process whose main thread never comes back, with a child of its own, as a browser is.
    const script = `
      import { spawn } from "node:child_process";
      import { writeSync } from "node:fs";
      import { Watchdog } from ${JSON.stringify(watchdog)};
      const dog = new Watchdog({ graceMs: 500, limitMs: 60_000, stallMs: 1000 });
      dog.onInit({ cancelCurrentRun: async () => {}, config: { browser: { headless: true }, inspector: {}, watch: false } });
      dog.onTestRunStart();
      const child = spawn("sleep", ["60"], { stdio: "ignore" });
      // Plain digits, written at once: console.log may colour a number.
      writeSync(1, String(child.pid));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
    `;
    const run = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    run.stdout.on("data", (chunk) => (stdout += chunk));
    run.stderr.on("data", (chunk) => (stderr += chunk));
    cleanup.push(async () => {
      // Should the watchdog miss, don't leave the processes behind.
      for (const pid of [run.pid, Number(stdout.trim())]) {
        try {
          if (pid) process.kill(pid, "SIGKILL");
        } catch {
          // Gone already.
        }
      }
    });
    // `close`, not `exit`: by then the output has all arrived.
    const signal = await new Promise<NodeJS.Signals | null>((resolve) =>
      run.on("close", (_, signal) => resolve(signal)),
    );

    expect(signal).toBe("SIGKILL");
    expect(stderr).toContain("Watchdog: no test finished in");
    expect(stderr).toContain("so it's killed");
    const child = Number(stdout.trim());
    expect(child).toBeGreaterThan(0);
    // The child is gone too: signalling it fails.
    await eventually(() => {
      try {
        process.kill(child, 0);
        return false;
      } catch {
        return true;
      }
    });
  }, 20_000);
});
