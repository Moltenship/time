import { describe, expect, test } from "vite-plus/test";

import { createEventSnapshot, getYearRange } from "@moltenship/calendar-core";
import { createOccurrenceAdapter } from "@moltenship/calendar-recurrence";

import {
  createFixtureExpander,
  expandFixture,
  recurrenceAdapters,
  runRecurrenceBenchmark,
} from "../recurrence/expansion";
import {
  generateRecurrenceFixture,
  RECURRENCE_ANCHOR,
  yearViewLoadRange,
  type RecurrenceFixture,
  type RecurrenceFixtureEvent,
} from "../recurrence/fixture";
import { benchmarkExitCode, RECURRENCE_BENCHMARK_STAGES } from "../shared/protocol";

const fixture = generateRecurrenceFixture();
const small = generateRecurrenceFixture({ seriesCount: 20 });

function occurrencesByCategory(range: RecurrenceFixture["year"]) {
  const { issues, occurrences } = expandFixture(fixture, range);
  const counts: Record<string, number> = {};
  for (const { event } of occurrences) {
    counts[event.data.category] = (counts[event.data.category] ?? 0) + 1;
  }
  return { counts, issues: issues.length, total: occurrences.length };
}

describe("recurrence benchmark fixture", () => {
  test("asks for the year view's own load range in Berlin", () => {
    const range = (anchor: Temporal.PlainDate) => {
      const { range, timeZone } = yearViewLoadRange(anchor, "Europe/Berlin");
      return `${range.start.toString()}/${range.end.toString()} ${timeZone}`;
    };

    expect(range(RECURRENCE_ANCHOR)).toBe("2026-01-01/2027-01-01 Europe/Berlin");
    expect(fixture.year.range).toEqual(getYearRange(RECURRENCE_ANCHOR));
    expect(range(fixture.nextYear.range.start)).toBe("2027-01-01/2028-01-01 Europe/Berlin");
  });

  test("mixes rules, ends, exceptions, zones and kinds as a real calendar does", () => {
    const masters = fixture.events.filter((event) => event.recurrence !== undefined);
    const overrides = fixture.events.filter((event) => event.override !== undefined);
    const tally = (keys: readonly string[]) => {
      const counts: Record<string, number> = {};
      for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    };

    expect({
      cancelled: overrides.filter((event) => event.override?.cancelled === true).length,
      count: masters.filter((event) => event.recurrence?.rule?.count !== undefined).length,
      earliestWorkStart: Math.min(
        ...masters
          .filter((event) => event.data.category !== "birthday")
          .map((event) =>
            event.kind === "timed" ? event.start.toZonedDateTimeISO("UTC").year : event.start.year,
          ),
      ),
      exceptions: masters.filter((event) => event.recurrence?.exceptionDates !== undefined).length,
      moved: overrides.filter((event) => event.override?.cancelled !== true).length,
      series: fixture.series,
      until: masters.filter((event) => event.recurrence?.rule?.until !== undefined).length,
      zones: tally(
        masters.map((event) => (event.kind === "timed" ? event.sourceTimeZone! : event.kind)),
      ),
    }).toEqual({
      cancelled: 16,
      count: 15,
      earliestWorkStart: 2015,
      exceptions: 27,
      moved: 13,
      series: 200,
      until: 18,
      zones: {
        "all-day": 62,
        "America/New_York": 28,
        "Asia/Kolkata": 9,
        "Australia/Lord_Howe": 17,
        "Australia/Sydney": 10,
        "Europe/Berlin": 66,
        floating: 8,
      },
    });
    expect(fixture.overrides).toBe(29);
  });

  // Pinned, so an engine that is faster because it shows less can't pass the benchmark.
  test("pins the occurrences the year and the next year show", () => {
    expect(occurrencesByCategory(fixture.year)).toEqual({
      counts: {
        "bi-weekly": 902,
        birthday: 49,
        chore: 480,
        daily: 2_462,
        "monthly-day": 96,
        "monthly-weekday": 223,
        quarterly: 39,
        "stand-up": 2_449,
        weekly: 3_557,
      },
      issues: 0,
      total: 10_257,
    });
    expect(occurrencesByCategory(fixture.nextYear)).toEqual({
      counts: {
        "bi-weekly": 762,
        birthday: 49,
        chore: 417,
        daily: 2_373,
        "monthly-day": 72,
        "monthly-weekday": 204,
        quarterly: 40,
        "stand-up": 2_351,
        weekly: 3_401,
      },
      issues: 0,
      total: 9_669,
    });
  });

  test("is the same calendar for the same seed", () => {
    const describeEvents = ({ events }: RecurrenceFixture) =>
      events.map(
        (event) => `${event.id} ${String(event.start)} ${JSON.stringify(event.recurrence)}`,
      );

    expect(describeEvents(generateRecurrenceFixture())).toEqual(describeEvents(fixture));
    expect(describeEvents(generateRecurrenceFixture({ seed: 7 }))).not.toEqual(
      describeEvents(fixture),
    );
    // A smaller calendar is the larger one's first series.
    expect(describeEvents(small)).toEqual(
      describeEvents({ ...fixture, events: fixture.events.slice(0, small.events.length) }),
    );
  });

  test("gives the calendar only valid occurrences", () => {
    const { occurrences } = expandFixture(fixture, fixture.year);
    const snapshot = createEventSnapshot(
      occurrences,
      createOccurrenceAdapter(recurrenceAdapters.event),
    );

    expect(snapshot.issues).toEqual([]);
    expect(snapshot.size).toBe(occurrences.length);
  });

  test("shows the same next year from an expander that has shown this year", () => {
    const warm = createFixtureExpander();
    warm.expand(small.events, small.year);
    const ids = (range: RecurrenceFixture["year"], expander = createFixtureExpander()) =>
      expander.expand(small.events, range).occurrences.map(({ id }) => id);

    expect(ids(small.nextYear, warm)).toEqual(ids(small.nextYear));
  });
});

describe("recurrence benchmark protocol", () => {
  test("reports the small fixture's counts and every stage", () => {
    const report = runRecurrenceBenchmark(small, {
      mode: "smoke",
      stages: RECURRENCE_BENCHMARK_STAGES,
      suite: "small-recurrence",
    });

    expect(RECURRENCE_BENCHMARK_STAGES).toEqual([
      "expand-cold",
      "expand-warm",
      "occurrence-snapshot",
    ]);
    expect(report.fixture).toEqual({
      nextYearOccurrences: 1_375,
      occurrences: 1_373,
      overrides: 3,
      range: "2026-01-01/2027-01-01",
      seed: fixture.seed,
      series: 20,
      timeZone: "Europe/Berlin",
    });
    // The budget each stage carries, not whether this machine met it, so a busy runner can't flake.
    expect(
      report.stages.map(({ stage, status, thresholdP95Ms }) => [
        stage,
        status === "report-only" ? status : thresholdP95Ms,
      ]),
    ).toEqual([
      ["expand-cold", 50],
      ["expand-warm", 50],
      ["occurrence-snapshot", "report-only"],
    ]);
  });

  test("returns nonzero in gated mode when a threshold fails", () => {
    const report = runRecurrenceBenchmark(small, {
      mode: "smoke",
      stages: ["expand-cold", "expand-warm"],
      suite: "intentional-gate-failure",
      thresholdScale: -1,
    });

    expect(report.stages.map(({ status }) => status)).toEqual(["fail", "fail"]);
    expect(benchmarkExitCode(report, true)).toBe(1);
    expect(benchmarkExitCode(report, false)).toBe(0);
  });

  test("refuses a fixture with issues and stages it doesn't measure", () => {
    const [master] = small.events;
    const broken: RecurrenceFixtureEvent = {
      ...master!,
      recurrence: { rule: { frequency: "WEEKLY", interval: 0 } },
    };
    const options = { mode: "smoke", stages: ["expand-cold"], suite: "refused" } as const;

    expect(() => runRecurrenceBenchmark({ ...small, events: [broken] }, options)).toThrow(
      "recurrence-fixture-issue:invalid-rule:series-000",
    );
    expect(() => runRecurrenceBenchmark(small, { ...options, stages: ["build"] })).toThrow(
      "unsupported-benchmark-stage:refused:build",
    );
  });
});
