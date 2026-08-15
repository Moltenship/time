import { isDirectExecution, runBenchmarkCli } from "./shared/cli";
import { ALL_BENCHMARK_STAGES } from "./shared/protocol";

export function runCompleteBenchmarkCli(arguments_: readonly string[]): number {
  return runBenchmarkCli(arguments_, ALL_BENCHMARK_STAGES, "complete-reference");
}

if (isDirectExecution(import.meta.url)) {
  process.exitCode = runCompleteBenchmarkCli(process.argv.slice(2));
}
