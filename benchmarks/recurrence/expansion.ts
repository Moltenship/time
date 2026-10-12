import { memoryUsage } from "node:process";

import { createEventSnapshot } from "@moltenship/calendar-core";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  type OccurrenceExpander,
  type OccurrenceExpansion,
  type OccurrenceRange,
} from "@moltenship/calendar-recurrence";

import type {
  BenchmarkReport,
  BenchmarkRunOptions,
  BenchmarkStageResult,
} from "../shared/contracts";
import {
  finishReport,
  garbageCollectionNote,
  measure,
  observableSink,
  stageResult,
  thresholdScaleOf,
  unsupportedStage,
} from "../shared/protocol";
import type { RecurrenceFixture, RecurrenceFixtureData, RecurrenceFixtureEvent } from "./fixture";

export interface RecurrenceFixtureSummary {
  /** Occurrences, shown overrides included, over the next year's load range. */
  readonly nextYearOccurrences: number;
  /** Occurrences, shown overrides included, over the year's load range. */
  readonly occurrences: number;
  readonly overrides: number;
  /** The year's load range, as `start/end`. */
  readonly range: string;
  readonly seed: number;
  readonly series: number;
  readonly timeZone: string;
}

type Expansion = OccurrenceExpansion<RecurrenceFixtureEvent, string>;

export const recurrenceAdapters = createCanonicalRecurrenceAdapter<RecurrenceFixtureData>();

export function createFixtureExpander(): OccurrenceExpander<RecurrenceFixtureEvent, string> {
  return createOccurrenceExpander(recurrenceAdapters);
}

/** What a new expander, as the year view's first paint has, shows over `range`. */
export function expandFixture(fixture: RecurrenceFixture, range: OccurrenceRange): Expansion {
  return createFixtureExpander().expand(fixture.events, range);
}

function rangeText({ range }: OccurrenceRange): string {
  return `${range.start.toString()}/${range.end.toString()}`;
}

function digest(expansion: Expansion): number {
  return expansion.occurrences.length ^ expansion.issues.length;
}

/**
 * Times the year view's recurrence work with `createOccurrenceExpander` from the production bundle.
 * The fixture must expand without issues, so every series measured is one the calendar shows.
 */
export function runRecurrenceBenchmark(
  fixture: RecurrenceFixture,
  options: BenchmarkRunOptions,
): BenchmarkReport<RecurrenceFixtureSummary> {
  const thresholdScale = thresholdScaleOf(options);
  const before = memoryUsage();
  const { events, nextYear, year } = fixture;
  const shown = expandFixture(fixture, year);
  const nextShown = expandFixture(fixture, nextYear);
  const issue = shown.issues[0] ?? nextShown.issues[0];
  if (issue !== undefined) {
    throw new Error(`recurrence-fixture-issue:${issue.code}:${String(issue.eventId)}`);
  }

  const results: BenchmarkStageResult[] = [];
  const measureOptions = {
    collectGarbageBetweenSamples: options.collectGarbageBetweenSamples,
    mode: options.mode,
  };
  let warm: OccurrenceExpander<RecurrenceFixtureEvent, string> | undefined;
  for (const stage of options.stages) {
    const statistics =
      stage === "expand-cold"
        ? measure(() => digest(createFixtureExpander().expand(events, year)), measureOptions)
        : stage === "expand-warm"
          ? measure(() => digest(warm!.expand(events, nextYear)), {
              ...measureOptions,
              // The expander has just shown the year, as when the year view navigates forward.
              prepare: () => {
                warm = createFixtureExpander();
                warm.expand(events, year);
              },
            })
          : stage === "occurrence-snapshot"
            ? measure(
                () =>
                  createEventSnapshot(
                    shown.occurrences,
                    createOccurrenceAdapter(recurrenceAdapters.event),
                  ).size,
                measureOptions,
              )
            : unsupportedStage(stage, options.suite);
    results.push(stageResult(stage, statistics, thresholdScale));
  }

  return finishReport(
    {
      engine: "calendar-recurrence-expander",
      fixture: {
        nextYearOccurrences: nextShown.occurrences.length,
        occurrences: shown.occurrences.length,
        overrides: fixture.overrides,
        range: rangeText(year),
        seed: fixture.seed,
        series: fixture.series,
        timeZone: year.timeZone,
      },
      mode: options.mode,
      notes: [
        "Expand-cold expands every series over the year view's load range with a new expander, as its first paint does.",
        "Expand-warm asks an expander that has just shown the year for the next one, as navigating forward does; the same range again returns the memoized result.",
        "Occurrence-snapshot builds core's event snapshot of the year's occurrences through createOccurrenceAdapter.",
        `Next year's load range: ${rangeText(nextYear)}.`,
        garbageCollectionNote(options),
        `Observable sink: ${observableSink() ^ shown.occurrences.length}`,
      ],
      stages: results,
      suite: options.suite,
    },
    before,
  );
}
