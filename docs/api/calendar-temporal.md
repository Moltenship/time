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
| Split at an interior point | `splitInstantInterval` | `splitPlainDateInterval` | `splitPlainDateTimeInterval` |

Point containment includes `start` and excludes `end`. Adjacent intervals do not intersect.
Intersection returns `null` for adjacent or disjoint inputs. Split returns the original
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
and `roundingMode` options; instant rounding is anchored at the Unix epoch. `snapPlainTime` and
`snapZonedDateTime` snap to a midnight-anchored wall-clock grid with the smaller
`nearest | floor | ceil` vocabulary. Native Temporal validates whether an increment is legal for the
selected unit.

`snapPlainTime` returns `{ time, days }`: `days` is `1` when rounding up crossed midnight, so a
late end time is never mistaken for an early one. `snapZonedDateTime` rounds in the value's own
timezone. Inside a fold it keeps the input's offset; inside a gap it resolves to the transition
instant, so `floor` never moves later and `ceil` never moves earlier. `snapZonedWallTime` does the
same for a nominal wall time without an occurrence, such as a pointer position: it snaps first,
then resolves a repeated time to the requested `fold` occurrence and a skipped one to the transition.

```ts
import { snapPlainTime, snapZonedDateTime } from "@moltenship/calendar-temporal";

snapPlainTime(Temporal.PlainTime.from("23:50"), {
  increment: 30,
  mode: "ceil",
  smallestUnit: "minute",
}); // { days: 1, time: 00:00 }

snapZonedDateTime(Temporal.ZonedDateTime.from("2026-03-08T01:50-05:00[America/New_York]"), {
  increment: 15,
  mode: "ceil",
  smallestUnit: "minute",
}); // 2026-03-08T03:00:00-04:00[America/New_York]
```

## Zoned days and splitting

`zonedDayRange(date, timeZone)` returns the boundary-day interval from Temporal's start of the
requested date to the start of the next date. Ordinary, 23-hour, 23.5-hour, 25-hour, and historical
longer days are `kind: "available"` and carry a validated `InstantInterval`. A date removed by a
date-line change is `kind: "skipped"`, has equal `start` and `end` instants, and deliberately has
`interval: null`; the package never fabricates a non-empty range for it. `startBoundary` is the
first real instant of the date, so a midnight gap can begin at `01:00` or another post-transition
wall time.

`splitInstantRangeByZonedDay(range, timeZone)` walks actual day boundaries and returns frozen
fragments with their nominal date, day metadata, continuation flags, and stable key. It does not
emit a fragment for a skipped date. A historical cross-midnight fold can project an instant in one
boundary day back onto the preceding wall date; the fragment retains its boundary-day owner rather
than relabeling it from that projection. Materialization defaults to a 10,000-fragment safety limit.

`zonedDayTransitions(date, timeZone)` returns offset changes whose affected wall range intersects
the date. Each transition identifies its instant, previous and next offsets, offset delta, and the
exact gap or fold wall interval.

## Wall-time projection and disambiguation

`resolveZonedWallTime(wallTime, environment)` requires both a timezone and a Temporal
disambiguation policy. Its result is explicit metadata rather than a bare `ZonedDateTime`:

- a unique wall time has one occurrence;
- a gap has zero occurrences and either a visible earlier/later adjustment or `status: "rejected"`;
- a fold has two occurrences with distinct instant keys, plus the occurrence selected by the policy.

`"compatible"` selects the later shifted value for a gap and the earlier occurrence for a fold.
Gap adjustments retain the requested wall time, resolved wall time, direction, and wall-time delta,
so transaction and accessibility layers can report the change. `projectInstantToZonedTime` performs
the inverse projection and retains the instant key, wall key, offset, timezone identifier, and native
Temporal values.

```ts
import { resolveZonedWallTime } from "@moltenship/calendar-temporal";

const projection = resolveZonedWallTime(Temporal.PlainDateTime.from("2026-03-08T02:15"), {
  disambiguation: "compatible",
  timeZone: "America/New_York",
});

if (projection.status === "resolved" && projection.adjustment) {
  // Requested 02:15, resolved 03:15, one-hour forward shift.
}
```

`ZonedTimeEnvironment` is structural: the timezone/disambiguation portion of the core
`CalendarEnvironment` can be passed directly. Current time remains a separate injected concern;
callers supply a `Temporal.Instant` or `CalendarClock`, and no zoned helper reads `Temporal.Now`.

## Zoned wall-clock slots

`slotsInZonedDay(date, options)` builds a bounded nominal 24-hour wall grid from an explicit
positive, time-only `slotDuration`. Each slot contains one or more segments:

- gap segments have no instant occurrence;
- unique segments have one instant interval;
- fold projections retain two instant identities; a segment exposes only the occurrence intervals
  owned by the selected boundary day;
- if a transition falls inside a configured slot, the slot is `kind: "transition"` and is split at
  the exact affected-wall-range boundaries.

Most boundary days are represented completely by their nominal slots. For a historical fold that
crosses midnight, a boundary day can also own a physical interval whose projected wall coordinate
belongs to an adjacent nominal date. `carryoverOccurrences` exposes those exceptional pieces
without placing them at an incorrect coordinate in the 24-hour grid. `physicalDurationNanoseconds`
is the sum of nominal segment occurrences and carryover occurrences and equals the boundary-day
duration, including zero for a skipped date. This keeps visual wall coordinates separate from
physical elapsed time without losing repeated-hour identity. Slot materialization defaults to a
10,000-item safety limit.

## Machine keys

`instantKey`, `plainDateKey`, `plainDateTimeKey`, `zonedDayKey`, and `zonedWallTimeKey` produce
deterministic strings for indexes, caches, and render models. A zoned wall key identifies the
nominal coordinate only; a fold occurrence must use its `instantKey`, because the two occurrences
share the same wall coordinate. Zoned keys normalize identifier case but keep aliases such as
`Asia/Calcutta` and `Asia/Kolkata` distinct, because engines disagree on the primary name.

## Runtime and package guarantees

- Node.js 26+ exercises unflagged native Temporal in local checks and CI.
- Current TypeScript with `compilerOptions.lib: ["ESNext"]` supplies the ambient Temporal declarations.
- Consumers use the global `Temporal` namespace directly; the package does not re-export it.
- The package contains no React, DOM, timezone default, current-time read, parser, or runtime
  polyfill dependency, and it has no production dependencies.
- The production ESM entry must remain at or below 30 KiB raw and 7 KiB gzip. The package build
  enforces both budgets.
