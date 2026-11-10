import { runSuiteCli } from "../shared/cli";
import { RECURRENCE_BENCHMARK_STAGES } from "../shared/protocol";
import { runRecurrenceBenchmark } from "./expansion";
import { generateRecurrenceFixture } from "./fixture";

process.exitCode = runSuiteCli(
  (options) =>
    runRecurrenceBenchmark(generateRecurrenceFixture(), {
      collectGarbageBetweenSamples: options.gated,
      mode: options.mode,
      stages: RECURRENCE_BENCHMARK_STAGES,
      suite: "recurrence-year-view",
      thresholdScale: options.thresholdScale,
    }),
  (fixture) =>
    `seed=${fixture.seed} series=${fixture.series} overrides=${fixture.overrides} occurrences=${fixture.occurrences} next-year=${fixture.nextYearOccurrences} range=${fixture.range} zone=${fixture.timeZone}`,
);
