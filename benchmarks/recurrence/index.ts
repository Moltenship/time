import { formatSuiteReport, isDirectExecution, runSuiteCli } from "../shared/cli";
import type { BenchmarkReport } from "../shared/contracts";
import { RECURRENCE_BENCHMARK_STAGES } from "../shared/protocol";
import { runRecurrenceBenchmark, type RecurrenceFixtureSummary } from "./expansion";
import { generateRecurrenceFixture } from "./fixture";

export { runRecurrenceBenchmark } from "./expansion";
export type { RecurrenceFixtureSummary } from "./expansion";
export { generateRecurrenceFixture, yearViewLoadRange } from "./fixture";
export type { RecurrenceFixture, RecurrenceFixtureOptions } from "./fixture";

export function formatRecurrenceReport(report: BenchmarkReport<RecurrenceFixtureSummary>): string {
  const { fixture } = report;
  return formatSuiteReport(
    report,
    `seed=${fixture.seed} series=${fixture.series} overrides=${fixture.overrides} occurrences=${fixture.occurrences} next-year=${fixture.nextYearOccurrences} range=${fixture.range} zone=${fixture.timeZone}`,
  );
}

export function runRecurrenceBenchmarkCli(arguments_: readonly string[]): number {
  return runSuiteCli(
    arguments_,
    (options) =>
      runRecurrenceBenchmark(generateRecurrenceFixture(), {
        collectGarbageBetweenSamples: options.gated,
        mode: options.mode,
        stages: RECURRENCE_BENCHMARK_STAGES,
        suite: "recurrence-year-view",
        thresholdScale: options.thresholdScale,
      }),
    formatRecurrenceReport,
  );
}

if (isDirectExecution(import.meta.url)) {
  process.exitCode = runRecurrenceBenchmarkCli(process.argv.slice(2));
}
