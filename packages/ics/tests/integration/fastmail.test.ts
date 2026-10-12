import { describe, expect, test } from "vite-plus/test";

import { getEventEnd, parseIcs, parseIcsComponents } from "../../src/index";
import {
  describeDate,
  instantOf,
  once,
  onlyCalendar,
  plain,
  propertyNamed,
  propertyNames,
  readFixture,
} from "./helpers";

const text = readFixture("fastmail.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));
const bookClub = once(() => {
  const [event] = calendar().events;
  if (!event) throw new Error("no event");
  return event;
});

const melbourne = (wallTime: string) => ({
  kind: "zoned",
  tzid: "Australia/Melbourne",
  wallTime,
  zoned: `${wallTime}+10:00[Australia/Melbourne]`,
});

describe("fastmail.ics", () => {
  test("parses without issues", () => {
    expect(result().issues).toEqual([]);
  });

  test("reads the calendar", () => {
    expect(calendar().name).toBe("Personal");
    expect(calendar().events).toHaveLength(1);
    expect(calendar().timeZones).toMatchObject([
      { timeZone: "Australia/Melbourne", tzid: "Australia/Melbourne" },
    ]);
    expect(calendar().timeZones[0]?.lastModified?.toString()).toBe("2025-06-10T09:00:00Z");
  });

  test("reads DTSTART with DURATION, and getEventEnd adds them", () => {
    expect(plain(bookClub().start)).toEqual(melbourne("2026-04-10T18:30:00"));
    expect(instantOf(bookClub().start)).toBe("2026-04-10T08:30:00Z");
    expect(bookClub().end).toBeUndefined();
    expect(bookClub().duration?.toString()).toBe("PT2H");
    expect(describeDate(getEventEnd(bookClub()))).toBe(
      "zoned 2026-04-10T20:30:00+10:00[Australia/Melbourne] tzid=Australia/Melbourne",
    );
  });

  test("reads RRULE with an ordinal BYDAY, EXDATE and RDATE", () => {
    expect(plain(bookClub().recurrenceRule)).toEqual({
      byDay: [{ ordinal: 2, weekday: "FR" }],
      frequency: "MONTHLY",
    });
    expect(plain(bookClub().exceptionDates)).toEqual([melbourne("2026-06-12T18:30:00")]);
    expect(plain(bookClub().recurrenceDates)).toEqual([melbourne("2026-07-24T18:30:00")]);
  });

  test("reads PRIORITY, GEO and the escaped LOCATION", () => {
    expect(bookClub()).toMatchObject({
      geo: { latitude: -37.8136, longitude: 144.9631 },
      location: "Example Library, Level 2",
      priority: 0,
      sequence: 3,
      status: "CONFIRMED",
      summary: "Book club",
    });
  });

  test("decodes RFC 6868 parameter values and the EMAIL parameter", () => {
    expect(bookClub().organizer).toEqual({
      address: "mailto:mary@example.org",
      email: "mary@example.org",
      name: 'Mary "Mo" Example',
      otherParameters: {},
    });
    expect(
      bookClub().attendees.map(({ email, name, participationStatus, rsvp }) => ({
        email,
        name,
        participationStatus,
        rsvp,
      })),
    ).toEqual([
      {
        email: "mary@example.org",
        name: 'Mary "Mo" Example',
        participationStatus: "ACCEPTED",
        rsvp: false,
      },
      {
        email: "nils@example.org",
        name: "Nils Example",
        participationStatus: "TENTATIVE",
        rsvp: true,
      },
    ]);
    const [vcalendar] = parseIcsComponents(text).components;
    const vevent = vcalendar?.components.find((component) => component.name === "VEVENT");
    expect(propertyNamed(vevent?.properties ?? [], "ORGANIZER")?.parameters.CN).toEqual([
      'Mary "Mo" Example',
    ]);
  });

  test("reads the alarm relative to the end", () => {
    expect(plain(bookClub().alarms)).toEqual([
      {
        action: "DISPLAY",
        attachments: [],
        attendees: [],
        description: "Book club",
        otherComponents: [],
        otherProperties: [],
        trigger: { kind: "relative", offset: "-PT5M", relatedTo: "END" },
        uid: "7c3e1a9f-2b4d-4c6e-8f0a-1b3c5d7e9f20",
      },
    ]);
  });

  test("keeps X-JMAP-CALENDARID", () => {
    expect(propertyNames(bookClub().otherProperties)).toEqual(["X-JMAP-CALENDARID"]);
  });
});
