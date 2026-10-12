import { describe, expect, test } from "vite-plus/test";

import { createIcsParser, icsExtension, parseIcs } from "../../src/index";
import {
  enumSchema,
  errorsOf,
  ics,
  idSchema,
  lineOf,
  onlyCalendar,
  plain,
  promiseSchema,
  propertyNames,
} from "./helpers";

const text = ics(
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example Corp//Tests//EN",
  "X-ORG-ID:42",
  "BEGIN:VEVENT",
  "UID:extended@example.com",
  "DTSTAMP:20260301T120000Z",
  "DTSTART:20260301T090000Z",
  "X-RESOURCE-ID:room-1",
  "X-BUSY:BUSY",
  "X-COUNT:7",
  "X-FLAG:TRUE",
  "X-WHEN;TZID=Europe/Berlin:20260302T090000",
  "X-DAY:20260303",
  "X-LENGTH:PT90M",
  "X-RATIO:0.75",
  "X-TAGS:a,b",
  "X-TAGS:c",
  "X-ESCAPED:one\\, two\\; three\\nfour",
  "X-UNCLAIMED:kept",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:plain@example.com",
  "DTSTAMP:20260301T120000Z",
  "DTSTART:20260301T100000Z",
  "X-BUSY:SOMETIMES",
  "X-COUNT:many",
  "END:VEVENT",
  "BEGIN:VTODO",
  "UID:todo@example.com",
  "DTSTAMP:20260301T120000Z",
  "X-COUNT:3",
  "END:VTODO",
  "BEGIN:VJOURNAL",
  "UID:journal@example.com",
  "DTSTAMP:20260301T120000Z",
  "X-RESOURCE-ID:notes",
  "END:VJOURNAL",
  "END:VCALENDAR",
);

describe("icsExtension", () => {
  test("upper-cases the name and defaults to a single TEXT value without schema", () => {
    expect(icsExtension("x-resource-id")).toMatchObject({
      multiple: false,
      name: "X-RESOURCE-ID",
      schema: undefined,
      type: "TEXT",
    });
    const schema = enumSchema(["a"]);
    expect(icsExtension("X-TAGS", { multiple: true, schema, type: "TEXT" })).toMatchObject({
      multiple: true,
      name: "X-TAGS",
      schema,
      type: "TEXT",
    });
  });
});

describe("extension values", () => {
  const parse = () =>
    parseIcs(text, {
      extensions: {
        calendar: { orgId: icsExtension("X-ORG-ID", { type: "INTEGER" }) },
        event: {
          count: icsExtension("X-COUNT", { type: "INTEGER" }),
          day: icsExtension("X-DAY", { type: "DATE" }),
          escaped: icsExtension("X-ESCAPED"),
          flag: icsExtension("X-FLAG", { type: "BOOLEAN" }),
          length: icsExtension("X-LENGTH", { type: "DURATION" }),
          missing: icsExtension("X-MISSING"),
          missingList: icsExtension("X-MISSING", { multiple: true }),
          ratio: icsExtension("X-RATIO", { type: "FLOAT" }),
          resource: icsExtension("x-resource-id"),
          tags: icsExtension("X-TAGS", { multiple: true }),
          when: icsExtension("X-WHEN", { type: "DATE-TIME" }),
        },
        journal: { resource: icsExtension("X-RESOURCE-ID") },
        todo: { count: icsExtension("X-COUNT", { type: "INTEGER" }) },
      },
    });

  test("decodes each value type", () => {
    const [event] = onlyCalendar(parse()).events;
    expect(plain(event?.extensions)).toEqual({
      count: 7,
      day: { date: "2026-03-03", kind: "date" },
      escaped: "one, two; three\nfour",
      flag: true,
      length: "PT90M",
      missing: undefined,
      missingList: [],
      ratio: 0.75,
      resource: "room-1",
      tags: ["a", "b", "c"],
      // A DATE-TIME extension honours its TZID parameter.
      when: {
        kind: "zoned",
        tzid: "Europe/Berlin",
        wallTime: "2026-03-02T09:00:00",
        zoned: "2026-03-02T09:00:00+01:00[Europe/Berlin]",
      },
    });
    expect(event?.extensions.missing).toBeUndefined();
  });

  test("fills calendar, todo and journal extensions", () => {
    const calendar = onlyCalendar(parse());
    expect(calendar.extensions.orgId).toBe(42);
    expect(calendar.todos[0]?.extensions.count).toBe(3);
    expect(calendar.journals[0]?.extensions.resource).toBe("notes");
  });

  test("claimed properties leave otherProperties; unclaimed ones stay", () => {
    const calendar = onlyCalendar(parse());
    expect(propertyNames(calendar.events[0]?.otherProperties ?? [])).toEqual([
      "X-BUSY",
      "X-UNCLAIMED",
    ]);
    expect(propertyNames(calendar.otherProperties)).not.toContain("X-ORG-ID");
  });

  test("drops a value that doesn't decode, with an invalid-value error, and keeps the event", () => {
    const result = parse();
    const calendar = onlyCalendar(result);
    expect(calendar.events).toHaveLength(2);
    expect(calendar.events[1]?.extensions.count).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-value",
        component: "VEVENT",
        path: ["calendars", 0, "events", 1, "extensions", "count"],
        property: "X-COUNT",
        severity: "error",
      }),
    );
  });
});

describe("extension schemas", () => {
  test("a schema validates and may transform the decoded value", () => {
    const result = parseIcs(text, {
      extensions: {
        event: {
          busy: icsExtension("X-BUSY", { schema: enumSchema(["BUSY", "FREE"]) }),
          id: icsExtension("X-COUNT", { schema: idSchema, type: "INTEGER" }),
          tags: icsExtension("X-TAGS", { multiple: true, schema: enumSchema(["a", "b", "c"]) }),
        },
      },
    });
    const [first] = onlyCalendar(result).events;
    expect(first?.extensions).toEqual({ busy: "BUSY", id: { id: 7 }, tags: ["a", "b", "c"] });
  });

  test("a rejected value is dropped with a schema error; the event stays", () => {
    const result = parseIcs(text, {
      extensions: { event: { busy: icsExtension("X-BUSY", { schema: enumSchema(["BUSY"]) }) } },
    });
    const events = onlyCalendar(result).events;
    expect(events.map((event) => event.extensions.busy)).toEqual(["BUSY", undefined]);
    const schemaIssues = result.issues.filter((issue) => issue.code === "schema");
    expect(schemaIssues).toEqual([
      expect.objectContaining({
        code: "schema",
        component: "VEVENT",
        line: lineOf(text, "X-BUSY:SOMETIMES"),
        path: ["calendars", 0, "events", 1, "extensions", "busy"],
        property: "X-BUSY",
        severity: "error",
      }),
    ]);
    expect(schemaIssues[0]?.message).toContain("not one of BUSY: SOMETIMES");
  });

  test("a schema that returns a promise is a schema error", () => {
    const result = parseIcs(text, {
      extensions: { event: { resource: icsExtension("X-RESOURCE-ID", { schema: promiseSchema }) } },
    });
    expect(onlyCalendar(result).events[0]?.extensions.resource).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "schema",
        path: ["calendars", 0, "events", 0, "extensions", "resource"],
        property: "X-RESOURCE-ID",
        severity: "error",
      }),
    );
  });

  test("schema errors fail Standard Schema validation and strict parsing", async () => {
    const parser = createIcsParser({
      extensions: { event: { busy: icsExtension("X-BUSY", { schema: enumSchema(["BUSY"]) }) } },
    });
    const validated = await parser["~standard"].validate(text);
    expect(validated.issues?.length).toBeGreaterThan(0);
    const strict = createIcsParser({
      extensions: { event: { busy: icsExtension("X-BUSY", { schema: enumSchema(["BUSY"]) }) } },
      strict: true,
    });
    expect(() => strict.parse(text)).toThrow();
    expect(errorsOf(parser.parse(text).issues).map(({ code }) => code)).toEqual(["schema"]);
  });
});
