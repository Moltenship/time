import { describe, expect, test } from "vite-plus/test";

import { getEventEnd, parseIcs, parseIcsComponents } from "../../src/index";
import {
  describeDate,
  errorsOf,
  eventByUid,
  lineBefore,
  lineOf,
  once,
  onlyCalendar,
  plain,
  propertyNamed,
  readFixture,
} from "./helpers";

describe("quirks.ics", () => {
  const text = readFixture("quirks.ics");
  const result = once(() => parseIcs(text));
  const calendar = once(() => onlyCalendar(result()));
  const event = (uid: string) => eventByUid(calendar().events, uid);
  const beginLineOf = (summary: string) =>
    lineBefore(text, "BEGIN:VEVENT", lineOf(text, `SUMMARY:${summary}`));

  test("keeps every event except the ones without UID or DTSTART, in source order", () => {
    expect(calendar().events.map(({ uid }) => uid)).toEqual([
      "lowercase@example.com",
      "date-without-value@example.com",
      "missing-dtstamp@example.com",
      "broken-folding@example.com",
      "unknown-tzid@example.com",
      "duplicate-summary@example.com",
      "dtend-and-duration@example.com",
      "multi-byte@example.com",
    ]);
  });

  test("reads lowercase names as upper case, keeping values as written", () => {
    expect(calendar().name).toBe("Quirks");
    expect(calendar().version).toBe("2.0");
    expect(calendar().productId).toBe("-//Example Corp//Quirky Exporter 0.9//EN");
    const lowercase = event("lowercase@example.com");
    expect(lowercase.summary).toBe("Lowercase names");
    expect(lowercase.stamp?.toString()).toBe("2026-03-01T12:00:00Z");
    expect(plain(lowercase.start)).toEqual({
      kind: "zoned",
      tzid: "Europe/Berlin",
      wallTime: "2026-03-02T09:00:00",
      zoned: "2026-03-02T09:00:00+01:00[Europe/Berlin]",
    });
    expect(propertyNamed(lowercase.otherProperties, "X-CUSTOM-FLAG")).toMatchObject({
      name: "X-CUSTOM-FLAG",
      parameters: { "X-PARAM": ["yes"] },
      value: "on",
    });
    expect(lowercase.otherComponents).toMatchObject([
      { components: [], name: "X-EXAMPLE-NOTE", properties: [{ name: "X-BODY", value: "hello" }] },
    ]);
  });

  test("decodes a date written without VALUE=DATE, with a warning", () => {
    const dated = event("date-without-value@example.com");
    expect(plain(dated.start)).toEqual({ date: "2026-03-05", kind: "date" });
    expect(plain(dated.end)).toEqual({ date: "2026-03-06", kind: "date" });
    expect(result().issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-value",
        line: lineOf(text, "DTSTART:20260305"),
        property: "DTSTART",
        severity: "warning",
      }),
    );
  });

  test("keeps an event without DTSTAMP", () => {
    const unstamped = event("missing-dtstamp@example.com");
    expect(unstamped.stamp).toBeUndefined();
    expect(unstamped.summary).toBe("Missing DTSTAMP");
    expect(errorsOf(result().issues).filter((issue) => issue.property === "DTSTAMP")).toEqual([]);
  });

  test("skips an event without UID, with an error at its BEGIN line", () => {
    expect(calendar().events.map(({ summary }) => summary)).not.toContain("Missing UID");
    expect(result().issues).toContainEqual(
      expect.objectContaining({
        code: "missing-property",
        component: "VEVENT",
        line: beginLineOf("Missing UID"),
        property: "UID",
        severity: "error",
      }),
    );
  });

  test("skips an event without DTSTART, with an error at its BEGIN line", () => {
    expect(calendar().events.map(({ uid }) => uid)).not.toContain("missing-dtstart@example.com");
    expect(result().issues).toContainEqual(
      expect.objectContaining({
        code: "missing-property",
        component: "VEVENT",
        line: beginLineOf("Missing DTSTART"),
        property: "DTSTART",
        severity: "error",
      }),
    );
  });

  test("reports a continuation line without its leading space and reads on", () => {
    const broken = event("broken-folding@example.com");
    // Whether the stray text is appended or dropped is open; the line before it is kept.
    expect(broken.description).toMatch(
      /^This description was folded by a careless exporter and the/,
    );
    expect(broken.location).toBe("Room 2");
    expect(broken.summary).toBe("Broken folding");
    expect(result().issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-content-line",
        line: lineOf(text, "next line lost its leading space"),
      }),
    );
  });

  test("keeps a date-time with an unknown TZID as unresolved, with a warning", () => {
    const unknown = event("unknown-tzid@example.com");
    expect(plain(unknown.start)).toEqual({
      kind: "unresolved",
      tzid: "Mars/Olympus_Mons",
      wallTime: "2026-03-12T09:00:00",
    });
    expect(plain(unknown.end)).toEqual({
      kind: "unresolved",
      tzid: "Mars/Olympus_Mons",
      wallTime: "2026-03-12T10:00:00",
    });
    expect(describeDate(getEventEnd(unknown))).toBe(
      "unresolved 2026-03-12T10:00:00 Mars/Olympus_Mons",
    );
    const index = calendar().events.indexOf(unknown);
    expect(result().issues).toContainEqual(
      expect.objectContaining({
        code: "unknown-time-zone",
        component: "VEVENT",
        line: lineOf(text, "DTSTART;TZID=Mars/Olympus_Mons:20260312T090000"),
        path: ["calendars", 0, "events", index, "start"],
        property: "DTSTART",
        severity: "warning",
      }),
    );
  });

  test("keeps the first of two SUMMARY properties", () => {
    expect(event("duplicate-summary@example.com").summary).toBe("First summary");
    expect(result().issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate-property",
        component: "VEVENT",
        line: lineOf(text, "SUMMARY:Second summary"),
        property: "SUMMARY",
      }),
    );
  });

  test("reports DTEND with DURATION and keeps the event", () => {
    const both = event("dtend-and-duration@example.com");
    expect(result().issues).toContainEqual(
      expect.objectContaining({ code: "conflicting-properties", component: "VEVENT" }),
    );
    // Which of the two survives is open; the end is one of them.
    expect(["2026-03-14T10:00:00Z", "2026-03-14T11:00:00Z"]).toContain(
      describeDate(getEventEnd(both)).replace("utc ", ""),
    );
  });

  test("unfolds Cyrillic and emoji folded inside multi-code-point sequences", () => {
    const multiByte = event("multi-byte@example.com");
    // Folds fall between 👩 and the ZWJ, inside a Cyrillic word, between 🗓 and U+FE0F, and
    // between 👋 and its skin-tone modifier.
    expect(multiByte.summary).toBe("Еженедельная встреча команды 👩‍💻 и планирование спринта 🚀");
    expect(multiByte.description).toBe(
      "Повестка: итоги релиза, ретроспектива и планы 🗓️\n" +
        "Не забудьте ноутбуки 💻 и хорошее настроение 😄 До встречи! 👋🏽",
    );
    expect(multiByte.location).toBe("Москва, Красная площадь, 1");
  });
});

describe("quirks-lf.ics: a BOM and bare LF line ends", () => {
  const text = readFixture("quirks-lf.ics");
  const result = once(() => parseIcs(text));
  const calendar = once(() => onlyCalendar(result()));

  test("the fixture really has them", () => {
    expect(text.startsWith("﻿BEGIN:VCALENDAR\n")).toBe(true);
    expect(text).not.toContain("\r");
  });

  test("parses without errors or content-line issues", () => {
    expect(errorsOf(result().issues)).toEqual([]);
    expect(result().issues.filter((issue) => issue.code === "invalid-content-line")).toEqual([]);
  });

  test("reads both events, unfolding LF + space and LF + tab", () => {
    expect(calendar().name).toBe("Line feeds");
    const [first, second] = calendar().events;
    expect(calendar().events).toHaveLength(2);
    expect(first?.summary).toBe("Bare line feeds");
    expect(first?.description).toBe("Folded with a line feed and a space, then with a tab.");
    expect(plain(first?.start)).toEqual({ instant: "2026-03-20T10:00:00Z", kind: "utc" });
    expect(second?.summary).toBe("After the BOM");
    expect(plain(second?.start)).toEqual({ date: "2026-03-21", kind: "date" });
  });

  test("the BOM is not part of the first name, and lines count LFs", () => {
    const { components } = parseIcsComponents(text);
    expect(components.map(({ line, name }) => ({ line, name }))).toEqual([
      { line: 1, name: "VCALENDAR" },
    ]);
    const vevent = components[0]?.components[0];
    expect(propertyNamed(vevent?.properties ?? [], "SUMMARY")?.line).toBe(
      lineOf(text, "SUMMARY:Bare line feeds"),
    );
    expect(propertyNamed(vevent?.properties ?? [], "DESCRIPTION")).toMatchObject({
      line: lineOf(text, "DESCRIPTION:Folded with a line feed"),
      value: "Folded with a line feed and a space\\, then with a tab.",
    });
  });
});

describe("quirks-structure.ics: a mismatched END and trailing garbage", () => {
  const text = readFixture("quirks-structure.ics");
  const result = once(() => parseIcs(text));
  const calendar = once(() => onlyCalendar(result()));
  const mismatchedEnd = () => lineOf(text, "END:VEVENT", lineOf(text, "BEGIN:VTODO"));
  const garbage = () => lineOf(text, "X-TRAILING-GARBAGE:this line follows END:VCALENDAR");

  test("reports the mismatched END", () => {
    expect(result().issues).toContainEqual(
      expect.objectContaining({ code: "invalid-structure", line: mismatchedEnd() }),
    );
  });

  test("still reads the event and the todo", () => {
    expect(calendar().events.map(({ summary, uid }) => ({ summary, uid }))).toEqual([
      { summary: "Well-formed event", uid: "well-formed@example.com" },
    ]);
    expect(calendar().todos.map(({ summary, uid }) => ({ summary, uid }))).toEqual([
      { summary: "Todo closed by the wrong END", uid: "mismatched-end@example.com" },
    ]);
  });

  test("reports the lines after END:VCALENDAR and attaches them nowhere", () => {
    expect(result().issues.some((issue) => (issue.line ?? 0) >= garbage())).toBe(true);
    const names = [
      ...calendar().otherProperties,
      ...calendar().todos.flatMap((todo) => todo.otherProperties),
    ].map(({ name }) => name);
    expect(names).not.toContain("X-TRAILING-GARBAGE");
  });

  test("the syntax tree holds one VCALENDAR with the VEVENT and the VTODO", () => {
    const { components, issues } = parseIcsComponents(text);
    expect(components.map(({ name }) => name)).toEqual(["VCALENDAR"]);
    expect(components[0]?.components.map(({ name }) => name)).toEqual(["VEVENT", "VTODO"]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "invalid-structure", line: mismatchedEnd(), path: [] }),
    );
  });
});
