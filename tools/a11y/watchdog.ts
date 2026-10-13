import { Worker } from "node:worker_threads";

import type { Reporter, TestCase, TestModule, Vitest } from "vite-plus/test/node";

export interface WatchdogOptions {
  /** How long the run may go without a test finishing. */
  readonly stallMs: number;
  /** How long the whole run may take. */
  readonly limitMs: number;
  /** How long a cancelled run gets to close its browsers before the process is killed. */
  readonly graceMs?: number;
  /** Where the report goes: stderr, or a file a test opened. */
  readonly fd?: number;
}

type Event =
  | { readonly type: "start" | "end" }
  | { readonly type: "queued" | "started"; readonly key: string; readonly label: string }
  | { readonly type: "test"; readonly key: string; readonly label: string }
  | { readonly type: "done"; readonly key: string; readonly file: boolean };

/**
 * The watch, in a worker thread of its own, so it fires even when the main thread is held up. It
 * writes straight to the file descriptor, asks the main thread to cancel the run, and if the run
 * hasn't ended after the grace period, kills the process and every process under it, the
 * browsers included. It runs from its own source text, so it closes over nothing.
 */
function watch() {
  const { parentPort, workerData } = process.getBuiltinModule("node:worker_threads");
  const { execFileSync } = process.getBuiltinModule("node:child_process");
  const { writeSync } = process.getBuiltinModule("node:fs");
  const { fd, graceMs, limitMs, stallMs } = workerData as Required<WatchdogOptions>;
  const files = new Map<
    string,
    { label: string; since: number; running: boolean; test?: string; testSince?: number }
  >();
  let started = 0;
  let progress = 0;
  let fired = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let kill: ReturnType<typeof setTimeout> | undefined;
  // Monotonic, so a laptop waking from sleep or a clock correction isn't a stall.
  const now = () => performance.now();
  const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;
  const report = (text: string) => {
    try {
      writeSync(fd, text);
    } catch {
      // stderr is full or gone; the run still fails.
    }
  };

  /** Every process under this one, children before their parents. */
  const descendants = () => {
    const children = new Map<number, number[]>();
    for (const line of execFileSync("ps", ["-A", "-o", "pid=,ppid="], {
      encoding: "utf8",
    }).split("\n")) {
      const [child, parent] = line.trim().split(/\s+/).map(Number);
      if (child && parent) children.set(parent, [...(children.get(parent) ?? []), child]);
    }
    const all: number[] = [];
    const visit = (id: number) => {
      for (const child of children.get(id) ?? []) {
        visit(child);
        all.push(child);
      }
    };
    visit(process.pid);
    return all;
  };

  const check = () => {
    const at = now();
    const stalled = at - progress >= stallMs;
    if (fired || (!stalled && at - started < limitMs)) return;
    fired = true;
    clearInterval(timer);
    const reason = stalled
      ? `no test finished in ${seconds(at - progress)}, so the run is stuck`
      : `the run took longer than its ${seconds(limitMs)} limit`;
    const lines = [...files.values()].map((file) =>
      !file.running
        ? `  ${file.label}: queued, or in its setup or imports (for ${seconds(at - file.since)})`
        : file.test === undefined || file.testSince === undefined
          ? `  ${file.label}: no test reported running; the page may be stuck in one it hadn't reported yet (file running ${seconds(at - file.since)})`
          : `  ${file.label} > ${file.test}: the last test the page reported starting, ${seconds(at - file.testSince)} ago`,
    );
    // Cancel and arm the kill first: a report that can't be written, as when nobody reads stderr,
    // mustn't leave the run hanging.
    parentPort!.postMessage("cancel");
    kill = setTimeout(() => {
      report(`Watchdog: the run didn't stop within ${seconds(graceMs)}, so it's killed.\n`);
      let pids: number[] = [];
      try {
        pids = descendants();
      } catch {
        // Without `ps`, the browsers may outlive the run, but the run still ends.
      }
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // It has exited already.
        }
      }
      process.kill(process.pid, "SIGKILL");
    }, graceMs);
    report(
      [
        "",
        `Watchdog: ${reason}. Still running:`,
        ...(lines.length > 0 ? lines : ["  no test file"]),
        "Rerun the file alone to see whether it stops there too (docs/internal/quality-gates.md).",
        "",
        "",
      ].join("\n"),
    );
  };

  parentPort!.on("message", (event: Event) => {
    const at = now();
    if (event.type === "start") {
      files.clear();
      started = progress = at;
      fired = false;
      clearInterval(timer);
      clearTimeout(kill);
      timer = setInterval(check, 1000);
    } else if (event.type === "end") {
      clearInterval(timer);
      clearTimeout(kill);
    } else if (event.type === "queued") {
      files.set(event.key, { label: event.label, since: at, running: false });
    } else if (event.type === "started") {
      files.set(event.key, { label: event.label, since: at, running: true });
    } else if (event.type === "test") {
      const file = files.get(event.key);
      if (file !== undefined) {
        file.test = event.label;
        file.testSince = at;
      }
    } else if (event.type === "done") {
      progress = at;
      if (event.file) files.delete(event.key);
      else {
        const file = files.get(event.key);
        if (file !== undefined) file.test = file.testSince = undefined;
      }
    }
  });
}

/**
 * Fails a browser run that stops making progress, instead of letting it wait for hours. A page
 * whose main thread is stuck can't time its own tests out, so the watch runs in Node: when no test
 * has finished for `stallMs`, or the run passes `limitMs`, it names the files and tests still
 * running and fails the run. It doesn't watch in watch mode, a headed browser or under a
 * debugger, where waiting is the point. `--reporter` on the command line replaces it.
 */
export class Watchdog implements Reporter {
  readonly #options: Required<WatchdogOptions>;
  #worker: Worker | undefined;

  constructor({ fd = 2, graceMs = 20_000, ...options }: WatchdogOptions) {
    this.#options = { fd, graceMs, ...options };
  }

  onInit(vitest: Vitest) {
    const { browser, inspector, watch: watching } = vitest.config;
    if (watching || !browser.headless || inspector.enabled) return;
    const worker = new Worker(`(${watch.toString()})()`, { eval: true, workerData: this.#options });
    // The watch has said why; the run stops as it does after a failure with `--bail`.
    worker.on("message", () => {
      process.exitCode = 1;
      void vitest.cancelCurrentRun("test-failure");
    });
    worker.on("error", (error) => {
      console.error("Watchdog: the watch failed, so this run has none:", error);
      process.exitCode = 1;
    });
    // After the listeners, which ref it: the watch never keeps the process open.
    worker.unref();
    this.#worker = worker;
  }

  onTestRunStart() {
    this.#post({ type: "start" });
  }

  onTestModuleQueued(module: TestModule) {
    this.#post({ type: "queued", key: key(module), label: label(module) });
  }

  onTestModuleStart(module: TestModule) {
    this.#post({ type: "started", key: key(module), label: label(module) });
  }

  onTestModuleEnd(module: TestModule) {
    this.#post({ type: "done", key: key(module), file: true });
  }

  onTestCaseReady(test: TestCase) {
    this.#post({ type: "test", key: key(test.module), label: test.fullName });
  }

  onTestCaseResult(test: TestCase) {
    this.#post({ type: "done", key: key(test.module), file: false });
  }

  onTestRunEnd() {
    this.#post({ type: "end" });
  }

  #post(event: Event) {
    this.#worker?.postMessage(event);
  }
}

const key = (module: TestModule) => `${module.project.name}\0${module.moduleId}`;
const label = (module: TestModule) => `${module.project.name}  ${module.relativeModuleId}`;
