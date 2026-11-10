import { describe, expect, test } from "vite-plus/test";

import { indexedSnapshotEngine } from "../core/indexed-snapshot";
import type { BenchmarkEngine, BenchmarkQuery } from "../shared/contracts";
import { generateBenchmarkFixtures } from "../shared/fixtures";
import {
  benchmarkExitCode,
  compareCandidateToReference,
  CORE_BENCHMARK_STAGES,
  runBenchmark,
  summarizeSamples,
} from "../shared/protocol";
import { referenceEngine, type ReferenceSnapshot } from "../shared/reference";

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
    const fixtures = generateBenchmarkFixtures({ eventCount: 80, resourceCount: 20 });
    const equivalentCandidate: BenchmarkEngine<ReferenceSnapshot> = {
      ...referenceEngine,
      name: "equivalent-candidate",
    };
    const invalidCandidate: BenchmarkEngine<ReferenceSnapshot> = {
      ...referenceEngine,
      name: "invalid-candidate",
      query: () => [],
    };

    expect(compareCandidateToReference(equivalentCandidate, fixtures).matchesReference).toBe(true);
    expect(compareCandidateToReference(invalidCandidate, fixtures).matchesReference).toBe(false);
  });

  test("keeps the production indexed snapshot equivalent to the reference", () => {
    const fixtures = generateBenchmarkFixtures({ eventCount: 500, resourceCount: 40 });

    expect(compareCandidateToReference(indexedSnapshotEngine, fixtures).matchesReference).toBe(
      true,
    );
    expect(CORE_BENCHMARK_STAGES).toEqual(["build", "query-1d", "query-7d"]);
  });

  test("returns nonzero in gated mode when a threshold fails", () => {
    const report = runBenchmark(
      referenceEngine,
      generateBenchmarkFixtures({ eventCount: 50, resourceCount: 10 }),
      {
        mode: "smoke",
        stages: ["query-1d"],
        suite: "intentional-gate-failure",
        thresholdScale: -1,
      },
    );

    expect(report.stages[0]?.status).toBe("fail");
    expect(benchmarkExitCode(report, true)).toBe(1);
    expect(benchmarkExitCode(report, false)).toBe(0);
  });

  test("measures distinct one-day and seven-day core query workloads", () => {
    const fixtures = generateBenchmarkFixtures({ eventCount: 50, resourceCount: 10 });
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
      new Set([1_440, 10_080]),
    );
    expect(
      report.stages.map(({ referenceP95Ms, stage }) => [stage, typeof referenceP95Ms]),
    ).toEqual([
      ["query-1d", "number"],
      ["query-7d", "number"],
    ]);
  });
});
