import { parseIcs, type IcsEvent } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
  occurrenceId,
  recurringEventsFromIcs,
  type IcsRecurringEventsOptions,
} from "../../src";

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

  test("splits a series at a RANGE=THISANDFUTURE override, which the later occurrences follow", () => {
    const events = parse(weeklySync, [
      "UID:sync",
      "SUMMARY:Sync (new time)",
      "RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:20260119T100000",
      "DTSTART;TZID=Europe/Berlin:20260119T110000",
      "DTEND;TZID=Europe/Berlin:20260119T120000",
    ]);
    const result = recurringEventsFromIcs(events);
    expect(result.issues).toEqual([]);
    expect(result.events.map((event) => event.data)).toEqual(events);
    expect(bridge(events).events).toStrictEqual([
      {
        data: "sync",
        end: "2026-01-12T09:30:00Z",
        id: "sync",
        kind: "timed",
        recurrence: { rule: { frequency: "WEEKLY", until: "2026-01-12T09:00:00Z" } },
        sourceTimeZone: "Europe/Berlin",
        start: "2026-01-12T09:00:00Z",
        title: "Sync",
      },
      {
        data: "sync",
        end: "2026-01-19T11:00:00Z",
        id: "sync::2026-01-19T09:00:00Z",
        kind: "timed",
        recurrence: { rule: { frequency: "WEEKLY" } },
        sourceTimeZone: "Europe/Berlin",
        start: "2026-01-19T10:00:00Z",
        title: "Sync (new time)",
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
    expect(bridge(events, { timeZone: "UTC" })).toStrictEqual({
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
    // Without X-WR-TIMEZONE, the zone the feed's TZIDs name: Berlin, from the zoned EXDATE.
    expect(read()).toEqual([
      { exceptionDates: ["2026-01-14", "2026-01-16"], kind: "all-day", until: "2026-03-30" },
      { exceptionDates: ["2026-01-14T00:00:00"], kind: "floating" },
    ]);
    expect(read({ timeZone: "UTC" })).toEqual([
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

describe("recurringEventsFromIcs: a DTSTART in a DST gap", () => {
  // Sydney moves from 02:00 to 03:00 on 4 October 2026, Lord Howe from 02:00 to 02:30.
  const shown = (events: readonly IcsEvent[]) => {
    const [master] = recurringEventsFromIcs(events).events;
    const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<IcsEvent>());
    const zone = master!.kind === "timed" ? master!.sourceTimeZone! : "UTC";
    const { occurrences } = expander.expand([master!], {
      range: {
        end: Temporal.PlainDate.from("2026-10-19"),
        start: Temporal.PlainDate.from("2026-10-01"),
      },
      timeZone: zone,
    });
    const wall = (date: unknown) =>
      (date as Temporal.Instant)
        .toZonedDateTimeISO(zone)
        .toPlainTime()
        .toString({ smallestUnit: "minute" });
    return occurrences.map(({ interval }) => `${wall(interval.start)}–${wall(interval.end)}`);
  };

  test("keeps the length written between DTSTART and DTEND, for every occurrence", () => {
    // 02:30 moves forward to 03:30, where DTEND is: without the written length the first
    // occurrence would have none, and every occurrence would last the 30-minute minimum.
    const sydney = parse([
      "UID:batch",
      "DTSTART;TZID=Australia/Sydney:20261004T023000",
      "DTEND;TZID=Australia/Sydney:20261004T033000",
      "RRULE:FREQ=WEEKLY;COUNT=3",
    ]);
    expect(bridge(sydney).events[0]).toMatchObject({
      end: "2026-10-03T17:30:00Z",
      recurrence: { wallStart: "2026-10-04T02:30:00" },
      start: "2026-10-03T16:30:00Z",
    });
    expect(shown(sydney)).toEqual(["03:30–04:30", "02:30–03:30", "02:30–03:30"]);

    const lordHowe = parse([
      "UID:batch",
      "DTSTART;TZID=Australia/Lord_Howe:20261004T021500",
      "DTEND;TZID=Australia/Lord_Howe:20261004T031500",
      "RRULE:FREQ=WEEKLY;COUNT=3",
    ]);
    expect(shown(lordHowe)).toEqual(["02:45–03:45", "02:15–03:15", "02:15–03:15"]);
  });

  test("keeps a single event's exact length, unless the gap leaves it none", () => {
    const events = parse(
      // RFC 5545 moves only DTSTART: 03:30–05:00.
      [
        "UID:long",
        "DTSTART;TZID=Australia/Sydney:20261004T023000",
        "DTEND;TZID=Australia/Sydney:20261004T050000",
      ],
      // Moved to DTEND, it would have no length: 03:30–04:30.
      [
        "UID:short",
        "DTSTART;TZID=Australia/Sydney:20261004T023000",
        "DTEND;TZID=Australia/Sydney:20261004T033000",
      ],
      // A series keeps the length written: 03:30–06:00, and 02:30–05:00 later.
      [
        "UID:series",
        "DTSTART;TZID=Australia/Sydney:20261004T023000",
        "DTEND;TZID=Australia/Sydney:20261004T050000",
        "RRULE:FREQ=WEEKLY",
      ],
      // With DTEND written in UTC or another zone, it keeps its exact length: 03:30–05:00, and
      // 03:30–06:00 (08:00 in Auckland), without the gap on top.
      [
        "UID:utc",
        "DTSTART;TZID=Australia/Sydney:20261004T023000",
        "DTEND:20261003T180000Z",
        "RRULE:FREQ=WEEKLY",
      ],
      [
        "UID:auckland",
        "DTSTART;TZID=Australia/Sydney:20261004T023000",
        "DTEND;TZID=Pacific/Auckland:20261004T080000",
        "RRULE:FREQ=WEEKLY",
      ],
    );
    expect(bridge(events).events).toMatchObject([
      { end: "2026-10-03T18:00:00Z", id: "long", start: "2026-10-03T16:30:00Z" },
      { end: "2026-10-03T17:30:00Z", id: "short", start: "2026-10-03T16:30:00Z" },
      { end: "2026-10-03T19:00:00Z", id: "series", start: "2026-10-03T16:30:00Z" },
      { end: "2026-10-03T18:00:00Z", id: "utc", start: "2026-10-03T16:30:00Z" },
      { end: "2026-10-03T19:00:00Z", id: "auckland", start: "2026-10-03T16:30:00Z" },
    ]);
  });

  test("keeps the exact length of a DTSTART outside the gap, and of a DTEND in it too", () => {
    const events = parse(
      [
        "UID:across",
        "DTSTART;TZID=Australia/Sydney:20261004T010000",
        "DTEND;TZID=Australia/Sydney:20261004T040000",
      ],
      [
        "UID:inside",
        "DTSTART;TZID=Australia/Sydney:20261004T021500",
        "DTEND;TZID=Australia/Sydney:20261004T024500",
      ],
    );
    expect(bridge(events).events).toMatchObject([
      // 01:00 AEST to 04:00 AEDT is two hours.
      { end: "2026-10-03T17:00:00Z", start: "2026-10-03T15:00:00Z" },
      // Both move forward by the gap: 03:15–03:45.
      { end: "2026-10-03T16:45:00Z", start: "2026-10-03T16:15:00Z" },
    ]);
  });
});

describe("recurringEventsFromIcs: Outlook's X-MICROSOFT-CDO-ALLDAYEVENT", () => {
  const flagged = "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE";

  test("makes a flagged event from midnight to a later midnight all-day on its written dates", () => {
    const events = parse(
      [
        "UID:offsite",
        "DTSTART;TZID=Europe/Berlin:20261012T000000",
        "DTEND;TZID=Europe/Berlin:20261014T000000",
        flagged,
      ],
      ["UID:duration", "DTSTART;TZID=Europe/Berlin:20261012T000000", "DURATION:P1D", flagged],
      // Its TZID resolves to no zone, but midnight is midnight on any clock.
      [
        "UID:office",
        "DTSTART;TZID=Our Office:20261012T000000",
        "DTEND;TZID=Our Office:20261013T000000",
        flagged,
      ],
      ["UID:floating", "DTSTART:20261012T000000", "DTEND:20261013T000000", flagged],
    );
    expect(bridge(events)).toStrictEqual({
      events: [
        {
          data: "offsite",
          end: "2026-10-14",
          id: "offsite",
          kind: "all-day",
          start: "2026-10-12",
          title: "",
        },
        {
          data: "duration",
          end: "2026-10-13",
          id: "duration",
          kind: "all-day",
          start: "2026-10-12",
          title: "",
        },
        {
          data: "office",
          end: "2026-10-13",
          id: "office",
          kind: "all-day",
          start: "2026-10-12",
          title: "",
        },
        {
          data: "floating",
          end: "2026-10-13",
          id: "floating",
          kind: "all-day",
          start: "2026-10-12",
          title: "",
        },
      ],
      issues: [],
    });
  });

  test("leaves timed a flagged event that isn't midnight to midnight, and an unflagged one", () => {
    const events = parse(
      [
        "UID:day",
        "DTSTART;TZID=Europe/Berlin:20261012T090000",
        "DTEND;TZID=Europe/Berlin:20261012T170000",
        flagged,
      ],
      [
        "UID:false",
        "DTSTART;TZID=Europe/Berlin:20261012T000000",
        "DTEND;TZID=Europe/Berlin:20261013T000000",
        "X-MICROSOFT-CDO-ALLDAYEVENT:FALSE",
      ],
      [
        "UID:unflagged",
        "DTSTART;TZID=Europe/Berlin:20261012T000000",
        "DTEND;TZID=Europe/Berlin:20261013T000000",
      ],
    );
    expect(bridge(events).events.map((event) => (event as { kind: string }).kind)).toEqual([
      "timed",
      "timed",
      "timed",
    ]);
  });

  test("reads a flagged series with a UTC DTSTART's UTC dates in UTC", () => {
    const events = parse(
      [
        "UID:leave",
        "DTSTART:20260601T000000Z",
        "DTEND:20260602T000000Z",
        "RRULE:FREQ=DAILY;UNTIL=20260605T000000Z",
        "EXDATE:20260603T000000Z",
        flagged,
      ],
      // The feed's TZIDs name New York, where these midnights are the evening before.
      ["UID:meeting", "DTSTART;TZID=America/New_York:20260601T100000"],
    );
    expect(bridge(events)).toMatchObject({
      events: [
        {
          kind: "all-day",
          recurrence: {
            exceptionDates: ["2026-06-03"],
            rule: { frequency: "DAILY", until: "2026-06-05" },
          },
          start: "2026-06-01",
        },
        { id: "meeting" },
      ],
      issues: [],
    });
  });

  test("gives a flagged override without its series the ID it has with it", () => {
    const override = [
      "UID:wfh",
      "RECURRENCE-ID;TZID=Europe/Berlin:20261211T000000",
      "DTSTART;TZID=Europe/Berlin:20261210T000000",
      "DTEND;TZID=Europe/Berlin:20261211T000000",
      flagged,
    ];
    const master = [
      "UID:wfh",
      "DTSTART;TZID=Europe/Berlin:20260904T000000",
      "DTEND;TZID=Europe/Berlin:20260905T000000",
      "RRULE:FREQ=WEEKLY;BYDAY=FR",
      flagged,
    ];
    const idOf = (events: readonly IcsEvent[]) =>
      recurringEventsFromIcs(events).events.find((event) => event.override !== undefined)?.id;
    expect(idOf(parse(override))).toBe("wfh::2026-12-11");
    expect(idOf(parse(master, override))).toBe("wfh::2026-12-11");
    // Exchange 2010 writes a DATE DTSTART and a UTC RECURRENCE-ID at the owner's midnight, read in
    // the feed's zone either way.
    const dateOverride = [
      "UID:office",
      "RECURRENCE-ID:20260729T220000Z",
      "DTSTART;VALUE=DATE:20260731",
      flagged,
    ];
    const dateMaster = [
      "UID:office",
      "DTSTART;VALUE=DATE:20260714",
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
      flagged,
    ];
    const options = { timeZone: "Europe/Berlin" };
    const dateIdOf = (events: readonly IcsEvent[]) =>
      recurringEventsFromIcs(events, options).events.find((event) => event.override !== undefined)
        ?.id;
    expect(dateIdOf(parse(dateOverride))).toBe("office::2026-07-30");
    expect(dateIdOf(parse(dateMaster, dateOverride))).toBe("office::2026-07-30");
  });

  test("reads a flagged series' midnights as its dates, and its UTC dates in its zone", () => {
    const events = parse(
      [
        "UID:wfh",
        "DTSTART;TZID=Europe/Berlin:20260904T000000",
        "DTEND;TZID=Europe/Berlin:20260905T000000",
        "RRULE:FREQ=WEEKLY;UNTIL=20261217T230000Z;BYDAY=FR",
        "EXDATE;TZID=Europe/Berlin:20261127T000000",
        "EXDATE:20261203T230000Z",
        "EXDATE;TZID=Europe/Berlin:20261120T120000",
        flagged,
      ],
      [
        "UID:wfh",
        "RECURRENCE-ID;TZID=Europe/Berlin:20261211T000000",
        "DTSTART;TZID=Europe/Berlin:20261210T000000",
        "DTEND;TZID=Europe/Berlin:20261211T000000",
        flagged,
      ],
    );
    expect(bridge(events, { timeZone: "UTC" })).toStrictEqual({
      events: [
        {
          data: "wfh",
          end: "2026-09-05",
          id: "wfh",
          kind: "all-day",
          recurrence: {
            exceptionDates: ["2026-11-27", "2026-12-04", "2026-11-20"],
            rule: { byDay: [{ weekday: "FR" }], frequency: "WEEKLY", until: "2026-12-18" },
          },
          start: "2026-09-04",
          title: "",
        },
        {
          data: "wfh",
          end: "2026-12-11",
          id: "wfh::2026-12-11",
          kind: "all-day",
          override: { recurrenceId: "2026-12-11", seriesId: "wfh" },
          start: "2026-12-10",
          title: "",
        },
      ],
      // Only the EXDATE at noon isn't a midnight.
      issues: [{ code: "date-kind-mismatch", property: "EXDATE", uid: "wfh" }],
    });
  });
});

describe("recurringEventsFromIcs: the feed's time zone", () => {
  const leave = [
    "UID:leave",
    "DTSTART;VALUE=DATE:20260112",
    "RRULE:FREQ=DAILY;UNTIL=20260130T230000Z",
  ];
  const untilOf = (events: readonly IcsEvent[]) =>
    String(recurringEventsFromIcs(events).events[0]!.recurrence?.rule?.until);

  test("is the zone most events' TZIDs name, without X-WR-TIMEZONE", () => {
    const meeting = (uid: string, zone: string) => [
      `UID:${uid}`,
      `DTSTART;TZID=${zone}:20260112T100000`,
    ];
    // 23:00 UTC on 30 January is 31 January in Berlin, and still 30 January in UTC.
    expect(
      untilOf(
        parse(
          leave,
          meeting("a", "America/New_York"),
          meeting("b", "Europe/Berlin"),
          meeting("c", "Europe/Berlin"),
        ),
      ),
    ).toBe("2026-01-31");
    expect(untilOf(parse(leave))).toBe("2026-01-30");
    // A tie goes to the zone that comes first. 02:00 UTC on 31 January is still 30 January in New
    // York, and 31 January in Berlin and in UTC.
    const early = [
      "UID:leave",
      "DTSTART;VALUE=DATE:20260112",
      "RRULE:FREQ=DAILY;UNTIL=20260131T020000Z",
    ];
    expect(
      untilOf(parse(early, meeting("a", "America/New_York"), meeting("b", "Europe/Berlin"))),
    ).toBe("2026-01-30");
  });
});

describe("recurringEventsFromIcs: RANGE=THISANDFUTURE", () => {
  const range = (date: string, ...lines: readonly string[]) => [
    "UID:sync",
    `RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:${date}T100000`,
    ...lines,
  ];
  test("counts a COUNT rule's occurrences on both sides of the split", () => {
    const events = parse(
      [...weeklySync.slice(0, -1), "RRULE:FREQ=WEEKLY;COUNT=5"],
      range(
        "20260126",
        "DTSTART;TZID=Europe/Berlin:20260126T110000",
        "DTEND;TZID=Europe/Berlin:20260126T113000",
      ),
    );
    expect(bridge(events).events).toMatchObject([
      { id: "sync", recurrence: { rule: { count: 2, frequency: "WEEKLY" } } },
      {
        id: "sync::2026-01-26T09:00:00Z",
        recurrence: { rule: { count: 3, frequency: "WEEKLY" } },
        start: "2026-01-26T10:00:00Z",
      },
    ]);
  });

  test("moves later EXDATEs and overrides to the new series, keeping the overrides' placements", () => {
    const events = parse(
      [...weeklySync, "EXDATE;TZID=Europe/Berlin:20260209T100000"],
      // A day later, on Tuesdays, from 26 January.
      range(
        "20260126",
        "SUMMARY:Sync (Tuesdays)",
        "DTSTART;TZID=Europe/Berlin:20260127T100000",
        "DTEND;TZID=Europe/Berlin:20260127T103000",
      ),
      [
        "UID:sync",
        "RECURRENCE-ID;TZID=Europe/Berlin:20260216T100000",
        "DTSTART;TZID=Europe/Berlin:20260216T150000",
        "DTEND;TZID=Europe/Berlin:20260216T153000",
      ],
    );
    expect(bridge(events)).toStrictEqual({
      events: [
        {
          data: "sync",
          end: "2026-01-12T09:30:00Z",
          id: "sync",
          kind: "timed",
          recurrence: { rule: { frequency: "WEEKLY", until: "2026-01-19T09:00:00Z" } },
          sourceTimeZone: "Europe/Berlin",
          start: "2026-01-12T09:00:00Z",
          title: "Sync",
        },
        {
          data: "sync",
          end: "2026-01-27T09:30:00Z",
          id: "sync::2026-01-26T09:00:00Z",
          kind: "timed",
          recurrence: {
            exceptionDates: ["2026-02-10T09:00:00Z"],
            rule: { frequency: "WEEKLY" },
          },
          sourceTimeZone: "Europe/Berlin",
          start: "2026-01-27T09:00:00Z",
          title: "Sync (Tuesdays)",
        },
        {
          data: "sync",
          end: "2026-02-16T14:30:00Z",
          id: "sync::2026-01-26T09:00:00Z::2026-02-17T09:00:00Z",
          kind: "timed",
          override: {
            recurrenceId: "2026-02-17T09:00:00Z",
            seriesId: "sync::2026-01-26T09:00:00Z",
          },
          sourceTimeZone: "Europe/Berlin",
          start: "2026-02-16T14:00:00Z",
          title: "",
        },
      ],
      issues: [],
    });
  });

  test("changes the whole series from its first occurrence", () => {
    const events = parse(
      weeklySync,
      range(
        "20260112",
        "SUMMARY:Sync (later)",
        "DTSTART;TZID=Europe/Berlin:20260112T110000",
        "DTEND;TZID=Europe/Berlin:20260112T113000",
      ),
    );
    expect(bridge(events).events).toStrictEqual([
      {
        data: "sync",
        end: "2026-01-12T10:30:00Z",
        id: "sync",
        kind: "timed",
        recurrence: { rule: { frequency: "WEEKLY" } },
        sourceTimeZone: "Europe/Berlin",
        start: "2026-01-12T10:00:00Z",
        title: "Sync (later)",
      },
    ]);
  });

  test("applies two in order, each to the occurrences after it", () => {
    const events = parse(
      weeklySync,
      range("20260209", "DTSTART;TZID=Europe/Berlin:20260209T120000"),
      range("20260126", "DTSTART;TZID=Europe/Berlin:20260126T110000"),
    );
    const bridged = recurringEventsFromIcs(events).events;
    expect(
      bridged.map(({ id, recurrence, start }) =>
        plain({ id, start, until: recurrence?.rule?.until }),
      ),
    ).toEqual([
      { id: "sync", start: "2026-01-12T09:00:00Z", until: "2026-01-19T09:00:00Z" },
      { id: "sync::2026-02-09T09:00:00Z", start: "2026-02-09T11:00:00Z", until: undefined },
      {
        id: "sync::2026-01-26T09:00:00Z",
        start: "2026-01-26T10:00:00Z",
        until: "2026-02-02T10:00:00Z",
      },
    ]);
  });

  test("ends the series at a cancelled one, which leaves later overrides as they are", () => {
    const later = [
      "UID:sync",
      "RECURRENCE-ID;TZID=Europe/Berlin:20260216T100000",
      "DTSTART;TZID=Europe/Berlin:20260216T150000",
    ];
    const events = parse(
      weeklySync,
      range("20260126", "STATUS:CANCELLED", "DTSTART;TZID=Europe/Berlin:20260126T100000"),
      later,
    );
    expect(bridge(events).events).toMatchObject([
      { id: "sync", recurrence: { rule: { frequency: "WEEKLY", until: "2026-01-19T09:00:00Z" } } },
      { id: "sync::2026-02-16T09:00:00Z", override: { seriesId: "sync" } },
    ]);
    // On the first occurrence nothing is left: the series keeps no occurrence, and the later
    // override still shows. A later range has no occurrence left to change.
    const first = parse(
      weeklySync,
      range("20260112", "STATUS:CANCELLED", "DTSTART;TZID=Europe/Berlin:20260112T100000"),
      later,
      range("20260209", "DTSTART;TZID=Europe/Berlin:20260209T120000"),
    );
    const result = recurringEventsFromIcs(first);
    expect(bridge(first).events).toMatchObject([
      { id: "sync", recurrence: { exceptionDates: ["2026-01-12T09:00:00Z"] } },
      { id: "sync::2026-02-16T09:00:00Z", override: { seriesId: "sync" } },
      { id: "sync::2026-02-09T09:00:00Z", override: { seriesId: "sync" } },
    ]);
    expect(result.events[0]!.recurrence).toEqual({
      exceptionDates: [Temporal.Instant.from("2026-01-12T09:00:00Z")],
    });
    expect(result.issues.map(({ code, index, message }) => ({ code, index, message }))).toEqual([
      {
        code: "unsupported-rule",
        index: 3,
        message:
          "RANGE=THISANDFUTURE can't apply: an earlier cancelled RANGE=THISANDFUTURE ended its series. The override replaces only the occurrence it names.",
      },
    ]);
    const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<IcsEvent>());
    const { issues, occurrences } = expander.expand(result.events, {
      range: {
        end: Temporal.PlainDate.from("2026-03-01"),
        start: Temporal.PlainDate.from("2026-01-01"),
      },
      timeZone: "Europe/Berlin",
    });
    expect(issues).toEqual([]);
    expect(occurrences.map(({ id }) => id)).toEqual([
      "sync::2026-02-16T09:00:00Z",
      "sync::2026-02-09T09:00:00Z",
    ]);
  });

  test("keeps UNTIL on both sides, and moves later RDATEs", () => {
    const events = parse(
      [
        ...weeklySync.slice(0, -1),
        "RRULE:FREQ=WEEKLY;UNTIL=20260216T090000Z",
        "RDATE;TZID=Europe/Berlin:20260211T100000",
      ],
      // A day later, from 26 January.
      range("20260126", "DTSTART;TZID=Europe/Berlin:20260127T100000"),
    );
    expect(bridge(events).events).toMatchObject([
      { id: "sync", recurrence: { rule: { frequency: "WEEKLY", until: "2026-01-19T09:00:00Z" } } },
      {
        id: "sync::2026-01-26T09:00:00Z",
        recurrence: {
          recurrenceDates: ["2026-02-12T09:00:00Z"],
          rule: { frequency: "WEEKLY", until: "2026-02-17T09:00:00Z" },
        },
        start: "2026-01-27T09:00:00Z",
      },
    ]);
  });

  test("splits an all-day series", () => {
    const events = parse(
      ["UID:sync", "DTSTART;VALUE=DATE:20260112", "RRULE:FREQ=WEEKLY;COUNT=4"],
      [
        "UID:sync",
        "RECURRENCE-ID;RANGE=THISANDFUTURE;VALUE=DATE:20260126",
        "DTSTART;VALUE=DATE:20260127",
      ],
    );
    expect(bridge(events).events).toMatchObject([
      { id: "sync", recurrence: { rule: { count: 2, frequency: "WEEKLY" } } },
      {
        end: "2026-01-28",
        id: "sync::2026-01-26",
        kind: "all-day",
        recurrence: { rule: { count: 2, frequency: "WEEKLY" } },
        start: "2026-01-27",
      },
    ]);
  });

  test("repeats a new series that starts in a DST gap at the time written", () => {
    // Berlin skips 02:00–03:00 on Sunday 29 March: an override written at 02:30–03:30 there.
    const events = parse(
      [
        "UID:sunday",
        "DTSTART;TZID=Europe/Berlin:20260315T090000",
        "DTEND;TZID=Europe/Berlin:20260315T100000",
        "RRULE:FREQ=WEEKLY;COUNT=5",
      ],
      [
        "UID:sunday",
        "RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:20260329T090000",
        "DTSTART;TZID=Europe/Berlin:20260329T023000",
        "DTEND;TZID=Europe/Berlin:20260329T033000",
      ],
    );
    const result = recurringEventsFromIcs(events);
    expect(plain(result.events[1]!.recurrence)).toEqual({
      rule: { count: 3, frequency: "WEEKLY" },
      wallStart: "2026-03-29T02:30:00",
    });
    const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<IcsEvent>());
    const { occurrences } = expander.expand(result.events, {
      range: {
        end: Temporal.PlainDate.from("2026-04-20"),
        start: Temporal.PlainDate.from("2026-03-28"),
      },
      timeZone: "Europe/Berlin",
    });
    const wall = (date: unknown) =>
      (date as Temporal.Instant)
        .toZonedDateTimeISO("Europe/Berlin")
        .toPlainDateTime()
        .toString({ smallestUnit: "minute" });
    expect(
      occurrences.map(({ interval }) => `${wall(interval.start)}–${wall(interval.end).slice(11)}`),
    ).toEqual(["2026-03-29T03:30–04:30", "2026-04-05T02:30–03:30", "2026-04-12T02:30–03:30"]);
  });

  test("gives an override at the later of two equal wall times the override's VEVENT", () => {
    // 24 October is excluded, so the range on 25 October changes the whole series. Its DTSTART,
    // written in UTC, is the later 02:30 of the night Berlin repeats 02:00–03:00, which a rule
    // can't give: an override keeps it.
    const events = parse(
      [
        "UID:night",
        "SUMMARY:Backup",
        "DTSTART;TZID=Europe/Berlin:20261024T023000",
        "DTEND;TZID=Europe/Berlin:20261024T030000",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE;TZID=Europe/Berlin:20261024T023000",
      ],
      [
        "UID:night",
        "SUMMARY:Backup (after the change)",
        "RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:20261025T023000",
        "DTSTART:20261025T013000Z",
        "DTEND:20261025T020000Z",
      ],
    );
    expect(bridge(events).events).toMatchObject([
      { id: "night", title: "Backup (after the change)" },
      {
        id: "night::2026-10-25T00:30:00Z",
        override: { recurrenceId: "2026-10-25T00:30:00Z", seriesId: "night" },
        start: "2026-10-25T01:30:00Z",
        title: "Backup (after the change)",
      },
    ]);
  });

  test("replaces only the occurrence it names when the series can't take it, with an issue", () => {
    const firstMonday = [
      "UID:sync",
      "DTSTART;TZID=Europe/Berlin:20260105T100000",
      "DTEND;TZID=Europe/Berlin:20260105T103000",
      "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1",
    ];
    const events = parse(
      firstMonday,
      range("20260202", "DTSTART;TZID=Europe/Berlin:20260203T100000"),
      [
        "UID:lone",
        "RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/Berlin:20260202T100000",
        "DTSTART;TZID=Europe/Berlin:20260203T100000",
      ],
    );
    const result = recurringEventsFromIcs(events);
    expect(result.events.map((event) => event.id)).toEqual([
      "sync",
      "sync::2026-02-02T09:00:00Z",
      "lone::2026-02-02T09:00:00Z",
    ]);
    expect(result.events[0]!.recurrence).toEqual({
      rule: { byDay: [{ weekday: "MO" }], bySetPosition: [1], frequency: "MONTHLY" },
    });
    expect(result.issues.map(({ code, index, message }) => ({ code, index, message }))).toEqual([
      {
        code: "unsupported-rule",
        index: 1,
        message:
          "RANGE=THISANDFUTURE can't apply: A BYSETPOS rule can't move to another day. The override replaces only the occurrence it names.",
      },
      {
        code: "unsupported-rule",
        index: 2,
        message:
          "RANGE=THISANDFUTURE can't apply: its series isn't in the feed. The override replaces only the occurrence it names.",
      },
    ]);
  });
});
