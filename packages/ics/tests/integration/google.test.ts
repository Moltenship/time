import { describe, expect, test } from "vite-plus/test";

import type { IcsComponent } from "../../src/index";
import { getEventEnd, icsExtension, parseIcs, parseIcsComponents } from "../../src/index";
import {
  describeDate,
  eventByUid,
  instantOf,
  lineOf,
  once,
  onlyCalendar,
  plain,
  propertyNamed,
  readFixture,
} from "./helpers";

const text = readFixture("google.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));

const seriesUid = "7kukuqrfedlm2f9t0vr42q2bfe@google.com";
const series = once(() => eventByUid(calendar().events, seriesUid));

const meetDescription =
  "Agenda:\n- Status updates, blockers and next steps\n- Demo of the new build\n" +
  "- Bring laptops; coffee is provided\n\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\n" +
  "Or dial: (US) +1 555-0100 PIN: 123456789#\n" +
  "More phone numbers: https://tel.meet/abc-defg-hij?pin=123456789\n\n" +
  "Learn more about Meet at: https://support.google.com/a/users/answer/9282720\n\n" +
  "Please do not edit this section.\n" +
  // The separator as the fixture writes it, which has one more ":~" than the first draft here.
  "-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-";

const berlin = (wallTime: string, offset: "+01:00" | "+02:00") => ({
  kind: "zoned",
  tzid: "Europe/Berlin",
  wallTime,
  zoned: `${wallTime}${offset}[Europe/Berlin]`,
});

describe("google.ics", () => {
  test("parses without issues", () => {
    expect(result().issues).toEqual([]);
  });

  test("reads the calendar and its X-WR-* properties", () => {
    expect(calendar()).toMatchObject({
      calendarScale: "GREGORIAN",
      description: "Shared calendar of the platform team",
      method: "PUBLISH",
      name: "Platform Team",
      productId: "-//Google Inc//Google Calendar 70.9054//EN",
      timeZone: "Europe/Berlin",
      version: "2.0",
    });
    expect(calendar().events).toHaveLength(6);
    expect(calendar().todos).toEqual([]);
    expect(calendar().journals).toEqual([]);
    expect(calendar().freeBusy).toEqual([]);
  });

  test("reads the VTIMEZONE, keeping X-LIC-LOCATION", () => {
    expect(calendar().timeZones).toHaveLength(1);
    const [zone] = calendar().timeZones;
    expect(zone?.tzid).toBe("Europe/Berlin");
    expect(zone?.timeZone).toBe("Europe/Berlin");
    expect(propertyNamed(zone?.otherProperties ?? [], "X-LIC-LOCATION")?.value).toBe(
      "Europe/Berlin",
    );
    expect(plain(zone?.observances)).toEqual([
      {
        comments: [],
        kind: "daylight",
        names: ["CEST"],
        offsetFrom: "+01:00",
        offsetTo: "+02:00",
        otherProperties: [],
        recurrenceDates: [],
        recurrenceRule: {
          byDay: [{ ordinal: -1, weekday: "SU" }],
          byMonth: [3],
          frequency: "YEARLY",
        },
        start: "1970-03-29T02:00:00",
      },
      {
        comments: [],
        kind: "standard",
        names: ["CET"],
        offsetFrom: "+02:00",
        offsetTo: "+01:00",
        otherProperties: [],
        recurrenceDates: [],
        recurrenceRule: {
          byDay: [{ ordinal: -1, weekday: "SU" }],
          byMonth: [10],
          frequency: "YEARLY",
        },
        start: "1970-10-25T03:00:00",
      },
    ]);
  });

  describe("the weekly series", () => {
    test("starts and ends in Europe/Berlin", () => {
      expect(plain(series().start)).toEqual(berlin("2026-01-12T10:00:00", "+01:00"));
      expect(plain(series().end)).toEqual(berlin("2026-01-12T10:30:00", "+01:00"));
      expect(instantOf(series().start)).toBe("2026-01-12T09:00:00Z");
      expect(instantOf(series().end)).toBe("2026-01-12T09:30:00Z");
      expect(series().duration).toBeUndefined();
      expect(describeDate(getEventEnd(series()))).toBe(describeDate(series().end));
    });

    test("has a weekly rule with a UTC UNTIL and two exception dates", () => {
      expect(plain(series().recurrenceRule)).toEqual({
        byDay: [{ weekday: "MO" }],
        frequency: "WEEKLY",
        until: { instant: "2026-03-30T21:59:59Z", kind: "utc" },
        weekStart: "MO",
      });
      expect(plain(series().exceptionDates)).toEqual([
        berlin("2026-01-26T10:00:00", "+01:00"),
        berlin("2026-02-16T10:00:00", "+01:00"),
      ]);
      expect(series().recurrenceDates).toEqual([]);
      expect(series().recurrenceId).toBeUndefined();
    });

    test("reads the text fields, unescaping the folded DESCRIPTION", () => {
      expect(series().summary).toBe("Weekly sync");
      expect(series().location).toBe("Room 4.01, Berlin Office");
      expect(series().description).toBe(meetDescription);
      expect(series().status).toBe("CONFIRMED");
      expect(series().transparency).toBe("OPAQUE");
      expect(series().sequence).toBe(0);
      expect(series().stamp?.toString()).toBe("2026-01-10T09:15:00Z");
      expect(series().created?.toString()).toBe("2025-12-15T12:00:00Z");
      expect(series().lastModified?.toString()).toBe("2026-01-10T09:15:00Z");
    });

    test("reads the organizer and attendees", () => {
      expect(series().organizer).toEqual({
        address: "mailto:alice@example.com",
        email: "alice@example.com",
        name: "Alice Example",
        otherParameters: {},
      });
      const common = {
        calendarUserType: "INDIVIDUAL",
        delegatedFrom: [],
        delegatedTo: [],
        memberOf: [],
        rsvp: true,
      };
      expect(series().attendees).toEqual([
        {
          ...common,
          address: "mailto:alice@example.com",
          email: "alice@example.com",
          name: "Alice Example",
          otherParameters: { "X-NUM-GUESTS": ["0"] },
          participationStatus: "ACCEPTED",
          role: "REQ-PARTICIPANT",
        },
        {
          ...common,
          address: "mailto:bob@example.com",
          email: "bob@example.com",
          name: "bob@example.com",
          otherParameters: { "X-NUM-GUESTS": ["0"] },
          participationStatus: "NEEDS-ACTION",
          role: "REQ-PARTICIPANT",
        },
        {
          ...common,
          address: "mailto:carol@example.org",
          email: "carol@example.org",
          name: "Carol Example",
          otherParameters: { "X-NUM-GUESTS": ["2"] },
          participationStatus: "TENTATIVE",
          role: "OPT-PARTICIPANT",
        },
      ]);
    });

    test("keeps X-NUM-GUESTS in otherParameters and in the syntax tree", () => {
      expect(series().attendees.map(({ otherParameters }) => otherParameters)).toEqual([
        { "X-NUM-GUESTS": ["0"] },
        { "X-NUM-GUESTS": ["0"] },
        { "X-NUM-GUESTS": ["2"] },
      ]);
      const [vcalendar] = parseIcsComponents(text).components;
      const vevent = vcalendar?.components.find(
        (component: IcsComponent) => component.name === "VEVENT",
      );
      const attendees = vevent?.properties.filter((property) => property.name === "ATTENDEE");
      expect(attendees?.map((attendee) => attendee.parameters["X-NUM-GUESTS"])).toEqual([
        ["0"],
        ["0"],
        ["2"],
      ]);
      expect(attendees?.[0]?.line).toBe(
        lineOf(text, "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE"),
      );
    });

    test("reads the VALARM", () => {
      expect(plain(series().alarms)).toEqual([
        {
          action: "DISPLAY",
          attachments: [],
          attendees: [],
          description: "This is an event reminder",
          otherComponents: [],
          otherProperties: [],
          trigger: { kind: "relative", offset: "-PT10M", relatedTo: "START" },
        },
      ]);
    });

    test("keeps X-GOOGLE-CONFERENCE in otherProperties", () => {
      // X-GOOGLE-CONFERENCE is not RFC 7986 CONFERENCE, so no typed field claims it.
      expect(propertyNamed(series().otherProperties, "X-GOOGLE-CONFERENCE")).toMatchObject({
        name: "X-GOOGLE-CONFERENCE",
        parameters: {},
        value: "https://meet.google.com/abc-defg-hij",
      });
      expect(series().conferences).toEqual([]);
    });
  });

  test("reads the moved occurrence by its RECURRENCE-ID", () => {
    const moved = eventByUid(calendar().events, seriesUid, "2026-02-09T10:00:00");
    expect(plain(moved.recurrenceId)).toEqual(berlin("2026-02-09T10:00:00", "+01:00"));
    expect(instantOf(moved.recurrenceId)).toBe("2026-02-09T09:00:00Z");
    expect(instantOf(moved.start)).toBe("2026-02-09T13:00:00Z");
    expect(instantOf(moved.end)).toBe("2026-02-09T14:00:00Z");
    expect(moved.summary).toBe("Weekly sync (moved)");
    expect(moved.sequence).toBe(1);
    expect(moved.recurrenceRule).toBeUndefined();
    expect(moved.recurrenceRange).toBeUndefined();
  });

  test("reads the cancelled occurrence", () => {
    const cancelled = eventByUid(calendar().events, seriesUid, "2026-03-02T10:00:00");
    expect(cancelled.status).toBe("CANCELLED");
    expect(instantOf(cancelled.recurrenceId)).toBe("2026-03-02T09:00:00Z");
    expect(instantOf(cancelled.start)).toBe("2026-03-02T09:00:00Z");
  });

  test("reads a single event written in UTC", () => {
    const lunch = eventByUid(calendar().events, "3h2k9f8s7d6a5g4j3k2l1m0n9b@google.com");
    expect(plain(lunch.start)).toEqual({ instant: "2026-01-20T11:30:00Z", kind: "utc" });
    expect(plain(lunch.end)).toEqual({ instant: "2026-01-20T12:30:00Z", kind: "utc" });
    expect(lunch.summary).toBe("Lunch with Erin");
  });

  test("reads a multi-day all-day event", () => {
    const offsite = eventByUid(calendar().events, "0p9o8i7u6y5t4r3e2w1q0a9s8d@google.com");
    expect(plain(offsite.start)).toEqual({ date: "2026-04-15", kind: "date" });
    expect(plain(offsite.end)).toEqual({ date: "2026-04-18", kind: "date" });
    expect(plain(getEventEnd(offsite))).toEqual({ date: "2026-04-18", kind: "date" });
    expect(offsite.transparency).toBe("TRANSPARENT");
    expect(offsite.location).toBe("Lakeside Lodge");
  });

  test("reads a yearly all-day birthday without DTEND", () => {
    const birthday = eventByUid(calendar().events, "5f4e3d2c1b0a9z8y7x6w5v4u3t@google.com");
    expect(plain(birthday.start)).toEqual({ date: "1990-05-21", kind: "date" });
    expect(birthday.end).toBeUndefined();
    expect(birthday.duration).toBeUndefined();
    expect(plain(birthday.recurrenceRule)).toEqual({ frequency: "YEARLY" });
    expect(birthday.summary).toBe("Dana Example's birthday");
    // RFC 5545 §3.6.1: a DATE start without DTEND or DURATION lasts one day.
    expect(plain(getEventEnd(birthday))).toEqual({ date: "1990-05-22", kind: "date" });
  });

  test("an event extension claims X-GOOGLE-CONFERENCE", () => {
    const parsed = parseIcs(text, {
      extensions: { event: { meet: icsExtension("X-GOOGLE-CONFERENCE", { type: "URI" }) } },
    });
    const events = onlyCalendar(parsed).events;
    const withMeet = eventByUid(events, seriesUid);
    expect(withMeet.extensions.meet).toBe("https://meet.google.com/abc-defg-hij");
    expect(propertyNamed(withMeet.otherProperties, "X-GOOGLE-CONFERENCE")).toBeUndefined();
    expect(eventByUid(events, "3h2k9f8s7d6a5g4j3k2l1m0n9b@google.com").extensions.meet).toBe(
      undefined,
    );
    expect(parsed.issues).toEqual([]);
  });

  test("a custom resolver is consulted before the built-in rules", () => {
    const calls: [string, string | undefined][] = [];
    const parsed = parseIcs(text, {
      resolveTimeZone: (tzid, definition) => {
        calls.push([tzid, definition?.name]);
        return tzid === "Europe/Berlin" ? "Europe/Amsterdam" : undefined;
      },
    });
    const start = eventByUid(onlyCalendar(parsed).events, seriesUid).start;
    expect(start.kind).toBe("zoned");
    if (start.kind !== "zoned") return;
    expect(start.tzid).toBe("Europe/Berlin");
    expect(start.zoned.timeZoneId).toBe("Europe/Amsterdam");
    expect(start.zoned.toInstant().toString()).toBe("2026-01-12T09:00:00Z");
    expect(calls).toContainEqual(["Europe/Berlin", "VTIMEZONE"]);
  });
});
