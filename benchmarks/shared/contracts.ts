import type { BenchmarkFixtureSet } from "./fixtures";

export type BenchmarkStage =
  | "build"
  | "query-1d"
  | "query-7d"
  | "expand-cold"
  | "expand-warm"
  | "occurrence-snapshot";

export interface BenchmarkQuery {
  readonly endUnit: number;
  readonly startUnit: number;
}

/** What the core suite times: a snapshot's build and its range queries, as event IDs. */
export interface BenchmarkEngine<TSnapshot> {
  readonly name: string;
  build(fixtures: BenchmarkFixtureSet): TSnapshot;
  query(snapshot: TSnapshot, query: BenchmarkQuery): readonly string[];
}

export interface BenchmarkStatistics {
  readonly iterations: number;
  readonly maximumMs: number;
  readonly minimumMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly warmupIterations: number;
}

export type BenchmarkThresholdStatus = "pass" | "fail" | "report-only";

export interface BenchmarkStageResult extends BenchmarkStatistics {
  readonly beatsReference?: boolean;
  readonly referenceP95Ms?: number;
  readonly stage: BenchmarkStage;
  readonly status: BenchmarkThresholdStatus;
  readonly thresholdP95Ms?: number;
}

export interface BenchmarkEnvironment {
  readonly cpuModel: string;
  readonly logicalCpuCount: number;
  readonly node: string;
  readonly platform: string;
  readonly platformRelease: string;
  readonly processArchitecture: string;
  readonly totalMemoryBytes: number;
}

export interface BenchmarkMemory {
  readonly afterHeapUsedBytes: number;
  readonly afterRssBytes: number;
  readonly beforeHeapUsedBytes: number;
  readonly beforeRssBytes: number;
  readonly heapUsedDeltaBytes: number;
  readonly rssDeltaBytes: number;
}

/** The fixture counts the core suite reports. */
export interface BenchmarkFixtureCounts {
  readonly events: number;
  readonly seed: number;
}

export interface BenchmarkReport<TFixture = BenchmarkFixtureCounts> {
  readonly engine: string;
  readonly environment: BenchmarkEnvironment;
  readonly fixture: TFixture;
  readonly memory: BenchmarkMemory;
  readonly mode: BenchmarkMode;
  readonly notes: readonly string[];
  readonly passed: boolean;
  readonly protocolVersion: 2;
  readonly stages: readonly BenchmarkStageResult[];
  readonly suite: string;
}

export type BenchmarkMode = "smoke" | "full";

export interface BenchmarkRunOptions {
  readonly collectGarbageBetweenSamples?: boolean;
  readonly mode: BenchmarkMode;
  readonly stages: readonly BenchmarkStage[];
  readonly suite: string;
  readonly thresholdScale?: number;
}

export interface BenchmarkComparison {
  readonly candidate: string;
  readonly matchesReference: boolean;
  readonly reference: string;
}
