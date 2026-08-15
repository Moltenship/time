import { isDirectExecution, runBenchmarkCli } from "../shared/cli";
import { CORE_BENCHMARK_STAGES } from "../shared/protocol";
import { indexedSnapshotEngine } from "./indexed-snapshot";

export { compareCandidateToReference, runBenchmark } from "../shared/protocol";
export { referenceEngine } from "../shared/reference";
export { indexedSnapshotEngine } from "./indexed-snapshot";
export type {
  BenchmarkComparison,
  BenchmarkEngine,
  BenchmarkReport,
  BenchmarkRunOptions,
  BenchmarkStage,
} from "../shared/contracts";

export function runCoreBenchmarkCli(arguments_: readonly string[]): number {
  return runBenchmarkCli(
    arguments_,
    CORE_BENCHMARK_STAGES,
    "core-indexed-snapshot",
    indexedSnapshotEngine,
  );
}

if (isDirectExecution(import.meta.url)) {
  process.exitCode = runCoreBenchmarkCli(process.argv.slice(2));
}
