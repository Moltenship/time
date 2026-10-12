import { describe, expect, test } from "vite-plus/test";

import { createIcsParser, parseIcs, parseIcsComponents } from "../../src/index";
import {
  instantOf,
  once,
  onlyCalendar,
  plain,
  propertyNamed,
  readFixture,
  rsvpOf,
  withoutRsvp,
} from "./helpers";

const text = readFixture("invitation.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));
const meeting = once(() => {
  const [event] = calendar().events;
  if (!event) throw new Error("no event");
  return event;
});

const zoomLink = "https://example.zoom.us/j/81234567890?pwd=AbCdEfGhIjKlMnOp";

describe("invitation.ics", () => {
  test("parses without issues, even strictly", () => {
    expect(result().issues).toEqual([]);
    expect(() => createIcsParser({ strict: true }).parse(text)).not.toThrow();
  });

  test("is an iTIP REQUEST", () => {
    expect(calendar().method).toBe("REQUEST");
    expect(calendar().productId).toBe("-//zoom.us//iCalendar Event//EN");
    expect(calendar().events).toHaveLength(1);
  });

  test("reads the VTIMEZONE with TZURL and LAST-MODIFIED", () => {
    const [zone] = calendar().timeZones;
    expect(zone).toMatchObject({
      timeZone: "America/Los_Angeles",
      tzid: "America/Los_Angeles",
      url: "http://tzurl.org/zoneinfo-outlook/America/Los_Angeles",
    });
    expect(zone?.lastModified?.toString()).toBe("2020-10-11T01:59:11Z");
    expect(zone?.otherProperties.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: "X-LIC-LOCATION", value: "America/Los_Angeles" },
    ]);
    expect(zone?.observances.map(({ kind, names }) => ({ kind, names }))).toEqual([
      { kind: "daylight", names: ["PDT"] },
      { kind: "standard", names: ["PST"] },
    ]);
  });

  test("reads the meeting", () => {
    expect(plain(meeting().start)).toEqual({
      kind: "zoned",
      tzid: "America/Los_Angeles",
      wallTime: "2026-09-15T10:00:00",
      zoned: "2026-09-15T10:00:00-07:00[America/Los_Angeles]",
    });
    expect(instantOf(meeting().start)).toBe("2026-09-15T17:00:00Z");
    expect(instantOf(meeting().end)).toBe("2026-09-15T18:00:00Z");
    expect(meeting()).toMatchObject({
      classification: "PUBLIC",
      location: zoomLink,
      priority: 5,
      sequence: 2,
      status: "CONFIRMED",
      summary: "Design review",
      transparency: "OPAQUE",
      uid: "ZOOM81234567890@example.zoom.us",
    });
    expect(meeting().description).toBe(
      "Ivan Example is inviting you to a scheduled Zoom meeting.\n\nJoin Zoom Meeting\n" +
        `${zoomLink}\n\nMeeting ID: 812 3456 7890\nPasscode: 424242\n`,
    );
  });

  test("reads the organizer with SENT-BY", () => {
    expect(meeting().organizer).toEqual({
      address: "mailto:ivan@example.com",
      email: "ivan@example.com",
      name: "Ivan Example",
      otherParameters: {},
      sentBy: "mailto:assistant@example.com",
    });
  });

  test("reads delegation, group membership, groups and rooms", () => {
    const person = (name: string, address: string) => ({
      address: `mailto:${address}`,
      calendarUserType: "INDIVIDUAL",
      delegatedFrom: [],
      delegatedTo: [],
      email: address,
      memberOf: [],
      name,
      otherParameters: {},
      participationStatus: "NEEDS-ACTION",
      role: "REQ-PARTICIPANT",
    });
    expect(withoutRsvp(meeting().attendees)).toEqual([
      person("Judy Example", "judy@example.org"),
      {
        ...person("Kim Example", "kim@example.org"),
        memberOf: ["mailto:design-team@example.com", "mailto:reviewers@example.com"],
      },
      {
        ...person("Lena Example", "lena@example.org"),
        delegatedTo: ["mailto:leo@example.org"],
        participationStatus: "DELEGATED",
      },
      {
        ...person("Leo Example", "leo@example.org"),
        delegatedFrom: ["mailto:lena@example.org"],
      },
      {
        ...person("Design Team", "design-team@example.com"),
        calendarUserType: "GROUP",
        role: "OPT-PARTICIPANT",
      },
      {
        ...person("Room 3, Building B", "room-3b@example.com"),
        calendarUserType: "ROOM",
        participationStatus: "ACCEPTED",
        role: "NON-PARTICIPANT",
      },
    ]);
    expect(rsvpOf(meeting().attendees)).toEqual([true, true, false, true, false, false]);
  });

  test("unquotes and splits multi-valued parameters in the syntax tree", () => {
    const [vcalendar] = parseIcsComponents(text).components;
    const vevent = vcalendar?.components.find((component) => component.name === "VEVENT");
    const attendees = vevent?.properties.filter((property) => property.name === "ATTENDEE") ?? [];
    expect(attendees[1]?.parameters.MEMBER).toEqual([
      "mailto:design-team@example.com",
      "mailto:reviewers@example.com",
    ]);
    expect(attendees[2]?.parameters["DELEGATED-TO"]).toEqual(["mailto:leo@example.org"]);
    expect(attendees[5]?.parameters.CN).toEqual(["Room 3, Building B"]);
    expect(attendees[5]?.parameters.RSVP).toBeUndefined();
    expect(propertyNamed(vevent?.properties ?? [], "ORGANIZER")?.parameters).toEqual({
      CN: ["Ivan Example"],
      "SENT-BY": ["mailto:assistant@example.com"],
    });
  });

  test("reads the alarm", () => {
    expect(
      plain(
        meeting().alarms.map(({ action, description, trigger }) => ({
          action,
          description,
          trigger,
        })),
      ),
    ).toEqual([
      {
        action: "DISPLAY",
        description: "Reminder",
        trigger: { kind: "relative", offset: "-PT10M", relatedTo: "START" },
      },
    ]);
  });
});
