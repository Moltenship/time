import { expect, test } from "vite-plus/test";

import type { RecurrenceRuleStart } from "../../src";

// Run with `vp run bench` in this package. Each case expands one week of 2026 from a series that
// started decades earlier: without COUNT the engine skips to the week; with COUNT it must count
// every occurrence from the first, which is the cost skipping saves.

// The production bundle, which `vp run bench` builds first. Through the test runner, each of the
// engine's modules would read the others' exports through getters inside the loop.
const bundle = "../../dist/index.mjs";
const { expandRecurrenceRule, parseRecurrenceRule } = (await import(
  /* @vite-ignore */ bundle
)) as typeof import("../../src");

function timed(wall: string, timeZone: string): RecurrenceRuleStart {
  const start = Temporal.PlainDateTime.from(wall).toZonedDateTime(timeZone).toInstant();
  return { end: start.add({ hours: 1 }), kind: "timed", sourceTimeZone: timeZone, start };
}

const rule = (text: string) => parseRecurrenceRule(text).rule!;

const week = {
  before: Temporal.Instant.from("2026-03-30T00:00:00Z"),
  from: Temporal.Instant.from("2026-03-23T00:00:00Z"),
};

let sink = 0;
function expand(text: string, first: RecurrenceRuleStart) {
  const { dates, truncated } = expandRecurrenceRule(rule(text), first, week);
  if (truncated) throw new Error(`${text} truncated`);
  sink += dates.length;
}

test("a daily series from 1990 skips to the week it's asked for", async ({ bench }) => {
  const first = timed("1990-01-01T09:00", "Europe/Berlin");
  const result = await bench.compare(
    bench("skips ahead", () => expand("FREQ=DAILY", first)),
    bench("counts from 1990", () => expand("FREQ=DAILY;COUNT=20000", first)),
  );
  expect(result.get("skips ahead")).toBeFasterThan(result.get("counts from 1990"));
});

test("an hourly series from 2010 skips to the week it's asked for", async ({ bench }) => {
  const first = timed("2010-01-01T00:30", "America/New_York");
  const result = await bench.compare(
    bench("skips ahead", () => expand("FREQ=HOURLY;BYHOUR=9,12,15", first)),
    bench("counts from 2010", () => expand("FREQ=HOURLY;BYHOUR=9,12,15;COUNT=20000", first)),
  );
  expect(result.get("skips ahead")).toBeFasterThan(result.get("counts from 2010"));
});

test("rules with every kind of period stay cheap in a week with a DST change", async ({
  bench,
}) => {
  const first = timed("2000-01-31T02:30", "Europe/Berlin");
  await bench.compare(
    bench("MINUTELY;INTERVAL=15", () => expand("FREQ=MINUTELY;INTERVAL=15", first)),
    bench("WEEKLY;BYDAY=MO,WE,FR", () => expand("FREQ=WEEKLY;BYDAY=MO,WE,FR", first)),
    bench("MONTHLY;BYDAY=-1SU", () => expand("FREQ=MONTHLY;BYDAY=-1SU", first)),
    bench("YEARLY;BYWEEKNO=13", () => expand("FREQ=YEARLY;BYWEEKNO=13;BYDAY=SU", first)),
  );
  expect(sink).toBeGreaterThan(0);
});
