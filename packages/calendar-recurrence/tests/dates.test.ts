import type { CalendarEventInterval } from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import { coerceRecurrenceDate } from "../src";

const timed: CalendarEventInterval = {
  end: Temporal.Instant.from("2026-10-21T08:00:00Z"),
  kind: "timed",
  sourceTimeZone: "Europe/Berlin",
  start: Temporal.Instant.from("2026-10-21T07:00:00Z"),
};
const allDay: CalendarEventInterval = {
  end: Temporal.PlainDate.from("2026-10-22"),
  kind: "all-day",
  start: Temporal.PlainDate.from("2026-10-21"),
};
const floating: CalendarEventInterval = {
  end: Temporal.PlainDateTime.from("2026-10-21T19:00"),
  kind: "floating",
  start: Temporal.PlainDateTime.from("2026-10-21T18:00"),
};

describe("coerceRecurrenceDate", () => {
  test("reads wall times on a timed series in its zone", () => {
    const wall = Temporal.PlainDateTime.from("2026-10-28T09:00");
    expect(String(coerceRecurrenceDate(wall, timed, "start"))).toBe("2026-10-28T08:00:00Z");
  });

  test("ends a date-only UNTIL at the end of its day in the series' zone", () => {
    const date = Temporal.PlainDate.from("2026-10-28");
    expect(String(coerceRecurrenceDate(date, timed, "until"))).toBe(
      "2026-10-28T22:59:59.999999999Z",
    );
    expect(String(coerceRecurrenceDate(date, floating, "until"))).toBe(
      "2026-10-28T23:59:59.999999999",
    );
  });

  test("keeps a date-only EXDATE as a whole day, and refuses a date-only start", () => {
    const date = Temporal.PlainDate.from("2026-10-28");
    expect(String(coerceRecurrenceDate(date, timed, "exception"))).toBe("2026-10-28");
    expect(coerceRecurrenceDate(date, timed, "start")).toBeUndefined();
    expect(coerceRecurrenceDate(date, floating, "start")).toBeUndefined();
  });

  test("reads a UTC UNTIL on an all-day series as its UTC date", () => {
    const until = Temporal.Instant.from("2026-12-31T23:59:59Z");
    expect(String(coerceRecurrenceDate(until, allDay, "until"))).toBe("2026-12-31");
  });

  test("returns ISO-calendar dates", () => {
    const gregory = Temporal.PlainDate.from("2026-10-28").withCalendar("gregory");
    expect(coerceRecurrenceDate(gregory, allDay, "start")?.toString()).toBe("2026-10-28");
  });

  test("falls back to defaultTimeZone only where the series has no zone", () => {
    const wall = Temporal.PlainDateTime.from("2026-10-28T09:00");
    const options = { defaultTimeZone: "America/New_York" };
    expect(String(coerceRecurrenceDate(wall, timed, "start", options))).toBe(
      "2026-10-28T08:00:00Z",
    );
    const utc = { ...timed, sourceTimeZone: undefined };
    expect(String(coerceRecurrenceDate(wall, utc, "start", options))).toBe("2026-10-28T13:00:00Z");
    const instant = Temporal.Instant.from("2026-10-28T13:00:00Z");
    expect(String(coerceRecurrenceDate(instant, floating, "start", options))).toBe(
      "2026-10-28T09:00:00",
    );
  });
});
