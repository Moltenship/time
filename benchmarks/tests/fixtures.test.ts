import { describe, expect, test } from "vite-plus/test";

import {
  BENCHMARK_EVENT_COUNT,
  BENCHMARK_EVENT_DAY_SPAN,
  BENCHMARK_RESOURCE_COUNT,
  generateBenchmarkFixtures,
} from "../shared/fixtures";

describe("benchmark fixtures", () => {
  test("repeats identical semantic data for the same seed", () => {
    const first = generateBenchmarkFixtures({ eventCount: 40, resourceCount: 12, seed: 42 });
    const second = generateBenchmarkFixtures({ eventCount: 40, resourceCount: 12, seed: 42 });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(generateBenchmarkFixtures({ eventCount: 2, seed: 1 }).events).not.toEqual(
      generateBenchmarkFixtures({ eventCount: 2, seed: 2 }).events,
    );
  });

  test("provides the production-scale fixture profile", () => {
    const fixtures = generateBenchmarkFixtures();

    expect(fixtures.events).toHaveLength(BENCHMARK_EVENT_COUNT);
    expect(Math.max(...fixtures.events.map(({ data }) => data.startUnit))).toBeGreaterThan(
      (BENCHMARK_EVENT_DAY_SPAN - 30) * 1_440,
    );
    expect(new Set(fixtures.events.map(({ id }) => id)).size).toBe(BENCHMARK_EVENT_COUNT);
    const resourceIds = new Set(fixtures.events.flatMap((event) => event.resourceIds ?? []));
    expect(resourceIds.size).toBeGreaterThan(BENCHMARK_RESOURCE_COUNT / 2);
    expect(resourceIds.size).toBeLessThanOrEqual(BENCHMARK_RESOURCE_COUNT);
  });

  test("contains overlaps, multi-day spans, and valid non-empty ranges", () => {
    const fixtures = generateBenchmarkFixtures();
    const timedStarts = new Set<number>();
    let overlapCount = 0;
    let multiDayCount = 0;

    for (const event of fixtures.events) {
      expect(event.data.startUnit).toBeLessThan(event.data.endUnit);
      if (event.kind === "all-day" && event.data.endUnit - event.data.startUnit > 1_440) {
        multiDayCount += 1;
      }
      if (event.kind === "timed") {
        if (timedStarts.has(event.data.startUnit)) {
          overlapCount += 1;
        }
        timedStarts.add(event.data.startUnit);
      }
    }

    expect(overlapCount).toBeGreaterThan(0);
    expect(multiDayCount).toBeGreaterThan(0);
  });

  test("rejects invalid generation sizes", () => {
    expect(() => generateBenchmarkFixtures({ eventCount: 0 })).toThrow(
      "event-count-must-be-a-positive-safe-integer",
    );
    expect(() => generateBenchmarkFixtures({ resourceCount: Number.NaN })).toThrow(
      "resource-count-must-be-a-positive-safe-integer",
    );
  });
});
