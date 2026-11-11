import { runSuiteCli } from "../shared/cli";
import { generateBenchmarkFixtures } from "../shared/fixtures";
import { CORE_BENCHMARK_STAGES, runBenchmark } from "../shared/protocol";
import { indexedSnapshotEngine } from "./indexed-snapshot";

process.exitCode = runSuiteCli(
  (options) =>
    runBenchmark(indexedSnapshotEngine, generateBenchmarkFixtures(), {
      collectGarbageBetweenSamples: options.gated,
      mode: options.mode,
      stages: CORE_BENCHMARK_STAGES,
      suite: "core-indexed-snapshot",
      thresholdScale: options.thresholdScale,
    }),
  (fixture) => `seed=${fixture.seed} events=${fixture.events}`,
);
