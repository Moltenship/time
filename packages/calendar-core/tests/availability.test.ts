import {
  instantInterval,
  plainDateInterval,
  zonedDayRange,
  type InstantInterval,
} from "@moltenship/calendar-temporal";
import { describe, expect, test } from "vite-plus/test";

import {
  closedDates,
  createAvailabilitySnapshot,
  projectTimeGridAvailability,
  projectTimelineAvailability,
  timeGridColumns,
  type AvailabilityHours,
  type AvailabilitySchedule,
  type CalendarAvailability,
} from "../src/index";

const newYork = "America/New_York";
const time = (value: string) => Temporal.PlainTime.from(value);
const date = (value: string) => Temporal.PlainDate.from(value);
const weekdays = [1, 2, 3, 4, 5] as const;

const office: CalendarAvailability = {
  exceptions: [
    { date: date("2026-12-25"), label: "Christmas" },
    { date: date("2026-12-24"), hours: [{ end: time("12:00"), start: time("09:00") }] },
  ],
  weekly: [{ days: weekdays, end: time("17:00"), start: time("09:00") }],
};

function calendarOf(availability: CalendarAvailability, timeZone = newYork): AvailabilitySchedule {
  return createAvailabilitySnapshot({ availability, timeZone }).calendar!;
}

function day(value: string, timeZone = newYork): InstantInterval {
  return zonedDayRange(date(value), timeZone).interval!;
}

/** Intervals as wall-clock ranges in `timeZone`, with offsets, for readable expectations. */
function wall(intervals: readonly InstantInterval[], timeZone = newYork): string[] {
  return intervals.map(({ end, start }) => {
    const from = start.toZonedDateTimeISO(timeZone);
    const to = end.toZonedDateTimeISO(timeZone);
    return `${from.toPlainDateTime().toString().slice(5, 16)}${from.offset}/${to.toPlainDateTime().toString().slice(5, 16)}${to.offset}`;
  });
}

describe("weekly rules and exceptions", () => {
  test("weekly hours open their days and close the rest", () => {
    const schedule = calendarOf(office);
    // Thursday.
    expect(wall(schedule.available(day("2026-10-08")))).toEqual([
      "10-08T09:00-04:00/10-08T17:00-04:00",
    ]);
    expect(wall(schedule.unavailable(day("2026-10-08")))).toEqual([
      "10-08T00:00-04:00/10-08T09:00-04:00",
      "10-08T17:00-04:00/10-09T00:00-04:00",
    ]);
    // Saturday.
    expect(schedule.available(day("2026-10-10"))).toEqual([]);
    expect(wall(schedule.unavailable(day("2026-10-10")))).toEqual([
      "10-10T00:00-04:00/10-11T00:00-04:00",
    ]);
  });

  test("queries are half-open", () => {
    const schedule = calendarOf(office);
    const at = (value: string) => Temporal.ZonedDateTime.from(`${value}[${newYork}]`).toInstant();
    expect(
      schedule.isAvailable(instantInterval(at("2026-10-08T09:00"), at("2026-10-08T17:00"))),
    ).toBe(true);
    expect(
      schedule.isAvailable(instantInterval(at("2026-10-08T16:00"), at("2026-10-08T17:01"))),
    ).toBe(false);
    expect(
      schedule.isAvailable(instantInterval(at("2026-10-08T08:59"), at("2026-10-08T10:00"))),
    ).toBe(false);
    // Open time ending exactly where a query starts doesn't count.
    expect(
      schedule.available(instantInterval(at("2026-10-08T17:00"), at("2026-10-08T18:00"))),
    ).toEqual([]);
  });

  test("hours ending at or before their start run past midnight", () => {
    const nights = calendarOf({
      weekly: [
        { days: [5], end: time("02:00"), start: time("22:00") },
        { days: [6], end: time("00:00"), start: time("00:00") },
      ],
    });
    expect(wall(nights.available(day("2026-10-10")))).toEqual([
      // Friday's night runs into Saturday, which is open all day, and on until Sunday.
      "10-10T00:00-04:00/10-11T00:00-04:00",
    ]);
    expect(wall(nights.available(day("2026-10-09")))).toEqual([
      "10-09T22:00-04:00/10-10T00:00-04:00",
    ]);
  });

  test("an exception replaces a date's hours, and one without hours closes it", () => {
    const schedule = calendarOf(office);
    expect(wall(schedule.available(day("2026-12-24")))).toEqual([
      "12-24T09:00-05:00/12-24T12:00-05:00",
    ]);
    expect(schedule.available(day("2026-12-25"))).toEqual([]);
    expect(schedule.exceptionOn(date("2026-12-25"))?.label).toBe("Christmas");
    expect(schedule.exceptionOn(date("2026-12-28"))).toBeUndefined();
  });

  test("an exception's date counts by its ISO date, whatever its calendar", () => {
    const gregorian = calendarOf({
      ...office,
      exceptions: [{ date: date("2026-10-08").withCalendar("gregory"), label: "Closure" }],
    });
    expect(gregorian.available(day("2026-10-08"))).toEqual([]);
    expect(gregorian.exceptionOn(date("2026-10-08"))?.label).toBe("Closure");
    expect(gregorian.exceptionOn(date("2026-10-08").withCalendar("japanese"))?.label).toBe(
      "Closure",
    );
  });

  test("without weekly hours every day is open, and exceptions still close dates", () => {
    const holidays = calendarOf({ exceptions: [{ date: date("2026-12-25") }] });
    expect(holidays.isAvailable(day("2026-10-10"))).toBe(true);
    expect(holidays.available(day("2026-12-25"))).toEqual([]);
    expect(calendarOf({ weekly: [] }).available(day("2026-10-08"))).toEqual([]);
  });

  test("overlapping and touching hours merge", () => {
    const split = calendarOf({
      weekly: [
        { days: [4], end: time("12:00"), start: time("09:00") },
        { days: [4], end: time("13:00"), start: time("11:00") },
        { days: [4], end: time("17:00"), start: time("13:00") },
      ],
    });
    expect(wall(split.available(day("2026-10-08")))).toEqual([
      "10-08T09:00-04:00/10-08T17:00-04:00",
    ]);
  });
});

describe("daylight saving time", () => {
  test("spring forward: hours across the gap keep their wall times, and a start in it opens at the jump", () => {
    // New York skips 02:00–03:00 on Sunday, March 8, 2026.
    const across = calendarOf({
      weekly: [{ days: [7], end: time("04:00"), start: time("01:00") }],
    });
    const [open] = across.available(day("2026-03-08"));
    expect(wall([open!])).toEqual(["03-08T01:00-05:00/03-08T04:00-04:00"]);
    expect(open!.start.until(open!.end).total("hours")).toBe(2);

    const inGap = calendarOf({ weekly: [{ days: [7], end: time("05:00"), start: time("02:30") }] });
    expect(wall(inGap.available(day("2026-03-08")))).toEqual([
      "03-08T03:00-04:00/03-08T05:00-04:00",
    ]);
    // Hours wholly inside the gap never open.
    const skipped = calendarOf({
      weekly: [{ days: [7], end: time("02:45"), start: time("02:15") }],
    });
    expect(skipped.available(day("2026-03-08"))).toEqual([]);
  });

  test("fall back: a start in the repeated hour opens at its first occurrence and an end closes after the second", () => {
    // New York repeats 01:00–02:00 on Sunday, November 1, 2026.
    const schedule = calendarOf({
      weekly: [{ days: [7], end: time("01:30"), start: time("00:00") }],
    });
    const [open] = schedule.available(day("2026-11-01"));
    expect(wall([open!])).toEqual(["11-01T00:00-04:00/11-01T01:30-05:00"]);
    expect(open!.start.until(open!.end).total("hours")).toBe(2.5);

    const late = calendarOf({ weekly: [{ days: [7], end: time("09:00"), start: time("01:30") }] });
    expect(wall(late.available(day("2026-11-01")))).toEqual([
      "11-01T01:30-04:00/11-01T09:00-05:00",
    ]);
  });

  test("a whole day lasts as long as the day does", () => {
    const always = calendarOf({
      weekly: [{ days: [7], end: time("00:00"), start: time("00:00") }],
    });
    expect(always.isAvailable(day("2026-03-08"))).toBe(true);
    expect(always.isAvailable(day("2026-11-01"))).toBe(true);
    expect(
      always.available(day("2026-11-01"))[0]!.start.until(day("2026-11-01").end).total("hours"),
    ).toBe(25);
  });
});

describe("resources", () => {
  const resources = [
    { id: "nyc", timeZone: newYork },
    {
      availability: { weekly: [{ days: weekdays, end: time("18:00"), start: time("10:00") }] },
      id: "late",
    },
    { id: "london", timeZone: "Europe/London" },
    {
      availability: { exceptions: [{ date: date("2026-10-09"), label: "Off" }] },
      id: "away",
      timeZone: "Asia/Tokyo",
    },
  ] as const;
  const snapshot = createAvailabilitySnapshot({
    availability: office,
    resources,
    timeZone: newYork,
  });

  test("resources follow the calendar's hours on their own time zones", () => {
    const london = snapshot.forResource("london")!;
    expect(london.timeZone).toBe("Europe/London");
    // 09:00–17:00 in London is 04:00–12:00 in New York in October.
    expect(wall(london.available(day("2026-10-08")))).toEqual([
      "10-08T04:00-04:00/10-08T12:00-04:00",
    ]);
    // A resource in the calendar's zone shares its schedule, and unknown ones get it.
    expect(snapshot.forResource("nyc")).toBe(snapshot.calendar);
    expect(snapshot.forResource("unknown")).toBe(snapshot.calendar);
    expect(snapshot.forResource(null)).toBe(snapshot.calendar);
  });

  test("own weekly hours replace the calendar's, and own exceptions add to its", () => {
    const late = snapshot.forResource("late")!;
    expect(wall(late.available(day("2026-10-08")))).toEqual([
      "10-08T10:00-04:00/10-08T18:00-04:00",
    ]);
    // The calendar's holiday still closes the late shift.
    expect(late.available(day("2026-12-25"))).toEqual([]);

    const away = snapshot.forResource("away")!;
    expect(away.exceptionOn(date("2026-10-09"))?.label).toBe("Off");
    expect(away.available(day("2026-10-09", "Asia/Tokyo"))).toEqual([]);
    expect(away.exceptionOn(date("2026-12-25"))?.label).toBe("Christmas");
  });

  test("without calendar hours, only resources with their own have any", () => {
    const own = createAvailabilitySnapshot({ resources, timeZone: newYork });
    expect(own.calendar).toBeNull();
    expect(own.forResource("london")).toBeNull();
    expect(own.forResource("late")!.available(day("2026-10-10"))).toEqual([]);
  });

  test("the calendar's time zone places its hours, and resources without their own keep it", () => {
    const tokyo = createAvailabilitySnapshot({
      availability: { ...office, timeZone: "Asia/Tokyo" },
      resources: [{ id: "here" }],
      timeZone: newYork,
    });
    expect(tokyo.calendar!.timeZone).toBe("Asia/Tokyo");
    expect(tokyo.forResource("here")).toBe(tokyo.calendar);
  });

  test("a repeated resource ID keeps its first resource, as the resource tree does", () => {
    const repeated = createAvailabilitySnapshot({
      availability: office,
      resources: [{ id: "room" }, { availability: { weekly: [] }, id: "room" }],
      timeZone: newYork,
    });
    expect(repeated.forResource("room")).toBe(repeated.calendar);
  });

  test("invalid rules, exceptions, and time zones are left out and reported", () => {
    const bad = createAvailabilitySnapshot({
      availability: {
        exceptions: [
          { date: date("2026-12-25") },
          { date: date("2026-12-25"), label: "Again" },
          { date: "2026-12-26" } as never,
        ],
        timeZone: "Mars/Olympus",
        weekly: [
          { days: [8], end: time("17:00"), start: time("09:00") } as never,
          { days: [1], end: "17:00", start: time("09:00") } as never,
          { days: [1], end: time("17:00"), start: time("09:00") },
        ],
      },
      resources: [{ id: "lost", timeZone: "Nowhere/City" }],
      timeZone: newYork,
    });
    expect(bad.issues.map(({ code, resourceId }) => [code, resourceId])).toEqual([
      ["invalid-time-zone", undefined],
      ["duplicate-exception-date", undefined],
      ["invalid-availability-exception", undefined],
      ["invalid-availability-rule", undefined],
      ["invalid-availability-rule", undefined],
      ["invalid-time-zone", "lost"],
    ]);
    expect(bad.calendar!.timeZone).toBe(newYork);
    expect(bad.forResource("lost")).toBe(bad.calendar);
    expect(wall(bad.calendar!.available(day("2026-10-05")))).toEqual([
      "10-05T09:00-04:00/10-05T17:00-04:00",
    ]);
  });
});

test("entries of the wrong shape are reported, never thrown over", () => {
  // A list with a hole, which `every` skips.
  const days: (1 | 2)[] = [];
  days.length = 1;
  const hours: AvailabilityHours[] = [];
  hours.length = 1;
  const holes = createAvailabilitySnapshot({
    availability: {
      exceptions: [{ date: date("2026-10-08"), hours }],
      weekly: [{ days, end: time("17:00"), start: time("09:00") }],
    },
    timeZone: newYork,
  });
  expect(holes.issues.map(({ code }) => code)).toEqual([
    "invalid-availability-exception",
    "invalid-availability-rule",
  ]);

  const odd = createAvailabilitySnapshot({
    availability: { exceptions: [null], weekly: [null] } as never,
    resources: [
      { availability: null, id: "none", timeZone: "Europe/London" },
      { availability: { exceptions: "soon", weekly: "always" }, id: "words" },
    ] as never,
    timeZone: newYork,
  });
  expect(odd.issues.map(({ code, resourceId }) => [code, resourceId])).toEqual([
    ["invalid-availability-exception", undefined],
    ["invalid-availability-rule", undefined],
    ["invalid-availability-exception", "words"],
    ["invalid-availability-rule", "words"],
  ]);
  // The calendar's empty weekly list closes every day; "words" keeps it.
  expect(odd.calendar!.available(day("2026-10-08"))).toEqual([]);
  expect(odd.forResource("words")!.available(day("2026-10-08"))).toEqual([]);
  expect(odd.forResource("none")!.timeZone).toBe("Europe/London");
});

describe("projections", () => {
  const snapshot = createAvailabilitySnapshot({
    availability: office,
    resources: [{ id: "london", timeZone: "Europe/London" }],
    timeZone: newYork,
  });

  test("a time grid gets each column's closed time as bands on its 24-hour axis", () => {
    const columns = timeGridColumns(
      plainDateInterval(date("2026-10-08"), date("2026-10-11")),
      newYork,
    );
    const bands = projectTimeGridAvailability(columns, snapshot.calendar);
    expect(bands[0]).toEqual([
      { height: 9 / 24, top: 0 },
      { height: 7 / 24, top: 17 / 24 },
    ]);
    expect(bands[2]).toEqual([{ height: 1, top: 0 }]);
    // London's day, seen from New York.
    expect(projectTimeGridAvailability(columns, snapshot.forResource("london"))[0]).toEqual([
      { height: 4 / 24, top: 0 },
      { height: 12 / 24, top: 12 / 24 },
    ]);
    expect(projectTimeGridAvailability(columns, null)).toEqual([[], [], []]);
  });

  test("bands keep their wall times across a fall-back day", () => {
    const columns = timeGridColumns(
      plainDateInterval(date("2026-11-01"), date("2026-11-02")),
      newYork,
    );
    const sunday = createAvailabilitySnapshot({
      availability: { weekly: [{ days: [7], end: time("17:00"), start: time("09:00") }] },
      timeZone: newYork,
    }).calendar;
    expect(projectTimeGridAvailability(columns, sunday)[0]).toEqual([
      { height: 9 / 24, top: 0 },
      { height: 7 / 24, top: 17 / 24 },
    ]);
  });

  test("a timeline gets its closed time as stretches of its width", () => {
    const columns = timeGridColumns(
      plainDateInterval(date("2026-10-08"), date("2026-10-09")),
      newYork,
    );
    expect(projectTimelineAvailability(columns, snapshot.calendar)).toEqual([
      { end: 9 / 24, start: 0 },
      { end: 1, start: 17 / 24 },
    ]);
    expect(projectTimelineAvailability(columns, null)).toEqual([]);
  });

  test("closed dates are those without open time on their day, named by an exception", () => {
    const closed = closedDates(
      plainDateInterval(date("2026-12-21"), date("2026-12-28")),
      snapshot.calendar,
      newYork,
    );
    expect([...closed.values()]).toEqual([
      { date: date("2026-12-25"), label: "Christmas" },
      { date: date("2026-12-26") },
      { date: date("2026-12-27") },
    ]);
    expect(
      closedDates(plainDateInterval(date("2026-12-21"), date("2026-12-28")), null, newYork).size,
    ).toBe(0);
  });
});

describe("a repeated hour after midnight", () => {
  // St. John's fell back at 00:01 on November 1, 2009: the clock went from 00:01 NDT back to
  // 23:01 NST on October 31, so October 31's last hour repeats after its nominal end.
  const stJohns = "America/St_Johns";
  const columns = timeGridColumns(
    plainDateInterval(date("2009-10-31"), date("2009-11-01")),
    stJohns,
  );
  const minutes = (fractions: readonly [number, number][]) =>
    fractions.map(([from, to]) => [Math.round(from * 1440), Math.round(to * 1440)]);
  // Open from Saturday noon UTC to 03:00 UTC on Sunday: 09:30 NDT on October 31 until 23:30 NST,
  // in the repeated hour.
  const saturday = createAvailabilitySnapshot({
    availability: {
      timeZone: "UTC",
      weekly: [{ days: [6], end: time("03:00"), start: time("12:00") }],
    },
    timeZone: stJohns,
  }).calendar;

  test("shades the closed time of both occurrences", () => {
    const [bands] = projectTimeGridAvailability(columns, saturday);
    expect(minutes(bands!.map(({ height, top }) => [top, top + height]))).toEqual([
      [0, 570],
      [1410, 1440],
    ]);
    expect(
      minutes(projectTimelineAvailability(columns, saturday).map(({ end, start }) => [start, end])),
    ).toEqual([
      [0, 570],
      [1410, 1440],
    ]);
  });

  test("a date open only in its repeated hour is not closed", () => {
    const repeatOnly = createAvailabilitySnapshot({
      availability: {
        exceptions: [
          { date: date("2009-11-01"), hours: [{ end: time("02:50"), start: time("02:40") }] },
        ],
        timeZone: "UTC",
        weekly: [],
      },
      timeZone: stJohns,
    }).calendar;
    // 02:40–02:50 UTC on November 1 is 23:10–23:20 NST on October 31.
    expect([
      ...closedDates(
        plainDateInterval(date("2009-10-31"), date("2009-11-02")),
        repeatOnly,
        stJohns,
      ).keys(),
    ]).toEqual(["2009-11-01"]);
  });
});
