# ADR 0016: Provisional interval index and DST wall-time geometry

- Status: Accepted for the phase 1 implementation, with reversal gates
- Issue: #16
- Date: 2026-08-15

## Context

Time needs indexed visible-range queries at 10,000 loaded events without making
an interval-tree package part of its public contract. It also needs a wall-clock
axis that does not lose instant identity when local times are skipped or
repeated.

The architecture already requires half-open intervals, native Temporal, no
bundled polyfill, explicit disambiguation, and a replaceable `IntervalIndex`
boundary. This spike tested those requirements without creating the production
`calendar-core` or `calendar-temporal` package topology owned by later issues.

## Decision

1. Retain `@flatten-js/interval-tree` 2.0.3 provisionally for phase 1, hidden
   behind Time's `IntervalIndex<T>` interface. No dependency-owned type may
   escape that module.
2. Keep a simple scan implementation as the property-test oracle and benchmark
   reference. The candidate's search is closed at both ends, so the adapter
   must filter every result with `event.start < query.end && event.end >
   query.start` to restore half-open semantics.
3. Model a zoned day as nominal wall coordinates plus cardinality at each wall
   position:
   - zero round-tripping instants means a gap and is unavailable;
   - one instant means an ordinary position;
   - two distinct instants means a fold and produces two occurrences at the
     same wall coordinate.
4. Use `PlainDateTime.toZonedDateTime(zone, { disambiguation: "earlier" })` and
   `"later"`, then round-trip each result to `PlainDateTime`. This uses the
   current public Temporal surface and avoids the removed `Temporal.TimeZone`
   type. Fold identity is the instant (`epochNanoseconds`), never the plain
   date-time.
5. Keep creation/move policy separate from geometry. `compatible` shifts a gap
   forward and chooses the earlier fold occurrence; any automatic shift must be
   retained in the transaction and announced. `reject` remains configurable.

## Evidence

The seeded benchmark uses 10,000 intervals over 365 days, 3,000 warm queries
per workload, and exact scan/tree result checksums.

| Implementation  | Build p95 | Query p95 | Retained heap delta |
| --------------- | --------: | --------: | ------------------: |
| scan             |  1.064 ms |         — |            1.23 MiB |
| tree             | 11.060 ms |         — |            5.44 MiB |
| scan, 1-day      |         — | 0.0651 ms |                   — |
| tree, 1-day      |         — | 0.0091 ms |                   — |
| scan, 7-day      |         — | 0.0678 ms |                   — |
| tree, 7-day      |         — | 0.0327 ms |                   — |

The tree was 7.2 times faster at one-day p95 and 2.1 times faster at seven-day
p95, stayed far below the 1 ms warm-query gate, and produced identical results.
It cost about 10 times the build latency and 4.4 times the retained heap of the
scan wrapper. Its 11.060 ms build p95 remained below the architecture's 25 ms
full-snapshot target on this local Apple M1 Pro run.

The native Temporal fixture matrix proves:

- New York's spring gap produces two unavailable 30-minute slots;
- New York's fall fold produces two instants with distinct offsets for each
  repeated slot;
- Lord Howe's 30-minute transition produces one unavailable slot and a
  1,410-minute physical day;
- Santiago's midnight transition makes the first two wall slots unavailable;
- half-open adjacency, duplicate tree keys, and cross-midnight queries agree
  with the scan oracle;
- 1,000 seeded property runs compare candidate queries with the scan reference.

The benchmark JSON/table and DST JSON/review table were committed beside the
spike, `tools/interval-dst-spike`. The spike is no longer in the tree: commit
`1034a5fb` has it as it was measured. Node.js 24.19.0 does **not** expose Temporal without a flag on this
workspace. The named tasks use native V8 Temporal through
`--harmony-temporal`; this evidence does not claim unflagged runtime support.

## Consequences

- Visible-range reads avoid a full 10,000-item scan and satisfy the measured
  query target, while index construction and memory are explicitly more
  expensive.
- The wrapper performs a final half-open filter and stable insertion-order sort;
  both costs are included in the benchmark.
- Wall layout can display gaps and folds without changing the nominal vertical
  coordinate system or merging repeated instants.
- The experiment's native V8 implementation is flag-gated and may differ from
  the eventual unflagged engines and their timezone databases. Phase 1 cannot
  treat this as browser/runtime compatibility proof.
- This 30-minute prototype samples slot starts. Phase 1 must split or annotate
  a slot when a transition falls inside the configured slot duration instead of
  assuming every transition aligns to a slot boundary.

## Reversal triggers

Replace the candidate without changing consumers if any of these occurs:

- the production harness on the recorded reference environment does not beat
  the scan p95 for both one-day and seven-day ranges;
- indexed warm-query p95 reaches 1 ms or full 10,000-event snapshot build p95
  reaches 25 ms;
- retained memory prevents the 10,000-event/500-resource target or makes worker
  transfer materially worse than a replacement;
- randomized reference comparisons find a semantic mismatch;
- dependency maintenance, security, or ESM/type compatibility becomes
  unacceptable.

Revisit the wall-time algorithm if supported native engines disagree with the
committed fixtures, if tzdb revisions move a fixture transition, or if
transition-inside-slot tests fail. If native Temporal is still unavailable in a
target runtime, the application must supply it before importing Time; the core
package will not add a conditional polyfill.

## Required phase 1 tests

- Port half-open adjacency, duplicate-key, cross-midnight, and randomized scan
  comparisons to `calendar-core`.
- Run 10,000-event one-day and seven-day benchmarks through the production
  benchmark task on the reference environment.
- Cover hourly gaps/folds, Lord Howe half-hour changes, midnight changes,
  transition-inside-slot splitting, and date-line changes in
  `calendar-temporal`.
- Assert gap transactions for `compatible` and `reject`, and fold transactions
  for explicit earlier/later selection.
- Run the DST fixture matrix on every supported unflagged native Temporal
  engine before the phase 1 gate closes.
