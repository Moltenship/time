# Performance harness

This workspace is a production-bundle benchmark protocol, not a product performance claim. The
core task measures the production indexed event snapshot; the recurrence task measures recurring
series expanded for the year view. Nothing here measures layout, rendering, pointer frames or
scrolling yet (#188).

## Tasks

Run from the repository root, by hand on reference hardware. No tier of the quality gate runs
them: the timings are for one machine, not a portable CI claim.

```sh
vp run benchmark#core
vp run benchmark#recurrence
```

Both first build the benchmark and its workspace dependencies, then execute files from
`benchmarks/dist`. Workspace packages export their TypeScript source, which Node can't run, so the
tasks start Node with `--import ./dist/shared/published-packages.mjs`: it resolves each
`@moltenship/*` package to the bundle its build wrote, the entry `publishConfig.exports` publishes.
Vite Task never caches them, so timings always describe the current process and machine. They run
gated, with ten warmups and fifty samples per stage and Node's `--expose-gc`: protocol v2 collects
between measured samples, outside the timed region, so garbage left by one sample does not randomly
contaminate the next. `--mode=smoke` takes two warmups and eight samples.

## The indexed snapshot

`benchmark#core` builds a snapshot of 10,000 seeded events over a year (timed, all-day and
floating, across 500 resources) and queries it.

| Stage | Work measured | p95 gate |
| --- | --- | --- |
| `build` | Validate, normalize, and index 10k native-Temporal events | 25 ms |
| `query-1d` | One-day production interval-index query versus a scan of every event | < 1 ms and < scan p95 |
| `query-7d` | Seven-day production interval-index query versus a scan of every event | < 1 ms and < scan p95 |

Query reports include the scan p95 from the same fixture, process, warmup count, and sample count.
Both indexed workloads must beat that scan as well as the absolute gate. Each query sample averages
200 operations, so a workload performs 2,000 warm-up and 10,000 measured queries.
Transport-string conversion is prepared before timed samples. The build measurement begins at
application records containing native Temporal values and includes adapter reads, validation,
normalization, ID/resource maps, interval indexes, and snapshot construction.

`tests/harness.test.ts` holds the indexed snapshot to the scan's answers
(`compareCandidateToReference`), so an index that is faster because it returns less fails.

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
| `expand-cold` | A new expander expands all 200 series over the year's load range: the year view's first paint | 19 / 19–21 ms | 40 ms |
| `expand-warm` | An expander that has just shown the year is asked for the next year: navigating forward | 18 / 19–22 ms | 40 ms |
| `occurrence-snapshot` | Core's `createEventSnapshot` of the year's occurrences through a new `createOccurrenceAdapter`, as the calendar builds next | 17–18 / 18–33 ms | Report only |

Measured in eight full gated runs on an Apple M5 Pro with Node 26.9. The gates leave about twice
the worst p95, as the core build gate does over its 13 ms, so they catch a real regression such as
losing skip-ahead without failing on a slower laptop. 40 ms is also under half the 100 ms a
navigation has to respond in, which leaves the rest for the snapshot, projection, and render.
Before #160 the stages took 23–24 / 24–28, 21–22 / 23–30 and 25–27 / 28–32 ms, under 50 ms gates:
the expander now keys each occurrence once and sorts only series with RDATEs, and
`createOccurrenceAdapter` keys intervals by epoch nanoseconds rather than ISO text and shares the
keys between adapters. The snapshot stage makes a new adapter for each sample, as a calendar that
creates one on every render does, so after the first sample it reads the keys earlier adapters
made; keyed afresh, it takes about 21.5 / 23.5 ms.

The warm stage asks for the next year because that is the expansion a user waits for after the
first paint. Asked for the same range with the same events, the expander returns its memoized
result after comparing the event list, which measures nothing. Most of the work is per occurrence
and has to be done for any new range, so warm costs about what cold does, a little less as the next
year has 6% fewer occurrences: the series plans the expander keeps are about 1% of a cold profile.

## Protocol

- Use the fixed default seed and record fixture counts in every report.
- Warm up each stage before collecting independent samples.
- Use Node's monotonic high-resolution timer and nearest-rank p50/p95.
- Consume each result so the operation cannot be discarded as unused.
- Sample process memory before and after the suite, outside timed loops.
- Record Node, OS/release, architecture, CPU, logical concurrency, and installed memory.
- Apply only architecture-approved thresholds.
- In gated mode, any threshold failure sets a nonzero process exit status.

For an intentional local gating proof, build the benchmark and run a production bundle with a
negative threshold scale. The report must say `gate=fail` and the process must exit 1:

```sh
cd benchmarks
node --expose-gc --import ./dist/shared/published-packages.mjs \
  dist/core/index.mjs --mode=smoke --gated --threshold-scale=-1
```
