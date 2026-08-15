import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { arch, cpus, platform, release } from "node:os";

import {
  FlattenIntervalIndex,
  ScanIntervalIndex,
  type HalfOpenInterval,
  type IntervalIndex,
  type IntervalIndexEntry,
} from "../src/interval-index";
import {
  candidateSurvivesBenchmark,
  TREE_BUILD_P95_LIMIT_MS,
  TREE_QUERY_P95_LIMIT_MS,
} from "../src/benchmark-verdict";
import { indexEntries, seededEvents, seededQueries } from "../src/seeded-data";

type IndexKind = "scan" | "tree";

interface Distribution {
  readonly p50: number;
  readonly p95: number;
  readonly minimum: number;
  readonly maximum: number;
}

interface QueryResult extends Distribution {
  readonly checksum: number;
  readonly matchedValues: number;
}

const EVENT_COUNT = 10_000;
const QUERY_COUNT = 3_000;
const BUILD_SAMPLES = 30;

function createIndex(
  kind: IndexKind,
  entries: readonly IntervalIndexEntry<number>[],
): IntervalIndex<number> {
  return kind === "tree" ? new FlattenIntervalIndex(entries) : new ScanIntervalIndex(entries);
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

function distribution(samples: readonly number[]): Distribution {
  const sorted = samples.toSorted((left, right) => left - right);

  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    minimum: sorted[0] ?? 0,
    maximum: sorted.at(-1) ?? 0,
  };
}

function measureBuild(
  kind: IndexKind,
  entries: readonly IntervalIndexEntry<number>[],
): Distribution {
  const samples: number[] = [];
  let observedSize = 0;

  for (let sample = 0; sample < BUILD_SAMPLES; sample += 1) {
    globalThis.gc?.();
    const started = performance.now();
    const index = createIndex(kind, entries);
    samples.push(performance.now() - started);
    observedSize ^= index.size;
  }

  if (observedSize !== 0) {
    throw new Error("Unexpected benchmark size checksum");
  }

  return distribution(samples);
}

function warm(index: IntervalIndex<number>, queries: readonly HalfOpenInterval[]): void {
  for (const query of queries.slice(0, 500)) {
    index.query(query);
  }
}

function measureQueries(
  index: IntervalIndex<number>,
  queries: readonly HalfOpenInterval[],
): QueryResult {
  warm(index, queries);
  const samples: number[] = [];
  let checksum = 0;
  let matchedValues = 0;

  for (const query of queries) {
    const started = process.hrtime.bigint();
    const values = index.query(query);
    const elapsed = process.hrtime.bigint() - started;
    samples.push(Number(elapsed) / 1_000_000);
    matchedValues += values.length;

    for (const value of values) {
      checksum = (Math.imul(checksum, 33) ^ value) >>> 0;
    }
  }

  return { ...distribution(samples), checksum, matchedValues };
}

function memoryProbe(kind: IndexKind): never {
  const entries = indexEntries(seededEvents(EVENT_COUNT));
  globalThis.gc?.();
  const before = process.memoryUsage().heapUsed;
  const index = createIndex(kind, entries);
  globalThis.gc?.();
  const after = process.memoryUsage().heapUsed;

  console.log(JSON.stringify({ kind, bytes: after - before, size: index.size }));
  process.exit(0);
}

function measureMemory(kind: IndexKind): number {
  const samples: number[] = [];
  const script = fileURLToPath(import.meta.url);

  for (let sample = 0; sample < 7; sample += 1) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--harmony-temporal", "--expose-gc", script, "--memory-probe", kind],
      { encoding: "utf8" },
    );

    if (result.status !== 0) {
      throw new Error(`Memory probe failed: ${result.stderr}`);
    }

    const parsed = JSON.parse(result.stdout) as { readonly bytes: number; readonly size: number };
    if (parsed.size !== EVENT_COUNT) {
      throw new Error(`Memory probe built ${parsed.size} entries; expected ${EVENT_COUNT}`);
    }
    samples.push(parsed.bytes);
  }

  return percentile(
    samples.toSorted((left, right) => left - right),
    0.5,
  );
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(2)} MiB`;
}

function renderMarkdown(report: ReturnType<typeof runBenchmark>): string {
  const rows: string[] = [];

  for (const kind of ["scan", "tree"] as const) {
    rows.push(
      `| ${kind} | ${report.build[kind].p50.toFixed(3)} | ${report.build[kind].p95.toFixed(3)} | — | ${formatBytes(report.memoryBytes[kind])} |`,
    );
  }

  for (const durationDays of [1, 7] as const) {
    for (const kind of ["scan", "tree"] as const) {
      const query = report.queries[`${durationDays}d`][kind];
      rows.push(`| ${kind} (${durationDays}d query) | — | — | ${query.p95.toFixed(4)} | — |`);
    }
  }

  return `# Interval-index benchmark evidence

- Dataset: ${report.eventCount.toLocaleString("en-US")} seeded intervals over 365 days
- Queries: ${report.queryCount.toLocaleString("en-US")} seeded warm queries per duration
- Runtime: ${report.environment.node} / V8 ${report.environment.v8}
- Host: ${report.environment.cpu}, ${report.environment.platform} ${report.environment.arch} ${report.environment.release}
- Native Temporal flag used by the spike task: \`${report.environment.temporalFlag}\`

| Implementation | Build p50 (ms) | Build p95 (ms) | Warm query p95 (ms) | Retained heap delta |
| --- | ---: | ---: | ---: | ---: |
${rows.join("\n")}

Checksums and matched-value counts agree for scan and tree in both query workloads: ${report.referenceAgreement ? "yes" : "no"}.

Decision gate: **${report.candidateSurvives ? "retain the candidate behind the replaceable seam" : "reject the candidate and keep the scan reference"}**. The gate requires exact reference agreement, tree build p95 below ${TREE_BUILD_P95_LIMIT_MS} ms, indexed p95 below ${TREE_QUERY_P95_LIMIT_MS} ms, and the tree to beat the scan p95 for both one-day and seven-day visible ranges.
`;
}

function runBenchmark() {
  const entries = indexEntries(seededEvents(EVENT_COUNT));
  const indexes = {
    scan: new ScanIntervalIndex(entries),
    tree: new FlattenIntervalIndex(entries),
  };
  const querySets = {
    "1d": seededQueries(QUERY_COUNT, 1),
    "7d": seededQueries(QUERY_COUNT, 7),
  };
  const queries = {
    "1d": {
      scan: measureQueries(indexes.scan, querySets["1d"]),
      tree: measureQueries(indexes.tree, querySets["1d"]),
    },
    "7d": {
      scan: measureQueries(indexes.scan, querySets["7d"]),
      tree: measureQueries(indexes.tree, querySets["7d"]),
    },
  };
  const referenceAgreement = (["1d", "7d"] as const).every(
    (duration) =>
      queries[duration].scan.checksum === queries[duration].tree.checksum &&
      queries[duration].scan.matchedValues === queries[duration].tree.matchedValues,
  );
  const build = {
    scan: measureBuild("scan", entries),
    tree: measureBuild("tree", entries),
  };
  const candidateSurvives = candidateSurvivesBenchmark({
    referenceAgreement,
    treeBuildP95: build.tree.p95,
    queries: {
      "1d": { scanP95: queries["1d"].scan.p95, treeP95: queries["1d"].tree.p95 },
      "7d": { scanP95: queries["7d"].scan.p95, treeP95: queries["7d"].tree.p95 },
    },
  });

  return {
    schemaVersion: 1,
    eventCount: EVENT_COUNT,
    queryCount: QUERY_COUNT,
    buildSamples: BUILD_SAMPLES,
    seed: { events: "0x16d57", queries: "0x16a11 + durationDays" },
    environment: {
      node: process.version,
      v8: process.versions.v8,
      temporalFlag: "--harmony-temporal (required; Temporal is absent without it on this runtime)",
      cpu: cpus()[0]?.model ?? "unknown",
      platform: platform(),
      arch: arch(),
      release: release(),
    },
    build: {
      scan: Object.fromEntries(
        Object.entries(build.scan).map(([key, value]) => [key, round(value)]),
      ) as unknown as Distribution,
      tree: Object.fromEntries(
        Object.entries(build.tree).map(([key, value]) => [key, round(value)]),
      ) as unknown as Distribution,
    },
    queries: Object.fromEntries(
      Object.entries(queries).map(([duration, values]) => [
        duration,
        Object.fromEntries(
          Object.entries(values).map(([kind, result]) => [
            kind,
            Object.fromEntries(
              Object.entries(result).map(([key, value]) => [
                key,
                typeof value === "number" && key !== "checksum" && key !== "matchedValues"
                  ? round(value)
                  : value,
              ]),
            ),
          ]),
        ),
      ]),
    ) as unknown as typeof queries,
    memoryBytes: {
      scan: measureMemory("scan"),
      tree: measureMemory("tree"),
    },
    referenceAgreement,
    candidateSurvives,
  };
}

if (process.argv[2] === "--memory-probe") {
  const kind = process.argv[3];
  if (kind !== "scan" && kind !== "tree") {
    throw new Error("Memory probe requires scan or tree");
  }
  memoryProbe(kind);
}

const report = runBenchmark();
console.log(JSON.stringify(report, undefined, 2));
console.log("\n--- MARKDOWN ---\n");
console.log(renderMarkdown(report));
