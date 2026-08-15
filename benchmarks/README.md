# Performance harness

This workspace is a production-bundle benchmark protocol, not a product performance claim. The
core task measures the production indexed event snapshot; the complete and React tasks continue to
use deliberately simple reference stages until their owning implementations land.

## First-class tasks

Run from the repository root:

```sh
vp run benchmark#smoke
vp run benchmark#core
vp run benchmark#react
vp run benchmark#gated
```

Every task first builds the benchmark and its workspace dependencies, then executes files from
`benchmarks/dist`. Benchmark tasks disable Vite Task caching so timings always describe the current
process and machine. `smoke` uses the full 10k/1k/500 fixture with two warmups and eight samples per
stage; full tasks use ten warmups and fifty samples. Each query sample averages 50 operations, so a
full one-day or seven-day workload performs 500 warm-up and 2,500 measured queries.

## Separately reported stages

| Stage | Work measured now | Initial p95 gate |
| --- | --- | --- |
| `build` | Core: validate, normalize, and index 10k native-Temporal events; complete: reference snapshot | 25 ms |
| `query-1d` | Core: one-day production interval-index query versus the scan oracle | < 1 ms and < scan p95 |
| `query-7d` | Core: seven-day production interval-index query versus the scan oracle | < 1 ms and < scan p95 |
| `query` | Complete task: scan-oracle query until its owning engine lands | 1 ms |
| `projection` | Materialize the exact 1k visible fragment inputs | Report only |
| `layout` | Deterministic overlap lane assignment for 1k fragments | 8 ms |
| `render` | Materialize framework-neutral render models | Report only |
| `pointer-frame` | Reference hit-test scripting for one pointer frame | 4 ms |

Core query reports include the scan p95 from the same fixture, process, warmup count, and sample
count. Both indexed workloads must beat that reference p95 as well as the absolute gate.
Transport-string conversion is prepared before timed core samples. The build measurement begins at
application records containing native Temporal values and includes adapter reads, validation,
normalization, ID/resource maps, interval indexes, and snapshot construction. Render excludes React
commits, browser style/layout, and paint. Pointer-frame excludes event delivery and browser paint.
Those claims require the later React and browser gates.

## Protocol

- Use the fixed default seed and record fixture counts in every report.
- Warm up each stage before collecting independent samples.
- Use Node's monotonic high-resolution timer and nearest-rank p50/p95.
- Consume each result so the operation cannot be discarded as unused.
- Sample process memory before and after the suite, outside timed loops.
- Record Node, OS/release, architecture, CPU, logical concurrency, and installed memory.
- Apply only architecture-approved thresholds. Projection and render remain report-only until their
  owning engine/browser issues establish audited budgets.
- In gated mode, any threshold failure sets a nonzero process exit status.

## Candidate comparison

Candidate engines implement the generic `BenchmarkEngine<TSnapshot>` seam and are checked against
`referenceEngine` before their timings are accepted. The production indexed core is covered by this
comparison in the benchmark test suite:

```ts
import { compareCandidateToReference } from "./core/index.ts";
import { generateBenchmarkFixtures } from "fixtures";

const comparison = compareCandidateToReference(candidateEngine, generateBenchmarkFixtures());
```

The comparison checks range-query IDs, projection, layout, render models, and pointer hit-test output.
A candidate with different semantics must fail correctness before its faster number is relevant.

For an intentional local gating proof, build the benchmark and run the production bundle with a
negative threshold scale. The report must say `gate=fail` and the process must exit nonzero:

```sh
node benchmarks/dist/run.mjs --mode=smoke --gated --threshold-scale=-1
```
