# Issue 21 Temporal utility evidence

Recorded on 2026-08-15 from `agent/21-temporal-utilities` on macOS arm64.

## Runtime boundary

The repository selects Node.js through `.node-version` and declares `engines.node >=26.0.0`. The
verified local runtime was Node.js 26.7.0, where `typeof globalThis.Temporal === "object"` without a
V8 feature flag. CI selects Node.js 26 through `voidzero-dev/setup-vp`.

`tests/temporal-utilities-boundary.test.ts` verifies that the utility modules do not read
`Temporal.Now`, a timezone, legacy `Date`, a parser, or a runtime polyfill. The only production
dependency remains the declaration-only `temporal-spec@1.0.1` package.

## Focused correctness and package build

```text
$ vp test packages/calendar-temporal/tests tests/temporal-utilities-boundary.test.ts tests/quality-gates.test.ts
Test Files  6 passed (6)
Tests       30 passed (30)

$ vp run calendar-temporal#build
dist/index.mjs    12.04 kB | gzip: 2.60 kB
dist/index.d.mts  11.44 kB | gzip: 2.45 kB
[calendar-temporal:size] raw=12041/16384 gzip=2601/4096
```

The focused suite includes fast-check properties for interval intersection/clamping symmetry,
split boundary round trips, half-open date iteration, exact instant-grid steps, and month-grid
coverage. It also covers adjacency, invalid ranges, iterator limits, explicit week starts, rounding,
and type-specific public signatures.

## Full repository gate

```text
$ vp run ready
check:          171 files formatted; 116 files linted and type-checked
build:          all recursive production builds passed
test:           18 files passed; 87 tests passed
SSR smoke:      hydrated without mutation; no recoverable errors; interaction and unmount passed
registry smoke: 1 contract fixture and 1 target validated
package graph:  dependency boundaries and quality-gate contracts passed
```

The SSR smoke retained server markup SHA-256
`cda5ec5b4edb5db5ef6037f14bc097428ed80928c048e75e07ea033ffa0dc2a1` under the committed
deterministic environment.
