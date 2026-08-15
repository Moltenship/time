# Issue 21 Temporal utility evidence

Recorded on 2026-08-15 from `agent/21-temporal-utilities` on macOS arm64.

## Runtime boundary

The repository selects Node.js through `.node-version` and declares `engines.node >=26.0.0`. The
verified local runtime was Node.js 26.7.0, where `typeof globalThis.Temporal === "object"` without a
V8 feature flag. CI selects Node.js 26 through `voidzero-dev/setup-vp`.

`tests/temporal-utilities-boundary.test.ts` verifies that the utility modules do not read
`Temporal.Now`, a timezone, legacy `Date`, a parser, or a runtime polyfill. Every workspace compiles
with TypeScript 7.0.2 and `compilerOptions.lib: ["ESNext"]`, which supplies the ambient Temporal
namespace. The package has no production dependencies and does not re-export the platform global.

The package-boundary test packs `@moltenship/calendar-temporal`, verifies its manifest and emitted
declarations contain no Temporal dependency, and compiles a clean consumer against the packed
declarations using the workspace's current TypeScript compiler and only its `ESNext` library.

## Focused correctness and package build

```text
$ vp test packages/calendar-temporal/tests packages/calendar-core/tests tests/temporal-utilities-boundary.test.ts tests/dependency-boundaries.test.ts tests/quality-gates.test.ts
Test Files  8 passed (8)
Tests       48 passed (48)

$ vp run calendar-temporal#build
dist/index.mjs    13.09 kB | gzip: 2.88 kB
dist/index.d.mts  11.39 kB | gzip: 2.43 kB
[calendar-temporal:size] raw=13089/16384 gzip=2877/4096
```

The focused suite includes fast-check properties for interval intersection/clamping symmetry,
split boundary round trips, half-open date iteration, exact instant-grid steps, and month-grid
coverage. It also covers adjacency, invalid ranges, iterator limits, explicit week starts, rounding,
type-specific public signatures, overshooting iteration strides, and ranges ending at the Temporal
upper bounds.

## Full repository gate

```text
$ vp run ready
check:          170 files formatted; 115 files linted and type-checked
build:          all recursive production builds passed
test:           18 files passed; 88 tests passed
SSR smoke:      hydrated without mutation; no recoverable errors; interaction and unmount passed
registry smoke: 1 contract fixture and 1 target validated
package graph:  dependency boundaries and quality-gate contracts passed
```

The SSR smoke retained server markup SHA-256
`cda5ec5b4edb5db5ef6037f14bc097428ed80928c048e75e07ea033ffa0dc2a1` under the committed
deterministic environment.
