import { isDirectExecution, runBenchmarkCli } from "../shared/cli.ts";
import { CORE_BENCHMARK_STAGES } from "../shared/protocol.ts";
import { indexedSnapshotEngine } from "./indexed-snapshot.ts";

export { compareCandidateToReference, runBenchmark } from "../shared/protocol.ts";
export { referenceEngine } from "../shared/reference.ts";
export { indexedSnapshotEngine } from "./indexed-snapshot.ts";
export type {
  BenchmarkComparison,
  BenchmarkEngine,
  BenchmarkReport,
  BenchmarkRunOptions,
  BenchmarkStage,
} from "../shared/contracts.ts";

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
