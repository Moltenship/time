import { describe, expect, test } from "vite-plus/test";

import {
  expandRecurrenceRule,
  parseRecurrenceRule,
  type RecurrenceDate,
  type RecurrenceRuleStart,
} from "../../src";
import coverage from "./fixtures/coverage.json";
import dst from "./fixtures/dst.json";
import rfc5545 from "./fixtures/rfc5545.json";

// Expected expansions from python-dateutil, adjusted where ADR 0048 differs on purpose; each such
// case keeps dateutil's own answer and says why. Regenerate them with tools/recurrence-oracle.

interface FixtureCase {
  readonly divergence?: string;
  readonly expected: readonly string[];
  readonly id: string;
  readonly kind: "all-day" | "floating" | "timed";
  readonly oracle?: readonly string[];
  readonly rule: string;
  readonly start: string;
  readonly timeZone?: string;
  readonly title: string;
  readonly window?: { readonly before?: string; readonly from?: string };
}

interface FixtureFile {
  readonly cases: readonly FixtureCase[];
}

const files = { coverage, dst, rfc5545 } as unknown as Record<string, FixtureFile>;

const OFFSET = /(?:[+-]\d{2}:\d{2}(?::\d{2})?|Z)$/;

/** A wall time in `timeZone`, resolved with `compatible`, or the instant an offset picks. */
function zoned(text: string, timeZone: string): Temporal.ZonedDateTime {
  return OFFSET.test(text)
    ? Temporal.ZonedDateTime.from(`${text}[${timeZone}]`)
    : Temporal.PlainDateTime.from(text).toZonedDateTime(timeZone);
}

function dateOf(text: string, fixture: FixtureCase): RecurrenceDate {
  if (fixture.kind === "all-day") return Temporal.PlainDate.from(text);
  if (fixture.kind === "floating") return Temporal.PlainDateTime.from(text);
  return zoned(text, fixture.timeZone ?? "UTC").toInstant();
}

function firstOf(fixture: FixtureCase): RecurrenceRuleStart {
  if (fixture.kind === "all-day") {
    const start = Temporal.PlainDate.from(fixture.start);
    return { end: start.add({ days: 1 }), kind: "all-day", start };
  }
  if (fixture.kind === "floating") {
    const start = Temporal.PlainDateTime.from(fixture.start);
    return { end: start.add({ hours: 1 }), kind: "floating", start };
  }
  const timeZone = fixture.timeZone ?? "UTC";
  const start = zoned(fixture.start, timeZone);
  // A start written in a gap resolved later; the series repeats at the written time.
  const written = OFFSET.test(fixture.start)
    ? undefined
    : Temporal.PlainDateTime.from(fixture.start);
  return {
    end: start.toInstant().add({ hours: 1 }),
    kind: "timed",
    sourceTimeZone: timeZone,
    start: start.toInstant(),
    ...(written === undefined || written.equals(start.toPlainDateTime())
      ? {}
      : { wallStart: written }),
  };
}

function show(date: RecurrenceDate, fixture: FixtureCase): string {
  return date instanceof Temporal.Instant
    ? date.toZonedDateTimeISO(fixture.timeZone ?? "UTC").toString({ timeZoneName: "never" })
    : date.toString();
}

for (const [name, file] of Object.entries(files)) {
  describe(`${name} fixtures`, () => {
    test("have unique ids, and explain each departure from the oracle", () => {
      const ids = file.cases.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const fixture of file.cases) {
        expect(fixture.oracle === undefined, fixture.id).toBe(fixture.divergence === undefined);
      }
    });

    test.each(file.cases.map((fixture) => [fixture.id, fixture] as const))("%s", (_, fixture) => {
      const { issues, rule } = parseRecurrenceRule(fixture.rule);
      // COUNT with UNTIL, which some feeds write, parses with a warning.
      expect(issues.filter(({ code }) => code !== "conflicting-properties")).toEqual([]);
      const expansion = expandRecurrenceRule(rule!, firstOf(fixture), {
        ...(fixture.window?.from === undefined
          ? {}
          : { from: dateOf(fixture.window.from, fixture) }),
        ...(fixture.window?.before === undefined
          ? {}
          : { before: dateOf(fixture.window.before, fixture) }),
      });
      expect(expansion.truncated).toBe(false);
      expect(expansion.dates.map((date) => show(date, fixture))).toEqual(fixture.expected);
    });
  });
}
