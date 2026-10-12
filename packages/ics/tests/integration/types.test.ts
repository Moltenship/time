// Compile-time tests: `vp check` type-checks them. The declarations below are never called, so
// these tests don't depend on the runtime.

import { describe, expectTypeOf, test } from "vite-plus/test";

import type {
  IcsCalendar,
  IcsDateValue,
  IcsDecodeResult,
  IcsEvent,
  IcsExtension,
  IcsIssueCode,
  IcsJournal,
  IcsParser,
  IcsParseResult,
  IcsTodo,
  IcsValueWarning,
  StandardSchemaV1,
} from "../../src/index";
import { createIcsParser, icsExtension, parseIcs } from "../../src/index";
import { defineSchema, enumSchema } from "./helpers";

const busySchema = enumSchema(["BUSY", "FREE"]);
const idSchema = defineSchema<string, { id: number }>((value) => ({
  value: { id: Number(value) },
}));

function declarations() {
  return {
    busy: icsExtension("X-BUSY", { schema: busySchema }),
    count: icsExtension("X-COUNT", { type: "INTEGER" }),
    counts: icsExtension("X-COUNTS", { multiple: true, type: "INTEGER" }),
    date: icsExtension("X-DAY", { type: "DATE" }),
    dateTime: icsExtension("X-WHEN", { type: "DATE-TIME" }),
    duration: icsExtension("X-LENGTH", { type: "DURATION" }),
    flag: icsExtension("X-FLAG", { type: "BOOLEAN" }),
    id: icsExtension("X-ID", { schema: idSchema }),
    ids: icsExtension("X-IDS", { multiple: true, schema: idSchema }),
    tags: icsExtension("X-TAGS", { multiple: true }),
    text: icsExtension("X-A"),
  };
}
type Declarations = ReturnType<typeof declarations>;
type OutputOf<T> = T extends IcsExtension<infer TOutput> ? TOutput : never;

function extensions() {
  const { busy, count, dateTime, id, tags, text } = declarations();
  return {
    calendar: { orgId: count },
    event: { busy, id, when: dateTime },
    journal: { tags },
    todo: { text },
  };
}
type Extensions = ReturnType<typeof extensions>;

function parsed() {
  return parseIcs("", { extensions: extensions() });
}
type Parsed = ReturnType<typeof parsed>;
type Calendar = Parsed["calendars"][number];

function parser() {
  const { busy } = declarations();
  return createIcsParser({ extensions: { event: { busy } } });
}
type Parser = ReturnType<typeof parser>;

describe("icsExtension output types", () => {
  test("TEXT by default: string | undefined", () => {
    expectTypeOf<OutputOf<Declarations["text"]>>().toEqualTypeOf<string | undefined>();
  });

  test("multiple: readonly arrays", () => {
    expectTypeOf<OutputOf<Declarations["tags"]>>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<OutputOf<Declarations["counts"]>>().toEqualTypeOf<readonly number[]>();
    expectTypeOf<OutputOf<Declarations["ids"]>>().toEqualTypeOf<readonly { id: number }[]>();
  });

  test("value types", () => {
    expectTypeOf<OutputOf<Declarations["count"]>>().toEqualTypeOf<number | undefined>();
    expectTypeOf<OutputOf<Declarations["flag"]>>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<OutputOf<Declarations["duration"]>>().toEqualTypeOf<
      Temporal.Duration | undefined
    >();
    expectTypeOf<OutputOf<Declarations["dateTime"]>>().toEqualTypeOf<IcsDateValue | undefined>();
    expectTypeOf<OutputOf<Declarations["date"]>>().toEqualTypeOf<IcsDateValue | undefined>();
  });

  test("a schema's output type wins", () => {
    expectTypeOf<OutputOf<Declarations["id"]>>().toEqualTypeOf<{ id: number } | undefined>();
    expectTypeOf<OutputOf<Declarations["busy"]>>().toEqualTypeOf<"BUSY" | "FREE" | undefined>();
  });
});

describe("inferred extensions", () => {
  test("on events", () => {
    expectTypeOf<Calendar["events"][number]["extensions"]>().toEqualTypeOf<{
      readonly busy: "BUSY" | "FREE" | undefined;
      readonly id: { id: number } | undefined;
      readonly when: IcsDateValue | undefined;
    }>();
  });

  test("on the calendar, todos and journals", () => {
    expectTypeOf<Calendar["extensions"]>().toEqualTypeOf<{
      readonly orgId: number | undefined;
    }>();
    expectTypeOf<Calendar["todos"][number]["extensions"]>().toEqualTypeOf<{
      readonly text: string | undefined;
    }>();
    expectTypeOf<Calendar["journals"][number]["extensions"]>().toEqualTypeOf<{
      readonly tags: readonly string[];
    }>();
  });

  test("every component type takes the same config argument as IcsCalendar", () => {
    expectTypeOf<Calendar>().toEqualTypeOf<IcsCalendar<Extensions>>();
    expectTypeOf<Calendar["events"][number]>().toEqualTypeOf<IcsEvent<Extensions>>();
    expectTypeOf<Calendar["todos"][number]>().toEqualTypeOf<IcsTodo<Extensions>>();
    expectTypeOf<Calendar["journals"][number]>().toEqualTypeOf<IcsJournal<Extensions>>();
    expectTypeOf<IcsEvent<Extensions>["extensions"]["busy"]>().toEqualTypeOf<
      "BUSY" | "FREE" | undefined
    >();
    expectTypeOf<IcsTodo<Extensions>["extensions"]>().toEqualTypeOf<{
      readonly text: string | undefined;
    }>();
    expectTypeOf<IcsEvent["extensions"]>().toEqualTypeOf<{}>();
    expectTypeOf<IcsEvent<{ todo: Extensions["todo"] }>["extensions"]>().toEqualTypeOf<{}>();
  });

  test("without extensions, every extensions object is empty", () => {
    type Plain = ReturnType<typeof parseIcs<{}>>["calendars"][number];
    expectTypeOf<Plain["extensions"]>().toEqualTypeOf<{}>();
    expectTypeOf<Plain["events"][number]["extensions"]>().toEqualTypeOf<{}>();
  });
});

describe("the parser's types", () => {
  test("is a Standard Schema from string to the parse result", () => {
    type Config = { event: { busy: Declarations["busy"] } };
    expectTypeOf<Parser>().toEqualTypeOf<IcsParser<Config>>();
    expectTypeOf<Parser>().toExtend<StandardSchemaV1<string, IcsParseResult<Config>>>();
    expectTypeOf<StandardSchemaV1.InferInput<Parser>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<Parser>>().toEqualTypeOf<IcsParseResult<Config>>();
  });

  test("parse returns the parse result", () => {
    expectTypeOf<ReturnType<Parser["parse"]>>().toEqualTypeOf<
      IcsParseResult<{ event: { busy: Declarations["busy"] } }>
    >();
    expectTypeOf<
      ReturnType<Parser["parse"]>["calendars"][number]["events"][number]["extensions"]["busy"]
    >().toEqualTypeOf<"BUSY" | "FREE" | undefined>();
  });
});

describe("the value layer's types", () => {
  test("a decode result carries structured warnings", () => {
    type Success = Extract<IcsDecodeResult<string>, { ok: true }>;
    expectTypeOf<Success["warnings"]>().toEqualTypeOf<readonly IcsValueWarning[] | undefined>();
    expectTypeOf<IcsValueWarning>().toEqualTypeOf<{
      readonly code: IcsIssueCode;
      readonly message: string;
    }>();
  });
});
