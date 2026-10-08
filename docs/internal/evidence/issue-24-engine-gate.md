# Issue 24 Temporal and snapshot engine gate evidence

Recorded on 2026-08-15 from the issue #24 working tree based on `cc9b871`, on macOS arm64 with
Node.js 26.7.0 and native, unflagged `globalThis.Temporal`.

## Reproducible gate

The phase-1 audit is a first-class Vite+ task:

```sh
vp run --no-cache engine:gate
```

It runs the repository formatter/linter/type-checker, focused engine and fixture matrices, runtime
and dependency/API boundaries, both production engine builds and emitted-size checks, and the full
uncached indexed-snapshot benchmark. The final run completed with 13 uncached Vite+ tasks and no
failure.

## Correctness matrix

| Matrix | Reproducible evidence | Result |
| --- | --- | --- |
| Interval | Type-specific constructors/operations, adjacency, intersection, clamp, split, bounded iteration, and fast-check properties | Pass |
| DST | Gaps, folds, half-hour and midnight changes, unusual offsets, date-line skips, cross-midnight folds, transition-inside-slot splits, and Temporal minimum | Pass |
| Index | Timed/all-day/floating/resource queries, nanosecond adjacency, type isolation, 500 fixed-seed scan-oracle properties, and benchmark candidate comparison | Pass |
| Revision | Stable array reuse, new snapshot versions, unchanged numeric/string revision reuse, changed revisions, invalid revisions, and accessor failure | Pass |
| Cache | Stable exact results, canonical resource-filter keys, every query kind, resource lookup, zero capacity, bounded LRU eviction, and observable statistics | Pass |
| Invalid data | Duplicate/invalid IDs, invalid revisions/resources/endpoints/source zones, empty/reversed intervals, throwing returned properties, every adapter accessor, report-and-skip, and strict rejection | Pass |
| Dependency | One-way workspace graph, forbidden deep-import fixture, ES-only core configs, and source-entry compilation | Pass |
| API | Packed Temporal consumer compilation, packed core exports/declarations, public snapshot surface, and private interval-tree types | Pass |
| Size | Emitted production ESM checked after both package builds | Pass |

Focused results:

```text
engine correctness: 11 files passed; 88 tests passed
engine contracts:    2 files passed; 12 tests passed
vp check:            187 files formatted; 132 files linted and type-checked
```

No randomized divergence or DST failure occurred. The fixed index property seed remains `0x232026`;
the benchmark fixture seed remains `1414090053` (`0x54494d45`).

The full repository baseline also passed:

```text
vp run ready: 28 uncached tasks passed
full tests:   22 files passed; 133 tests passed
SSR smoke:    deterministic markup; no recoverable errors; interaction and unmount passed
registry:     contract fixture and target passed
package graph: dependency boundaries, packed APIs, and quality-gate contracts passed
```

The SSR smoke retained server markup SHA-256
`cda5ec5b4edb5db5ef6037f14bc097428ed80928c048e75e07ea033ffa0dc2a1` under the committed
deterministic environment.

## Benchmark protocol v2

Protocol v2 keeps ten warmups and fifty nearest-rank samples. Gated tasks run Node with
`--expose-gc` and collect outside each timed sample so garbage from a previous sample cannot
randomly contaminate the next. Query samples average 200 operations: each one-day and seven-day
workload performs 2,000 warm-up and 10,000 measured queries. Candidate results still have to match
the reference semantics, remain below the absolute threshold, and beat the scan p95 from the same
fixture and process.

The implementation also removed redundant normalization-result allocations and validates the
already type-checked interval through the exact bigint keys used by its index. This preserves
half-open semantics while moving the full-build distribution below the unchanged 25 ms threshold.
No threshold was relaxed and no waiver or ADR was required.

## Reference environment

| Field | Value |
| --- | --- |
| Machine CPU | Apple M1 Pro |
| Available logical CPUs | 10 |
| Installed memory | 32 GiB |
| Platform | macOS (`darwin`, `arm64`) |
| Darwin release | 25.5.0 |
| Node | v26.7.0 |
| Runner | Production ESM from `benchmarks/dist/core/index.mjs` |
| Fixture | 10,000 events; 1,000 fragments; 500 resources; 5 DST cases |
| Warmup / samples | 10 / 50 per stage |

## Performance result

| Stage | p50 | p95 | Scan p95 | Gate | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| 10k snapshot build | 16.952 ms | 19.618 ms | — | 25 ms | Pass |
| One-day indexed query | 0.017 ms | 0.019 ms | 0.129 ms | < scan and < 1 ms | Pass |
| Seven-day indexed query | 0.060 ms | 0.065 ms | 0.110 ms | < scan and < 1 ms | Pass |
| 1k-fragment projection | 0.207 ms | 0.433 ms | — | Report only | Recorded |
| 1k-fragment layout | 0.782 ms | 1.045 ms | — | 8 ms | Pass |

The process reported +6.0 MiB heap used and +127.5 MiB RSS across the complete suite. These are
diagnostic process snapshots, not allocation budgets or portable end-user latency claims.

## Production size matrix

| Package | Raw | Raw budget | Gzip | Gzip budget | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `@moltenship/calendar-temporal` | 28,452 B | 28,672 B | 6,302 B | 6,400 B | Pass |
| `@moltenship/calendar-core` | 19,985 B | 24,576 B | 4,761 B | 5,632 B | Pass |

Browser, SSR, and accessibility artifacts are not applicable to this framework-free, DOM-free
engine gate. Their downstream React and view gates remain responsible for those matrices.
