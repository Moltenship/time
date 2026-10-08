# Issue 23 event snapshot and index evidence

Recorded on 2026-08-15 from the issue #23 implementation worktree on macOS arm64 with Node.js
26.7.0 and native, unflagged `globalThis.Temporal`.

## Contract evidence

The production `@moltenship/calendar-core` entry point now exposes:

- reusable immutable-array snapshot caches and a one-shot builder;
- normalized records retaining the latest application event and exact Temporal interval type;
- stable ID lookup plus timed, all-day, floating, and resource queries;
- cache-local monotonic versions and `(event ID, revision)` structural reuse;
- bounded query-result LRU statistics;
- report-and-skip and strict invalid-record policies; and
- the external-store-shaped `CalendarEventSource` contract with deterministic server snapshots.

`@flatten-js/interval-tree` 2.0.3 is a private `calendar-core` dependency. Its closed searches are
filtered back to `[start, end)` at the wrapper, and values are returned in immutable input order.
Timed, date, and floating keys remain exact bigint coordinates; dependency-owned types and legacy
`Date` do not cross the internal seam.

## Correctness matrix

- Stable array and adapter identities return the exact same snapshot without rereading adapters.
- New arrays advance the version and normalize one time.
- Recreated records with unchanged revisions skip interval/title/resource normalization while the
  new application record remains visible.
- Half-open adjacency, type isolation, multi-resource lookup, duplicate IDs, invalid resources,
  malformed Temporal endpoint brands, throwing returned interval properties, malformed timed source
  zones, adapter failures, strict rejection, and LRU eviction are covered by focused tests. Accessor
  throws and malformed returned intervals retain distinct public issue codes.
- A fixed-seed fast-check suite runs 500 randomized timed/all-day/floating interval cases against a
  simple scan oracle.
- The production benchmark candidate is compared with the reference query/projection/layout/render
  semantics before its performance is accepted.

## Production benchmark

Command:

```sh
vp run --no-cache benchmark#core
```

The committed 10,000-event fixture distributes intervals over 365 days and is converted from
transport strings to native Temporal records before timed samples. Build samples include adapter
reads, validation, immutable normalization, three interval indexes, ID/resource maps, and snapshot
construction. Query caching is disabled so the one-day and seven-day samples exercise the interval
indexes rather than an exact-result cache. Each query workload also measures the simple scan oracle
in the same process and passes only when indexed p95 is below both scan p95 and the absolute 1 ms
gate.
Each query sample averages 50 operations, yielding 500 warm-up and 2,500 measured queries per
range while preserving per-query milliseconds.

| Stage | p50 | p95 | Scan p95 | Gate | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| 10k snapshot build | 20.642 ms | 22.240 ms | — | 25 ms | Pass |
| One-day indexed query | 0.013 ms | 0.014 ms | 0.093 ms | < scan and < 1 ms | Pass |
| Seven-day indexed query | 0.050 ms | 0.077 ms | 0.099 ms | < scan and < 1 ms | Pass |
| 1k-fragment projection | 0.090 ms | 0.156 ms | — | Report only | Recorded |
| 1k-fragment layout | 0.322 ms | 0.416 ms | — | 8 ms | Pass |

The run used fixture seed `1414090053`, 10 warmups, and 50 measured samples on an Apple M1 Pro with
10 logical CPUs and 32 GiB memory. These values describe the recorded environment and protocol;
they are not portable end-user latency claims.

## Full repository gate

```text
$ vp run ready
check:          186 files formatted; 131 files linted and type-checked
build:          all recursive production builds passed
test:           22 files passed; 124 tests passed
SSR smoke:      hydrated without mutation; no recoverable errors; interaction and unmount passed
registry smoke: 1 contract fixture and 1 target validated
package graph:  dependency boundaries and packed-consumer checks passed
```

The SSR smoke retained server markup SHA-256
`cda5ec5b4edb5db5ef6037f14bc097428ed80928c048e75e07ea033ffa0dc2a1` under the committed
deterministic environment.

## Verification boundary

Browser, SSR, and accessibility artifacts are not applicable to this framework-free, DOM-free
engine task. The downstream React, view, and phase-gate issues own those matrices.
