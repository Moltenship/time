import { availableParallelism, cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { memoryUsage } from "node:process";

import type {
  BenchmarkComparison,
  BenchmarkEngine,
  BenchmarkEnvironment,
  BenchmarkMode,
  BenchmarkQuery,
  BenchmarkReport,
  BenchmarkRunOptions,
  BenchmarkStage,
  BenchmarkStageResult,
  BenchmarkStatistics,
} from "./contracts";
import type { BenchmarkFixtureSet } from "./fixtures";
import { referenceEngine } from "./reference";

export const CORE_BENCHMARK_STAGES: readonly BenchmarkStage[] = Object.freeze([
  "build",
  "query-1d",
  "query-7d",
]);

export const RECURRENCE_BENCHMARK_STAGES: readonly BenchmarkStage[] = Object.freeze([
  "expand-cold",
  "expand-warm",
  "occurrence-snapshot",
]);

const initialP95ThresholdsMs: Readonly<Partial<Record<BenchmarkStage, number>>> = Object.freeze({
  build: 25,
  "expand-cold": 40,
  "expand-warm": 40,
  "query-1d": 1,
  "query-7d": 1,
});

const QUERY_START_UNIT = 8 * 60;
const QUERY_OPERATIONS_PER_SAMPLE = 200;
const queries: Readonly<Partial<Record<BenchmarkStage, BenchmarkQuery>>> = Object.freeze({
  "query-1d": Object.freeze({ startUnit: QUERY_START_UNIT, endUnit: QUERY_START_UNIT + 1_440 }),
  "query-7d": Object.freeze({
    startUnit: QUERY_START_UNIT,
    endUnit: QUERY_START_UNIT + 7 * 1_440,
  }),
});
let benchmarkSink = 0;

function iterationCounts(mode: BenchmarkMode): {
  readonly iterations: number;
  readonly warmupIterations: number;
} {
  return mode === "smoke"
    ? { iterations: 8, warmupIterations: 2 }
    : { iterations: 50, warmupIterations: 10 };
}

function percentile(sortedSamples: readonly number[], proportion: number): number {
  const index = Math.max(0, Math.ceil(sortedSamples.length * proportion) - 1);
  return sortedSamples[index] ?? 0;
}

export function summarizeSamples(
  samples: readonly number[],
  warmupIterations: number,
): BenchmarkStatistics {
  if (samples.length === 0) {
    throw new RangeError("benchmark-samples-must-not-be-empty");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  return {
    iterations: sorted.length,
    maximumMs: sorted.at(-1) ?? 0,
    minimumMs: sorted[0] ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    warmupIterations,
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  }
  return hash;
}

export interface MeasureOptions {
  readonly collectGarbageBetweenSamples?: boolean;
  readonly mode: BenchmarkMode;
  /** Operations averaged into one sample. */
  readonly operationsPerSample?: number;
  /** Runs before each warmup and sample, outside the timed region and before collection. */
  readonly prepare?: () => void;
}

/** Warms up, then times samples of `operation`, whose results feed the observable sink. */
export function measure(
  operation: (iteration: number) => number,
  { collectGarbageBetweenSamples = false, mode, operationsPerSample = 1, prepare }: MeasureOptions,
): BenchmarkStatistics {
  const { iterations, warmupIterations } = iterationCounts(mode);
  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    prepare?.();
    for (let operationIndex = 0; operationIndex < operationsPerSample; operationIndex += 1) {
      benchmarkSink ^= operation(iteration * operationsPerSample + operationIndex);
    }
  }

  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    prepare?.();
    if (collectGarbageBetweenSamples) {
      const collectGarbage = (globalThis as typeof globalThis & { gc?: () => void }).gc;
      if (collectGarbage === undefined) {
        throw new Error("explicit-garbage-collection-is-unavailable");
      }
      collectGarbage();
    }
    const startedAt = performance.now();
    for (let operationIndex = 0; operationIndex < operationsPerSample; operationIndex += 1) {
      benchmarkSink ^= operation(iteration * operationsPerSample + operationIndex);
    }
    samples.push((performance.now() - startedAt) / operationsPerSample);
  }

  return summarizeSamples(samples, warmupIterations);
}

function environment(): BenchmarkEnvironment {
  return {
    cpuModel: cpus()[0]?.model ?? "unknown",
    logicalCpuCount: availableParallelism(),
    node: process.version,
    platform: process.platform,
    platformRelease: release(),
    processArchitecture: process.arch,
    totalMemoryBytes: totalmem(),
  };
}

/** Every measured result XORed together; reports print it so no operation is discarded. */
export function observableSink(): number {
  return benchmarkSink;
}

export function stageResult(
  stage: BenchmarkStage,
  statistics: BenchmarkStatistics,
  thresholdScale: number,
  referenceP95Ms?: number,
): BenchmarkStageResult {
  const baseThreshold = initialP95ThresholdsMs[stage];
  if (baseThreshold === undefined) {
    return { ...statistics, stage, status: "report-only" };
  }

  const thresholdP95Ms = baseThreshold * thresholdScale;
  const beatsReference =
    referenceP95Ms === undefined ? undefined : statistics.p95Ms < referenceP95Ms;
  return {
    ...statistics,
    beatsReference,
    referenceP95Ms,
    stage,
    status: statistics.p95Ms <= thresholdP95Ms && beatsReference !== false ? "pass" : "fail",
    thresholdP95Ms,
  };
}

/** Whether the candidate's range queries return the IDs the reference scan returns. */
export function compareCandidateToReference<TSnapshot>(
  candidate: BenchmarkEngine<TSnapshot>,
  fixtures: BenchmarkFixtureSet,
): BenchmarkComparison {
  const referenceSnapshot = referenceEngine.build(fixtures);
  const candidateSnapshot = candidate.build(fixtures);

  return {
    candidate: candidate.name,
    matchesReference: Object.values(queries).every(
      (query) =>
        JSON.stringify(referenceEngine.query(referenceSnapshot, query)) ===
        JSON.stringify(candidate.query(candidateSnapshot, query)),
    ),
    reference: referenceEngine.name,
  };
}

export function thresholdScaleOf(options: BenchmarkRunOptions): number {
  const thresholdScale = options.thresholdScale ?? 1;
  if (!Number.isFinite(thresholdScale)) {
    throw new RangeError("threshold-scale-must-be-finite");
  }
  return thresholdScale;
}

export function unsupportedStage(stage: BenchmarkStage, suite: string): never {
  throw new RangeError(`unsupported-benchmark-stage:${suite}:${stage}`);
}

/**
 * Completes a suite's report with the environment, memory sampled now against `before`, and
 * whether every gated stage passed.
 */
export function finishReport<TFixture>(
  report: Pick<
    BenchmarkReport<TFixture>,
    "engine" | "fixture" | "mode" | "notes" | "stages" | "suite"
  >,
  before: NodeJS.MemoryUsage,
): BenchmarkReport<TFixture> {
  const after = memoryUsage();
  return {
    engine: report.engine,
    environment: environment(),
    fixture: report.fixture,
    memory: {
      afterHeapUsedBytes: after.heapUsed,
      afterRssBytes: after.rss,
      beforeHeapUsedBytes: before.heapUsed,
      beforeRssBytes: before.rss,
      heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
      rssDeltaBytes: after.rss - before.rss,
    },
    mode: report.mode,
    notes: report.notes,
    passed: report.stages.every(({ status }) => status !== "fail"),
    protocolVersion: 2,
    stages: report.stages,
    suite: report.suite,
  };
}

/** Times the core suite's stages: a snapshot's build, and its range queries against the scan. */
export function runBenchmark<TSnapshot>(
  engine: BenchmarkEngine<TSnapshot>,
  fixtures: BenchmarkFixtureSet,
  options: BenchmarkRunOptions,
): BenchmarkReport {
  const thresholdScale = thresholdScaleOf(options);
  const before = memoryUsage();
  const snapshot = engine.build(fixtures);
  const results: BenchmarkStageResult[] = [];
  let referenceSnapshot: ReturnType<typeof referenceEngine.build> | undefined;

  for (const stage of options.stages) {
    const { collectGarbageBetweenSamples, mode } = options;

    if (stage === "build") {
      const statistics = measure(
        () => {
          engine.build(fixtures);
          return fixtures.events.length;
        },
        { collectGarbageBetweenSamples, mode },
      );
      results.push(stageResult(stage, statistics, thresholdScale));
      continue;
    }

    const query = queries[stage] ?? unsupportedStage(stage, options.suite);
    const measureOptions = {
      collectGarbageBetweenSamples,
      mode,
      operationsPerSample: QUERY_OPERATIONS_PER_SAMPLE,
    };
    const statistics = measure(() => {
      const result = engine.query(snapshot, query);
      return hashString(result[0] ?? "") ^ result.length;
    }, measureOptions);
    let referenceP95Ms: number | undefined;
    if (engine !== referenceEngine) {
      referenceSnapshot ??= referenceEngine.build(fixtures);
      const scanned = referenceSnapshot;
      referenceP95Ms = measure(() => {
        const result = referenceEngine.query(scanned, query);
        return hashString(result[0] ?? "") ^ result.length;
      }, measureOptions).p95Ms;
    }
    results.push(stageResult(stage, statistics, thresholdScale, referenceP95Ms));
  }

  return finishReport(
    {
      engine: engine.name,
      fixture: { events: fixtures.events.length, seed: fixtures.seed },
      mode: options.mode,
      notes: [
        "The scan is the correctness oracle; timings describe the selected engine.",
        "One-day and seven-day query gates require indexed p95 below both 1 ms and scan p95.",
        "Query samples average 200 operations to reduce sub-millisecond timer and scheduler noise.",
        garbageCollectionNote(options),
        `Observable sink: ${benchmarkSink}`,
      ],
      stages: results,
      suite: options.suite,
    },
    before,
  );
}

export function garbageCollectionNote(options: BenchmarkRunOptions): string {
  return `Explicit garbage collection between samples: ${options.collectGarbageBetweenSamples === true ? "enabled" : "disabled"}.`;
}

export function benchmarkExitCode(report: BenchmarkReport<unknown>, gated: boolean): number {
  return gated && !report.passed ? 1 : 0;
}
