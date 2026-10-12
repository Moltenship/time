import { resolveViewInstantRange } from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import {
  clock,
  createExpander,
  minutesOf,
  monthView,
  scrollingWeekView,
  show,
  weekView,
  yearView,
  type Occurrence,
} from "./calendar";
import {
  displayZones,
  eventsOf,
  kolkata,
  seriesZones,
  weeksOf,
  type SeriesSpec,
  type SeriesZone,
} from "./zones";

// The DST matrix's checks across every series zone, display zone and transition week, against
// Temporal's own reading of each series' wall time and against the whole year expanded at once.
// `dst-matrix.test.ts` has the positions worked out by hand.

type Timed = Readonly<{ end: Temporal.Instant; start: Temporal.Instant }>;

const timedOf = (occurrence: Occurrence) => occurrence.interval as Timed;
const describeOccurrence = (occurrence: Occurrence) => {
  const { end, start } = timedOf(occurrence);
  return `${occurrence.id} ${start.toString()}/${end.toString()}`;
};
const overlaps = (occurrence: Occurrence, from: Temporal.Instant, to: Temporal.Instant) => {
  const { end, start } = timedOf(occurrence);
  return Temporal.Instant.compare(start, to) < 0 && Temporal.Instant.compare(end, from) > 0;
};
/** The occurrences overlapping `from` to `to`, described and sorted. */
const within = (occurrences: Iterable<Occurrence>, from: Temporal.Instant, to: Temporal.Instant) =>
  [...occurrences]
    .filter((occurrence) => overlaps(occurrence, from, to))
    .map(describeOccurrence)
    .toSorted();
const later = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) > 0 ? left : right;
const earlier = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) < 0 ? left : right;

/** Mondays from the week holding `from` to the week holding `to`. */
function mondays(from: string, to: string): string[] {
  const result: string[] = [];
  const first = Temporal.PlainDate.from(from);
  const last = Temporal.PlainDate.from(to);
  for (
    let day = first.subtract({ days: first.dayOfWeek - 1 });
    Temporal.PlainDate.compare(day, last) <= 0;
    day = day.add({ weeks: 1 })
  ) {
    result.push(day.toString());
  }
  return result;
}

/**
 * Where a week view draws an interval in `timeZone`, worked out without core: the interval runs at
 * one offset between the zone's changes, and each date's block reaches from the earliest wall time
 * a run has on that date to the latest, so a block across a repeated hour covers it once. Minutes
 * from midnight, by date.
 */
function blocksOf({ end, start }: Timed, timeZone: string): Map<string, [number, number]> {
  const blocks = new Map<string, [number, number]>();
  const minutes = (from: Temporal.PlainDateTime, to: Temporal.PlainDateTime) =>
    from.until(to, { largestUnit: "minute" }).minutes;
  let cursor = start.toZonedDateTimeISO(timeZone);
  for (;;) {
    const change = cursor.getTimeZoneTransition("next");
    const until =
      change === null || Temporal.Instant.compare(change.toInstant(), end) >= 0
        ? end
        : change.toInstant();
    const runStart = cursor.toPlainDateTime();
    const runEnd = runStart.add(cursor.toInstant().until(until));
    for (
      let day = runStart.toPlainDate();
      Temporal.PlainDateTime.compare(day.toPlainDateTime(), runEnd) < 0;
      day = day.add({ days: 1 })
    ) {
      const midnight = day.toPlainDateTime();
      const top = Math.max(0, minutes(midnight, runStart));
      const bottom = Math.min(24 * 60, minutes(midnight, runEnd));
      const [earliest, latest] = blocks.get(day.toString()) ?? [top, bottom];
      blocks.set(day.toString(), [Math.min(earliest, top), Math.max(latest, bottom)]);
    }
    if (change === null || until === end) return blocks;
    cursor = change;
  }
}

/**
 * Where the oracle puts an occurrence in its own zone: on a date the rule repeats on, at its wall
 * time as Temporal reads it (moved forward by a gap, or the first of a repeated time), lasting as
 * long as the first, and named by its series and that start in UTC.
 */
function wrongPlace(zone: SeriesZone, occurrence: Occurrence): string | undefined {
  const spec = zone.series.find(({ id }) => id === occurrence.recurrence?.seriesId);
  if (spec === undefined) return `${occurrence.id}: no series`;
  const { end, start } = timedOf(occurrence);
  const first = Temporal.PlainDateTime.from(spec.start);
  const day = start.toZonedDateTimeISO(zone.timeZone).toPlainDate();
  const expected = day.toPlainDateTime(first.toPlainTime()).toZonedDateTime(zone.timeZone);
  const problems = [
    repeatsOn(spec, day) ? "" : `doesn't repeat on ${day.toString()}`,
    start.equals(expected.toInstant()) ? "" : `starts at ${start.toString()}`,
    start.until(end).total("minutes") === spec.minutes ? "" : `ends at ${end.toString()}`,
    occurrence.id === `${spec.id}::${start.toString()}` ? "" : "has another ID",
  ].filter(Boolean);
  return problems.length === 0 ? undefined : `${occurrence.id}: ${problems.join(", ")}`;
}

function repeatsOn(spec: SeriesSpec, date: Temporal.PlainDate): boolean {
  const first = Temporal.PlainDateTime.from(spec.start).toPlainDate();
  return Temporal.PlainDate.compare(date, first) >= 0 && spec.on(date);
}

describe.each(seriesZones)("$timeZone series", (zone) => {
  const events = eventsOf(zone);
  // One expander, kept across weeks and display zones as an application keeps one.
  const expander = createExpander();
  // The year at once in the series' own zone: every week is checked against it.
  const year = show(yearView, "2026-06-01", zone.timeZone, events, expander);

  test("repeat on every day their rules say in 2026, once each, gaps and folds included", () => {
    expect(year.expansion.issues).toEqual([]);
    const counts: Record<string, number> = {};
    for (const occurrence of year.expansion.occurrences) {
      const id = occurrence.recurrence!.seriesId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts).toEqual(Object.fromEntries(zone.series.map(({ id, in2026 }) => [id, in2026])));
    expect(year.expansion.occurrences.map((occurrence) => wrongPlace(zone, occurrence))).toEqual(
      year.expansion.occurrences.map(() => undefined),
    );

    // The year view, day by day: each series starts once on the days its rule repeats on.
    const wrongDays: string[] = [];
    for (const day of year.projection.months.flatMap(({ weeks }) =>
      weeks.flatMap(({ days }) => days.filter((cell) => cell !== null)),
    )) {
      for (const spec of zone.series) {
        const starting = day.fragments.filter(
          ({ event, startsBeforeDay }) => event.title === spec.id && !startsBeforeDay,
        ).length;
        if (starting !== (repeatsOn(spec, day.date) ? 1 : 0)) {
          wrongDays.push(`${day.date.toString()} ${spec.id} ×${starting}`);
        }
      }
    }
    expect(wrongDays).toEqual([]);
  });

  describe.each(displayZones)("shown in %s", (timeZone) => {
    test.each(weeksOf(zone, timeZone))("the week of %s", (monday) => {
      const { expansion, projection, range, snapshot } = show(
        weekView,
        monday,
        timeZone,
        events,
        expander,
      );
      const { end: to, start: from } = resolveViewInstantRange(range, timeZone);

      expect(expansion.issues).toEqual([]);
      expect(snapshot.issues).toEqual([]);
      // Each keeps its wall time in its own zone, whatever zone shows it.
      expect(expansion.occurrences.map((occurrence) => wrongPlace(zone, occurrence))).toEqual(
        expansion.occurrences.map(() => undefined),
      );
      // The week has exactly the year's occurrences that overlap it: none lost, none doubled.
      expect(expansion.occurrences.map(describeOccurrence)).toEqual(
        year.expansion.occurrences
          .filter((occurrence) => overlaps(occurrence, from, to))
          .map(describeOccurrence),
      );

      // Each occurrence shows once on every date it touches in the display zone, where its wall
      // times say.
      const dates = new Set(projection.days.map(({ column }) => column.date.toString()));
      const expected = expansion.occurrences.flatMap((occurrence) =>
        [...blocksOf(timedOf(occurrence), timeZone)]
          .filter(([day]) => dates.has(day))
          .map(([day, [top, bottom]]) => `${day} ${clock(top)}–${clock(bottom)} ${occurrence.id}`),
      );
      const shown = projection.days.flatMap(({ column, events: blocks }) =>
        blocks.map(({ fragment, height, top }) => {
          const [from, to] = [top, top + height].map((y) => clock(minutesOf(y)));
          return `${column.date.toString()} ${from}–${to} ${fragment.event.id}`;
        }),
      );
      expect(shown.toSorted()).toEqual(expected.toSorted());
      expect(projection.allDay.segments).toEqual([]);
    });
  });

  test.each([zone.timeZone, kolkata])(
    "keep IDs and intervals whether the year is expanded at once or week by week, in %s",
    (timeZone) => {
      // A new expander for the year, and the shared one, which has seen other ranges, by week.
      const { expansion: atOnce, range } = show(
        yearView,
        "2026-06-01",
        timeZone,
        events,
        createExpander(),
      );
      const byWeek = new Map<string, Occurrence>();
      const changed: string[] = [];
      for (const monday of mondays("2026-01-01", "2026-12-31")) {
        const { occurrences } = show(weekView, monday, timeZone, events, expander).expansion;
        for (const occurrence of occurrences) {
          const described = describeOccurrence(occurrence);
          const before = byWeek.get(occurrence.id);
          if (before !== undefined && describeOccurrence(before) !== described) {
            changed.push(described);
          }
          byWeek.set(occurrence.id, occurrence);
        }
      }
      const { end, start } = resolveViewInstantRange(range, timeZone);
      // The instants this year and the series' own one both cover.
      const own = resolveViewInstantRange(year.range, zone.timeZone);
      const [from, to] = [later(own.start, start), earlier(own.end, end)];

      expect(changed).toEqual([]);
      expect(within(atOnce.occurrences, start, end)).toHaveLength(atOnce.occurrences.length);
      expect(within(atOnce.occurrences, start, end)).toEqual(within(byWeek.values(), start, end));
      expect(within(atOnce.occurrences, from, to)).toEqual(
        within(year.expansion.occurrences, from, to),
      );
    },
  );

  test("keep IDs, intervals and objects across a scrolling week's overlapping load ranges", () => {
    for (const transitionMonday of zone.weeks) {
      const seen = new Map<string, Occurrence>();
      const changed: string[] = [];
      const anchors = [-2, -1, 0, 1, 2].map((weeks) =>
        Temporal.PlainDate.from(transitionMonday).add({ weeks }).toString(),
      );
      for (const anchor of anchors) {
        const { expansion, loadRange, range } = show(
          scrollingWeekView,
          anchor,
          zone.timeZone,
          events,
          expander,
        );
        // The view loads a week on each side, and the application expands all three.
        expect(loadRange.start.toString()).toBe(range.start.subtract({ weeks: 1 }).toString());
        expect(loadRange.end.toString()).toBe(range.end.add({ weeks: 1 }).toString());
        for (const occurrence of expansion.occurrences) {
          const earlier = seen.get(occurrence.id);
          if (earlier !== undefined && earlier !== occurrence) changed.push(occurrence.id);
          seen.set(occurrence.id, occurrence);
        }
      }

      expect(changed).toEqual([]);
    }
  });

  test.each(zone.weeks)(
    "keep IDs and intervals when the display zone changes, in the week of %s",
    (monday) => {
      const shown = displayZones.map((timeZone) => {
        const { expansion, range } = show(weekView, monday, timeZone, events, expander);
        return { ...resolveViewInstantRange(range, timeZone), expansion, timeZone };
      });
      const disagreements: string[] = [];
      for (const left of shown) {
        for (const right of shown) {
          // The instants both weeks cover.
          const [from, to] = [later(left.start, right.start), earlier(left.end, right.end)];
          const pair = `${left.timeZone} / ${right.timeZone}`;
          const [seen, alsoSeen] = [left, right].map(({ expansion }) =>
            within(expansion.occurrences, from, to).join("\n"),
          );
          if (seen !== alsoSeen) disagreements.push(pair);
        }
      }

      expect(disagreements).toEqual([]);
    },
  );

  test.each([zone.timeZone, kolkata])(
    "place occurrences in the month view on the dates the week view does, in %s",
    (timeZone) => {
      for (const transitionMonday of zone.weeks) {
        const sunday = Temporal.PlainDate.from(transitionMonday).add({ days: 6 }).toString();
        const month = show(monthView, sunday, timeZone, events, expander);
        const inMonth = month.projection.weeks.flatMap(({ segments }) =>
          segments.flatMap(({ fragments }) =>
            fragments.map(({ date, event }) => `${date.toString()} ${event.id}`),
          ),
        );
        const inWeeks = mondays(
          month.range.start.toString(),
          month.range.end.subtract({ days: 1 }).toString(),
        ).flatMap((monday) =>
          show(weekView, monday, timeZone, events, expander).projection.days.flatMap(
            ({ column, events: blocks }) =>
              blocks.map(({ fragment }) => `${column.date.toString()} ${fragment.event.id}`),
          ),
        );

        expect(month.loadRange).toBe(month.range);
        expect(inMonth.toSorted()).toEqual(inWeeks.toSorted());
      }
    },
  );
});
