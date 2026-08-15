import type { BenchmarkFixtureSet, FixtureFragment } from "fixtures";

export type BenchmarkStage =
  | "build"
  | "query"
  | "query-1d"
  | "query-7d"
  | "projection"
  | "layout"
  | "render"
  | "pointer-frame";

export interface BenchmarkQuery {
  readonly endUnit: number;
  readonly resourceIds?: ReadonlySet<string>;
  readonly startUnit: number;
}

export interface BenchmarkProjection {
  readonly endUnit: number;
  readonly eventId: string;
  readonly key: string;
  readonly resourceId: string;
  readonly startUnit: number;
}

export interface BenchmarkLayout extends BenchmarkProjection {
  readonly lane: number;
  readonly laneCount: number;
}

export interface BenchmarkRenderModel {
  readonly height: number;
  readonly key: string;
  readonly lane: number;
  readonly resourceId: string;
  readonly top: number;
}

export interface BenchmarkEngine<TSnapshot> {
  readonly name: string;
  build(fixtures: BenchmarkFixtureSet): TSnapshot;
  layout(projection: readonly BenchmarkProjection[]): readonly BenchmarkLayout[];
  pointerFrame(layout: readonly BenchmarkLayout[], frame: number): string | null;
  project(
    snapshot: TSnapshot,
    fragments: readonly FixtureFragment[],
  ): readonly BenchmarkProjection[];
  query(snapshot: TSnapshot, query: BenchmarkQuery): readonly string[];
  render(layout: readonly BenchmarkLayout[]): readonly BenchmarkRenderModel[];
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

export interface BenchmarkReport {
  readonly engine: string;
  readonly environment: BenchmarkEnvironment;
  readonly fixture: {
    readonly dstCases: number;
    readonly events: number;
    readonly resources: number;
    readonly seed: number;
    readonly visibleFragments: number;
  };
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
  readonly differences: readonly BenchmarkStage[];
  readonly matchesReference: boolean;
  readonly reference: string;
}
