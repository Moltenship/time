# Performance harness

This workspace is a production-bundle benchmark protocol, not a product performance claim. The
core task measures the production indexed event snapshot; the recurrence task measures recurring
series expanded for the year view; the complete and React tasks continue to use deliberately simple
reference stages until their owning implementations land.

## First-class tasks

Run from the repository root:

```sh
vp run benchmark#smoke
vp run benchmark#core
vp run benchmark#react
vp run benchmark#gated
vp run benchmark#recurrence
vp run benchmark#recurrence:smoke
```

Every task first builds the benchmark and its workspace dependencies, then executes files from
`benchmarks/dist`. Workspace packages export their TypeScript source, which Node can't run, so tasks
that load them start Node with `--import ./dist/shared/published-packages.mjs`: it resolves each
`@moltenship/*` package to the bundle its build wrote, the entry `publishConfig.exports` publishes.
Benchmark tasks disable Vite Task caching so timings always describe the current process and
machine. Gated tasks run Node with `--expose-gc`; protocol v2 collects between measured samples,
outside the timed region, so garbage left by one sample does not randomly contaminate the next.
`smoke` uses the full 10k/1k/500 fixture with two warmups and eight samples per stage; full tasks use
ten warmups and fifty samples. Each query sample averages 200 operations, so a full one-day or
seven-day workload performs 2,000 warm-up and 10,000 measured queries.

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

## Recurrence on the year view

`benchmark#recurrence` expands 200 recurring series over a full year, as the year view asks for
them, with `createOccurrenceExpander` from `@moltenship/calendar-recurrence`'s production bundle. The
range is the year view's `loadRange`, which core's `resolveViewLoadRange` gives for 1 August 2026 in
Europe/Berlin: 2026-01-01 to 2027-01-01. The year view keeps no dates ready around the year, so that
is `getYearRange` itself.

The fixed-seed fixture is a busy work calendar with a team's and a family's calendars on top: daily
stand-ups on weekdays, daily and every-other-day series, weekly meetings on one to three days,
bi-weekly ones, monthly ones on the 1st, 15th, 28th, or last day and on the 1st Monday, 2nd
Tuesday, or last Friday, quarterly reviews, 50 yearly all-day birthdays (one on 29 February), and
all-day or floating chores. Timed series repeat in Europe/Berlin, America/New_York, Asia/Kolkata,
Australia/Sydney, and Australia/Lord_Howe; one runs at 02:30 in Berlin through the hour Europe
skips in March. 15 end after a COUNT and 18 on an UNTIL, 27 skip EXDATEs, and 29 overrides move 13
occurrences and cancel 16. Most series started between 2015 and 2025, so the engine skips ahead to
the year. The year shows 10,257 occurrences and the next year 9,669;
`tests/recurrence.test.ts` pins both, by kind of series, so an engine that is faster because it
shows less fails.

| Stage | Work measured now | Measured p50 / p95 | p95 gate |
| --- | --- | --- | --- |
| `expand-cold` | A new expander expands all 200 series over the year's load range: the year view's first paint | 23–24 / 24–28 ms | 50 ms |
| `expand-warm` | An expander that has just shown the year is asked for the next year: navigating forward | 21–22 / 23–30 ms | 50 ms |
| `occurrence-snapshot` | Core's `createEventSnapshot` of the year's occurrences through `createOccurrenceAdapter`, as the calendar builds next | 25–27 / 28–32 ms | Report only |

Measured in eight full gated runs on an Apple M5 Pro with Node 26.9. The gates leave about twice
the worst p95, as the core build gate does over its 13 ms, so they catch a real regression such as
losing skip-ahead without failing on a slower laptop. 50 ms is also half the 100 ms a navigation
has to respond in, which leaves the rest for the snapshot, projection, and render.

The warm stage asks for the next year because that is the expansion a user waits for after the
first paint. Asked for the same range with the same events, the expander returns its memoized
result after comparing the event list, which measures nothing. Most of the work is per occurrence
and has to be done for any new range, so warm costs about what cold does, a little less as the next
year has 6% fewer occurrences: the series plans the expander keeps are about 1% of a cold profile.

```sh
node --expose-gc --import ./benchmarks/dist/shared/published-packages.mjs \
  benchmarks/dist/recurrence/index.mjs --mode=smoke --gated --threshold-scale=-1
```

The command above is the recurrence task's gating proof: it must print `gate=fail` and exit 1.

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
import { compareCandidateToReference } from "./core/index";
import { generateBenchmarkFixtures } from "fixtures";

const comparison = compareCandidateToReference(candidateEngine, generateBenchmarkFixtures());
```

The comparison checks range-query IDs, projection, layout, render models, and pointer hit-test output.
A candidate with different semantics must fail correctness before its faster number is relevant.

For an intentional local gating proof, build the benchmark and run the production bundle with a
negative threshold scale. The report must say `gate=fail` and the process must exit nonzero:

```sh
node --expose-gc benchmarks/dist/run.mjs --mode=smoke --gated --threshold-scale=-1
```
