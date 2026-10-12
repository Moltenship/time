import { describe, expect, test } from "vite-plus/test";

import {
  EVENT_PATH,
  calendarText,
  issuesOf,
  onlyCalendar,
  parse,
  parseEvent,
  plain,
} from "./helpers";

describe("VEVENT fields", () => {
  test("maps every typed property", () => {
    const { event, issues } = parseEvent(
      "DTSTAMP:20260201T080000Z",
      "CREATED:20260101T080000Z",
      "LAST-MODIFIED:20260115T080000Z",
      "DTEND:20260301T100000Z",
      "SUMMARY:Planning\\, Q2",
      "DESCRIPTION:Line one\\nLine two",
      "LOCATION:Room 1",
      "STATUS:confirmed",
      "CLASS:private",
      "TRANSP:transparent",
      "PRIORITY:5",
      "SEQUENCE:2",
      "COLOR:red",
      "URL:https://example.com/event",
      "GEO:52.52;13.405",
      "CATEGORIES:Work,Planning",
      "CATEGORIES:Q2",
      "RESOURCES:Projector,Whiteboard\\, large",
      "COMMENT:First",
      "COMMENT:Second",
      "CONTACT:Ann",
      "CONTACT:Ben",
      "RRULE:FREQ=WEEKLY;COUNT=4",
      "RELATED-TO;RELTYPE=sibling:other@example.com",
      "RELATED-TO:parent@example.com",
      "CONFERENCE;VALUE=URI;FEATURE=audio,Video;LABEL=Call:https://call.example.com/1",
    );
    expect(issues).toEqual([]);
    expect(plain(event)).toEqual({
      alarms: [],
      attachments: [],
      attendees: [],
      categories: ["Work", "Planning", "Q2"],
      classification: "PRIVATE",
      color: "red",
      comments: ["First", "Second"],
      conferences: [
        { features: ["AUDIO", "VIDEO"], label: "Call", uri: "https://call.example.com/1" },
      ],
      contacts: ["Ann", "Ben"],
      created: "2026-01-01T08:00:00Z",
      description: "Line one\nLine two",
      end: { instant: "2026-03-01T10:00:00Z", kind: "utc" },
      exceptionDates: [],
      extensions: {},
      geo: { latitude: 52.52, longitude: 13.405 },
      lastModified: "2026-01-15T08:00:00Z",
      location: "Room 1",
      otherComponents: [],
      otherProperties: [],
      priority: 5,
      recurrenceDates: [],
      recurrenceRule: { count: 4, frequency: "WEEKLY" },
      relatedTo: [
        { relationship: "SIBLING", uid: "other@example.com" },
        { uid: "parent@example.com" },
      ],
      resources: ["Projector", "Whiteboard, large"],
      sequence: 2,
      stamp: "2026-02-01T08:00:00Z",
      start: { instant: "2026-03-01T09:00:00Z", kind: "utc" },
      status: "CONFIRMED",
      summary: "Planning, Q2",
      transparency: "TRANSPARENT",
      uid: "event@example.com",
      url: "https://example.com/event",
    });
  });

  test("leaves absent optional fields out", () => {
    const { event } = parseEvent();
    expect(Object.keys(event).sort()).toEqual([
      "alarms",
      "attachments",
      "attendees",
      "categories",
      "comments",
      "conferences",
      "contacts",
      "exceptionDates",
      "extensions",
      "otherComponents",
      "otherProperties",
      "recurrenceDates",
      "relatedTo",
      "resources",
      "start",
      "uid",
    ]);
  });

  test("keeps unclaimed properties in source order and unknown subcomponents", () => {
    const { event, issues } = parseEvent(
      "X-B:2",
      "SUMMARY:Kept",
      "X-A;X-PARAM=1:1",
      "IMAGE;VALUE=URI:https://example.com/a.png",
      "BEGIN:X-NOTE",
      "X-BODY:hello",
      "END:X-NOTE",
    );
    expect(issues).toEqual([]);
    expect(event.otherProperties.map(({ name, value }) => `${name}:${value}`)).toEqual([
      "X-B:2",
      "X-A:1",
      "IMAGE:https://example.com/a.png",
    ]);
    expect(event.otherProperties[1]?.parameters).toEqual({ "X-PARAM": ["1"] });
    expect(event.otherComponents.map(({ name }) => name)).toEqual(["X-NOTE"]);
  });

  test("skips empty items of list properties", () => {
    const { event } = parseEvent("CATEGORIES:a,,b,", "RESOURCES:");
    expect(event.categories).toEqual(["a", "b"]);
    expect(event.resources).toEqual([]);
  });

  test("reads a malformed GEO as an error and drops it", () => {
    for (const geo of ["52.52,13.405", "north;east"]) {
      const { event, issues } = parseEvent(`GEO:${geo}`);
      expect(event.geo).toBeUndefined();
      expect(issuesOf(issues)).toContainEqual({
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "geo"],
        property: "GEO",
        severity: "error",
      });
    }
  });

  test("drops a value that doesn't decode, with an error at its field", () => {
    const { event, issues } = parseEvent("PRIORITY:high", "SEQUENCE:1");
    expect(event.priority).toBeUndefined();
    expect(event.sequence).toBe(1);
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "priority"],
        property: "PRIORITY",
        severity: "error",
      },
    ]);
  });

  test("reports a lenient decode as an invalid-value warning and keeps the value", () => {
    const { event, issues } = parseEvent("DTEND:20260301T1000Z");
    expect(plain(event.end)).toEqual({ instant: "2026-03-01T10:00:00Z", kind: "utc" });
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "end"],
        property: "DTEND",
        severity: "warning",
      },
    ]);
    expect(issues[0]?.message).toMatch(/^DTEND: .*no seconds/);
  });

  test("reports each warning of a lenient decode as its own issue", () => {
    const { issues } = parseEvent("DTEND:20260301t1000z");
    expect(issues.map(({ code, message }) => [code, message])).toEqual([
      ["invalid-value", "DTEND: lowercase T or Z; read as uppercase"],
      ["invalid-value", "DTEND: no seconds; read as :00"],
    ]);
  });

  test("codes a warning by the decoder's code, not by the words in its message", () => {
    const result = parse(
      calendarText(
        "BEGIN:VEVENT",
        "UID:a@example.com",
        "DTSTART;TZID=unsupported:20260101T000000Z",
        "END:VEVENT",
      ),
    );
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 4,
        path: [...EVENT_PATH, "start"],
        property: "DTSTART",
        severity: "warning",
      },
    ]);
    expect(result.issues[0]?.message).toMatch(/Z wins/);
  });

  test("reads an empty TZID as no TZID: floating, with an invalid-value warning", () => {
    const result = parse(
      calendarText(
        "BEGIN:VEVENT",
        "UID:a@example.com",
        "DTSTART;TZID=:20260101T090000",
        "EXDATE;TZID=:20260102T090000",
        "END:VEVENT",
      ),
    );
    const event = onlyCalendar(result).events[0]!;
    expect(plain(event.start)).toEqual({ kind: "floating", wallTime: "2026-01-01T09:00:00" });
    expect(plain(event.exceptionDates)).toEqual([
      { kind: "floating", wallTime: "2026-01-02T09:00:00" },
    ]);
    expect(issuesOf(result.issues)).toEqual([
      expect.objectContaining({ code: "invalid-value", path: [...EVENT_PATH, "start"] }),
      expect.objectContaining({
        code: "invalid-value",
        path: [...EVENT_PATH, "exceptionDates", 0],
      }),
    ]);
    expect(result.issues.map(({ message }) => message)).toEqual([
      "DTSTART: an empty TZID; ignored",
      "EXDATE: an empty TZID; ignored",
    ]);
  });
});

describe("single-valued properties", () => {
  test("keep the first occurrence and report the others", () => {
    const { event, issues } = parseEvent(
      "SUMMARY:First",
      "SUMMARY:Second",
      "SUMMARY:Third",
      "DTSTART:20260401T090000Z",
    );
    expect(event.summary).toBe("First");
    expect(plain(event.start)).toEqual({ instant: "2026-03-01T09:00:00Z", kind: "utc" });
    expect(issuesOf(issues)).toEqual([
      ...[6, 7].map((line) => ({
        code: "duplicate-property",
        component: "VEVENT",
        line,
        path: [...EVENT_PATH, "summary"],
        property: "SUMMARY",
        severity: "warning",
      })),
      {
        code: "duplicate-property",
        component: "VEVENT",
        line: 8,
        path: [...EVENT_PATH, "start"],
        property: "DTSTART",
        severity: "warning",
      },
    ]);
    expect(event.otherProperties).toEqual([]);
  });

  test("a second RRULE is reported and skipped", () => {
    const { event, issues } = parseEvent("RRULE:FREQ=DAILY", "RRULE:FREQ=WEEKLY");
    expect(event.recurrenceRule).toEqual({ frequency: "DAILY" });
    expect(issuesOf(issues)).toEqual([
      expect.objectContaining({ code: "duplicate-property", line: 6, property: "RRULE" }),
    ]);
    expect(event.otherProperties).toEqual([]);
  });
});

describe("enumerated values", () => {
  test("are upper-cased, whatever the producer wrote", () => {
    const { event } = parseEvent(
      "STATUS:Tentative",
      "CLASS:confidential",
      "TRANSP:opaque",
      "ATTENDEE;CUTYPE=room;ROLE=chair;PARTSTAT=accepted;RSVP=true:mailto:a@example.com",
      "RELATED-TO;RELTYPE=child:child@example.com",
    );
    expect(event).toMatchObject({
      attendees: [
        {
          calendarUserType: "ROOM",
          participationStatus: "ACCEPTED",
          role: "CHAIR",
          rsvp: true,
        },
      ],
      classification: "CONFIDENTIAL",
      relatedTo: [{ relationship: "CHILD", uid: "child@example.com" }],
      status: "TENTATIVE",
      transparency: "OPAQUE",
    });
  });

  test("other values stay as written, upper-cased", () => {
    const { event, issues } = parseEvent("STATUS:x-postponed");
    expect(event.status).toBe("X-POSTPONED");
    expect(issues).toEqual([]);
  });
});

describe("calendar users", () => {
  test("take the e-mail address from EMAIL, else from a mailto: address", () => {
    const { event } = parseEvent(
      'ORGANIZER;CN=Ann;DIR="ldap://example.com/ann";LANGUAGE=en;SENT-BY="mailto:b@example.com":MAILTO:ann@example.com',
      "ATTENDEE;EMAIL=carl@example.com:urn:uuid:1234",
      "ATTENDEE:urn:uuid:5678",
      "ATTENDEE:mailto:dora@example.com",
    );
    expect(event.organizer).toEqual({
      address: "MAILTO:ann@example.com",
      directory: "ldap://example.com/ann",
      email: "ann@example.com",
      language: "en",
      name: "Ann",
      otherParameters: {},
      sentBy: "mailto:b@example.com",
    });
    expect(event.attendees.map(({ address, email }) => ({ address, email }))).toEqual([
      { address: "urn:uuid:1234", email: "carl@example.com" },
      { address: "urn:uuid:5678", email: undefined },
      { address: "mailto:dora@example.com", email: "dora@example.com" },
    ]);
    expect(event.attendees[1]).not.toHaveProperty("email");
  });

  test("keep the parameters no field maps in otherParameters", () => {
    const { event } = parseEvent(
      "ORGANIZER;CN=Ann;X-ORG=1;PARTSTAT=ACCEPTED:mailto:ann@example.com",
      "ATTENDEE;CN=Ben;RSVP=TRUE;X-NUM-GUESTS=2;SCHEDULE-STATUS=1.2,2.0:mailto:ben@example.com",
    );
    // PARTSTAT is an attendee's parameter; ORGANIZER has no field for it.
    expect(event.organizer?.otherParameters).toEqual({ PARTSTAT: ["ACCEPTED"], "X-ORG": ["1"] });
    expect(event.attendees[0]?.otherParameters).toEqual({
      "SCHEDULE-STATUS": ["1.2", "2.0"],
      "X-NUM-GUESTS": ["2"],
    });
  });

  test("have no prototype keys in otherParameters", () => {
    const { event } = parseEvent(
      "ORGANIZER;X-ORG=1:mailto:ann@example.com",
      "ATTENDEE:mailto:ben@example.com",
    );
    for (const { otherParameters } of [event.organizer!, event.attendees[0]!]) {
      expect(otherParameters["constructor"]).toBeUndefined();
      expect(otherParameters["toString"]).toBeUndefined();
      expect("hasOwnProperty" in otherParameters).toBe(false);
    }
  });

  test("map delegation, membership and the attendee defaults", () => {
    const { event } = parseEvent(
      'ATTENDEE;DELEGATED-FROM="mailto:a@example.com";DELEGATED-TO="mailto:c@example.com","mailto:d@example.com";MEMBER="mailto:team@example.com":mailto:b@example.com',
      "ATTENDEE:mailto:e@example.com",
    );
    expect(event.attendees).toEqual([
      {
        address: "mailto:b@example.com",
        delegatedFrom: ["mailto:a@example.com"],
        delegatedTo: ["mailto:c@example.com", "mailto:d@example.com"],
        email: "b@example.com",
        memberOf: ["mailto:team@example.com"],
        otherParameters: {},
      },
      {
        address: "mailto:e@example.com",
        delegatedFrom: [],
        delegatedTo: [],
        email: "e@example.com",
        memberOf: [],
        otherParameters: {},
      },
    ]);
  });

  test("read RSVP as a boolean, absent when the parameter is", () => {
    const { event, issues } = parseEvent(
      "ATTENDEE;RSVP=TRUE:mailto:a@example.com",
      "ATTENDEE;RSVP=false:mailto:b@example.com",
      "ATTENDEE:mailto:c@example.com",
      "ATTENDEE;RSVP=maybe:mailto:d@example.com",
    );
    expect(event.attendees.map(({ rsvp }) => rsvp)).toEqual([true, false, undefined, undefined]);
    expect(event.attendees[2]).not.toHaveProperty("rsvp");
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 8,
        path: [...EVENT_PATH, "attendees", 3, "rsvp"],
        property: "ATTENDEE",
        severity: "error",
      },
    ]);
  });

  test("join a single-valued parameter that unquoted commas split", () => {
    const { event } = parseEvent("ORGANIZER;CN=Smith, Ann:mailto:ann@example.com");
    expect(event.organizer?.name).toBe("Smith, Ann");
  });
});

describe("ATTACH", () => {
  test("is a URI, or binary data with VALUE=BINARY or ENCODING=BASE64", () => {
    const { event, issues } = parseEvent(
      "ATTACH;FMTTYPE=application/pdf:https://example.com/agenda.pdf",
      "ATTACH;ENCODING=BASE64;VALUE=BINARY;FMTTYPE=text/plain:aGVsbG8=",
      "ATTACH;ENCODING=base64:aGk=",
      "ATTACH;VALUE=BINARY:not base64!",
      "ATTACH:cid:part1@example.com",
    );
    expect(event.attachments).toEqual([
      { formatType: "application/pdf", kind: "uri", uri: "https://example.com/agenda.pdf" },
      { data: "aGVsbG8=", formatType: "text/plain", kind: "binary" },
      { data: "aGk=", kind: "binary" },
      { kind: "uri", uri: "cid:part1@example.com" },
    ]);
    // A dropped item points at its list, since it has no index there.
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 8,
        path: [...EVENT_PATH, "attachments"],
        property: "ATTACH",
        severity: "error",
      },
    ]);
  });
});

describe("RECURRENCE-ID", () => {
  test("reads RANGE=THISANDFUTURE", () => {
    const { event, issues } = parseEvent("RECURRENCE-ID;RANGE=thisandfuture:20260308T090000Z");
    expect(plain(event.recurrenceId)).toEqual({ instant: "2026-03-08T09:00:00Z", kind: "utc" });
    expect(event.recurrenceRange).toBe("THISANDFUTURE");
    expect(issues).toEqual([]);
  });

  test("reports RANGE=THISANDPRIOR as unsupported and other ranges as invalid", () => {
    const prior = parseEvent("RECURRENCE-ID;RANGE=THISANDPRIOR:20260308T090000Z");
    expect(prior.event.recurrenceRange).toBeUndefined();
    expect(plain(prior.event.recurrenceId)).toEqual({
      instant: "2026-03-08T09:00:00Z",
      kind: "utc",
    });
    expect(issuesOf(prior.issues)).toEqual([
      {
        code: "unsupported",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "recurrenceRange"],
        property: "RECURRENCE-ID",
        severity: "warning",
      },
    ]);

    const other = parseEvent("RECURRENCE-ID;RANGE=FOREVER:20260308T090000Z");
    expect(other.event.recurrenceRange).toBeUndefined();
    expect(issuesOf(other.issues)).toEqual([
      expect.objectContaining({ code: "invalid-value", severity: "error" }),
    ]);
  });

  test("decodes a date by its shape", () => {
    const { event } = parseEvent("RECURRENCE-ID;VALUE=DATE:20260308");
    expect(plain(event.recurrenceId)).toEqual({ date: "2026-03-08", kind: "date" });
  });
});

describe("recurrence rules", () => {
  test("map COUNT with UNTIL to conflicting-properties and unknown parts to unsupported", () => {
    const { event, issues } = parseEvent(
      "RRULE:FREQ=DAILY;COUNT=3;UNTIL=20260310T000000Z;BYDAY=XX;RSCALE=GREGORIAN",
    );
    expect(plain(event.recurrenceRule)).toEqual({
      count: 3,
      frequency: "DAILY",
      until: { instant: "2026-03-10T00:00:00Z", kind: "utc" },
    });
    expect(issuesOf(issues).map(({ code, severity }) => [code, severity])).toEqual([
      ["invalid-value", "warning"],
      ["conflicting-properties", "warning"],
      ["unsupported", "warning"],
    ]);
    expect(issues.map(({ path }) => path)).toEqual(
      Array(3).fill([...EVENT_PATH, "recurrenceRule"]),
    );
    expect(issues[2]?.message).toBe("RRULE: unsupported rule parts ignored: RSCALE");
  });

  test("keep EXRULE in otherProperties with an unsupported warning", () => {
    const { event, issues } = parseEvent("X-FIRST:1", "EXRULE:FREQ=WEEKLY", "RRULE:FREQ=DAILY");
    expect(event.otherProperties.map(({ name }) => name)).toEqual(["X-FIRST", "EXRULE"]);
    expect(issuesOf(issues)).toEqual([
      {
        code: "unsupported",
        component: "VEVENT",
        line: 6,
        path: [...EVENT_PATH, "otherProperties", 1],
        property: "EXRULE",
        severity: "warning",
      },
    ]);
  });
});

describe("EXDATE and RDATE", () => {
  test("collect every value of every occurrence", () => {
    const { event, issues } = parseEvent(
      "EXDATE:20260302T090000Z,20260303T090000Z",
      "EXDATE;VALUE=DATE:20260304",
      "EXDATE;TZID=Europe/Berlin:20260305T100000",
      "RDATE;VALUE=PERIOD:20260310T090000Z/PT1H,20260311T090000Z/20260311T100000Z",
      "RDATE;VALUE=DATE:20260312,20260313",
    );
    expect(issues).toEqual([]);
    expect(plain(event.exceptionDates)).toEqual([
      { instant: "2026-03-02T09:00:00Z", kind: "utc" },
      { instant: "2026-03-03T09:00:00Z", kind: "utc" },
      { date: "2026-03-04", kind: "date" },
      {
        kind: "zoned",
        tzid: "Europe/Berlin",
        wallTime: "2026-03-05T10:00:00",
        zoned: "2026-03-05T10:00:00+01:00[Europe/Berlin]",
      },
    ]);
    expect(plain(event.recurrenceDates)).toEqual([
      { duration: "PT1H", start: { instant: "2026-03-10T09:00:00Z", kind: "utc" } },
      {
        end: { instant: "2026-03-11T10:00:00Z", kind: "utc" },
        start: { instant: "2026-03-11T09:00:00Z", kind: "utc" },
      },
      { date: "2026-03-12", kind: "date" },
      { date: "2026-03-13", kind: "date" },
    ]);
  });

  test("drop an item that doesn't decode; warnings point at the kept item", () => {
    const { event, issues } = parseEvent("EXDATE:20260302T090000Z,yesterday,20260304");
    expect(plain(event.exceptionDates)).toEqual([
      { instant: "2026-03-02T09:00:00Z", kind: "utc" },
      { date: "2026-03-04", kind: "date" },
    ]);
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "exceptionDates"],
        property: "EXDATE",
        severity: "error",
      },
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "exceptionDates", 1],
        property: "EXDATE",
        severity: "warning",
      },
    ]);
  });
});

describe("UTC timestamps", () => {
  test("read UTC as is and zoned times through their instant", () => {
    const { event, issues } = parseEvent(
      "DTSTAMP:20260301T080000Z",
      "CREATED;TZID=Europe/Berlin:20260301T090000",
    );
    expect(event.stamp?.toString()).toBe("2026-03-01T08:00:00Z");
    expect(event.created?.toString()).toBe("2026-03-01T08:00:00Z");
    expect(issues).toEqual([]);
  });

  test("read floating and unresolved times as UTC, with a warning", () => {
    const { event, issues } = parseEvent(
      "DTSTAMP:20260301T080000",
      "LAST-MODIFIED;TZID=Nowhere/Special:20260301T090000",
    );
    expect(event.stamp?.toString()).toBe("2026-03-01T08:00:00Z");
    expect(event.lastModified?.toString()).toBe("2026-03-01T09:00:00Z");
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "stamp"],
        property: "DTSTAMP",
        severity: "warning",
      },
      {
        code: "unknown-time-zone",
        component: "VEVENT",
        line: 6,
        path: [...EVENT_PATH, "lastModified"],
        property: "LAST-MODIFIED",
        severity: "warning",
      },
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 6,
        path: [...EVENT_PATH, "lastModified"],
        property: "LAST-MODIFIED",
        severity: "warning",
      },
    ]);
  });

  test("drop a date with a warning", () => {
    const { event, issues } = parseEvent("DTSTAMP;VALUE=DATE:20260301", "CREATED:20260301");
    expect(event.stamp).toBeUndefined();
    expect(event.created).toBeUndefined();
    expect(
      issuesOf(issues).map(({ code, property, severity }) => [code, property, severity]),
    ).toEqual([
      ["invalid-value", "DTSTAMP", "warning"],
      ["invalid-value", "CREATED", "warning"],
    ]);
  });

  test("tolerate a missing DTSTAMP silently", () => {
    const { event, issues } = parseEvent();
    expect(event.stamp).toBeUndefined();
    expect(issues).toEqual([]);
  });
});

describe("required properties", () => {
  const skipped = (property: string, line: number) => ({
    code: "missing-property",
    component: "VEVENT",
    line,
    path: ["calendars", 0, "events"],
    property,
    severity: "error",
  });

  test("an event without UID or DTSTART is skipped; kept events are indexed without it", () => {
    const result = parse(
      calendarText(
        "BEGIN:VEVENT",
        "SUMMARY:No UID or DTSTART",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:",
        "DTSTART:20260301T090000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:kept@example.com",
        "DTSTART;TZID=Nowhere/Special:20260301T090000",
        "END:VEVENT",
      ),
    );
    expect(onlyCalendar(result).events.map(({ uid }) => uid)).toEqual(["kept@example.com"]);
    expect(issuesOf(result.issues)).toEqual([
      skipped("UID", 2),
      skipped("DTSTART", 2),
      skipped("UID", 5),
      {
        code: "unknown-time-zone",
        component: "VEVENT",
        line: 11,
        path: ["calendars", 0, "events", 0, "start"],
        property: "DTSTART",
        severity: "warning",
      },
    ]);
    expect(result.issues[2]?.message).toBe("VEVENT has an empty UID; skipped");
  });

  test("an event whose DTSTART doesn't decode is skipped with an invalid-value error", () => {
    const result = parse(
      calendarText("BEGIN:VEVENT", "UID:a@example.com", "DTSTART:soon", "END:VEVENT"),
    );
    expect(onlyCalendar(result).events).toEqual([]);
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 4,
        path: ["calendars", 0, "events"],
        property: "DTSTART",
        severity: "error",
      },
    ]);
  });
});

describe("DTEND and DURATION", () => {
  test("DTEND wins over DURATION, with a conflicting-properties warning", () => {
    const { event, issues } = parseEvent("DURATION:PT2H", "DTEND:20260301T100000Z");
    expect(plain(event.end)).toEqual({ instant: "2026-03-01T10:00:00Z", kind: "utc" });
    expect(event.duration).toBeUndefined();
    expect(issuesOf(issues)).toEqual([
      {
        code: "conflicting-properties",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "duration"],
        property: "DURATION",
        severity: "warning",
      },
    ]);
  });

  test("a negative DURATION is kept with a warning", () => {
    const { event, issues } = parseEvent("DURATION:-PT1H");
    expect(event.duration?.toString()).toBe("-PT1H");
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "duration"],
        property: "DURATION",
        severity: "warning",
      },
    ]);
    expect(issues[0]?.message).toBe("DURATION is negative, which RFC 5545 doesn't allow");
    expect(parseEvent("DURATION:PT0S").issues).toEqual([]);
  });

  test("DURATION stays when DTEND doesn't decode", () => {
    const { event, issues } = parseEvent("DTEND:later", "DURATION:PT2H");
    expect(event.end).toBeUndefined();
    expect(event.duration?.toString()).toBe("PT2H");
    expect(issuesOf(issues).map(({ code }) => code)).toEqual(["invalid-value"]);
  });

  test("a DTEND of another kind than DTSTART is kept with a warning", () => {
    const { event, issues } = parseEvent("DTEND;VALUE=DATE:20260302");
    expect(plain(event.end)).toEqual({ date: "2026-03-02", kind: "date" });
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "end"],
        property: "DTEND",
        severity: "warning",
      },
    ]);
    expect(issues[0]?.message).toBe("DTEND is a DATE but DTSTART is a DATE-TIME");
  });

  test.each([
    ["a UTC end", "DTEND:20260301T080000Z"],
    ["a zoned end", "DTEND;TZID=Europe/Berlin:20260301T090000"],
  ])("%s before DTSTART is kept with a warning", (_, line) => {
    const { event, issues } = parseEvent(line);
    expect(event.end).toBeDefined();
    expect(issuesOf(issues)).toEqual([
      expect.objectContaining({ code: "invalid-value", path: [...EVENT_PATH, "end"] }),
    ]);
    expect(issues[0]?.message).toBe("DTEND is before DTSTART");
  });

  test("ends that equal the start, or don't compare with it, aren't reported", () => {
    expect(parseEvent("DTEND:20260301T090000Z").issues).toEqual([]);
    // A floating end has no instant to compare with a UTC start.
    expect(parseEvent("DTEND:20260301T080000").issues).toEqual([]);
    const dates = parse(
      calendarText(
        "BEGIN:VEVENT",
        "UID:a@example.com",
        "DTSTART;VALUE=DATE:20260301",
        "DTEND;VALUE=DATE:20260228",
        "END:VEVENT",
      ),
    );
    expect(dates.issues.map(({ message }) => message)).toEqual(["DTEND is before DTSTART"]);
  });
});

describe("unknown time zones", () => {
  test("are reported once per TZID per calendar, at the first use", () => {
    const result = parse(
      [
        calendarText(
          "BEGIN:VEVENT",
          "UID:a@example.com",
          "DTSTART;TZID=Nowhere/Special:20260301T090000",
          "DTEND;TZID=Nowhere/Special:20260301T100000",
          "EXDATE;TZID=Elsewhere:20260308T090000",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:b@example.com",
          "DTSTART;TZID=Nowhere/Special:20260302T090000",
          "END:VEVENT",
        ),
        calendarText(
          "BEGIN:VEVENT",
          "UID:c@example.com",
          "DTSTART;TZID=Nowhere/Special:20260303T090000",
          "END:VEVENT",
        ),
      ].join(""),
    );
    expect(result.calendars).toHaveLength(2);
    expect(plain(result.calendars[0]?.events[1]?.start)).toEqual({
      kind: "unresolved",
      tzid: "Nowhere/Special",
      wallTime: "2026-03-02T09:00:00",
    });
    expect(issuesOf(result.issues).map(({ line, path }) => ({ line, path }))).toEqual([
      { line: 4, path: ["calendars", 0, "events", 0, "start"] },
      { line: 6, path: ["calendars", 0, "events", 0, "exceptionDates", 0] },
      { line: 16, path: ["calendars", 1, "events", 0, "start"] },
    ]);
    expect(result.issues.every(({ code }) => code === "unknown-time-zone")).toBe(true);
  });

  test("are reported at the first line even when a later field is read first", () => {
    // EXDATE is read before DTEND, but DTEND comes first in the text.
    const { issues } = parseEvent(
      "DTEND;TZID=Nowhere/Special:20260301T100000",
      "EXDATE;TZID=Nowhere/Special:20260308T090000",
    );
    expect(issuesOf(issues)).toEqual([
      {
        code: "unknown-time-zone",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "end"],
        property: "DTEND",
        severity: "warning",
      },
    ]);
  });

  test("aren't reported for dates or UTC times that carry a TZID", () => {
    const { issues } = parseEvent(
      "DTEND;TZID=Nowhere/Special;VALUE=DATE:20260302",
      "RECURRENCE-ID;TZID=Nowhere/Special:20260301T090000Z",
    );
    expect(issuesOf(issues).map(({ code }) => code)).not.toContain("unknown-time-zone");
  });

  test("are reported for a period in RDATE", () => {
    const { event, issues } = parseEvent(
      "RDATE;VALUE=PERIOD;TZID=Nowhere/Special:20260310T090000/PT1H",
    );
    expect(plain(event.recurrenceDates)).toEqual([
      {
        duration: "PT1H",
        start: { kind: "unresolved", tzid: "Nowhere/Special", wallTime: "2026-03-10T09:00:00" },
      },
    ]);
    expect(issuesOf(issues)).toEqual([
      expect.objectContaining({
        code: "unknown-time-zone",
        path: [...EVENT_PATH, "recurrenceDates", 0],
      }),
    ]);
  });

  test("resolve through the calendar's VTIMEZONE and the custom resolver", () => {
    const text = calendarText(
      "BEGIN:VTIMEZONE",
      "TZID:Office",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0530",
      "TZOFFSETTO:+0530",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:a@example.com",
      "DTSTART;TZID=Office:20260301T090000",
      "DTEND;TZID=Home:20260301T100000",
      "END:VEVENT",
    );
    const result = parse(text, {
      resolveTimeZone: (tzid) => (tzid === "Home" ? "Europe/Lisbon" : undefined),
    });
    const [event] = onlyCalendar(result).events;
    expect(result.issues).toEqual([]);
    expect(event?.start.kind === "zoned" && event.start.zoned.timeZoneId).toBe("+05:30");
    expect(event?.end?.kind === "zoned" && event.end.zoned.timeZoneId).toBe("Europe/Lisbon");
  });
});
