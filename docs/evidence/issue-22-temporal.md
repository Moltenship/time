# Issue 22 zoned-day and DST utility evidence

Recorded on 2026-08-15 from the issue #22 implementation worktree on macOS arm64 with Node.js
26.7.0 and native, unflagged `globalThis.Temporal`.

## Contract evidence

The production `@moltenship/calendar-temporal` entry point now exposes:

- actual zoned-day boundaries, including a discriminated skipped-date result;
- instant-range splitting at actual zoned-day boundaries;
- offset-transition metadata with exact affected gap/fold wall ranges;
- explicit wall-time resolution through an injected timezone/disambiguation environment;
- inverse instant-to-zone projection metadata;
- transition-aware nominal wall slots with zero/one/two physical occurrences;
- deterministic date, date-time, zoned-day, wall-coordinate, and instant keys.

The implementation imports no timezone database or Temporal polyfill. Zoned helpers require an
explicit timezone, policy-sensitive helpers require an explicit disambiguation value, and the
runtime-boundary test proves the new modules do not read `Temporal.Now` or legacy `Date`.

## DST and timezone matrix

| Case | Verified result |
| --- | --- |
| New York spring gap, 2026-03-08 | 23-hour day; `02:00` and `02:30` 30-minute slots have zero occurrences; `compatible` shifts forward and retains requested/resolved wall times |
| New York fall fold, 2026-11-01 | 25-hour day; `01:00` and `01:30` slots each retain two distinct instant identities and offsets |
| Lord Howe half-hour gap, 2026-10-04 | 23.5-hour day; a 45-minute `01:30–02:15` slot splits into unique and gap segments at `02:00` |
| Santiago midnight gap, 2026-09-06 | day starts at the first real wall time, `01:00`; first two 30-minute slots are gaps; reject policy remains rejected |
| Kathmandu unusual offset | ordinary 24-hour grid projects `+05:45` without host-timezone input |
| Apia date-line change, 2011-12-30 | date is `kind: "skipped"` with no fabricated interval; slots are all gaps and zoned splitting emits no fragment for the removed date |

The ordinary-grid fast-check property ran 150 generated year/month/duration cases and verified
bounded slot counts, adjacency, stable unique slot keys, unique occurrence cardinality, and exact
physical-day totals.

## Focused checks

```text
$ vp test packages/calendar-temporal/tests packages/calendar-core/tests tests/temporal-utilities-boundary.test.ts tests/dependency-boundaries.test.ts tests/quality-gates.test.ts
Test Files  11 passed (11)
Tests       67 passed (67)

$ vp run calendar-temporal#build
dist/index.mjs    26.09 kB | gzip: 5.80 kB
dist/index.d.mts  19.17 kB | gzip: 3.88 kB
[calendar-temporal:size] raw=26085/28672 gzip=5801/6144
```

The size budget moved from the issue #21 base-only 16 KiB / 4 KiB gate to 28 KiB / 6 KiB for the
intentional public zoned-day, projection, slot, transition, and key surface. The production artifact
remains dependency-free and tree-shakeable.

## Full repository gate

```text
$ vp run ready
check:          178 files formatted; 123 files linted and type-checked
build:          all recursive production builds passed
test:           21 files passed; 107 tests passed
SSR smoke:      hydrated without mutation; no recoverable errors; interaction and unmount passed
registry smoke: 1 contract fixture and 1 target validated
package graph:  dependency boundaries and quality-gate contracts passed
```

The SSR smoke retained server markup SHA-256
`cda5ec5b4edb5db5ef6037f14bc097428ed80928c048e75e07ea033ffa0dc2a1` under the committed
deterministic environment. Browser and accessibility artifacts are not applicable to this
framework-free, DOM-free utility task; later time-grid work consumes this metadata for rendering
and announcements. The interval-index performance evidence and wall-geometry decision remain in
[ADR 0016](../adr/0016-interval-index-and-dst-wall-time-geometry.md).
