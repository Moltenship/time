# Reference harness baseline — 2026-08-15

This record calibrates benchmark protocol v1 against the deliberately simple reference algorithms.
It is not evidence for the future indexed engine, React commit behavior, browser rendering, or an
end-user latency claim.

## Reference environment

| Field | Value |
| --- | --- |
| Machine CPU | Apple M1 Pro |
| Available logical CPUs | 10 |
| Installed memory | 32 GiB |
| Platform | macOS (`darwin`, `arm64`) |
| Darwin release | 25.5.0 |
| Node | v24.19.0 |
| Runner | Production ESM bundle from `benchmarks/dist/run.mjs` |
| Measured revision | `e470476e00d04242bfe5072dc61f3ba468e4e9e1` |
| Fixture seed | `1414090053` (`0x54494d45`) |
| Fixture profile | 10,000 events; 1,000 visible fragments; 500 resources; 5 DST cases |

Command:

```sh
vp run --no-cache benchmark#gated
```

Each stage used 10 warmup iterations followed by 50 measured samples. Values below are monotonic
wall-clock milliseconds reported with nearest-rank percentiles.

## Results

| Stage | p50 | p95 | Initial p95 threshold | Result |
| --- | ---: | ---: | ---: | --- |
| Build | 0.662 ms | 1.517 ms | 25 ms | Pass |
| Query | 0.129 ms | 0.195 ms | 1 ms | Pass |
| Projection | 0.052 ms | 0.072 ms | Report only | Recorded |
| Layout | 0.352 ms | 0.506 ms | 8 ms | Pass |
| Render-model materialization | 0.017 ms | 0.053 ms | Report only | Recorded |
| Pointer-frame hit test | 0.012 ms | 0.032 ms | 4 ms | Pass |

The process memory snapshots changed by +9.0 MiB heap used and +31.2 MiB RSS across this run. These
are diagnostic deltas, not allocation budgets: Node documents process memory collection as a
point-in-time operation, and garbage collection plus allocator behavior can move either value between
runs.

## Interpretation boundary

- Build, query, projection, and layout currently exercise the simple correctness reference.
- Query is intentionally a linear scan; its timing does not satisfy the architecture's indexed-query
  implementation requirement.
- Render measures framework-neutral model creation, not React reconciliation, DOM work, style/layout,
  or paint.
- Pointer-frame measures reference library scripting only, not browser event delivery or presentation.
- A future candidate result is admissible only after `compareCandidateToReference` reports identical
  semantics for query, projection, layout, render models, and hit testing.
- Compare later numbers only with the same fixture seed, protocol, production-build mode, and an
  equivalent recorded environment.
