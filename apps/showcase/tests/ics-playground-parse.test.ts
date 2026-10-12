import { describe, expect, test } from "vite-plus/test";

import {
  describeIssues,
  formatIssuePath,
  parsePlayground,
} from "../components/ics-playground/parse";
import { sampleIcs } from "../components/ics-playground/sample";

const lineOf = (text: string, needle: string) =>
  text.split("\n").findIndex((line) => line.startsWith(needle)) + 1;

describe("ICS playground", () => {
  test("parses the sample with exactly the intended warning", () => {
    const { issues, summary } = parsePlayground(sampleIcs);

    expect(issues).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: lineOf(sampleIcs, "DTSTART:20261019"),
        message: "DTSTART: a DATE where DATE-TIME is declared; read as DATE",
        path: ["calendars", 0, "events", 3, "start"],
        property: "DTSTART",
        severity: "warning",
      },
    ]);
    expect(summary).toBe("1 warning");
  });

  test("shows the sample's calendar, time zones and events", () => {
    const [calendar] = JSON.parse(parsePlayground(sampleIcs).json);

    expect(calendar.name).toBe("Design team");
    expect(calendar.timeZone).toBe("Europe/Berlin");
    expect(calendar.timeZones[0].timeZone).toBe("Europe/Berlin");
    expect(calendar.events.map((event: { summary: string }) => event.summary)).toEqual([
      "Design review",
      "Team offsite",
      "Budget call with finance",
      "Release freeze",
    ]);

    const [review, offsite, budget, freeze] = calendar.events;
    expect(review.attendees[0]).toMatchObject({
      email: "ben@example.com",
      name: "Ben Okafor",
      otherParameters: { "X-NUM-GUESTS": ["0"] },
      participationStatus: "ACCEPTED",
    });
    expect(review.description).toBe("Agenda:\n- Onboarding flow\n- Icons, round two");
    expect(review.recurrenceRule).toEqual({
      byDay: [{ weekday: "WE" }],
      count: 6,
      frequency: "WEEKLY",
    });
    expect(offsite.start).toEqual({ date: "2026-10-16", kind: "date" });
    expect(budget.otherProperties).toEqual([
      {
        line: lineOf(sampleIcs, "X-MICROSOFT-CDO-BUSYSTATUS"),
        name: "X-MICROSOFT-CDO-BUSYSTATUS",
        parameters: {},
        value: "TENTATIVE",
      },
    ]);
    expect(freeze.start).toEqual({ date: "2026-10-19", kind: "date" });
  });

  test("writes Temporal values as ISO strings", () => {
    const [calendar] = JSON.parse(parsePlayground(sampleIcs).json);
    const [review, , budget] = calendar.events;

    expect(review.stamp).toBe("2026-10-01T08:00:00Z");
    expect(review.start).toEqual({
      kind: "zoned",
      tzid: "Europe/Berlin",
      wallTime: "2026-10-14T10:00:00",
      zoned: "2026-10-14T10:00:00+02:00[Europe/Berlin]",
    });
    expect(review.exceptionDates[0].zoned).toBe("2026-10-28T10:00:00+01:00[Europe/Berlin]");
    expect(budget.start).toEqual({
      kind: "zoned",
      tzid: "W. Europe Standard Time",
      wallTime: "2026-10-15T14:30:00",
      zoned: "2026-10-15T14:30:00+02:00[Europe/Berlin]",
    });
  });

  test("lists the errors of broken input, with their lines", () => {
    const broken = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:no-start@example.com",
      "SEQUENCE:first",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:bad-value@example.com",
      "DTSTART:20261012T090000Z",
      "SEQUENCE:second",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const { issues, json, summary } = parsePlayground(broken);

    expect(issues.map(({ code, line, severity }) => ({ code, line, severity }))).toEqual([
      { code: "missing-property", line: 3, severity: "error" },
      { code: "invalid-value", line: 10, severity: "error" },
    ]);
    expect(summary).toBe("2 errors");
    expect(JSON.parse(json)[0].events).toHaveLength(1);
  });

  test("reports text without a calendar as an error", () => {
    expect(parsePlayground("").issues).toEqual([
      { code: "invalid-structure", message: "No VCALENDAR found", path: [], severity: "error" },
    ]);
    expect(parsePlayground("").json).toBe("[]");
  });

  test("counts and formats issues for display", () => {
    const issue = { code: "invalid-value", message: "", path: [] } as const;

    expect(describeIssues([])).toBe("No issues");
    expect(
      describeIssues([
        { ...issue, severity: "error" },
        { ...issue, severity: "error" },
        { ...issue, severity: "warning" },
      ]),
    ).toBe("2 errors and 1 warning");
    expect(formatIssuePath(["calendars", 0, "events", 3, "start"])).toBe(
      "calendars[0].events[3].start",
    );
    expect(formatIssuePath([])).toBe("");
  });
});
