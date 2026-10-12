import { describe, expect, test } from "vite-plus/test";

import { createIcsParser, IcsParseError, parseIcs } from "../../src/index";
import { errorsOf, ics, plain, readFixture } from "./helpers";

const google = readFixture("google.ics");
const quirks = readFixture("quirks.ics");

/** One event whose only problem is a warning: its TZID resolves to nothing. */
const warningOnly = ics(
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example Corp//Tests//EN",
  "BEGIN:VEVENT",
  "UID:warning-only@example.com",
  "DTSTAMP:20260301T120000Z",
  "DTSTART;TZID=Nowhere/Special:20260301T090000",
  "END:VEVENT",
  "END:VCALENDAR",
);

describe("the parser as a Standard Schema", () => {
  test("declares version 1 and a vendor", () => {
    const standard = createIcsParser()["~standard"];
    expect(standard.version).toBe(1);
    expect(typeof standard.vendor).toBe("string");
    expect(standard.vendor.length).toBeGreaterThan(0);
  });

  test("succeeds with the parse result for valid text", async () => {
    const parser = createIcsParser();
    const result = await parser["~standard"].validate(google);
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(plain(result.value)).toEqual(plain(parser.parse(google)));
    expect(result.value.calendars[0]?.events).toHaveLength(6);
  });

  test("succeeds when there are only warnings, and keeps them in the value", async () => {
    const result = await createIcsParser()["~standard"].validate(warningOnly);
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value.issues).toContainEqual(
      expect.objectContaining({ code: "unknown-time-zone", severity: "warning" }),
    );
  });

  test("fails with the error-severity issues", async () => {
    const parser = createIcsParser();
    const result = await parser["~standard"].validate(quirks);
    const errors = errorsOf(parser.parse(quirks).issues);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(result.issues?.map((issue) => issue.message)).toEqual(
      errors.map((issue) => issue.message),
    );
  });

  test.each([
    ["a number", 42],
    ["undefined", undefined],
    ["null", null],
    ["bytes", new Uint8Array([0x42, 0x45, 0x47, 0x49, 0x4e])],
    ["an object", { text: google }],
  ])("fails for %s", async (_label, input) => {
    const result = await createIcsParser()["~standard"].validate(input);
    expect(result.issues?.length).toBeGreaterThan(0);
    for (const issue of result.issues ?? []) expect(typeof issue.message).toBe("string");
  });

  test("a parser can be reused", () => {
    const parser = createIcsParser();
    expect(parser.parse(google).calendars[0]?.name).toBe("Platform Team");
    expect(parser.parse(quirks).calendars[0]?.name).toBe("Quirks");
    expect(parser.parse(google).calendars[0]?.name).toBe("Platform Team");
  });

  test.each([
    ["empty text", ""],
    ["whitespace", "\r\n  \r\n"],
    ["a loose event", ics("BEGIN:VEVENT", "UID:loose@example.com", "END:VEVENT")],
  ])("fails for %s, which holds no calendar", async (_label, text) => {
    expect(parseIcs(text).calendars).toEqual([]);
    const result = await createIcsParser()["~standard"].validate(text);
    expect(result.issues).toEqual([{ message: "No VCALENDAR found", path: [] }]);
  });
});

describe("strict parsing", () => {
  test("throws IcsParseError with the errors", () => {
    const parse = () => createIcsParser({ strict: true }).parse(quirks);
    expect(parse).toThrow(IcsParseError);
    try {
      parse();
    } catch (error) {
      expect(error).toBeInstanceOf(IcsParseError);
      if (!(error instanceof IcsParseError)) return;
      expect(error.name).toBe("IcsParseError");
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "missing-property", property: "UID", severity: "error" }),
          expect.objectContaining({
            code: "missing-property",
            property: "DTSTART",
            severity: "error",
          }),
        ]),
      );
    }
  });

  test("parseIcs takes strict too", () => {
    expect(() => parseIcs(quirks, { strict: true })).toThrow(IcsParseError);
  });

  test("throws for text without a calendar", () => {
    expect(() => parseIcs("", { strict: true })).toThrow("No VCALENDAR found");
  });

  test("doesn't throw for warnings", () => {
    const result = parseIcs(warningOnly, { strict: true });
    expect(result.calendars[0]?.events).toHaveLength(1);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(errorsOf(result.issues)).toEqual([]);
  });

  test("is off by default", () => {
    expect(() => parseIcs(quirks)).not.toThrow();
  });
});
