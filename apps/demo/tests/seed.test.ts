import { describe, expect, test } from "vite-plus/test";

import type { DemoEvent } from "../src/calendar";
import { createSeedEvents } from "../src/seed";

const today = Temporal.PlainDate.from("2026-10-08");
const timeZone = "America/New_York";
const events = createSeedEvents(today, timeZone);
const timed = events.filter(
  (event): event is Extract<DemoEvent, { kind: "timed" }> => event.kind === "timed",
);
const wallDate = (instant: Temporal.Instant) => instant.toZonedDateTimeISO(timeZone).toPlainDate();

describe("seed events", () => {
  test("have unique ids and non-empty half-open intervals", () => {
    expect(new Set(events.map(({ id }) => id)).size).toBe(events.length);
    for (const event of events) {
      const order =
        event.kind === "timed"
          ? Temporal.Instant.compare(event.start, event.end)
          : Temporal.PlainDate.compare(event.start, event.end);
      expect(order, event.title).toBe(-1);
    }
  });

  test("cover the layouts every view has to handle", () => {
    const overlaps = timed.some((left) =>
      timed.some(
        (right) =>
          left !== right &&
          Temporal.Instant.compare(left.start, right.end) < 0 &&
          Temporal.Instant.compare(right.start, left.end) < 0,
      ),
    );
    const crossesMidnight = timed.some(
      ({ end, start }) => !wallDate(start).equals(wallDate(end.subtract({ nanoseconds: 1 }))),
    );
    const allDayLengths = events.flatMap((event) =>
      event.kind === "all-day" ? [event.start.until(event.end).days] : [],
    );

    expect(overlaps).toBe(true);
    expect(crossesMidnight).toBe(true);
    expect(timed.some(({ end, start }) => start.until(end).total("minutes") === 15)).toBe(true);
    expect(allDayLengths).toContain(1);
    expect(allDayLengths.some((days) => days > 1)).toBe(true);
  });

  test("sit at local wall-clock times from last Monday through next Sunday", () => {
    const standup = timed.find(
      ({ start, title }) => title === "Standup" && wallDate(start).equals(today),
    );
    const dates = events
      .map((event) => (event.kind === "timed" ? wallDate(event.start) : event.start))
      .toSorted((left, right) => Temporal.PlainDate.compare(left, right));

    expect(standup?.start.toZonedDateTimeISO(timeZone).toPlainTime().toString()).toBe("09:30:00");
    expect(dates[0]?.toString()).toBe("2026-09-28");
    expect(dates.at(-1)?.toString()).toBe("2026-10-18");
  });
});
