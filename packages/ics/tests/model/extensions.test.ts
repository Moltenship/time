import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import type {
  IcsCalendar,
  IcsDateValue,
  IcsExtension,
  IcsPeriod,
  IcsRecurrenceRule,
  StandardSchemaV1,
} from "../../src/index";
import { icsExtension, parseIcs } from "../../src/index";
import { EVENT_PATH, eventText, issuesOf, onlyCalendar, plain, schema } from "./helpers";

const upperCase = schema<string, string>((value) =>
  typeof value === "string" && value.length > 0
    ? { value: value.toUpperCase() }
    : { issues: [{ message: "empty" }, { message: "not a word" }] },
);
const positive = schema<number, number>((value) =>
  typeof value === "number" && value > 0 ? { value } : { issues: [{ message: "not positive" }] },
);
const anything = schema<unknown, string>((value) => ({ value: typeof value }));
const asynchronous = schema<string, string>(() => Promise.reject(new Error("never awaited")));

function eventWith(lines: readonly string[], event: Record<string, IcsExtension>) {
  const result = parseIcs(eventText(...lines), { extensions: { event } });
  const [parsed] = onlyCalendar(result).events;
  return {
    extensions: parsed!.extensions as Record<string, unknown>,
    issues: result.issues,
    parsed: parsed!,
  };
}

describe("icsExtension", () => {
  test("upper-cases the name and fills the defaults", () => {
    expect(icsExtension("x-room")).toEqual({
      multiple: false,
      name: "X-ROOM",
      schema: undefined,
      type: "TEXT",
    });
    expect(icsExtension("X-ROOMS", { multiple: true, schema: upperCase, type: "TEXT" })).toEqual({
      multiple: true,
      name: "X-ROOMS",
      schema: upperCase,
      type: "TEXT",
    });
  });
});

describe("extension values", () => {
  test("decode as the declared type, whatever VALUE says", () => {
    const { extensions, issues } = eventWith(
      [
        "X-COUNT;VALUE=TEXT:7",
        "X-WHEN:20260302",
        "X-AT;TZID=Europe/Berlin:20260302T090000",
        "X-SLOT:20260302T090000Z/PT1H",
        "X-RULE:FREQ=DAILY;COUNT=2",
        "X-OFFSET:+0530",
        "X-TIME:093000",
      ],
      {
        at: icsExtension("X-AT", { type: "DATE-TIME" }),
        count: icsExtension("X-COUNT", { type: "INTEGER" }),
        offset: icsExtension("X-OFFSET", { type: "UTC-OFFSET" }),
        rule: icsExtension("X-RULE", { type: "RECUR" }),
        slot: icsExtension("X-SLOT", { type: "PERIOD" }),
        time: icsExtension("X-TIME", { type: "TIME" }),
        when: icsExtension("X-WHEN", { type: "DATE" }),
      },
    );
    expect(issues).toEqual([]);
    expect(plain(extensions)).toEqual({
      at: {
        kind: "zoned",
        tzid: "Europe/Berlin",
        wallTime: "2026-03-02T09:00:00",
        zoned: "2026-03-02T09:00:00+01:00[Europe/Berlin]",
      },
      count: 7,
      offset: "+05:30",
      rule: { count: 2, frequency: "DAILY" },
      slot: { duration: "PT1H", start: { instant: "2026-03-02T09:00:00Z", kind: "utc" } },
      time: { time: "09:30:00", utc: false },
      when: { date: "2026-03-02", kind: "date" },
    });
  });

  test("a DATE extension reads a date-time by its shape, with a warning", () => {
    const { extensions, issues } = eventWith(["X-WHEN:20260302T090000Z"], {
      when: icsExtension("X-WHEN", { type: "DATE" }),
    });
    expect(plain(extensions["when"])).toEqual({ instant: "2026-03-02T09:00:00Z", kind: "utc" });
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "extensions", "when"],
        property: "X-WHEN",
        severity: "warning",
      },
    ]);
  });

  test("a single value takes the first occurrence, whole, and reports the others", () => {
    const { extensions, issues, parsed } = eventWith(["X-ROOM:A\\, east", "X-ROOM:B"], {
      room: icsExtension("X-ROOM"),
    });
    expect(extensions["room"]).toBe("A, east");
    expect(parsed.otherProperties).toEqual([]);
    expect(issuesOf(issues)).toEqual([
      {
        code: "duplicate-property",
        component: "VEVENT",
        line: 6,
        path: [...EVENT_PATH, "extensions", "room"],
        property: "X-ROOM",
        severity: "warning",
      },
    ]);
  });

  test("multiple collects every occurrence and every comma-separated value", () => {
    const { extensions, issues } = eventWith(
      ["X-ROOM:A,B\\,C", "X-ROOM:D", "X-DAYS:20260302,bad,20260304"],
      {
        days: icsExtension("X-DAYS", { multiple: true, type: "DATE" }),
        none: icsExtension("X-NONE", { multiple: true }),
        rooms: icsExtension("X-ROOM", { multiple: true }),
      },
    );
    expect(plain(extensions)).toEqual({
      days: [
        { date: "2026-03-02", kind: "date" },
        { date: "2026-03-04", kind: "date" },
      ],
      none: [],
      rooms: ["A", "B,C", "D"],
    });
    expect(issuesOf(issues)).toEqual([
      {
        code: "invalid-value",
        component: "VEVENT",
        line: 7,
        path: [...EVENT_PATH, "extensions", "days"],
        property: "X-DAYS",
        severity: "error",
      },
    ]);
  });

  test("an absent single value is undefined, with its key in place", () => {
    const { extensions } = eventWith([], { room: icsExtension("X-ROOM") });
    expect(extensions).toEqual({ room: undefined });
    expect(Object.keys(extensions)).toEqual(["room"]);
  });

  test("an unresolved TZID is reported at the extension", () => {
    const { issues } = eventWith(["X-AT;TZID=Nowhere/Special:20260302T090000"], {
      at: icsExtension("X-AT", { type: "DATE-TIME" }),
    });
    expect(issuesOf(issues)).toEqual([
      expect.objectContaining({
        code: "unknown-time-zone",
        path: [...EVENT_PATH, "extensions", "at"],
      }),
    ]);
  });
});

describe("extension schemas", () => {
  test("validate and transform each value", () => {
    const { extensions, issues } = eventWith(["X-ROOM:a,b", "X-SEATS:4"], {
      rooms: icsExtension("X-ROOM", { multiple: true, schema: upperCase }),
      seats: icsExtension("X-SEATS", { schema: positive, type: "INTEGER" }),
      type: icsExtension("X-SEATS", { schema: anything, type: "INTEGER" }),
    });
    expect(extensions).toEqual({ rooms: ["A", "B"], seats: 4, type: "number" });
    expect(issues).toEqual([]);
  });

  test("a rejected value is dropped with a schema error holding the schema's messages", () => {
    const { extensions, issues } = eventWith(["X-ROOM:a,,b", "X-ROOM:", "X-SEATS:-1"], {
      rooms: icsExtension("X-ROOM", { multiple: true, schema: upperCase }),
      seats: icsExtension("X-SEATS", { schema: positive, type: "INTEGER" }),
    });
    expect(extensions).toEqual({ rooms: ["A", "B"], seats: undefined });
    expect(issuesOf(issues)).toEqual([
      {
        code: "schema",
        component: "VEVENT",
        line: 7,
        path: [...EVENT_PATH, "extensions", "seats"],
        property: "X-SEATS",
        severity: "error",
      },
    ]);
    expect(issues[0]?.message).toBe("X-SEATS: not positive");

    const empty = eventWith(["X-ROOM:"], { room: icsExtension("X-ROOM", { schema: upperCase }) });
    expect(empty.issues[0]?.message).toBe("X-ROOM: empty; not a word");
  });

  test("a schema that returns a promise is a schema error, and its rejection is handled", async () => {
    const { extensions, issues } = eventWith(["X-ROOM:a"], {
      room: icsExtension("X-ROOM", { schema: asynchronous }),
    });
    expect(extensions["room"]).toBeUndefined();
    expect(issuesOf(issues)).toEqual([
      {
        code: "schema",
        component: "VEVENT",
        line: 5,
        path: [...EVENT_PATH, "extensions", "room"],
        property: "X-ROOM",
        severity: "error",
      },
    ]);
    expect(issues[0]?.message).toMatch(/asynchronous schemas aren't supported/);
    // An unhandled rejection would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("a schema doesn't see values that fail to decode", () => {
    let calls = 0;
    const counting = schema<number, number>((value) => {
      calls += 1;
      return { value: value as number };
    });
    const { issues } = eventWith(["X-SEATS:four"], {
      seats: icsExtension("X-SEATS", { schema: counting, type: "INTEGER" }),
    });
    expect(calls).toBe(0);
    expect(issuesOf(issues).map(({ code }) => code)).toEqual(["invalid-value"]);
  });
});

describe("components", () => {
  test("calendar, todo and journal extensions claim their own component's properties", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "X-OWNER:ann",
      "BEGIN:VTODO",
      "UID:todo",
      "X-OWNER:ben",
      "END:VTODO",
      "BEGIN:VJOURNAL",
      "UID:journal",
      "X-OWNER:cy",
      "END:VJOURNAL",
      "BEGIN:VEVENT",
      "UID:event",
      "DTSTART:20260301T090000Z",
      "X-OWNER:dee",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const owner = icsExtension("X-OWNER");
    const calendar = onlyCalendar(
      parseIcs(text, { extensions: { calendar: { owner }, journal: { owner }, todo: { owner } } }),
    );
    expect(calendar.extensions.owner).toBe("ann");
    expect(calendar.todos[0]?.extensions.owner).toBe("ben");
    expect(calendar.journals[0]?.extensions.owner).toBe("cy");
    expect(calendar.events[0]?.extensions).toEqual({});
    expect(calendar.events[0]?.otherProperties.map(({ value }) => value)).toEqual(["dee"]);
    expect(calendar.otherProperties).toEqual([]);
  });
});

describe("types", () => {
  type OutputOf<T> = T extends IcsExtension<infer TOutput> ? TOutput : never;

  test("infer the output from the value type, the schema and multiple", () => {
    expectTypeOf<OutputOf<ReturnType<typeof icsExtension<"TEXT">>>>().toEqualTypeOf<
      string | undefined
    >();
    const period = icsExtension("X-SLOT", { type: "PERIOD" });
    expectTypeOf<OutputOf<typeof period>>().toEqualTypeOf<IcsPeriod | undefined>();
    const rule = icsExtension("X-RULE", { multiple: true, type: "RECUR" });
    expectTypeOf<OutputOf<typeof rule>>().toEqualTypeOf<readonly IcsRecurrenceRule[]>();
    const date = icsExtension("X-DAY", { type: "DATE" });
    expectTypeOf<OutputOf<typeof date>>().toEqualTypeOf<IcsDateValue | undefined>();
    const seats = icsExtension("X-SEATS", { schema: positive, type: "INTEGER" });
    expectTypeOf<OutputOf<typeof seats>>().toEqualTypeOf<number | undefined>();
    const kinds = icsExtension("X-ANY", { multiple: true, schema: anything, type: "BOOLEAN" });
    expectTypeOf<OutputOf<typeof kinds>>().toEqualTypeOf<readonly string[]>();
  });

  test("accept schemas whose input takes the decoded value", () => {
    const narrow = schema<"A" | "B", "A" | "B">((value) => ({ value: value as "A" | "B" }));
    const dateOnly = schema<{ readonly kind: "date" }, string>(() => ({ value: "date" }));
    const wide = schema<string | number, string>((value) => ({ value: String(value) }));
    // A narrower input, such as an enum, is what validation is for.
    expectTypeOf(icsExtension("X-A", { schema: narrow })).toExtend<IcsExtension>();
    expectTypeOf(icsExtension("X-B", { schema: dateOnly, type: "DATE" })).toExtend<IcsExtension>();
    expectTypeOf(icsExtension("X-C", { schema: wide })).toExtend<IcsExtension>();
    expectTypeOf(
      icsExtension("X-D", { schema: anything, type: "PERIOD" }),
    ).toExtend<IcsExtension>();
  });

  test("reject schemas whose input can't take the decoded value", () => {
    const date = schema<Temporal.PlainDate, string>(() => ({ value: "" }));
    // @ts-expect-error A number schema can't validate TEXT.
    icsExtension("X-A", { schema: positive });
    // @ts-expect-error A string schema can't validate an INTEGER.
    icsExtension("X-B", { schema: upperCase, type: "INTEGER" });
    // @ts-expect-error A DATE decodes to an IcsDateValue, not a Temporal.PlainDate.
    icsExtension("X-C", { schema: date, type: "DATE" });
    // @ts-expect-error The check holds for multiple values too.
    icsExtension("X-D", { multiple: true, schema: positive, type: "TEXT" });
  });

  test("type each component's extensions in IcsCalendar", () => {
    type Config = {
      readonly calendar: { readonly owner: IcsExtension<string | undefined> };
      readonly event: { readonly seats: IcsExtension<number | undefined> };
    };
    expectTypeOf<IcsCalendar<Config>["extensions"]>().toEqualTypeOf<{
      readonly owner: string | undefined;
    }>();
    expectTypeOf<IcsCalendar<Config>["events"][number]["extensions"]>().toEqualTypeOf<{
      readonly seats: number | undefined;
    }>();
    expectTypeOf<IcsCalendar<Config>["todos"][number]["extensions"]>().toEqualTypeOf<{}>();

    const result = parseIcs("", {
      extensions: {
        event: { seats: icsExtension("X-SEATS", { schema: positive, type: "INTEGER" }) },
      },
    });
    type Event = (typeof result)["calendars"][number]["events"][number];
    expectTypeOf<Event["extensions"]["seats"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof positive>>().toEqualTypeOf<number>();
  });
});
