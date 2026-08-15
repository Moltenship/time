import { describe, expect, test } from "vite-plus/test";

import { generateBenchmarkFixtures } from "fixtures";

import type { BenchmarkEngine, BenchmarkQuery } from "../shared/contracts";
import {
  benchmarkExitCode,
  compareCandidateToReference,
  CORE_BENCHMARK_STAGES,
  runBenchmark,
  summarizeSamples,
} from "../shared/protocol";
import { referenceEngine, type ReferenceSnapshot } from "../shared/reference";
import { indexedSnapshotEngine } from "../core/indexed-snapshot";

describe("benchmark protocol", () => {
  test("reports nearest-rank p50 and p95 after warmup", () => {
    expect(summarizeSamples([9, 1, 7, 3, 5], 2)).toEqual({
      iterations: 5,
      maximumMs: 9,
      minimumMs: 1,
      p50Ms: 5,
      p95Ms: 9,
      warmupIterations: 2,
    });
  });

  test("compares a candidate against the simple reference", () => {
    const fixtures = generateBenchmarkFixtures({
      eventCount: 80,
      resourceCount: 20,
      visibleFragmentCount: 40,
    });
    const equivalentCandidate: BenchmarkEngine<ReferenceSnapshot> = {
      ...referenceEngine,
      name: "equivalent-candidate",
    };
    const invalidCandidate: BenchmarkEngine<ReferenceSnapshot> = {
      ...referenceEngine,
      name: "invalid-candidate",
      query: () => [],
    };

    expect(compareCandidateToReference(equivalentCandidate, fixtures)).toMatchObject({
      differences: [],
      matchesReference: true,
    });
    expect(compareCandidateToReference(invalidCandidate, fixtures)).toMatchObject({
      differences: ["query"],
      matchesReference: false,
    });
  });

  test("keeps the production indexed snapshot equivalent to the reference", () => {
    const fixtures = generateBenchmarkFixtures({
      eventCount: 500,
      resourceCount: 40,
      visibleFragmentCount: 100,
    });

    expect(compareCandidateToReference(indexedSnapshotEngine, fixtures)).toMatchObject({
      differences: [],
      matchesReference: true,
    });
    expect(CORE_BENCHMARK_STAGES).toEqual([
      "build",
      "query-1d",
      "query-7d",
      "projection",
      "layout",
    ]);
  });

  test("returns nonzero in gated mode when a threshold fails", () => {
    const report = runBenchmark(
      referenceEngine,
      generateBenchmarkFixtures({
        eventCount: 50,
        resourceCount: 10,
        visibleFragmentCount: 20,
      }),
      {
        mode: "smoke",
        stages: ["query"],
        suite: "intentional-gate-failure",
        thresholdScale: -1,
      },
    );

    expect(report.stages[0]?.status).toBe("fail");
    expect(benchmarkExitCode(report, true)).toBe(1);
    expect(benchmarkExitCode(report, false)).toBe(0);
  });

  test("measures distinct one-day and seven-day core query workloads", () => {
    const fixtures = generateBenchmarkFixtures({
      eventCount: 50,
      resourceCount: 10,
      visibleFragmentCount: 20,
    });
    const measuredQueries: BenchmarkQuery[] = [];
    const candidate: BenchmarkEngine<ReferenceSnapshot> = {
      ...referenceEngine,
      name: "query-workload-recorder",
      query(snapshot, query) {
        measuredQueries.push(query);
        return referenceEngine.query(snapshot, query);
      },
    };
    const report = runBenchmark(candidate, fixtures, {
      mode: "smoke",
      stages: ["query-1d", "query-7d"],
      suite: "query-workloads",
    });

    expect(new Set(measuredQueries.map(({ endUnit, startUnit }) => endUnit - startUnit))).toEqual(
      new Set([1_440, 2_400, 10_080]),
    );
    expect(
      report.stages.map(({ referenceP95Ms, stage }) => [stage, typeof referenceP95Ms]),
    ).toEqual([
      ["query-1d", "number"],
      ["query-7d", "number"],
    ]);
  });
});

describe("reference layout", () => {
  test("orders equal starts by longer duration and then stable ID", () => {
    const layout = referenceEngine.layout([
      {
        endUnit: 20,
        eventId: "short",
        key: "short",
        resourceId: "resource",
        startUnit: 10,
      },
      {
        endUnit: 30,
        eventId: "long-b",
        key: "long-b",
        resourceId: "resource",
        startUnit: 10,
      },
      {
        endUnit: 30,
        eventId: "long-a",
        key: "long-a",
        resourceId: "resource",
        startUnit: 10,
      },
    ]);

    expect(layout).toEqual([
      {
        endUnit: 30,
        eventId: "long-a",
        key: "long-a",
        lane: 0,
        laneCount: 3,
        resourceId: "resource",
        startUnit: 10,
      },
      {
        endUnit: 30,
        eventId: "long-b",
        key: "long-b",
        lane: 1,
        laneCount: 3,
        resourceId: "resource",
        startUnit: 10,
      },
      {
        endUnit: 20,
        eventId: "short",
        key: "short",
        lane: 2,
        laneCount: 3,
        resourceId: "resource",
        startUnit: 10,
      },
    ]);
  });

  test("resets lane count for each half-open collision group", () => {
    const layout = referenceEngine.layout([
      {
        endUnit: 20,
        eventId: "overlap-a",
        key: "overlap-a",
        resourceId: "resource",
        startUnit: 0,
      },
      {
        endUnit: 30,
        eventId: "overlap-b",
        key: "overlap-b",
        resourceId: "resource",
        startUnit: 10,
      },
      {
        endUnit: 40,
        eventId: "isolated",
        key: "isolated",
        resourceId: "resource",
        startUnit: 30,
      },
    ]);

    expect(layout).toEqual([
      {
        endUnit: 20,
        eventId: "overlap-a",
        key: "overlap-a",
        lane: 0,
        laneCount: 2,
        resourceId: "resource",
        startUnit: 0,
      },
      {
        endUnit: 30,
        eventId: "overlap-b",
        key: "overlap-b",
        lane: 1,
        laneCount: 2,
        resourceId: "resource",
        startUnit: 10,
      },
      {
        endUnit: 40,
        eventId: "isolated",
        key: "isolated",
        lane: 0,
        laneCount: 1,
        resourceId: "resource",
        startUnit: 30,
      },
    ]);
  });
});
