import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import { plainDateInterval } from "@moltenship/calendar-temporal";

import {
  resolveSecondaryTimeZones,
  timeGridColumns,
  timeGridZoneAxis,
  timeGridZoneRows,
  timeGridZoneTimes,
  type TimeGridColumn,
  type TimeGridZoneRow,
} from "../src/index";

function columns(start: string, days: number, timeZone: string): readonly TimeGridColumn[] {
  const first = Temporal.PlainDate.from(start);
  return timeGridColumns(plainDateInterval(first, first.add({ days })), timeZone);
}

function column(date: string, timeZone: string): TimeGridColumn {
  return columns(date, 1, timeZone)[0]!;
}

/** A row as "wall → other", such as "21:00 → 00:30+1"; "–" for a skipped wall time. */
function read(row: TimeGridZoneRow): string {
  const times = row.times.map(({ dateTime, dayOffset }) => {
    const marker = dayOffset === 0 ? "" : dayOffset > 0 ? `+${dayOffset}` : String(dayOffset);
    return `${dateTime.toPlainTime().toString({ smallestUnit: "minute" })}${marker}`;
  });
  return `${row.wallTime.toString({ smallestUnit: "minute" })} → ${times.join(" / ") || "–"}`;
}

function rowsAt(rows: readonly TimeGridZoneRow[], ...hours: number[]): readonly string[] {
  return hours.map((hour) => read(rows[hour]!));
}

describe("time-grid zone rows", () => {
  test("reads each hour line of an ordinary day in another zone", () => {
    const rows = timeGridZoneRows(column("2026-10-12", "Europe/Berlin"), "America/New_York");

    expect(rows).toHaveLength(24);
    expect(rows.map(({ top }) => top)).toEqual(Array.from({ length: 24 }, (_, hour) => hour / 24));
    expect(rowsAt(rows, 0, 5, 6, 12, 23)).toEqual([
      "00:00 → 18:00-1",
      "05:00 → 23:00-1",
      "06:00 → 00:00",
      "12:00 → 06:00",
      "23:00 → 17:00",
    ]);
    expect(rows[12]!.times[0]).toMatchObject({ offset: "-04:00" });
    expect(rows[12]!.times[0]!.instant.toString()).toBe("2026-10-12T10:00:00Z");
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[12])).toBe(true);
    expect(Object.isFrozen(rows[12]!.times[0])).toBe(true);
  });

  test("keeps the minutes of offsets that aren't whole hours", () => {
    const berlin = column("2026-10-12", "Europe/Berlin");

    expect(rowsAt(timeGridZoneRows(berlin, "Asia/Kolkata"), 0, 9, 20, 21)).toEqual([
      "00:00 → 03:30",
      "09:00 → 12:30",
      "20:00 → 23:30",
      "21:00 → 00:30+1",
    ]);
    expect(rowsAt(timeGridZoneRows(berlin, "Asia/Kathmandu"), 0, 9, 20, 21)).toEqual([
      "00:00 → 03:45",
      "09:00 → 12:45",
      "20:00 → 23:45",
      "21:00 → 00:45+1",
    ]);
    // A display zone off the hour puts the other zone's hours between its lines.
    expect(rowsAt(timeGridZoneRows(column("2026-10-12", "Asia/Kolkata"), "UTC"), 0, 5, 6)).toEqual([
      "00:00 → 18:30-1",
      "05:00 → 23:30-1",
      "06:00 → 00:30",
    ]);
  });

  test("follows Lord Howe's 30-minute daylight saving change line by line", () => {
    // Lord Howe moves from +10:30 to +11:00 at 02:00 local on October 4, 2026 (15:30 UTC).
    const rows = timeGridZoneRows(column("2026-10-03", "UTC"), "Australia/Lord_Howe");

    expect(rowsAt(rows, 0, 13, 15, 16)).toEqual([
      "00:00 → 10:30",
      "13:00 → 23:30",
      "15:00 → 01:30+1",
      "16:00 → 03:00+1",
    ]);
    expect(rows[15]!.times[0]!.offset).toBe("+10:30");
    expect(rows[16]!.times[0]!.offset).toBe("+11:00");
  });

  test("skips Lord Howe's 30-minute gap and reads both sides of its 30-minute fold", () => {
    // 02:00–02:30 never happens on October 4, 2026; 01:30–02:00 happens twice on April 5, 2026.
    const spring = timeGridZoneRows(column("2026-10-04", "Australia/Lord_Howe"), "UTC", 30);
    const fall = timeGridZoneRows(column("2026-04-05", "Australia/Lord_Howe"), "UTC", 30);

    expect(spring).toHaveLength(48);
    expect(rowsAt(spring, 3, 4, 5)).toEqual(["01:30 → 15:00-1", "02:00 → –", "02:30 → 15:30-1"]);
    expect(rowsAt(fall, 2, 3, 4)).toEqual([
      "01:00 → 14:00-1",
      "01:30 → 14:30-1 / 15:00-1",
      "02:00 → 15:30-1",
    ]);
  });

  test("leaves a skipped hour without a time on a 23-hour day", () => {
    const rows = timeGridZoneRows(column("2026-03-29", "Europe/Berlin"), "America/New_York");

    expect(rowsAt(rows, 1, 2, 3, 6)).toEqual([
      "01:00 → 20:00-1",
      "02:00 → –",
      "03:00 → 21:00-1",
      "06:00 → 00:00",
    ]);
    expect(rows[2]!.times).toEqual([]);
  });

  test("reads both moments of a repeated hour on a 25-hour day, earlier first", () => {
    const rows = timeGridZoneRows(column("2026-10-25", "Europe/Berlin"), "America/New_York");

    expect(rowsAt(rows, 1, 2, 3)).toEqual([
      "01:00 → 19:00-1",
      "02:00 → 20:00-1 / 21:00-1",
      "03:00 → 22:00-1",
    ]);
    expect(rows[2]!.times.map(({ instant }) => instant.toString())).toEqual([
      "2026-10-25T00:00:00Z",
      "2026-10-25T01:00:00Z",
    ]);
  });

  test("reads the other zone's own change in the middle of a day", () => {
    // New York falls back at 06:00 UTC on November 1, 2026, which is 15:00 in Tokyo.
    const fall = timeGridZoneRows(column("2026-11-01", "Asia/Tokyo"), "America/New_York");
    // New York springs forward at 07:00 UTC on March 8, 2026, which is 16:00 in Tokyo.
    const spring = timeGridZoneRows(column("2026-03-08", "Asia/Tokyo"), "America/New_York");

    expect(rowsAt(fall, 14, 15, 16)).toEqual(["14:00 → 01:00", "15:00 → 01:00", "16:00 → 02:00"]);
    expect(fall[14]!.times[0]!.offset).toBe("-04:00");
    expect(fall[15]!.times[0]!.offset).toBe("-05:00");
    expect(rowsAt(spring, 15, 16)).toEqual(["15:00 → 01:00", "16:00 → 03:00"]);
  });

  test("marks the other zone's date, up to two days apart across the date line", () => {
    const ahead = timeGridZoneRows(column("2026-10-12", "Pacific/Pago_Pago"), "Pacific/Kiritimati");
    const behind = timeGridZoneRows(
      column("2026-10-12", "Pacific/Kiritimati"),
      "Pacific/Pago_Pago",
    );
    const tokyo = timeGridZoneRows(column("2026-10-12", "Asia/Tokyo"), "America/Los_Angeles");

    expect(rowsAt(ahead, 0, 22, 23)).toEqual([
      "00:00 → 01:00+1",
      "22:00 → 23:00+1",
      "23:00 → 00:00+2",
    ]);
    expect(rowsAt(behind, 0, 1, 23)).toEqual([
      "00:00 → 23:00-2",
      "01:00 → 00:00-1",
      "23:00 → 22:00-1",
    ]);
    expect(rowsAt(tokyo, 0, 15, 16)).toEqual([
      "00:00 → 08:00-1",
      "15:00 → 23:00-1",
      "16:00 → 00:00",
    ]);
    expect(ahead[23]!.times[0]!.dayOffset).toBe(2);
  });

  test("leaves every line of a date the display zone skips without a time", () => {
    // Samoa skipped December 30, 2011 when it crossed the date line.
    const rows = timeGridZoneRows(column("2011-12-30", "Pacific/Apia"), "UTC");

    expect(rows.every(({ times }) => times.length === 0)).toBe(true);
  });

  test("rejects steps that don't divide a day", () => {
    const berlin = column("2026-10-12", "Europe/Berlin");

    for (const step of [0, -60, 7, 1.5, 2880, Number.NaN]) {
      expect(() => timeGridZoneRows(berlin, "UTC", step)).toThrow("invalid-time-grid-zone-step");
    }
    expect(timeGridZoneRows(berlin, "UTC", 1440)).toHaveLength(1);
    expect(timeGridZoneRows(berlin, "UTC", 15)).toHaveLength(96);
  });

  test("matches a single wall time read through timeGridZoneTimes", () => {
    const berlin = column("2026-10-25", "Europe/Berlin");
    const rows = timeGridZoneRows(berlin, "Asia/Tokyo", 15);

    for (const row of rows) {
      expect(timeGridZoneTimes(berlin, row.wallTime, "Asia/Tokyo")).toEqual(row.times);
    }
    expect(
      timeGridZoneTimes(berlin, Temporal.PlainTime.from("10:20"), "Asia/Tokyo").map(read0),
    ).toEqual(["18:20"]);

    function read0({ dateTime }: { readonly dateTime: Temporal.PlainDateTime }) {
      return dateTime.toPlainTime().toString({ smallestUnit: "minute" });
    }
  });

  test("round-trips every line through both zones on any date", () => {
    const zones = [
      "America/New_York",
      "America/Santiago",
      "Asia/Kathmandu",
      "Asia/Kolkata",
      "Australia/Lord_Howe",
      "Europe/Berlin",
      "Pacific/Apia",
      "Pacific/Chatham",
      "UTC",
    ];
    const zone = fc.constantFrom(...zones);
    const date = fc
      .integer({ max: 4 * 365, min: 0 })
      .map((days) => Temporal.PlainDate.from("2024-01-01").add({ days }));

    fc.assert(
      fc.property(date, zone, zone, (day, display, other) => {
        const target = column(day.toString(), display);
        for (const row of timeGridZoneRows(target, other, 30)) {
          for (const time of row.times) {
            const there = time.instant.toZonedDateTimeISO(other);
            expect(time.instant.toZonedDateTimeISO(display).toPlainDateTime()).toEqual(
              day.toPlainDateTime(row.wallTime),
            );
            expect(time.dateTime).toEqual(there.toPlainDateTime());
            expect(time.offset).toBe(there.offset);
            expect(time.dayOffset).toBe(day.until(there.toPlainDate()).days);
          }
        }
      }),
      { numRuns: 60, seed: 165 },
    );
  });
});

describe("time-grid zone axis", () => {
  test("reads the first column and lists no shifts in an ordinary week", () => {
    const axis = timeGridZoneAxis(columns("2026-10-05", 7, "Europe/Berlin"), "asia/tokyo");

    expect(axis).not.toBeNull();
    expect(axis!.timeZone).toBe("Asia/Tokyo");
    expect(axis!.date.toString()).toBe("2026-10-05");
    expect(axis!.shifts).toEqual([]);
    expect(rowsAt(axis!.rows, 9, 17)).toEqual(["09:00 → 16:00", "17:00 → 00:00+1"]);
    expect(Object.isFrozen(axis)).toBe(true);
  });

  test("lists the day the other zone changes offset in the middle of a week", () => {
    // Berlin is already on CET; New York leaves EDT on Sunday, November 1, at 07:00 in Berlin.
    const week = columns("2026-10-26", 7, "Europe/Berlin");
    const axis = timeGridZoneAxis(week, "America/New_York")!;

    expect(rowsAt(axis.rows, 7, 12)).toEqual(["07:00 → 02:00", "12:00 → 07:00"]);
    expect(axis.shifts).toHaveLength(1);
    expect(axis.shifts[0]!.date.toString()).toBe("2026-11-01");
    expect(axis.shifts[0]!.from.toString()).toBe("07:00:00");
    expect(axis.shifts[0]!.minutes).toBe(-60);
  });

  test("lists the day the display zone changes offset, past its skipped hour", () => {
    const week = columns("2026-03-23", 7, "Europe/Berlin");
    const axis = timeGridZoneAxis(week, "America/New_York")!;

    expect(
      axis.shifts.map(({ date, from, minutes }) => [date.toString(), from.hour, minutes]),
    ).toEqual([["2026-03-29", 3, -60]]);
  });

  test("lists the days around a 25-hour day by the line after the repeated hour", () => {
    const week = columns("2026-10-19", 7, "Europe/Berlin");
    const axis = timeGridZoneAxis(week, "America/New_York")!;

    // The repeated 02:00 reads the same as the axis on its earlier moment; 03:00 is CET.
    expect(
      axis.shifts.map(({ date, from, minutes }) => [date.toString(), from.hour, minutes]),
    ).toEqual([["2026-10-25", 3, 60]]);
  });

  test("reads the rows on a chosen column and lists the others against it", () => {
    const week = columns("2026-03-23", 7, "Europe/Berlin");
    const sunday = Temporal.PlainDate.from("2026-03-29");
    const axis = timeGridZoneAxis(week, "America/New_York", { date: sunday })!;

    expect(axis.date.toString()).toBe("2026-03-29");
    expect(rowsAt(axis.rows, 2, 3)).toEqual(["02:00 → –", "03:00 → 21:00-1"]);
    expect(axis.shifts.map(({ date, from, minutes }) => [date.day, from.hour, minutes])).toEqual(
      [23, 24, 25, 26, 27, 28].map((day) => [day, 3, 60]),
    );
    // A date outside the columns falls back to the first column.
    expect(
      timeGridZoneAxis(week, "America/New_York", { date: Temporal.PlainDate.from("2026-01-01") })!
        .date.day,
    ).toBe(23);
  });

  test("lists a Lord Howe half-hour change as a 30-minute shift", () => {
    const week = columns("2026-09-28", 7, "UTC");
    const axis = timeGridZoneAxis(week, "Australia/Lord_Howe")!;

    expect(axis.shifts.map(({ date, from, minutes }) => [date.day, from.hour, minutes])).toEqual([
      [3, 16, 30],
      [4, 0, 30],
    ]);
  });

  test("is null without columns and rejects unknown zones", () => {
    expect(timeGridZoneAxis([], "UTC")).toBeNull();
    expect(() => timeGridZoneAxis(columns("2026-10-05", 1, "UTC"), "Mars/Base")).toThrow(
      RangeError,
    );
  });
});

describe("resolveSecondaryTimeZones", () => {
  test("reads names and labelled entries in order, as Temporal names the zones", () => {
    const { issues, zones } = resolveSecondaryTimeZones([
      "asia/tokyo",
      { label: "Office", timeZone: "America/New_York" },
      { timeZone: "UTC" },
    ]);

    expect(issues).toEqual([]);
    expect(zones).toEqual([
      { timeZone: "Asia/Tokyo" },
      { label: "Office", timeZone: "America/New_York" },
      { timeZone: "UTC" },
    ]);
    expect(Object.isFrozen(zones)).toBe(true);
    expect(Object.isFrozen(zones[0])).toBe(true);
  });

  test("leaves out and reports unknown zones and malformed entries", () => {
    const malformed = [
      "Mars/Base",
      42,
      null,
      { label: 3, timeZone: "UTC" },
      { label: "No zone" },
      "",
    ] as unknown as readonly string[];
    const { issues, zones } = resolveSecondaryTimeZones(["Asia/Kolkata", ...malformed]);

    expect(zones).toEqual([{ timeZone: "Asia/Kolkata" }]);
    expect(issues.map(({ code, index }) => [code, index])).toEqual(
      [1, 2, 3, 4, 5, 6].map((index) => ["invalid-secondary-time-zone", index]),
    );
    expect(issues[0]!.value).toBe("Mars/Base");
  });
});
