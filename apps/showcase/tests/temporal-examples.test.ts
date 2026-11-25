import { describe, expect, test } from "vite-plus/test";

import {
  hourRows,
  hoursInDay,
  isOnDate,
  pickTime,
  snapToGrid,
} from "../content/examples/temporal-dst";
import { nights, stay, week } from "../content/examples/temporal-first";
import {
  monthRows,
  monthText,
  sixWeeks,
  weekdayNames,
} from "../content/examples/temporal-month-grid";

const date = (value: string) => Temporal.PlainDate.from(value);
const berlin = "Europe/Berlin";
const text = (range: { start: Temporal.PlainDate; end: Temporal.PlainDate }) =>
  `${range.start.toString()} ${range.end.toString()}`;

describe("the overview's first example", () => {
  test("has the ranges the page names", () => {
    expect(text(stay)).toBe("2026-10-09 2026-10-14");
    expect(text(week)).toBe("2026-10-05 2026-10-12");
    expect(nights && text(nights)).toBe("2026-10-09 2026-10-12");
    expect(nights?.start.until(nights.end).days).toBe(3);
  });
});

describe("the month grid", () => {
  test("prints October 2026 as the page shows it", () => {
    expect(monthText(date("2026-10-08"), 1)).toBe(
      [
        "Mo Tu We Th Fr Sa Su",
        "          1  2  3  4",
        " 5  6  7  8  9 10 11",
        "12 13 14 15 16 17 18",
        "19 20 21 22 23 24 25",
        "26 27 28 29 30 31   ",
      ].join("\n"),
    );
  });

  test("starts the week on the day asked for", () => {
    expect(weekdayNames(7, "en-US")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(monthText(date("2026-10-08"), 7).split("\n")[1]).toBe("             1  2  3");
  });

  test("marks the days of the months around it", () => {
    const rows = monthRows(date("2026-10-08"), 1);
    expect(rows).toHaveLength(5);
    expect(rows[0]?.map((day) => `${day.date.day}${day.inMonth ? "" : "*"}`)).toEqual([
      "28*",
      "29*",
      "30*",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  test("has four to six rows, or six when fixed", () => {
    // February 2027 starts on a Monday and has 28 days.
    expect(monthRows(date("2027-02-10"), 1)).toHaveLength(4);
    expect(monthRows(date("2026-08-10"), 1)).toHaveLength(6);
    expect(sixWeeks(date("2027-02-10"), 1).weeks).toHaveLength(6);
    expect(sixWeeks(date("2027-02-10"), 1).range.end.toString()).toBe("2027-03-15");
  });
});

describe("days with a clock change", () => {
  test("last 23, 24 or 25 hours", () => {
    expect(hoursInDay(date("2026-03-29"), berlin)).toBe(23);
    expect(hoursInDay(date("2026-10-08"), berlin)).toBe(24);
    expect(hoursInDay(date("2026-10-25"), berlin)).toBe(25);
  });

  test("an event is on a date by the zone's midnights", () => {
    const event = {
      start: Temporal.Instant.from("2026-10-08T22:30:00Z"),
      end: Temporal.Instant.from("2026-10-08T23:00:00Z"),
    };
    // 00:30 on October 9 in Berlin, 18:30 on October 8 in New York.
    expect(isOnDate(event, date("2026-10-09"), berlin)).toBe(true);
    expect(isOnDate(event, date("2026-10-08"), berlin)).toBe(false);
    expect(isOnDate(event, date("2026-10-08"), "America/New_York")).toBe(true);
  });

  const rowsOf = (day: string) =>
    hourRows(date(day), berlin)
      .slice(1, 4)
      .map((row) => `${row.label} ${row.kind} ${row.starts.join(" ")}`.trim());

  test("have 24 hour rows, with no instant in a gap and two in a fold", () => {
    expect(hourRows(date("2026-03-29"), berlin)).toHaveLength(24);
    expect(hourRows(date("2026-10-25"), berlin)).toHaveLength(24);
    expect(rowsOf("2026-03-29")).toEqual([
      "01:00 unique 2026-03-29T00:00:00Z",
      "02:00 gap",
      "03:00 unique 2026-03-29T01:00:00Z",
    ]);
    expect(rowsOf("2026-10-25")).toEqual([
      "01:00 unique 2026-10-24T23:00:00Z",
      "02:00 fold 2026-10-25T00:00:00Z 2026-10-25T01:00:00Z",
      "03:00 unique 2026-10-25T02:00:00Z",
    ]);
  });

  const pick = (value: string) => {
    const picked = pickTime(Temporal.PlainDateTime.from(value), berlin);
    return picked.ok ? picked.instant.toString() : picked.reason;
  };

  test("a picked time resolves, or says the clocks skip it", () => {
    expect(pick("2026-10-08T02:15")).toBe("2026-10-08T00:15:00Z");
    expect(pick("2026-03-29T02:15")).toBe("The clocks skip that time. Did you mean 03:15?");
    // The first 02:15 of the two that night, at +02:00.
    expect(pick("2026-10-25T02:15")).toBe("2026-10-25T00:15:00Z");
  });

  test("snapping moves a skipped time to the moment the clocks change", () => {
    const snap = (value: string) =>
      snapToGrid(Temporal.PlainDateTime.from(value), berlin).toString();
    expect(snap("2026-10-08T09:07")).toBe("2026-10-08T09:00:00+02:00[Europe/Berlin]");
    expect(snap("2026-03-29T02:10")).toBe("2026-03-29T03:00:00+02:00[Europe/Berlin]");
  });
});
