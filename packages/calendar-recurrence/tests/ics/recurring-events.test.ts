import { parseIcs, type IcsEvent } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import { occurrenceId, recurringEventsFromIcs, type IcsRecurringEventsOptions } from "../../src";

function parse(...events: readonly (readonly string[])[]): readonly IcsEvent[] {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moltenship//Recurrence tests//EN",
    ...events.flatMap((event) => ["BEGIN:VEVENT", ...event, "END:VEVENT"]),
    "END:VCALENDAR",
  ];
  return parseIcs(lines.join("\r\n")).calendars[0]!.events;
}

// Temporal values as their ISO strings, so `toStrictEqual` compares them and sees absent keys.
function plain(value: unknown): unknown {
  if (
    value instanceof Temporal.Duration ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainDateTime
  ) {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

/** The bridged events with `data` as its UID, and the issues as code, property and UID. */
function bridge(events: readonly IcsEvent[], options?: IcsRecurringEventsOptions) {
  const result = recurringEventsFromIcs(events, options);
  return {
    events: result.events.map((event) => plain({ ...event, data: event.data.uid })),
    issues: result.issues.map(({ code, event, property }) => ({ code, property, uid: event.uid })),
  };
}

const weeklySync = [
  "UID:sync",
  "SUMMARY:Sync",
  "DTSTART;TZID=Europe/Berlin:20260112T100000",
  "DTEND;TZID=Europe/Berlin:20260112T103000",
  "RRULE:FREQ=WEEKLY",
];

describe("recurringEventsFromIcs: intervals", () => {
  test("turns one-off events into calendar events, in input order, with the VEVENT as data", () => {
    const events = parse(
      ["UID:utc", "SUMMARY:UTC", "DTSTART:20260112T090000Z", "DTEND:20260112T100000Z"],
      [
        "UID:zoned",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "DTEND;TZID=Europe/Berlin:20260112T110000",
      ],
      ["UID:date", "DTSTART;VALUE=DATE:20260112", "DTEND;VALUE=DATE:20260114"],
      ["UID:floating", "DTSTART:20260112T100000", "DTEND:20260112T113000"],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => event.data)).toEqual(events);
    expect(result.events[0]!.data).toBe(events[0]);
    expect(bridge(events)).toStrictEqual({
      events: [
        {
          data: "utc",
          end: "2026-01-12T10:00:00Z",
          id: "utc",
          kind: "timed",
          sourceTimeZone: "UTC",
          start: "2026-01-12T09:00:00Z",
          title: "UTC",
        },
        {
          data: "zoned",
          end: "2026-01-12T10:00:00Z",
          id: "zoned",
          kind: "timed",
          sourceTimeZone: "Europe/Berlin",
          start: "2026-01-12T09:00:00Z",
          title: "",
        },
        {
          data: "date",
          end: "2026-01-14",
          id: "date",
          kind: "all-day",
          start: "2026-01-12",
          title: "",
        },
        {
          data: "floating",
          end: "2026-01-12T11:30:00",
          id: "floating",
          kind: "floating",
          start: "2026-01-12T10:00:00",
          title: "",
        },
      ],
      issues: [],
    });
  });

  test("skips an event whose DTSTART has a time zone that didn't resolve", () => {
    const events = parse(["UID:office", "DTSTART;TZID=Our Office:20260112T100000"]);
    const result = recurringEventsFromIcs(events);
    expect(result.events).toEqual([]);
    expect(result.issues).toEqual([
      {
        code: "unresolved-time-zone",
        event: events[0],
        index: 0,
        message:
          'DTSTART has TZID "Our Office", which resolved to no time zone; the event is skipped.',
        property: "DTSTART",
      },
    ]);
  });

  test("gives events without a length one day, or the minimum duration", () => {
    const events = parse(
      ["UID:day", "DTSTART;VALUE=DATE:20260112"],
      ["UID:same-day", "DTSTART;VALUE=DATE:20260112", "DTEND;VALUE=DATE:20260112"],
      ["UID:timed", "DTSTART:20260112T090000Z"],
      ["UID:empty", "DTSTART;TZID=Europe/Berlin:20260112T100000", "DURATION:PT0S"],
      ["UID:backwards", "DTSTART:20260112T100000", "DTEND:20260112T090000"],
    );
    const spans = (options?: IcsRecurringEventsOptions) =>
      bridge(events, options).events.map((event) => {
        const { end, start } = event as { end: string; start: string };
        return `${start}/${end}`;
      });
    expect(spans()).toEqual([
      "2026-01-12/2026-01-13",
      "2026-01-12/2026-01-13",
      "2026-01-12T09:00:00Z/2026-01-12T09:30:00Z",
      "2026-01-12T09:00:00Z/2026-01-12T09:30:00Z",
      "2026-01-12T10:00:00/2026-01-12T10:30:00",
    ]);
    expect(spans({ minimumDuration: { hours: 1 } })).toEqual([
      "2026-01-12/2026-01-13",
      "2026-01-12/2026-01-13",
      "2026-01-12T09:00:00Z/2026-01-12T10:00:00Z",
      "2026-01-12T09:00:00Z/2026-01-12T10:00:00Z",
      "2026-01-12T10:00:00/2026-01-12T11:00:00",
    ]);
  });

  test("ends events at DTSTART plus DURATION, and keeps the instant of a DTEND in UTC", () => {
    const events = parse(
      ["UID:meeting", "DTSTART;TZID=Europe/Berlin:20260112T100000", "DURATION:PT45M"],
      ["UID:trip", "DTSTART;VALUE=DATE:20260112", "DURATION:P2D"],
      ["UID:call", "DTSTART;TZID=Europe/Berlin:20260112T100000", "DTEND:20260112T100000Z"],
    );
    expect(bridge(events).events).toMatchObject([
      { end: "2026-01-12T09:45:00Z", start: "2026-01-12T09:00:00Z" },
      { end: "2026-01-14", start: "2026-01-12" },
      { end: "2026-01-12T10:00:00Z", start: "2026-01-12T09:00:00Z" },
    ]);
  });
});

describe("recurringEventsFromIcs: series and overrides", () => {
  test("makes events with RRULE, RDATE or EXDATE masters, with only the keys that apply", () => {
    const events = parse(
      ["UID:rule", "DTSTART:20260112T090000Z", "RRULE:FREQ=DAILY;COUNT=3"],
      ["UID:rdate", "DTSTART:20260112T090000Z", "RDATE:20260114T090000Z"],
      ["UID:exdate", "DTSTART:20260112T090000Z", "EXDATE:20260112T090000Z"],
    );
    expect(
      bridge(events).events.map((event) => (event as { recurrence: unknown }).recurrence),
    ).toStrictEqual([
      { rule: { count: 3, frequency: "DAILY" } },
      { recurrenceDates: ["2026-01-14T09:00:00Z"] },
      { exceptionDates: ["2026-01-12T09:00:00Z"] },
    ]);
  });

  test("gives an override the ID of the occurrence it replaces, and makes its UID a series", () => {
    const events = parse(
      [
        "UID:sync",
        "SUMMARY:Sync",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "DTEND;TZID=Europe/Berlin:20260112T103000",
      ],
      [
        "UID:sync",
        "SUMMARY:Sync (moved)",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260112T100000",
        "DTSTART;TZID=Europe/Berlin:20260112T140000",
        "DTEND;TZID=Europe/Berlin:20260112T150000",
      ],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events[1]!.id).toBe(
      occurrenceId("sync", Temporal.Instant.from("2026-01-12T09:00:00Z")),
    );
    expect(bridge(events)).toStrictEqual({
      events: [
        {
          data: "sync",
          end: "2026-01-12T09:30:00Z",
          id: "sync",
          kind: "timed",
          recurrence: {},
          sourceTimeZone: "Europe/Berlin",
          start: "2026-01-12T09:00:00Z",
          title: "Sync",
        },
        {
          data: "sync",
          end: "2026-01-12T14:00:00Z",
          id: "sync::2026-01-12T09:00:00Z",
          kind: "timed",
          override: { recurrenceId: "2026-01-12T09:00:00Z", seriesId: "sync" },
          sourceTimeZone: "Europe/Berlin",
          start: "2026-01-12T13:00:00Z",
          title: "Sync (moved)",
        },
      ],
      issues: [],
    });
  });

  test("treats RANGE=THISANDFUTURE as an override of one occurrence, with an issue", () => {
    const events = parse(weeklySync, [
      "UID:sync",
      "RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:20260119T100000",
      "DTSTART;TZID=Europe/Berlin:20260119T110000",
    ]);
    const result = recurringEventsFromIcs(events);
    expect(plain(result.events[1]!.override)).toStrictEqual({
      recurrenceId: "2026-01-19T09:00:00Z",
      seriesId: "sync",
    });
    expect(result.issues).toEqual([
      {
        code: "unsupported-rule",
        event: events[1],
        index: 1,
        message:
          "RANGE=THISANDFUTURE isn't supported; the override replaces only the occurrence it names.",
        property: "RECURRENCE-ID",
      },
    ]);
  });

  test("keeps a lone override's RECURRENCE-ID in its series' kind, and skips one that didn't resolve", () => {
    const events = parse(
      ["UID:utc", "RECURRENCE-ID:20260112T090000Z", "DTSTART:20260112T120000Z"],
      ["UID:date", "RECURRENCE-ID;VALUE=DATE:20260112", "DTSTART;VALUE=DATE:20260113"],
      ["UID:floating", "RECURRENCE-ID:20260112T100000", "DTSTART:20260112T120000"],
      [
        "UID:resolved",
        "RECURRENCE-ID:20260112T100000",
        "DTSTART;TZID=Europe/Berlin:20260112T120000",
      ],
      ["UID:to-timed", "RECURRENCE-ID;VALUE=DATE:20260112", "DTSTART:20260112T120000Z"],
      ["UID:to-all-day", "RECURRENCE-ID:20260112T090000Z", "DTSTART;VALUE=DATE:20260112"],
      ["UID:office", "RECURRENCE-ID;TZID=Our Office:20260112T100000", "DTSTART:20260112T120000Z"],
    );
    const { events: bridged, issues } = bridge(events);
    expect(bridged.map((event) => (event as { id: string }).id)).toEqual([
      "utc::2026-01-12T09:00:00Z",
      "date::2026-01-12",
      "floating::2026-01-12T10:00:00",
      "resolved::2026-01-12T09:00:00Z",
      "to-timed::2026-01-12",
      "to-all-day::2026-01-12T09:00:00Z",
    ]);
    expect(issues).toEqual([
      { code: "unresolved-time-zone", property: "RECURRENCE-ID", uid: "office" },
    ]);
  });

  test("makes the overrides of a master whose DTSTART didn't resolve lone overrides", () => {
    const events = parse(
      ["UID:sync", "DTSTART;TZID=Our Office:20260112T100000", "RRULE:FREQ=WEEKLY"],
      [
        "UID:sync",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260119T100000",
        "DTSTART;TZID=Europe/Berlin:20260119T110000",
      ],
    );
    expect(bridge(events)).toMatchObject({
      events: [{ id: "sync::2026-01-19T09:00:00Z", override: { seriesId: "sync" } }],
      issues: [{ code: "unresolved-time-zone", property: "DTSTART", uid: "sync" }],
    });
  });

  test("gives a master its DURATION as a nominal length, and the written time of a DTSTART in a DST gap", () => {
    const events = parse(
      [
        "UID:nominal",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "DURATION:P1D",
        "RRULE:FREQ=WEEKLY",
      ],
      [
        "UID:exact",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "DTEND;TZID=Europe/Berlin:20260113T100000",
        "RRULE:FREQ=WEEKLY",
      ],
      ["UID:all-day", "DTSTART;VALUE=DATE:20260112", "DURATION:P2D", "RRULE:FREQ=WEEKLY"],
      [
        "UID:gap",
        "DTSTART;TZID=Europe/Berlin:20260329T023000",
        "DTEND;TZID=Europe/Berlin:20260329T040000",
        "RRULE:FREQ=DAILY",
      ],
    );
    const { events: bridged } = bridge(events);
    expect(bridged.map((event) => (event as { recurrence: unknown }).recurrence)).toStrictEqual([
      { duration: "P1D", rule: { frequency: "WEEKLY" } },
      { rule: { frequency: "WEEKLY" } },
      { rule: { frequency: "WEEKLY" } },
      { rule: { frequency: "DAILY" }, wallStart: "2026-03-29T02:30:00" },
    ]);
    expect(bridged[3]).toMatchObject({ start: "2026-03-29T01:30:00Z" });
  });
});

describe("recurringEventsFromIcs: dates in the series' kind", () => {
  test("keeps a date-only EXDATE on a timed series a date, which excludes the whole day", () => {
    const events = parse([...weeklySync, "EXDATE;VALUE=DATE:20260126"]);
    expect(bridge(events)).toStrictEqual({
      events: [
        expect.objectContaining({
          recurrence: { exceptionDates: ["2026-01-26"], rule: { frequency: "WEEKLY" } },
        }),
      ],
      issues: [],
    });
  });

  test("drops a date-only RDATE on a timed series, with an issue", () => {
    const events = parse([...weeklySync, "RDATE;VALUE=DATE:20260128", "RDATE:20260129T090000Z"]);
    const result = recurringEventsFromIcs(events);
    expect(plain(result.events[0]!.recurrence)).toStrictEqual({
      recurrenceDates: ["2026-01-29T09:00:00Z"],
      rule: { frequency: "WEEKLY" },
    });
    expect(result.issues).toEqual([
      {
        code: "date-kind-mismatch",
        event: events[0],
        index: 0,
        message: "RDATE is a date, but the series is timed; it was dropped.",
        property: "RDATE",
      },
    ]);
  });

  test("converts date-times of other kinds on a timed series without an issue", () => {
    const events = parse([
      ...weeklySync,
      "EXDATE:20260119T090000Z",
      "EXDATE:20260126T100000",
      "EXDATE;TZID=America/New_York:20260202T040000",
    ]);
    expect(bridge(events)).toMatchObject({
      events: [
        {
          recurrence: {
            exceptionDates: [
              "2026-01-19T09:00:00Z",
              "2026-01-26T09:00:00Z",
              "2026-02-02T09:00:00Z",
            ],
          },
        },
      ],
      issues: [],
    });
  });

  test("reads an EXDATE whose time zone didn't resolve in the series' time zone, with an issue", () => {
    const events = parse([...weeklySync, "EXDATE;TZID=Our Office:20260119T100000"]);
    const result = recurringEventsFromIcs(events);
    expect(plain(result.events[0]!.recurrence?.exceptionDates)).toEqual(["2026-01-19T09:00:00Z"]);
    expect(result.issues.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: "date-kind-mismatch",
        message:
          'EXDATE has TZID "Our Office", which resolved to no time zone; it was read as a wall time in Europe/Berlin.',
      },
    ]);
  });

  test("keeps the dates of date-times on an all-day series, each in its own zone", () => {
    const events = parse([
      "UID:standup",
      "DTSTART;VALUE=DATE:20260112",
      "RRULE:FREQ=DAILY",
      "EXDATE;TZID=America/New_York:20260113T230000",
      "EXDATE:20260114T230000Z",
      "EXDATE:20260115T100000",
      "RDATE;VALUE=DATE:20260201",
    ]);
    expect(bridge(events)).toStrictEqual({
      events: [
        expect.objectContaining({
          recurrence: {
            exceptionDates: ["2026-01-13", "2026-01-14", "2026-01-15"],
            recurrenceDates: ["2026-02-01"],
            rule: { frequency: "DAILY" },
          },
        }),
      ],
      issues: [{ code: "date-kind-mismatch", property: "EXDATE", uid: "standup" }],
    });
  });

  test("reads date-times on a floating series as wall times, each in its own zone", () => {
    const events = parse([
      "UID:focus",
      "DTSTART:20260112T100000",
      "RRULE:FREQ=DAILY",
      "EXDATE;VALUE=DATE:20260113",
      "EXDATE:20260114T100000Z",
      "EXDATE;TZID=Europe/Berlin:20260115T100000",
      "RDATE;VALUE=DATE:20260120",
    ]);
    expect(bridge(events)).toStrictEqual({
      events: [
        expect.objectContaining({
          recurrence: {
            exceptionDates: ["2026-01-13", "2026-01-14T10:00:00", "2026-01-15T10:00:00"],
            rule: { frequency: "DAILY" },
          },
        }),
      ],
      issues: [{ code: "date-kind-mismatch", property: "RDATE", uid: "focus" }],
    });
  });

  test("converts UNTIL into the series' kind, a date meaning through the end of that day", () => {
    const events = parse(
      [
        "UID:google",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "RRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=MO,TH;UNTIL=20260330T215959Z",
      ],
      [
        "UID:timed",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "RRULE:FREQ=DAILY;UNTIL=20260330",
      ],
      ["UID:floating", "DTSTART:20260112T100000", "RRULE:FREQ=DAILY;UNTIL=20260330"],
      ["UID:all-day", "DTSTART;VALUE=DATE:20260112", "RRULE:FREQ=DAILY;UNTIL=20260330T215959Z"],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => plain(event.recurrence?.rule))).toStrictEqual([
      {
        byDay: [{ weekday: "MO" }, { weekday: "TH" }],
        frequency: "WEEKLY",
        interval: 2,
        until: "2026-03-30T21:59:59Z",
        weekStart: "SU",
      },
      { frequency: "DAILY", until: "2026-03-30T21:59:59.999999999Z" },
      { frequency: "DAILY", until: "2026-03-30T23:59:59.999999999" },
      { frequency: "DAILY", until: "2026-03-30" },
    ]);
    expect(
      result.issues.map(({ code, event, message, property }) => [
        code,
        event.uid,
        property,
        message,
      ]),
    ).toEqual([
      [
        "date-kind-mismatch",
        "timed",
        "RRULE",
        "UNTIL is a date, but the series is timed; it was read as the end of that day in Europe/Berlin.",
      ],
      [
        "date-kind-mismatch",
        "floating",
        "RRULE",
        "UNTIL is a date, but the series is floating; it was read as the end of that day.",
      ],
      [
        "date-kind-mismatch",
        "all-day",
        "RRULE",
        "UNTIL is a date-time, but the series is all-day; it was read as its date.",
      ],
    ]);
  });

  test("keeps an RDATE PERIOD as a period, or its start when it ends no later in the series' kind", () => {
    const events = parse(
      [
        "UID:meeting",
        "DTSTART:20260112T090000Z",
        "DTEND:20260112T100000Z",
        "RDATE;VALUE=PERIOD:20260114T090000Z/20260114T110000Z,20260116T090000Z/PT3H",
        "RDATE:20260117T090000Z",
      ],
      ["UID:trip", "DTSTART;VALUE=DATE:20260112", "RDATE;VALUE=PERIOD:20260121T090000Z/P2D"],
      ["UID:workshop", "DTSTART;VALUE=DATE:20260112", "RDATE;VALUE=PERIOD:20260120T090000Z/PT8H"],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => plain(event.recurrence?.recurrenceDates))).toStrictEqual([
      [
        { end: "2026-01-14T11:00:00Z", start: "2026-01-14T09:00:00Z" },
        { end: "2026-01-16T12:00:00Z", start: "2026-01-16T09:00:00Z" },
        "2026-01-17T09:00:00Z",
      ],
      [{ end: "2026-01-23", start: "2026-01-21" }],
      ["2026-01-20"],
    ]);
    expect(result.issues.map(({ event, message }) => [event.uid, message])).toEqual([
      ["trip", "RDATE is a date-time, but the series is all-day; it was read as its date."],
      [
        "workshop",
        "RDATE PERIOD doesn't end after it starts in the series' kind; only its start was kept.",
      ],
    ]);
  });

  test("keeps only the start of an RDATE PERIOD that doesn't end after it starts as written", () => {
    const events = parse([
      "UID:meeting",
      "DTSTART:20260112T090000Z",
      "DTEND:20260112T100000Z",
      "RDATE;VALUE=PERIOD:20260118T090000Z/PT0S,20260119T090000Z/20260119T080000Z",
      "RDATE;VALUE=PERIOD:20260120T090000Z/-PT1H",
    ]);
    const result = recurringEventsFromIcs(events);
    expect(plain(result.events[0]!.recurrence?.recurrenceDates)).toEqual([
      "2026-01-18T09:00:00Z",
      "2026-01-19T09:00:00Z",
      "2026-01-20T09:00:00Z",
    ]);
    expect(result.issues).toEqual([
      {
        code: "invalid-period",
        event: events[0],
        index: 0,
        message: "RDATE PERIOD doesn't end after it starts; only its start was kept.",
        property: "RDATE",
      },
    ]);
  });

  test("reads a zoned date-time in a DST gap on a floating series at the wall time written", () => {
    const events = parse([
      "UID:night",
      "DTSTART:20270321T023000",
      "RRULE:FREQ=WEEKLY",
      "EXDATE;TZID=Europe/Berlin:20270328T023000",
    ]);
    expect(bridge(events)).toMatchObject({
      events: [{ recurrence: { exceptionDates: ["2027-03-28T02:30:00"] } }],
      issues: [],
    });
  });

  test("keeps both COUNT and UNTIL", () => {
    const events = parse([
      "UID:both",
      "DTSTART:20260112T090000Z",
      "RRULE:FREQ=DAILY;COUNT=5;UNTIL=20260114T090000Z",
    ]);
    expect(plain(recurringEventsFromIcs(events).events[0]!.recurrence)).toStrictEqual({
      rule: { count: 5, frequency: "DAILY", until: "2026-01-14T09:00:00Z" },
    });
  });

  test("reads UTC times on all-day and floating series in the feed's time zone", () => {
    const events = parse(
      [
        "UID:leave",
        "DTSTART;VALUE=DATE:20260112",
        "RRULE:FREQ=DAILY;UNTIL=20260330T130000Z",
        "EXDATE:20260114T130000Z",
        "EXDATE;TZID=Europe/Berlin:20260116T230000",
      ],
      ["UID:focus", "DTSTART:20260112T100000", "RRULE:FREQ=DAILY", "EXDATE:20260113T230000Z"],
    );
    const read = (options?: IcsRecurringEventsOptions) =>
      recurringEventsFromIcs(events, options).events.map(({ kind, recurrence }) =>
        plain({ exceptionDates: recurrence?.exceptionDates, kind, until: recurrence?.rule?.until }),
      );
    expect(read({ timeZone: "Australia/Sydney" })).toEqual([
      { exceptionDates: ["2026-01-15", "2026-01-16"], kind: "all-day", until: "2026-03-31" },
      { exceptionDates: ["2026-01-14T10:00:00"], kind: "floating" },
    ]);
    expect(read()).toEqual([
      { exceptionDates: ["2026-01-14", "2026-01-16"], kind: "all-day", until: "2026-03-30" },
      { exceptionDates: ["2026-01-13T23:00:00"], kind: "floating" },
    ]);
  });

  test("converts an override's RECURRENCE-ID into the series' kind, and drops a date-only one", () => {
    const events = parse(
      weeklySync,
      ["UID:sync", "RECURRENCE-ID;VALUE=DATE:20260119", "DTSTART:20260119T120000Z"],
      ["UID:sync", "RECURRENCE-ID:20260126T090000Z", "DTSTART:20260126T120000Z"],
      ["UID:sync", "RECURRENCE-ID:20260202T100000", "DTSTART:20260202T120000Z"],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => event.id)).toEqual([
      "sync",
      "sync::2026-01-26T09:00:00Z",
      "sync::2026-02-02T09:00:00Z",
    ]);
    expect(result.issues).toEqual([
      {
        code: "date-kind-mismatch",
        event: events[1],
        index: 1,
        message: "RECURRENCE-ID is a date, but the series is timed; it was dropped.",
        property: "RECURRENCE-ID",
      },
    ]);
  });
});

describe("recurringEventsFromIcs: cancelled and duplicate events", () => {
  test("marks a cancelled override cancelled, with or without its series", () => {
    const events = parse(
      [
        "UID:sync",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260126T100000",
        "DTSTART;TZID=Europe/Berlin:20260126T100000",
        "STATUS:CANCELLED",
      ],
      [...weeklySync, "EXDATE;TZID=Europe/Berlin:20260119T100000"],
      [
        "UID:lone",
        "RECURRENCE-ID:20260126T090000Z",
        "DTSTART:20260126T090000Z",
        "STATUS:CANCELLED",
      ],
    );
    expect(bridge(events)).toStrictEqual({
      events: [
        expect.objectContaining({
          id: "sync::2026-01-26T09:00:00Z",
          override: { cancelled: true, recurrenceId: "2026-01-26T09:00:00Z", seriesId: "sync" },
        }),
        expect.objectContaining({
          id: "sync",
          recurrence: { exceptionDates: ["2026-01-19T09:00:00Z"], rule: { frequency: "WEEKLY" } },
        }),
        expect.objectContaining({
          id: "lone::2026-01-26T09:00:00Z",
          override: { cancelled: true, recurrenceId: "2026-01-26T09:00:00Z", seriesId: "lone" },
        }),
      ],
      issues: [],
    });
  });

  test("leaves out a cancelled master with its overrides, and a cancelled one-off event", () => {
    const events = parse(
      [...weeklySync, "STATUS:CANCELLED"],
      [
        "UID:sync",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260119T100000",
        "DTSTART;TZID=Europe/Berlin:20260119T140000",
      ],
      ["UID:lunch", "DTSTART:20260120T113000Z", "STATUS:CANCELLED"],
    );
    expect(bridge(events)).toStrictEqual({ events: [], issues: [] });
  });

  test("keeps the duplicate with the highest SEQUENCE, then the later one", () => {
    const events = parse(
      ["UID:sync", "SEQUENCE:2", "SUMMARY:Second", "DTSTART:20260112T090000Z"],
      ["UID:sync", "SEQUENCE:1", "SUMMARY:First", "DTSTART:20260112T090000Z"],
      ["UID:lunch", "SUMMARY:Old", "DTSTART:20260120T113000Z"],
      ["UID:lunch", "SUMMARY:New", "DTSTART:20260120T113000Z"],
      ["UID:demo", "SEQUENCE:1", "DTSTART:20260121T090000Z"],
      ["UID:demo", "SEQUENCE:2", "DTSTART:20260121T090000Z", "STATUS:CANCELLED"],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => event.title)).toEqual(["Second", "New"]);
    expect(result.issues.map(({ code, event, message }) => [code, event, message])).toEqual([
      [
        "duplicate-event",
        events[1],
        'Another VEVENT with UID "sync" has a higher SEQUENCE, and replaces this one.',
      ],
      [
        "duplicate-event",
        events[2],
        'Another VEVENT with UID "lunch" has the same SEQUENCE and comes later, and replaces this one.',
      ],
      [
        "duplicate-event",
        events[4],
        'Another VEVENT with UID "demo" has a higher SEQUENCE, and replaces this one.',
      ],
    ]);
  });

  test("leaves out events it can't read before it picks among duplicates", () => {
    const events = parse(
      ["UID:sync", "SEQUENCE:2", "DTSTART;TZID=Our Office:20260112T100000", "RRULE:FREQ=WEEKLY"],
      [...weeklySync, "SEQUENCE:1"],
      [
        "UID:sync",
        "SEQUENCE:3",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260119T100000",
        "DTSTART;TZID=Our Office:20260119T140000",
      ],
      [
        "UID:sync",
        "SEQUENCE:1",
        "SUMMARY:Sync (moved)",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260119T100000",
        "DTSTART;TZID=Europe/Berlin:20260119T140000",
      ],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map(({ id, title }) => [id, title])).toEqual([
      ["sync", "Sync"],
      ["sync::2026-01-19T09:00:00Z", "Sync (moved)"],
    ]);
    expect(result.issues.map(({ code, index, property }) => [code, index, property])).toEqual([
      ["unresolved-time-zone", 0, "DTSTART"],
      ["unresolved-time-zone", 2, "DTSTART"],
    ]);
  });

  test("makes an event a master only for overrides that come out, cancelled ones included", () => {
    const events = parse(
      ["UID:lunch", "DTSTART:20260120T113000Z"],
      ["UID:lunch", "RECURRENCE-ID;VALUE=DATE:20260120", "DTSTART:20260120T123000Z"],
      ["UID:call", "DTSTART:20260121T090000Z"],
      ["UID:call", "RECURRENCE-ID:20260121T090000Z", "DTSTART;TZID=Our Office:20260121T100000"],
      ["UID:demo", "DTSTART:20260122T090000Z"],
      [
        "UID:demo",
        "RECURRENCE-ID:20260122T090000Z",
        "DTSTART:20260122T090000Z",
        "STATUS:CANCELLED",
      ],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => [event.id, event.recurrence])).toStrictEqual([
      ["lunch", undefined],
      ["call", undefined],
      ["demo", {}],
      ["demo::2026-01-22T09:00:00Z", undefined],
    ]);
    expect(result.events.filter((event) => "recurrence" in event)).toHaveLength(1);
  });

  test("picks a duplicate override by SEQUENCE before it decides whether it's cancelled", () => {
    const events = parse(
      weeklySync,
      [
        "UID:sync",
        "SEQUENCE:2",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260119T100000",
        "DTSTART;TZID=Europe/Berlin:20260119T100000",
        "STATUS:CANCELLED",
      ],
      [
        "UID:sync",
        "SEQUENCE:1",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260119T100000",
        "DTSTART;TZID=Europe/Berlin:20260119T140000",
      ],
      [
        "UID:sync",
        "SUMMARY:Earlier",
        "RECURRENCE-ID:20260126T090000Z",
        "DTSTART;TZID=Europe/Berlin:20260126T140000",
      ],
      [
        "UID:sync",
        "SUMMARY:Later",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260126T100000",
        "DTSTART;TZID=Europe/Berlin:20260126T150000",
      ],
    );
    const result = recurringEventsFromIcs(events);
    expect(
      plain(result.events.map(({ id, override, title }) => ({ id, override, title }))),
    ).toEqual([
      { id: "sync", title: "Sync" },
      {
        id: "sync::2026-01-19T09:00:00Z",
        override: { cancelled: true, recurrenceId: "2026-01-19T09:00:00Z", seriesId: "sync" },
        title: "",
      },
      {
        id: "sync::2026-01-26T09:00:00Z",
        override: { recurrenceId: "2026-01-26T09:00:00Z", seriesId: "sync" },
        title: "Later",
      },
    ]);
    expect(result.issues.map(({ code, event, message }) => [code, event, message])).toEqual([
      [
        "duplicate-event",
        events[2],
        'Another VEVENT with UID "sync" and RECURRENCE-ID 2026-01-19T09:00:00Z has a higher SEQUENCE, and replaces this one.',
      ],
      [
        "duplicate-event",
        events[3],
        'Another VEVENT with UID "sync" and RECURRENCE-ID 2026-01-26T09:00:00Z has the same SEQUENCE and comes later, and replaces this one.',
      ],
    ]);
  });
});

describe("recurringEventsFromIcs: options", () => {
  const events = parse(["UID:lunch", "DTSTART:20260120T113000Z"]);

  test("throws a RangeError for a time zone Temporal doesn't know", () => {
    const bridgeIn = (timeZone: string) => () => recurringEventsFromIcs(events, { timeZone });
    expect(bridgeIn("Mars/Olympus_Mons")).toThrow(RangeError);
    expect(bridgeIn("Mars/Olympus_Mons")).toThrow(
      'timeZone "Mars/Olympus_Mons" isn\'t a time zone Temporal knows.',
    );
    expect(bridgeIn("Australia/Sydney")).not.toThrow();
  });

  test("throws a RangeError for a minimum duration that doesn't parse or isn't positive", () => {
    const invalid: readonly Temporal.DurationLike[] = [
      {},
      { minutes: 0 },
      { minutes: -5 },
      { minutes: 1.5 },
    ];
    for (const minimumDuration of invalid) {
      expect(() => recurringEventsFromIcs(events, { minimumDuration })).toThrow(
        "minimumDuration must be a positive duration, such as { minutes: 30 }.",
      );
    }
    expect(() =>
      recurringEventsFromIcs(events, { minimumDuration: Temporal.Duration.from("PT1H") }),
    ).not.toThrow();
  });
});
