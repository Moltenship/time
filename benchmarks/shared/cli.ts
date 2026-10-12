import { pathToFileURL } from "node:url";

import { generateBenchmarkFixtures } from "fixtures";

import type { BenchmarkEngine, BenchmarkMode, BenchmarkReport, BenchmarkStage } from "./contracts";
import { benchmarkExitCode, runBenchmark } from "./protocol";
import { referenceEngine } from "./reference";

export interface BenchmarkLogger {
  error(message: string): void;
  log(message: string): void;
}

export interface BenchmarkCliOptions {
  readonly gated: boolean;
  readonly json: boolean;
  readonly mode: BenchmarkMode;
  readonly thresholdScale: number;
}

function parseOptions(arguments_: readonly string[]): BenchmarkCliOptions {
  let gated = false;
  let json = false;
  let mode: BenchmarkMode = "full";
  let thresholdScale = 1;

  for (const argument of arguments_) {
    if (argument === "--gated") {
      gated = true;
    } else if (argument === "--json") {
      json = true;
    } else if (argument.startsWith("--mode=")) {
      const value = argument.slice("--mode=".length);
      if (value !== "full" && value !== "smoke") {
        throw new RangeError("mode-must-be-smoke-or-full");
      }
      mode = value;
    } else if (argument.startsWith("--threshold-scale=")) {
      thresholdScale = Number(argument.slice("--threshold-scale=".length));
      if (!Number.isFinite(thresholdScale)) {
        throw new RangeError("threshold-scale-must-be-finite");
      }
    } else {
      throw new RangeError(`unknown-benchmark-argument:${argument}`);
    }
  }

  return { gated, json, mode, thresholdScale };
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const { fixture } = report;
  return formatSuiteReport(
    report,
    `seed=${fixture.seed} events=${fixture.events} fragments=${fixture.visibleFragments} resources=${fixture.resources} dst=${fixture.dstCases}`,
  );
}

/** The report as text, with `fixture` describing the suite's fixture on one line. */
export function formatSuiteReport(report: BenchmarkReport<unknown>, fixture: string): string {
  const lines = [
    `Moltenship benchmark protocol v${report.protocolVersion}`,
    `suite=${report.suite} engine=${report.engine} mode=${report.mode}`,
    `fixture ${fixture}`,
    `environment node=${report.environment.node} platform=${report.environment.platform}/${report.environment.processArchitecture} release=${report.environment.platformRelease}`,
    `cpu=${report.environment.cpuModel} logical=${report.environment.logicalCpuCount} memory=${megabytes(report.environment.totalMemoryBytes)}`,
    "stage               warmup samples    p50 ms    p95 ms   scan p95   threshold      status",
  ];

  for (const result of report.stages) {
    lines.push(
      `${result.stage.padEnd(19)}${String(result.warmupIterations).padStart(6)}${String(result.iterations).padStart(8)}${result.p50Ms.toFixed(3).padStart(10)}${result.p95Ms.toFixed(3).padStart(10)}${(result.referenceP95Ms === undefined ? "—" : result.referenceP95Ms.toFixed(3)).padStart(11)}${(result.thresholdP95Ms === undefined ? "report" : result.thresholdP95Ms.toFixed(3)).padStart(12)} ${result.status.padStart(11)}`,
    );
  }

  lines.push(
    `memory heap=${megabytes(report.memory.heapUsedDeltaBytes)} rss=${megabytes(report.memory.rssDeltaBytes)}`,
    `gate=${report.passed ? "pass" : "fail"}`,
    ...report.notes.map((note) => `note=${note}`),
  );
  return lines.join("\n");
}

export function runBenchmarkCli<TSnapshot = ReturnType<typeof referenceEngine.build>>(
  arguments_: readonly string[],
  stages: readonly BenchmarkStage[],
  suite: string,
  engine: BenchmarkEngine<TSnapshot> = referenceEngine as BenchmarkEngine<TSnapshot>,
  logger: BenchmarkLogger = console,
): number {
  return runSuiteCli(
    arguments_,
    (options) =>
      runBenchmark(engine, generateBenchmarkFixtures(), {
        collectGarbageBetweenSamples: options.gated,
        mode: options.mode,
        stages,
        suite,
        thresholdScale: options.thresholdScale,
      }),
    formatBenchmarkReport,
    logger,
  );
}

/**
 * Parses the shared arguments, runs a suite, and prints its report as text or `--json`. Returns
 * the process exit code: 1 for a failed gate with `--gated`, 2 for an error.
 */
export function runSuiteCli<TFixture>(
  arguments_: readonly string[],
  run: (options: BenchmarkCliOptions) => BenchmarkReport<TFixture>,
  format: (report: BenchmarkReport<TFixture>) => string,
  logger: BenchmarkLogger = console,
): number {
  try {
    const options = parseOptions(arguments_);
    const report = run(options);
    logger.log(options.json ? JSON.stringify(report, null, 2) : format(report));
    return benchmarkExitCode(report, options.gated);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

export function isDirectExecution(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === moduleUrl;
}
