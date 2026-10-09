import { describe, expect, test } from "vite-plus/test";

import { formatPlacementRange, type CalendarEventInterval } from "../src/index";

const timeZone = "America/New_York";

/** Intl separates ranges and day periods with thin and narrow spaces. */
function format(placement: CalendarEventInterval, locale = "en-US"): string {
  return formatPlacementRange(placement, { locale, timeZone }).replace(/\s/gu, " ");
}

function timed(start: string, end: string): CalendarEventInterval {
  return {
    end: Temporal.ZonedDateTime.from(`${end}[${timeZone}]`).toInstant(),
    kind: "timed",
    start: Temporal.ZonedDateTime.from(`${start}[${timeZone}]`).toInstant(),
  };
}

describe("formatPlacementRange", () => {
  test("formats a same-day range as times in the display time zone", () => {
    expect(format(timed("2026-10-08T07:00", "2026-10-08T07:45"))).toBe("7:00 – 7:45 AM");
    expect(format(timed("2026-10-08T11:30", "2026-10-08T12:30"))).toBe("11:30 AM – 12:30 PM");
    expect(format(timed("2026-10-08T18:15", "2026-10-08T19:00"), "de")).toBe("18:15–19:00 Uhr");
  });

  test("adds dates once a range crosses midnight, but not for one ending at midnight", () => {
    expect(format(timed("2026-10-08T22:00", "2026-10-09T01:00"))).toBe(
      "Oct 8, 10:00 PM – Oct 9, 1:00 AM",
    );
    expect(format(timed("2026-10-08T23:00", "2026-10-09T00:00"))).toBe("11:00 PM – 12:00 AM");
  });

  test("formats floating ranges on their own wall clock", () => {
    expect(
      format({
        end: Temporal.PlainDateTime.from("2026-10-08T10:00"),
        kind: "floating",
        start: Temporal.PlainDateTime.from("2026-10-08T09:00"),
      }),
    ).toBe("9:00 – 10:00 AM");
  });

  test("formats all-day events by their dates, the end being exclusive", () => {
    const allDay = (start: string, end: string): CalendarEventInterval => ({
      end: Temporal.PlainDate.from(end),
      kind: "all-day",
      start: Temporal.PlainDate.from(start),
    });
    expect(format(allDay("2026-10-08", "2026-10-09"))).toBe("Oct 8");
    expect(format(allDay("2026-10-08", "2026-10-11"))).toBe("Oct 8 – 10");
    expect(format(allDay("2026-10-30", "2026-11-03"))).toBe("Oct 30 – Nov 2");
  });
});
