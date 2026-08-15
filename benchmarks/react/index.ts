import { isDirectExecution, runBenchmarkCli } from "../shared/cli";
import { REACT_BENCHMARK_STAGES } from "../shared/protocol";

export function runReactBenchmarkCli(arguments_: readonly string[]): number {
  return runBenchmarkCli(arguments_, REACT_BENCHMARK_STAGES, "react-reference");
}

if (isDirectExecution(import.meta.url)) {
  process.exitCode = runReactBenchmarkCli(process.argv.slice(2));
}
