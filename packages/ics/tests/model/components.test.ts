import { describe, expect, test } from "vite-plus/test";

import { calendarText, issuesOf, onlyCalendar, parse, parseEvent, plain } from "./helpers";

describe("VTODO", () => {
  test("maps its fields", () => {
    const result = parse(
      calendarText(
        "BEGIN:VTODO",
        "UID:todo@example.com",
        "DTSTAMP:20260301T080000Z",
        "DTSTART;VALUE=DATE:20260301",
        "DUE;VALUE=DATE:20260305",
        "COMPLETED:20260304T170000Z",
        "PERCENT-COMPLETE:100",
        "PRIORITY:1",
        "STATUS:completed",
        "SUMMARY:Taxes",
        "LOCATION:Desk",
        "GEO:1.5;2.5",
        "RESOURCES:Pen",
        "CONFERENCE;VALUE=URI:https://call.example.com",
        "X-TODO:kept",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER;RELATED=END:-PT1H",
        "DESCRIPTION:Due soon",
        "END:VALARM",
        "END:VTODO",
      ),
    );
    expect(result.issues).toEqual([]);
    const [todo] = onlyCalendar(result).todos;
    expect(plain(todo)).toEqual({
      alarms: [
        {
          action: "DISPLAY",
          attachments: [],
          attendees: [],
          description: "Due soon",
          otherComponents: [],
          otherProperties: [],
          trigger: { kind: "relative", offset: "-PT1H", relatedTo: "END" },
        },
      ],
      attachments: [],
      attendees: [],
      categories: [],
      comments: [],
      completed: "2026-03-04T17:00:00Z",
      conferences: [{ features: [], uri: "https://call.example.com" }],
      contacts: [],
      due: { date: "2026-03-05", kind: "date" },
      exceptionDates: [],
      extensions: {},
      geo: { latitude: 1.5, longitude: 2.5 },
      location: "Desk",
      otherComponents: [],
      otherProperties: [{ line: 16, name: "X-TODO", parameters: {}, value: "kept" }],
      percentComplete: 100,
      priority: 1,
      recurrenceDates: [],
      relatedTo: [],
      resources: ["Pen"],
      stamp: "2026-03-01T08:00:00Z",
      start: { date: "2026-03-01", kind: "date" },
      status: "COMPLETED",
      summary: "Taxes",
      uid: "todo@example.com",
    });
  });

  test("checks DUE like DTEND: DUE wins over DURATION, and may not precede DTSTART", () => {
    const result = parse(
      calendarText(
        "BEGIN:VTODO",
        "UID:todo@example.com",
        "DTSTART:20260305T090000Z",
        "DUE:20260301T090000Z",
        "DURATION:PT1H",
        "END:VTODO",
      ),
    );
    const [todo] = onlyCalendar(result).todos;
    expect(plain(todo?.due)).toEqual({ instant: "2026-03-01T09:00:00Z", kind: "utc" });
    expect(todo?.duration).toBeUndefined();
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "invalid-value",
        component: "VTODO",
        line: 5,
        path: ["calendars", 0, "todos", 0, "due"],
        property: "DUE",
        severity: "warning",
      },
      {
        code: "conflicting-properties",
        component: "VTODO",
        line: 6,
        path: ["calendars", 0, "todos", 0, "duration"],
        property: "DURATION",
        severity: "warning",
      },
    ]);
  });

  test("keeps a negative DURATION with a warning", () => {
    const result = parse(
      calendarText("BEGIN:VTODO", "UID:todo@example.com", "DURATION:-P1D", "END:VTODO"),
    );
    expect(onlyCalendar(result).todos[0]?.duration?.toString()).toBe("-P1D");
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "invalid-value",
        component: "VTODO",
        line: 4,
        path: ["calendars", 0, "todos", 0, "duration"],
        property: "DURATION",
        severity: "warning",
      },
    ]);
  });

  test("is skipped without UID", () => {
    const result = parse(calendarText("BEGIN:VTODO", "SUMMARY:Nameless", "END:VTODO"));
    expect(onlyCalendar(result).todos).toEqual([]);
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "missing-property",
        component: "VTODO",
        line: 2,
        path: ["calendars", 0, "todos"],
        property: "UID",
        severity: "error",
      },
    ]);
  });
});

describe("VJOURNAL", () => {
  test("maps its fields and keeps further DESCRIPTIONs, which RFC 5545 allows, as written", () => {
    const result = parse(
      calendarText(
        "BEGIN:VJOURNAL",
        "UID:journal@example.com",
        "DTSTART;VALUE=DATE:20260301",
        "STATUS:final",
        "DESCRIPTION:First entry",
        "DESCRIPTION:Second entry",
        "LOCATION:not a journal field",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT1H",
        "END:VALARM",
        "END:VJOURNAL",
      ),
    );
    expect(result.issues).toEqual([]);
    const [journal] = onlyCalendar(result).journals;
    expect(journal).toMatchObject({ description: "First entry", status: "FINAL" });
    expect(plain(journal?.start)).toEqual({ date: "2026-03-01", kind: "date" });
    expect(journal?.otherProperties.map(({ name, value }) => `${name}:${value}`)).toEqual([
      "DESCRIPTION:Second entry",
      "LOCATION:not a journal field",
    ]);
    expect(journal?.otherComponents.map(({ name }) => name)).toEqual(["VALARM"]);
    expect(journal).not.toHaveProperty("alarms");
  });
});

describe("VFREEBUSY", () => {
  test("maps its fields, with FBTYPE defaulting to BUSY", () => {
    const result = parse(
      calendarText(
        "BEGIN:VFREEBUSY",
        "UID:busy@example.com",
        "DTSTAMP:20260301T080000Z",
        "DTSTART:20260301T000000Z",
        "DTEND:20260308T000000Z",
        "ORGANIZER:mailto:ann@example.com",
        "ATTENDEE:mailto:ben@example.com",
        "CONTACT:Ann",
        "COMMENT:Office hours",
        "URL:https://example.com/busy",
        "FREEBUSY:20260302T090000Z/PT1H,20260302T140000Z/20260302T150000Z",
        "FREEBUSY;FBTYPE=busy-tentative:20260303T090000Z/PT30M",
        "FREEBUSY;FBTYPE=FREE:20260304T090000Z/PT8H,nonsense",
        "END:VFREEBUSY",
      ),
    );
    const [busy] = onlyCalendar(result).freeBusy;
    expect(plain(busy)).toEqual({
      attendees: [
        {
          address: "mailto:ben@example.com",
          delegatedFrom: [],
          delegatedTo: [],
          email: "ben@example.com",
          memberOf: [],
          otherParameters: {},
        },
      ],
      comments: ["Office hours"],
      contact: "Ann",
      end: { instant: "2026-03-08T00:00:00Z", kind: "utc" },
      freeBusy: [
        {
          periods: [
            { duration: "PT1H", start: { instant: "2026-03-02T09:00:00Z", kind: "utc" } },
            {
              end: { instant: "2026-03-02T15:00:00Z", kind: "utc" },
              start: { instant: "2026-03-02T14:00:00Z", kind: "utc" },
            },
          ],
          type: "BUSY",
        },
        {
          periods: [{ duration: "PT30M", start: { instant: "2026-03-03T09:00:00Z", kind: "utc" } }],
          type: "BUSY-TENTATIVE",
        },
        {
          periods: [{ duration: "PT8H", start: { instant: "2026-03-04T09:00:00Z", kind: "utc" } }],
          type: "FREE",
        },
      ],
      organizer: {
        address: "mailto:ann@example.com",
        email: "ann@example.com",
        otherParameters: {},
      },
      otherComponents: [],
      otherProperties: [],
      stamp: "2026-03-01T08:00:00Z",
      start: { instant: "2026-03-01T00:00:00Z", kind: "utc" },
      uid: "busy@example.com",
      url: "https://example.com/busy",
    });
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "invalid-value",
        component: "VFREEBUSY",
        line: 14,
        path: ["calendars", 0, "freeBusy", 0, "freeBusy", 2, "periods"],
        property: "FREEBUSY",
        severity: "error",
      },
    ]);
  });
});

describe("VTIMEZONE", () => {
  test("maps the zone and its observances, resolving the TZID", () => {
    const result = parse(
      calendarText(
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Berlin",
        "TZURL:https://tz.example.com/Europe/Berlin",
        "LAST-MODIFIED:20250101T000000Z",
        "X-LIC-LOCATION:Europe/Berlin",
        "BEGIN:DAYLIGHT",
        "DTSTART:19810329T020000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "TZNAME:CEST",
        "TZNAME:MESZ",
        "COMMENT:Summer",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
        "RDATE:19800406T020000",
        "X-OBSERVANCE:kept",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "DTSTART:19961027T030000",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0100",
        "END:STANDARD",
        "BEGIN:X-OTHER",
        "END:X-OTHER",
        "END:VTIMEZONE",
      ),
    );
    expect(result.issues).toEqual([]);
    const [zone] = onlyCalendar(result).timeZones;
    expect(plain(zone)).toEqual({
      lastModified: "2025-01-01T00:00:00Z",
      observances: [
        {
          comments: ["Summer"],
          kind: "daylight",
          names: ["CEST", "MESZ"],
          offsetFrom: "+01:00",
          offsetTo: "+02:00",
          otherProperties: [{ line: 16, name: "X-OBSERVANCE", parameters: {}, value: "kept" }],
          recurrenceDates: [{ kind: "floating", wallTime: "1980-04-06T02:00:00" }],
          recurrenceRule: {
            byDay: [{ ordinal: -1, weekday: "SU" }],
            byMonth: [3],
            frequency: "YEARLY",
          },
          start: "1981-03-29T02:00:00",
        },
        {
          comments: [],
          kind: "standard",
          names: [],
          offsetFrom: "+02:00",
          offsetTo: "+01:00",
          otherProperties: [],
          recurrenceDates: [],
          start: "1996-10-27T03:00:00",
        },
      ],
      otherComponents: [{ components: [], line: 23, name: "X-OTHER", properties: [] }],
      otherProperties: [
        { line: 6, name: "X-LIC-LOCATION", parameters: {}, value: "Europe/Berlin" },
      ],
      timeZone: "Europe/Berlin",
      tzid: "Europe/Berlin",
      url: "https://tz.example.com/Europe/Berlin",
    });
  });

  test("leaves timeZone out when the TZID resolves to nothing", () => {
    const result = parse(
      calendarText(
        "BEGIN:VTIMEZONE",
        "TZID:Somewhere special",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:+0200",
        "END:STANDARD",
        "BEGIN:DAYLIGHT",
        "DTSTART:19700601T000000",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0300",
        "END:DAYLIGHT",
        "END:VTIMEZONE",
      ),
    );
    const [zone] = onlyCalendar(result).timeZones;
    expect(zone?.tzid).toBe("Somewhere special");
    expect(zone).not.toHaveProperty("timeZone");
    expect(result.issues).toEqual([]);
  });

  test("skips a zone without TZID, and an observance without its offsets, keeping the zone", () => {
    const result = parse(
      calendarText(
        "BEGIN:VTIMEZONE",
        "BEGIN:STANDARD",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Paris",
        "BEGIN:STANDARD",
        "DTSTART:19701025T030000",
        "TZOFFSETTO:+0100",
        "END:STANDARD",
        "BEGIN:DAYLIGHT",
        "DTSTART:19700329T020000",
        "TZOFFSETFROM:+0100",
        "TZOFFSETTO:2 hours",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "DTSTART:19701025T030000Z",
        "TZOFFSETFROM:+0200",
        "TZOFFSETTO:+0100",
        "END:STANDARD",
        "END:VTIMEZONE",
      ),
    );
    const { timeZones } = onlyCalendar(result);
    expect(timeZones.map(({ tzid }) => tzid)).toEqual(["Europe/Paris"]);
    expect(timeZones[0]?.observances.map(({ start }) => start.toString())).toEqual([
      "1970-10-25T03:00:00",
    ]);
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "missing-property",
        component: "VTIMEZONE",
        line: 2,
        path: ["calendars", 0, "timeZones"],
        property: "TZID",
        severity: "error",
      },
      {
        code: "missing-property",
        component: "STANDARD",
        line: 8,
        path: ["calendars", 0, "timeZones", 0, "observances"],
        property: "TZOFFSETFROM",
        severity: "error",
      },
      {
        code: "invalid-value",
        component: "DAYLIGHT",
        line: 15,
        path: ["calendars", 0, "timeZones", 0, "observances"],
        property: "TZOFFSETTO",
        severity: "error",
      },
      // An onset is a local time: its Z is dropped, with a warning.
      {
        code: "invalid-value",
        component: "STANDARD",
        line: 18,
        path: ["calendars", 0, "timeZones", 0, "observances", 0, "start"],
        property: "DTSTART",
        severity: "warning",
      },
    ]);
  });
});

describe("VALARM", () => {
  test("maps its fields", () => {
    const { event, issues } = parseEvent(
      "BEGIN:VALARM",
      "UID:alarm@example.com",
      "ACTION:email",
      "TRIGGER;VALUE=DATE-TIME:20260301T080000Z",
      "SUMMARY:Reminder",
      "DESCRIPTION:Starts soon",
      "ATTENDEE:mailto:ann@example.com",
      "ATTACH:https://example.com/sound.aud",
      "REPEAT:2",
      "DURATION:PT5M",
      "ACKNOWLEDGED:20260301T080100Z",
      "BEGIN:X-INNER",
      "END:X-INNER",
      "END:VALARM",
    );
    expect(issues).toEqual([]);
    expect(plain(event.alarms)).toEqual([
      {
        action: "EMAIL",
        attachments: [{ kind: "uri", uri: "https://example.com/sound.aud" }],
        attendees: [
          {
            address: "mailto:ann@example.com",
            delegatedFrom: [],
            delegatedTo: [],
            email: "ann@example.com",
            memberOf: [],
            otherParameters: {},
          },
        ],
        description: "Starts soon",
        duration: "PT5M",
        otherComponents: [{ components: [], line: 16, name: "X-INNER", properties: [] }],
        otherProperties: [
          { line: 15, name: "ACKNOWLEDGED", parameters: {}, value: "20260301T080100Z" },
        ],
        repeat: 2,
        summary: "Reminder",
        trigger: { instant: "2026-03-01T08:00:00Z", kind: "absolute" },
        uid: "alarm@example.com",
      },
    ]);
  });

  test("reads an absolute TRIGGER without VALUE=DATE-TIME by its shape, with a warning", () => {
    const { event, issues } = parseEvent(
      "BEGIN:VALARM",
      "ACTION:AUDIO",
      "TRIGGER:19980403T120000Z",
      "END:VALARM",
    );
    expect(plain(event.alarms[0]?.trigger)).toEqual({
      instant: "1998-04-03T12:00:00Z",
      kind: "absolute",
    });
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VALARM",
        line: 7,
        path: ["calendars", 0, "events", 0, "alarms", 0, "trigger"],
        property: "TRIGGER",
        severity: "warning",
      },
    ]);
  });

  test("reads RELATED, defaulting to START", () => {
    const { event, issues } = parseEvent(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER;RELATED=end:PT0S",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER;RELATED=MIDDLE:-PT5M",
      "END:VALARM",
    );
    expect(
      event.alarms.map(({ trigger }) => trigger.kind === "relative" && trigger.relatedTo),
    ).toEqual(["END", "START"]);
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VALARM",
        line: 11,
        path: ["calendars", 0, "events", 0, "alarms", 1, "trigger", "relatedTo"],
        property: "TRIGGER",
        severity: "warning",
      },
    ]);
  });

  test("an alarm without ACTION or a usable TRIGGER is skipped; its event is kept", () => {
    const { event, issues } = parseEvent(
      "BEGIN:VALARM",
      "TRIGGER:-PT5M",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:soon",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER;VALUE=DATE-TIME:20260301",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT15M",
      "END:VALARM",
    );
    expect(event.alarms).toHaveLength(1);
    expect(event.alarms[0]?.trigger).toMatchObject({ kind: "relative" });
    const alarms = ["calendars", 0, "events", 0, "alarms"];
    expect(issuesOf(issues)).toEqual([
      {
        code: "missing-property",
        component: "VALARM",
        line: 5,
        path: alarms,
        property: "ACTION",
        severity: "error",
      },
      {
        code: "invalid-value",
        component: "VALARM",
        line: 10,
        path: alarms,
        property: "TRIGGER",
        severity: "error",
      },
      {
        code: "invalid-value",
        component: "VALARM",
        line: 14,
        path: alarms,
        property: "TRIGGER",
        severity: "error",
      },
    ]);
  });
});
