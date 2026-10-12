import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import type { IcsParseResult, StandardSchemaV1 } from "../../src/index";
import { createIcsParser, IcsParseError, parseIcs } from "../../src/index";
import { calendarText, eventText } from "./helpers";

const valid = eventText("SUMMARY:Fine");
const warningOnly = eventText("SUMMARY:One", "SUMMARY:Two");
const withErrors = calendarText(
  "BEGIN:VEVENT",
  "SUMMARY:No UID",
  "DTSTART:20260301T090000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:a@example.com",
  "DTSTART:20260301T090000Z",
  "PRIORITY:high",
  "END:VEVENT",
);

describe("the Standard Schema surface", () => {
  test("declares version 1 and the vendor", () => {
    const standard = createIcsParser()["~standard"];
    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe("@moltenship/ics");
  });

  test("validates synchronously and succeeds with the parse result", () => {
    const parser = createIcsParser();
    const result = parser["~standard"].validate(valid);
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ value: parser.parse(valid) });
  });

  test("succeeds with warnings, which stay in the value's issues", () => {
    const result = createIcsParser()["~standard"].validate(
      warningOnly,
    ) as StandardSchemaV1.Result<IcsParseResult>;
    expect(result.issues).toBeUndefined();
    expect(result).toMatchObject({
      value: { issues: [expect.objectContaining({ code: "duplicate-property" })] },
    });
  });

  test("fails with the error-severity issues as message and path", () => {
    const result = createIcsParser()["~standard"].validate(withErrors);
    expect(result).toEqual({
      issues: [
        { message: "VEVENT has no UID; skipped", path: ["calendars", 0, "events"] },
        {
          message: expect.stringMatching(/^PRIORITY: "high" isn't an INTEGER/),
          path: ["calendars", 0, "events", 0, "priority"],
        },
      ],
    });
  });

  test.each([42, null, undefined, { text: valid }])("fails for %j with one issue", (input) => {
    const result = createIcsParser()["~standard"].validate(input);
    expect(result).toEqual({ issues: [{ message: expect.stringMatching(/string/) }] });
  });

  test("never throws, even when the parser is strict", () => {
    const parser = createIcsParser({ strict: true });
    expect(() => parser["~standard"].validate(withErrors)).not.toThrow();
  });

  test("types the parser as a schema from string to the parse result", () => {
    const parser = createIcsParser();
    expectTypeOf<StandardSchemaV1.InferInput<typeof parser>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof parser>>().toEqualTypeOf<IcsParseResult>();
  });
});

describe("strict mode", () => {
  test("throws IcsParseError with only the error-severity issues", () => {
    let thrown: unknown;
    try {
      createIcsParser({ strict: true }).parse(withErrors);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IcsParseError);
    const { issues, message } = thrown as IcsParseError;
    expect(issues.map(({ code, severity }) => [code, severity])).toEqual([
      ["missing-property", "error"],
      ["invalid-value", "error"],
    ]);
    expect(message).toBe("VEVENT has no UID; skipped (and 1 more)");
  });

  test("returns the result when there are only warnings", () => {
    const result = parseIcs(warningOnly, { strict: true });
    expect(result.issues).toHaveLength(1);
    expect(result.calendars[0]?.events).toHaveLength(1);
  });

  test("is off by default", () => {
    expect(parseIcs(withErrors).calendars[0]?.events).toHaveLength(1);
  });
});

describe("performance", () => {
  // Every event carries the properties of a typical subscription feed.
  function feed(count: number): string {
    const lines: string[] = ["BEGIN:VCALENDAR"];
    for (let index = 0; index < count; index += 1) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:event-${index}@example.com`,
        "DTSTAMP:20260110T091500Z",
        "DTSTART;TZID=Europe/Berlin:20260112T100000",
        "DTEND;TZID=Europe/Berlin:20260112T103000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260330T215959Z",
        "EXDATE;TZID=Europe/Berlin:20260126T100000,20260202T100000",
        "ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:bob@example.com",
        `SUMMARY:Event ${index}`,
        "X-CUSTOM:value",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT10M",
        "END:VALARM",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR", "");
    return lines.join("\r\n");
  }

  function time(text: string): number {
    const started = performance.now();
    parseIcs(text);
    return performance.now() - started;
  }

  test("stays linear in the number of events", () => {
    const small = feed(5_000);
    const large = feed(20_000);
    time(small);
    const smallTime = Math.min(time(small), time(small));
    const largeTime = Math.min(time(large), time(large));
    expect(parseIcs(large).calendars[0]?.events).toHaveLength(20_000);
    // Four times the events; a quadratic parser would take sixteen times as long.
    expect(largeTime / smallTime).toBeLessThan(8);
  }, 60_000);
});
