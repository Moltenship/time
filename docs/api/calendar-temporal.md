# `@moltenship/calendar-temporal`

`@moltenship/calendar-temporal` is the framework-free, native-Temporal foundation for Time. It
targets Node.js 26+ and modern browsers with `globalThis.Temporal`; it does not import a polyfill,
read the host timezone, accept legacy `Date`, or parse fuzzy input.

Consumers import every supported value and type from the package root. Source-file paths are not
public API.

`compareInstants`, `comparePlainDates`, `comparePlainDateTimes`, and `comparePlainTimes` expose the
native type-specific ordering operations used by the rest of the package.

## Half-open intervals

`instantInterval`, `plainDateInterval`, and `plainDateTimeInterval` create frozen, non-empty
`[start, end)` values. Equal or reversed endpoints throw `InvalidHalfOpenIntervalError`. External
validation boundaries can use `validateHalfOpenInterval` when a discriminated result is preferable
to throwing.

Every operation is specific to one Temporal point type:

| Operation | Instant | PlainDate | PlainDateTime |
| --- | --- | --- | --- |
| Point containment | `instantIntervalContains` | `plainDateIntervalContains` | `plainDateTimeIntervalContains` |
| Interval containment | `instantIntervalContainsInterval` | `plainDateIntervalContainsInterval` | `plainDateTimeIntervalContainsInterval` |
| Overlap predicate | `instantIntervalsIntersect` | `plainDateIntervalsIntersect` | `plainDateTimeIntervalsIntersect` |
| Intersection | `intersectInstantIntervals` | `intersectPlainDateIntervals` | `intersectPlainDateTimeIntervals` |
| Clamp to bounds | `clampInstantInterval` | `clampPlainDateInterval` | `clampPlainDateTimeInterval` |
| Split at an interior point | `splitInstantInterval` | `splitPlainDateInterval` | `splitPlainDateTimeInterval` |

Point containment includes `start` and excludes `end`. Adjacent intervals do not intersect.
Intersection and clamp return `null` for adjacent or disjoint inputs. Split returns the original
interval as a one-item tuple unless the split point is strictly inside it.

## Lazy grids

`iteratePlainDates(range, options)` lazily visits a `PlainDateInterval`. `stepDays` defaults to one
and must be a positive safe integer. `iterateInstants(range, { step })` accepts an explicit positive,
time-only `Temporal.DurationLike`. Both iterators exclude `range.end` and default to a 10,000-value
safety limit; callers traversing a larger intentional range must raise `limit` explicitly.

```ts
import { iteratePlainDates, plainDateInterval } from "@moltenship/calendar-temporal";

const range = plainDateInterval(
  Temporal.PlainDate.from("2026-08-01"),
  Temporal.PlainDate.from("2026-09-01"),
);

for (const date of iteratePlainDates(range)) {
  // 2026-08-01 through 2026-08-31
}
```

## Week and month grids

`weekRange(date, { weekStartsOn })` returns the seven-day half-open week containing `date`.
`weekStartsOn` is the ISO day number from 1 (Monday) through 7 (Sunday); locale-derived week rules
must be resolved by the caller.

`monthGrid(date, options)` returns a frozen object containing the first day of the anchored month,
the complete visible range, and consecutive seven-day row intervals. Natural grids contain four to
six rows. `{ fixedWeeks: true }` pads them to exactly six. Dates remain lazy: pass `grid.range` or an
individual row to `iteratePlainDates` when cells are needed.

## Rounding and snapping

`roundPlainTime` and `roundInstant` expose native Temporal rounding with package-level `increment`
and `roundingMode` options. `snapPlainTime` and `snapInstant` use the smaller `nearest | floor | ceil`
vocabulary. Plain-time grids are anchored at midnight; instant grids are anchored at the Unix epoch.
Native Temporal validates whether an increment is legal for the selected unit.

```ts
import { snapPlainTime } from "@moltenship/calendar-temporal";

const snapped = snapPlainTime(Temporal.PlainTime.from("10:07:30"), {
  increment: 15,
  mode: "nearest",
  smallestUnit: "minute",
}); // 10:15:00
```

## Runtime and package guarantees

- Node.js 26+ exercises unflagged native Temporal in local checks and CI.
- Current TypeScript with `compilerOptions.lib: ["ESNext"]` supplies the ambient Temporal declarations.
- Consumers use the global `Temporal` namespace directly; the package does not re-export it.
- The package contains no React, DOM, timezone default, current-time read, parser, or runtime
  polyfill dependency, and it has no production dependencies.
- The production ESM entry must remain at or below 16 KiB raw and 4 KiB gzip. The package build
  enforces both budgets.
