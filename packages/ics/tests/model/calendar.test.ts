import { describe, expect, test } from "vite-plus/test";

import { calendarText, ics, issuesOf, onlyCalendar, parse, plain } from "./helpers";

describe("VCALENDAR", () => {
  test("maps the calendar properties", () => {
    const result = parse(
      calendarText(
        "PRODID:-//Example//EN",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:request",
        "NAME:Team",
        "DESCRIPTION:Team calendar\\, shared",
        "COLOR:teal",
        "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
        "SOURCE;VALUE=URI:https://example.com/team.ics",
        "URL:https://example.com/team",
        "UID:calendar@example.com",
        "LAST-MODIFIED:20260301T080000Z",
        "X-WR-TIMEZONE:Europe/Berlin",
        "X-OTHER:kept",
      ),
    );
    expect(result.issues).toEqual([]);
    expect(plain(onlyCalendar(result))).toEqual({
      calendarScale: "GREGORIAN",
      color: "teal",
      description: "Team calendar, shared",
      events: [],
      extensions: {},
      freeBusy: [],
      journals: [],
      lastModified: "2026-03-01T08:00:00Z",
      method: "REQUEST",
      name: "Team",
      otherComponents: [],
      otherProperties: [{ line: 15, name: "X-OTHER", parameters: {}, value: "kept" }],
      productId: "-//Example//EN",
      refreshInterval: "PT4H",
      source: "https://example.com/team.ics",
      timeZone: "Europe/Berlin",
      timeZones: [],
      todos: [],
      uid: "calendar@example.com",
      url: "https://example.com/team",
      version: "2.0",
    });
  });

  test("falls back to the X-WR-* properties and claims them either way", () => {
    const legacy = onlyCalendar(
      parse(
        calendarText(
          "X-WR-CALNAME:Legacy",
          "X-WR-CALDESC:Legacy description",
          "X-PUBLISHED-TTL:PT1H",
        ),
      ),
    );
    expect(legacy).toMatchObject({ description: "Legacy description", name: "Legacy" });
    expect(legacy.refreshInterval?.toString()).toBe("PT1H");

    const both = onlyCalendar(
      parse(
        calendarText(
          "NAME:New",
          "X-WR-CALNAME:Legacy",
          "REFRESH-INTERVAL;VALUE=DURATION:P1D",
          "X-PUBLISHED-TTL:PT1H",
        ),
      ),
    );
    expect(both.name).toBe("New");
    expect(both.refreshInterval?.toString()).toBe("P1D");
    expect(both.otherProperties).toEqual([]);
  });

  test("keeps the first NAME and leaves the other languages in otherProperties", () => {
    const result = parse(calendarText("NAME;LANGUAGE=en:Holidays", "NAME;LANGUAGE=de:Feiertage"));
    const calendar = onlyCalendar(result);
    expect(calendar.name).toBe("Holidays");
    expect(calendar.otherProperties.map(({ value }) => value)).toEqual(["Feiertage"]);
    expect(result.issues).toEqual([]);
  });

  test("leaves out an X-WR-TIMEZONE that resolves to nothing, with a warning", () => {
    const result = parse(calendarText("X-WR-TIMEZONE:Mars/Olympus_Mons"));
    expect(onlyCalendar(result).timeZone).toBeUndefined();
    expect(result.issues[0]?.message).toBe(
      'X-WR-TIMEZONE "Mars/Olympus_Mons" resolves to no time zone; the calendar has no timeZone',
    );
    expect(issuesOf(result.issues)).toEqual([
      {
        code: "unknown-time-zone",
        component: "VCALENDAR",
        line: 2,
        path: ["calendars", 0, "timeZone"],
        property: "X-WR-TIMEZONE",
        severity: "warning",
      },
    ]);
  });

  test("resolves X-WR-TIMEZONE like a TZID, through the custom resolver", () => {
    const result = parse(calendarText("X-WR-TIMEZONE:Head office"), {
      resolveTimeZone: (tzid) => (tzid === "Head office" ? "Asia/Tokyo" : undefined),
    });
    expect(onlyCalendar(result).timeZone).toBe("Asia/Tokyo");
  });

  test("sorts components into their arrays, in source order, and keeps the rest", () => {
    const calendar = onlyCalendar(
      parse(
        calendarText(
          "BEGIN:VTODO",
          "UID:todo-1",
          "END:VTODO",
          "BEGIN:VEVENT",
          "UID:event-1",
          "DTSTART:20260301T090000Z",
          "END:VEVENT",
          "BEGIN:VAVAILABILITY",
          "UID:availability",
          "END:VAVAILABILITY",
          "BEGIN:VEVENT",
          "UID:event-2",
          "DTSTART:20260302T090000Z",
          "END:VEVENT",
          "BEGIN:VJOURNAL",
          "UID:journal-1",
          "END:VJOURNAL",
          "BEGIN:VFREEBUSY",
          "UID:busy-1",
          "END:VFREEBUSY",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "TRIGGER:-PT5M",
          "END:VALARM",
        ),
      ),
    );
    expect(calendar.events.map(({ uid }) => uid)).toEqual(["event-1", "event-2"]);
    expect(calendar.todos.map(({ uid }) => uid)).toEqual(["todo-1"]);
    expect(calendar.journals.map(({ uid }) => uid)).toEqual(["journal-1"]);
    expect(calendar.freeBusy.map(({ uid }) => uid)).toEqual(["busy-1"]);
    expect(calendar.otherComponents.map(({ name }) => name)).toEqual(["VAVAILABILITY", "VALARM"]);
  });

  test("skips top-level components other than VCALENDAR, with a warning", () => {
    const result = parse(
      ics(
        "BEGIN:VEVENT",
        "UID:loose@example.com",
        "DTSTART:20260301T090000Z",
        "END:VEVENT",
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "END:VCALENDAR",
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "END:VCALENDAR",
      ),
    );
    expect(result.calendars).toHaveLength(2);
    expect(issuesOf(result.issues)).toEqual([
      { code: "invalid-structure", component: "VEVENT", line: 1, path: [], severity: "warning" },
    ]);
  });

  test.each([
    ["empty text", ""],
    ["blank lines", "\r\n\r\n"],
    ["components but no VCALENDAR", ics("BEGIN:VTODO", "UID:loose@example.com", "END:VTODO")],
  ])("gives %s no calendars and an error", (_, text) => {
    const result = parse(text);
    expect(result.calendars).toEqual([]);
    const errors = result.issues.filter(({ severity }) => severity === "error");
    expect(errors).toEqual([
      { code: "invalid-structure", message: "No VCALENDAR found", path: [], severity: "error" },
    ]);
  });

  test("gives text that isn't iCalendar no calendars and an error", () => {
    const result = parse("<html>Not found</html>");
    expect(result.calendars).toEqual([]);
    expect(issuesOf(result.issues)).toEqual([
      { code: "invalid-structure", path: [], severity: "error" },
    ]);
  });

  test("lists issues in source order, syntax issues among them", () => {
    const result = parse(
      calendarText(
        "BEGIN:VEVENT",
        "UID:a@example.com",
        "SUMMARY:One",
        "SUMMARY:Two",
        "not a content line",
        "DTSTART:20260301T090000Z",
        "PRIORITY:high",
        "END:VEVENT",
      ),
    );
    expect(result.issues.map(({ code, line }) => [line, code])).toEqual([
      [5, "duplicate-property"],
      [6, "invalid-content-line"],
      [8, "invalid-value"],
    ]);
  });
});
