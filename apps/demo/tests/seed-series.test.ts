import { plainDateInterval } from "@moltenship/calendar";
import { createOccurrenceExpander } from "@moltenship/calendar-recurrence";
import { describe, expect, test } from "vite-plus/test";

import { demoAdapters, type DemoEvent, type DemoOccurrence } from "../src/calendar";
import { createRoutineEvents } from "../src/routine";
import { createSeedEvents } from "../src/seed";
import { createSeriesEvents, nearestClockChange, upgradeSavedEvents } from "../src/seed-series";

// A Monday, two weeks before Berlin's clocks go back and three before New York's.
const today = Temporal.PlainDate.from("2026-10-12");

function expand(events: readonly DemoEvent[], timeZone: string, start: string, end: string) {
  const expander = createOccurrenceExpander(demoAdapters, { defaultTimeZone: timeZone });
  const range = plainDateInterval(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end));
  return expander.expand(events, { range, timeZone });
}

const wall = ({ interval }: DemoOccurrence, timeZone: string) =>
  interval.kind === "timed"
    ? interval.start
        .toZonedDateTimeISO(timeZone)
        .toPlainDateTime()
        .toString({ smallestUnit: "minute" })
    : String(interval.start);
const titled = (occurrences: readonly DemoOccurrence[], title: string) =>
  occurrences.filter(({ event }) => event.title === title);

describe("seeded series", () => {
  test("expand without issues, and repeat on their zone's wall clock", () => {
    const timeZone = "Europe/Berlin";
    const { issues, occurrences } = expand(
      createSeriesEvents(today, timeZone),
      timeZone,
      "2026-10-12",
      "2026-11-02",
    );

    expect(issues).toEqual([]);
    // Overrides follow their series' occurrences, in the input order of events.
    const standups = titled(occurrences, "Standup")
      .map((occurrence) => wall(occurrence, timeZone))
      .toSorted();
    // This Wednesday's moved half an hour later; next Wednesday to Friday are the offsite.
    expect(standups).toEqual([
      "2026-10-12T09:30",
      "2026-10-13T09:30",
      "2026-10-14T10:00",
      "2026-10-15T09:30",
      "2026-10-16T09:30",
      "2026-10-19T09:30",
      "2026-10-20T09:30",
      "2026-10-26T09:30",
      "2026-10-27T09:30",
      "2026-10-28T09:30",
      "2026-10-29T09:30",
      "2026-10-30T09:30",
    ]);
    const moved = titled(occurrences, "Standup").find(({ event }) => event.id === "standup-moved");
    expect(moved?.recurrence?.override).toBe(moved?.event);
    expect(moved?.id).toBe("standup::2026-10-14T07:30:00Z");

    expect(titled(occurrences, "Monthly review").map((item) => wall(item, timeZone))).toEqual([
      "2026-10-13T14:00",
    ]);
    expect(titled(occurrences, "Mom's birthday").map((item) => wall(item, timeZone))).toEqual([
      "2026-10-17",
    ]);
  });

  test.each([
    ["Europe/Berlin", "2026-10-25"],
    ["America/New_York", "2026-11-01"],
    ["Australia/Lord_Howe", "2026-10-04"],
    ["America/Santiago", "2026-09-06"],
  ])("walk the dog at 08:00 on both sides of %s's clock change", (timeZone, change) => {
    expect(nearestClockChange(today, timeZone)?.toString()).toBe(change);
    const { occurrences } = expand(
      createSeriesEvents(today, timeZone),
      timeZone,
      "2026-08-01",
      "2026-12-01",
    );
    const walks = titled(occurrences, "Walk the dog");
    const times = new Set(walks.map((walk) => wall(walk, timeZone).slice(11)));
    const days = walks.map((walk) => wall(walk, timeZone).slice(0, 10));
    const offsets = new Set(
      walks.map(({ interval }) =>
        interval.kind === "timed" ? interval.start.toZonedDateTimeISO(timeZone).offset : "",
      ),
    );

    expect(times).toEqual(new Set(["08:00"]));
    // From this week, or a week before the change, to a week after it.
    expect(days).toContain(change);
    expect(days).toContain("2026-10-12");
    expect(days.at(-1)).toBe(
      [Temporal.PlainDate.from(change).add({ weeks: 1 }), today.add({ days: 13 })]
        .toSorted((left, right) => Temporal.PlainDate.compare(left, right))
        .at(-1)
        ?.toString(),
    );
    expect(offsets.size).toBe(2);
  });

  test("walk the dog for two weeks where the clocks don't change", () => {
    const timeZone = "Asia/Tokyo";
    expect(nearestClockChange(today, timeZone)).toBeNull();
    const { occurrences } = expand(
      createSeriesEvents(today, timeZone),
      timeZone,
      "2026-10-01",
      "2026-11-30",
    );

    expect(titled(occurrences, "Walk the dog")).toHaveLength(14);
  });

  test("replace the seeded one-off standups and birthday in events saved before recurrence", () => {
    const timeZone = "Europe/Berlin";
    const saved: DemoEvent[] = [
      ...createSeedEvents(today, timeZone),
      ...createRoutineEvents(today, timeZone),
      // The one-offs the old seed had, and an event of the visitor's own with the same title.
      { ...createSeedEvents(today, timeZone)[0]!, id: "seed-900", title: "Standup" },
      { ...createSeedEvents(today, timeZone)[0]!, id: "routine-9000", title: "Standup" },
      { ...createSeedEvents(today, timeZone)[0]!, id: "seed-901", title: "Mom's birthday" },
      { ...createSeedEvents(today, timeZone)[0]!, id: "4f9c", title: "Standup" },
    ];
    const upgraded = upgradeSavedEvents(saved, today, timeZone);
    const ids = upgraded.map(({ id }) => id);

    expect(ids).not.toContain("seed-900");
    expect(ids).not.toContain("routine-9000");
    expect(ids).not.toContain("seed-901");
    expect(ids).toContain("4f9c");
    expect(ids).toEqual(expect.arrayContaining(["standup", "standup-moved", "moms-birthday"]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(upgraded.filter(({ title }) => title === "Design review")).toHaveLength(
      saved.filter(({ title }) => title === "Design review").length,
    );
  });
});
