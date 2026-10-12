import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import type {
  IcsDate,
  IcsDateTime,
  IcsDecodedValueMap,
  IcsFrequency,
  IcsPeriod,
  IcsRecurrenceRule,
  IcsValueType,
  IcsWeekday,
} from "../../src/types";
import {
  decodeIcsValue,
  decodeIcsValues,
  encodeIcsValue,
  type IcsValueContext,
} from "../../src/values";
import { plain } from "./helpers";

const TIME_ZONES = [
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
  "Europe/Berlin",
  "Pacific/Chatham",
];
const WEEKDAYS: IcsWeekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const FREQUENCIES: IcsFrequency[] = [
  "SECONDLY",
  "MINUTELY",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
];

function expectRoundTrip<TType extends IcsValueType>(
  type: TType,
  value: IcsDecodedValueMap[TType],
  context?: IcsValueContext,
): void {
  const result = decodeIcsValue(type, encodeIcsValue(type, value), context);
  expect(result.ok).toBe(true);
  expect(plain(result.ok && result.value)).toEqual(plain(value));
}

const plainDate = fc
  .record({
    day: fc.integer({ max: 31, min: 1 }),
    month: fc.integer({ max: 12, min: 1 }),
    year: fc.integer({ max: 9999, min: 0 }),
  })
  .map((fields) => Temporal.PlainDate.from(fields));

const plainTime = fc
  .record({
    hour: fc.integer({ max: 23, min: 0 }),
    minute: fc.integer({ max: 59, min: 0 }),
    second: fc.integer({ max: 59, min: 0 }),
  })
  .map((fields) => Temporal.PlainTime.from(fields));

const wallTime = fc.tuple(plainDate, plainTime).map(([date, time]) => date.toPlainDateTime(time));

const date: fc.Arbitrary<IcsDate> = plainDate.map((value) => ({ date: value, kind: "date" }));
const floating: fc.Arbitrary<IcsDateTime> = wallTime.map((value) => ({
  kind: "floating",
  wallTime: value,
}));
const utc: fc.Arbitrary<IcsDateTime> = wallTime.map((value) => ({
  instant: value.toZonedDateTime("UTC").toInstant(),
  kind: "utc",
}));

function inZone(tzid: string): fc.Arbitrary<IcsDateTime> {
  return wallTime.map((value) => ({
    kind: "zoned",
    tzid,
    wallTime: value,
    zoned: value.toZonedDateTime(tzid, { disambiguation: "compatible" }),
  }));
}

const unsignedDuration = fc.oneof(
  fc.record({ weeks: fc.integer({ max: 10_000, min: 0 }) }),
  fc.record(
    {
      days: fc.integer({ max: 100_000, min: 0 }),
      hours: fc.integer({ max: 100_000, min: 0 }),
      minutes: fc.integer({ max: 100_000, min: 0 }),
      seconds: fc.integer({ max: 100_000, min: 0 }),
      weeks: fc.integer({ max: 10_000, min: 0 }),
    },
    { requiredKeys: [] },
  ),
);

const duration = fc.tuple(unsignedDuration, fc.boolean()).map(([fields, negative]) => {
  const value = Temporal.Duration.from({ seconds: 0, ...fields });
  return negative ? value.negated() : value;
});

const positiveDuration = unsignedDuration.map((fields) =>
  Temporal.Duration.from({ seconds: 0, ...fields }),
);

function numbers(min: number, max: number, nonZero = false): fc.Arbitrary<number[]> {
  return fc.array(
    fc.integer({ max, min }).filter((value) => !nonZero || value !== 0),
    { maxLength: 5, minLength: 1 },
  );
}

const weekday = fc.constantFrom(...WEEKDAYS);

const rule: fc.Arbitrary<IcsRecurrenceRule> = fc.record(
  {
    byDay: fc.array(
      fc.record(
        { ordinal: fc.integer({ max: 53, min: -53 }).filter((value) => value !== 0), weekday },
        { requiredKeys: ["weekday"] },
      ),
      { maxLength: 7, minLength: 1 },
    ),
    byHour: numbers(0, 23),
    byMinute: numbers(0, 59),
    byMonth: numbers(1, 12),
    byMonthDay: numbers(-31, 31, true),
    bySecond: numbers(0, 60),
    bySetPosition: numbers(-366, 366, true),
    byWeekNumber: numbers(-53, 53, true),
    byYearDay: numbers(-366, 366, true),
    count: fc.integer({ max: 100_000, min: 1 }),
    frequency: fc.constantFrom(...FREQUENCIES),
    interval: fc.integer({ max: 1000, min: 1 }),
    until: fc.oneof(date, utc, floating),
    weekStart: weekday,
  },
  { requiredKeys: ["frequency"] },
);

// Every character TEXT escapes, characters others wrongly escape, and any unicode.
const text = fc
  .array(
    fc.oneof(
      fc.constantFrom("\\", ";", ",", "\n", "\r\n", "\r", ":", '"', "\\n", "\\,", "N"),
      fc.string({ unit: "binary" }),
    ),
  )
  .map((parts) => parts.join(""));

function normalizeNewlines(value: string): string {
  return value.replaceAll(/\r\n?/g, "\n");
}

describe("round trips: decode(encode(value)) equals value", () => {
  test("TEXT, with every escapable character and unicode", () => {
    fc.assert(
      fc.property(text, (value) => {
        expect(decodeIcsValue("TEXT", encodeIcsValue("TEXT", value))).toEqual({
          ok: true,
          value: normalizeNewlines(value),
        });
      }),
      { numRuns: 500 },
    );
  });

  test("TEXT lists, item by item", () => {
    fc.assert(
      fc.property(fc.array(text, { maxLength: 6, minLength: 1 }), (items) => {
        const raw = items.map((item) => encodeIcsValue("TEXT", item)).join(",");
        expect(decodeIcsValues("TEXT", raw)).toEqual(
          items.map((item) => ({ ok: true, value: normalizeNewlines(item) })),
        );
      }),
      { numRuns: 300 },
    );
  });

  test("DATE", () => {
    fc.assert(fc.property(date, (value) => expectRoundTrip("DATE", value)));
  });

  test("DATE-TIME: floating and UTC", () => {
    fc.assert(fc.property(fc.oneof(floating, utc), (value) => expectRoundTrip("DATE-TIME", value)));
  });

  test("DATE-TIME: zoned, including wall times in DST gaps and folds", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TIME_ZONES).chain((tzid) => fc.tuple(fc.constant(tzid), inZone(tzid))),
        ([tzid, value]) => expectRoundTrip("DATE-TIME", value, { tzid }),
      ),
    );
  });

  test("DATE-TIME: unresolved", () => {
    fc.assert(
      fc.property(wallTime, fc.constantFrom("Custom Zone", "Mars/Olympus_Mons"), (value, tzid) =>
        expectRoundTrip("DATE-TIME", { kind: "unresolved", tzid, wallTime: value }, { tzid }),
      ),
    );
  });

  test("TIME", () => {
    fc.assert(
      fc.property(plainTime, fc.boolean(), (time, isUtc) =>
        expectRoundTrip("TIME", { time, utc: isUtc }),
      ),
    );
  });

  test("DURATION, with mixed units and signs", () => {
    fc.assert(
      fc.property(duration, (value) => {
        const result = decodeIcsValue("DURATION", encodeIcsValue("DURATION", value));
        expect(result.ok && result.value.toString()).toBe(value.toString());
      }),
      { numRuns: 500 },
    );
  });

  test("PERIOD, explicit and with a duration", () => {
    const start = fc.oneof(utc, floating);
    const period: fc.Arbitrary<IcsPeriod> = fc.oneof(
      fc.record({ end: fc.oneof(utc, floating), start }),
      fc.record({ duration: positiveDuration, start }),
    );
    fc.assert(fc.property(period, (value) => expectRoundTrip("PERIOD", value)));
  });

  test("PERIOD, zoned in the property's TZID", () => {
    const zonedPeriod = fc
      .constantFrom(...TIME_ZONES)
      .chain((tzid) =>
        fc.tuple(
          fc.constant(tzid),
          fc.oneof(
            fc.record({ end: inZone(tzid), start: inZone(tzid) }),
            fc.record({ duration: positiveDuration, start: inZone(tzid) }),
          ),
        ),
      );
    fc.assert(
      fc.property(zonedPeriod, ([tzid, value]) => expectRoundTrip("PERIOD", value, { tzid })),
    );
  });

  test("UTC-OFFSET", () => {
    const offset = fc
      .record({
        hours: fc.integer({ max: 23, min: 0 }),
        minutes: fc.integer({ max: 59, min: 0 }),
        negative: fc.boolean(),
        seconds: fc.option(fc.integer({ max: 59, min: 0 }), { nil: undefined }),
      })
      .map(({ hours, minutes, negative, seconds }) => {
        const zero = hours + minutes + (seconds ?? 0) === 0;
        const pad = (value: number) => String(value).padStart(2, "0");
        return `${negative && !zero ? "-" : "+"}${pad(hours)}:${pad(minutes)}${
          seconds === undefined ? "" : `:${pad(seconds)}`
        }`;
      });
    fc.assert(fc.property(offset, (value) => expectRoundTrip("UTC-OFFSET", value)));
  });

  test("RECUR, with every rule part", () => {
    fc.assert(
      fc.property(rule, (value) => {
        const result = decodeIcsValue("RECUR", encodeIcsValue("RECUR", value));
        expect(result.ok).toBe(true);
        expect(plain(result.ok && result.value)).toEqual(plain(value));
      }),
      { numRuns: 500 },
    );
  });

  test("INTEGER", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (value) => {
        const result = decodeIcsValue("INTEGER", encodeIcsValue("INTEGER", value));
        expect(result.ok && result.value === value).toBe(true);
      }),
    );
  });

  test("FLOAT, including -0, tiny and huge magnitudes", () => {
    fc.assert(
      fc.property(fc.double({ noDefaultInfinity: true, noNaN: true }), (value) => {
        const result = decodeIcsValue("FLOAT", encodeIcsValue("FLOAT", value));
        expect(result.ok && Object.is(result.value, value)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test("BOOLEAN", () => {
    fc.assert(fc.property(fc.boolean(), (value) => expectRoundTrip("BOOLEAN", value)));
  });

  test("URI and CAL-ADDRESS, as written", () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.emailAddress(), (uri, email) => {
        expectRoundTrip("URI", uri);
        expectRoundTrip("CAL-ADDRESS", `mailto:${email}`);
      }),
    );
  });

  test("BINARY", () => {
    const base64 = fc.stringMatching(
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    );
    fc.assert(fc.property(base64, (value) => expectRoundTrip("BINARY", value)));
  });
});
