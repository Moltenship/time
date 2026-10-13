import { describe, expect, test } from "vite-plus/test";

import {
  applyRecurrenceEdit,
  resolveRecurrenceEdit,
  type RecurrenceEdit,
  type RecurrenceSeriesEdit,
} from "../../src";
import { adapters, change, move, resize } from "../edits/harness";
import { createExpander, timedSeries, type Event, type Occurrence } from "./calendar";
import { kolkata } from "./zones";

// Edits on DST change days, through the expander and, where they write, `applyRecurrenceEdit`, in a
// zone of each kind: Berlin and New York in the north, Sydney in the south, and Lord Howe, whose
// clocks move by half an hour. Each series repeats at a time the zone skips in one change, or
// repeats in the other. The calendar shows the series' own zone, or Kolkata's, which has no DST.
// Times are worked out by hand from the zones' 2026 offsets (see `zones.ts`).

interface EditZone {
  readonly timeZone: string;
  /** The day clocks go forward, and a series time they skip. */
  readonly gapDay: string;
  readonly gapTime: string;
  /** Where that time shows on the gap day: moved forward by the gap. */
  readonly gapShown: string;
  /** The day clocks go back, a series time they repeat, and its two instants. */
  readonly foldDay: string;
  readonly foldTime: string;
  readonly foldInstants: readonly [string, string];
}

const zones: readonly EditZone[] = [
  {
    foldDay: "2026-10-25",
    foldInstants: ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"],
    foldTime: "02:30",
    gapDay: "2026-03-29",
    gapShown: "03:30",
    gapTime: "02:30",
    timeZone: "Europe/Berlin",
  },
  {
    foldDay: "2026-11-01",
    foldInstants: ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"],
    foldTime: "01:30",
    gapDay: "2026-03-08",
    gapShown: "03:30",
    gapTime: "02:30",
    timeZone: "America/New_York",
  },
  {
    foldDay: "2026-04-05",
    foldInstants: ["2026-04-04T15:30:00Z", "2026-04-04T16:30:00Z"],
    foldTime: "02:30",
    gapDay: "2026-10-04",
    gapShown: "03:30",
    gapTime: "02:30",
    timeZone: "Australia/Sydney",
  },
  {
    // 02:00 → 02:30 in October, 02:00 → 01:30 in April.
    foldDay: "2026-04-05",
    foldInstants: ["2026-04-04T14:45:00Z", "2026-04-04T15:15:00Z"],
    foldTime: "01:45",
    gapDay: "2026-10-04",
    gapShown: "02:45",
    gapTime: "02:15",
    timeZone: "Australia/Lord_Howe",
  },
];

type SeriesEdit = RecurrenceSeriesEdit<Event, string, string>;

function series(edit: RecurrenceEdit<Event, string, string>): SeriesEdit {
  if (edit.type !== "series")
    throw new Error(`Expected a series edit, got ${JSON.stringify(edit)}`);
  return edit;
}

const day = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString();

describe.each(zones)("$timeZone: edits on DST change days", (zone) => {
  const { foldDay, foldInstants, foldTime, gapDay, gapShown, gapTime, timeZone } = zone;
  const wall = (instant: Temporal.Instant) =>
    instant.toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });

  /** Each occurrence as `start–end` on the zone's wall clock, for the ten days from `from`. */
  function shown(events: readonly Event[], from: string): string[] {
    const { occurrences } = createExpander().expand(events, {
      range: { end: Temporal.PlainDate.from(day(from, 10)), start: Temporal.PlainDate.from(from) },
      timeZone,
    });
    return occurrences.map(({ interval }) => {
      const { end, start } = interval as { end: Temporal.Instant; start: Temporal.Instant };
      return `${wall(start)}–${wall(end).slice(11)}`;
    });
  }

  function occurrenceOn(events: readonly Event[], date: string): Occurrence {
    const { occurrences } = createExpander().expand(events, {
      range: { end: Temporal.PlainDate.from(day(date, 1)), start: Temporal.PlainDate.from(date) },
      timeZone,
    });
    if (occurrences.length !== 1) throw new Error(`${occurrences.length} occurrences on ${date}`);
    return occurrences[0]!;
  }

  let counter = 0;
  const apply = (events: readonly Event[], edit: SeriesEdit) =>
    applyRecurrenceEdit(events, edit, { createId: () => `created-${++counter}` });

  // Seven nights at the time the zone skips, from three days before the gap.
  const gapNights = timedSeries(
    "gap",
    `${day(gapDay, -3)}T${gapTime}`,
    timeZone,
    30,
    "FREQ=DAILY;COUNT=7",
  );
  // Seven nights at the time the zone repeats, from three days before the fold.
  const foldNights = timedSeries(
    "fold",
    `${day(foldDay, -3)}T${foldTime}`,
    timeZone,
    30,
    "FREQ=DAILY;COUNT=7",
  );

  test(`"all" dragged a day onto the gap moves the series a day at its written time`, () => {
    const dragged = move(occurrenceOn([gapNights], day(gapDay, -1)), { days: 1 }, timeZone);
    const after = apply([gapNights], series(resolveRecurrenceEdit(dragged, "all", adapters)));
    expect(shown(after, day(gapDay, -3))).toEqual([
      `${day(gapDay, -2)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, -1)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${gapDay}T${gapShown}–${addMinutes(gapShown, 30)}`,
      `${day(gapDay, 1)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, 2)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, 3)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, 4)}T${gapTime}–${addMinutes(gapTime, 30)}`,
    ]);
  });

  test(`"following" dragged onto the gap starts a series that keeps the written time`, () => {
    const dragged = move(occurrenceOn([gapNights], day(gapDay, -1)), { days: 1 }, timeZone);
    const edit = series(resolveRecurrenceEdit(dragged, "following", adapters));
    expect(edit.newSeries?.recurrence.wallStart?.toString()).toBe(`${gapDay}T${gapTime}:00`);
    expect(shown(apply([gapNights], edit), day(gapDay, -3))).toEqual([
      `${day(gapDay, -3)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, -2)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${gapDay}T${gapShown}–${addMinutes(gapShown, 30)}`,
      `${day(gapDay, 1)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, 2)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, 3)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      `${day(gapDay, 4)}T${gapTime}–${addMinutes(gapTime, 30)}`,
    ]);
  });

  test(`"all" stretching the gap night's end lengthens the series and leaves its time`, () => {
    const stretched = resize(occurrenceOn([gapNights], gapDay), "end", { minutes: 15 }, timeZone);
    const edit = series(resolveRecurrenceEdit(stretched, "all", adapters));
    expect(
      edit.series.action === "update" && wall(edit.series.placement.start as Temporal.Instant),
    ).toBe(`${day(gapDay, -3)}T${gapTime}`);
    const after = shown(apply([gapNights], edit), day(gapDay, -1));
    expect(after.slice(0, 3)).toEqual([
      `${day(gapDay, -1)}T${gapTime}–${addMinutes(gapTime, 45)}`,
      `${gapDay}T${gapShown}–${addMinutes(gapShown, 45)}`,
      `${day(gapDay, 1)}T${gapTime}–${addMinutes(gapTime, 45)}`,
    ]);
  });

  test(`"all" dropped on the later repeated time keeps that instant with an override`, () => {
    const [earlier, later] = foldInstants.map((text) => Temporal.Instant.from(text));
    const occurrence = occurrenceOn([foldNights], day(foldDay, -1));
    const dropped = change(occurrence, "move", {
      end: later!.add({ minutes: 30 }),
      kind: "timed",
      sourceTimeZone: timeZone,
      start: later!,
    });
    const edit = series(resolveRecurrenceEdit(dropped, "all", adapters));
    // The series moves a day and repeats at the earlier instant, which an RRULE gives; the edited
    // occurrence keeps the later one through an override.
    expect(edit.override).toMatchObject({
      action: "create",
      recurrenceId: earlier,
      seriesId: "fold",
    });
    expect(edit.occurrenceIds.get(occurrence.id)).toBe(`fold::${earlier!.toString()}`);
    const after = apply([foldNights], edit);
    const { occurrences } = createExpander().expand(after, {
      range: {
        end: Temporal.PlainDate.from(day(foldDay, 1)),
        start: Temporal.PlainDate.from(foldDay),
      },
      timeZone,
    });
    expect(occurrences.map(({ id, interval }) => [id, String(interval.start)])).toEqual([
      [`fold::${earlier!.toString()}`, later!.toString()],
    ]);
    expect(shown(after, day(foldDay, -2))[0]).toBe(
      `${day(foldDay, -2)}T${foldTime}–${addMinutes(foldTime, 30)}`,
    );
  });

  test(`"following" dropped on the later of the repeated times starts the series there`, () => {
    const later = Temporal.Instant.from(foldInstants[1]);
    const dropped = change(occurrenceOn([foldNights], day(foldDay, -1)), "move", {
      end: later.add({ minutes: 30 }),
      kind: "timed",
      sourceTimeZone: timeZone,
      start: later,
    });
    const edit = series(resolveRecurrenceEdit(dropped, "following", adapters));
    expect(edit.newSeries?.placement.start).toEqual(later);
    expect(edit.override).toBeUndefined();
    const after = apply([foldNights], edit);
    expect(occurrenceOn(after, foldDay).interval.start).toEqual(later);
    expect(shown(after, day(foldDay, 1))[0]).toBe(
      `${day(foldDay, 1)}T${foldTime}–${addMinutes(foldTime, 30)}`,
    );
  });

  // From a calendar in Kolkata, which has no DST, and from the series' own zone.
  describe.each([timeZone, kolkata])("on a calendar in %s", (calendar) => {
    const options = calendar === timeZone ? {} : { timeZone: calendar };

    test(`"all" dragged a day off the gap night keeps the series' written time`, () => {
      const dragged = move(occurrenceOn([gapNights], gapDay), { days: 1 }, calendar);
      const after = apply(
        [gapNights],
        series(resolveRecurrenceEdit(dragged, "all", adapters, options)),
      );
      expect(shown(after, day(gapDay, -1)).slice(0, 3)).toEqual([
        `${day(gapDay, -1)}T${gapTime}–${addMinutes(gapTime, 30)}`,
        `${gapDay}T${gapShown}–${addMinutes(gapShown, 30)}`,
        `${day(gapDay, 1)}T${gapTime}–${addMinutes(gapTime, 30)}`,
      ]);
    });

    test(`"all" changed to the next day in the editor takes the time it shows`, () => {
      const gapNight = occurrenceOn([gapNights], gapDay);
      const { end, start } = gapNight.interval as {
        end: Temporal.Instant;
        start: Temporal.Instant;
      };
      const nextDay = (instant: Temporal.Instant) =>
        instant.toZonedDateTimeISO(calendar).add({ days: 1 }).toInstant();
      const updated = change(gapNight, "update", {
        end: nextDay(end),
        kind: "timed",
        sourceTimeZone: timeZone,
        start: nextDay(start),
      });
      const edit = series(resolveRecurrenceEdit(updated, "all", adapters, options));
      // The editor showed the time the gap moved it to, and names it for the next day.
      expect(
        edit.series.action === "update" && wall(edit.series.placement.start as Temporal.Instant),
      ).toBe(`${day(gapDay, -2)}T${gapShown}`);
      expect(
        edit.series.action === "update" && wall(edit.series.placement.end as Temporal.Instant),
      ).toBe(`${day(gapDay, -2)}T${addMinutes(gapShown, 30)}`);
    });

    test(`"all" dragged an hour later on the gap night moves as the zone's calendar does`, () => {
      const startOf = (edit: RecurrenceEdit<Event, string, string>) => {
        const { series: write } = series(edit);
        return write.action === "update" ? String(write.placement.start) : write.action;
      };
      const gapNight = occurrenceOn([gapNights], gapDay);
      const own = resolveRecurrenceEdit(move(gapNight, { hours: 1 }, timeZone), "all", adapters);
      const here = resolveRecurrenceEdit(
        move(gapNight, { hours: 1 }, calendar),
        "all",
        adapters,
        options,
      );
      expect(startOf(here)).toBe(startOf(own));
    });
  });

  test(`"this" moved to the later of the repeated times keeps the occurrence's ID`, () => {
    const [earlier, later] = foldInstants.map((text) => Temporal.Instant.from(text));
    const occurrence = occurrenceOn([foldNights], foldDay);
    expect(occurrence.interval.start).toEqual(earlier);
    const moved = change(occurrence, "move", {
      end: later!.add({ minutes: 30 }),
      kind: "timed",
      sourceTimeZone: timeZone,
      start: later!,
    });
    const after = apply([foldNights], series(resolveRecurrenceEdit(moved, "this", adapters)));
    expect(occurrenceOn(after, foldDay)).toMatchObject({
      id: occurrence.id,
      interval: { start: later },
    });
  });
});

/** `HH:MM` plus minutes, on a clock that doesn't change. */
function addMinutes(time: string, minutes: number): string {
  return Temporal.PlainTime.from(time).add({ minutes }).toString({ smallestUnit: "minute" });
}
