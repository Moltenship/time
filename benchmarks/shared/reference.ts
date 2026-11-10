import type { BenchmarkEngine, BenchmarkQuery } from "./contracts";
import type { BenchmarkFixtureSet, FixtureEvent } from "./fixtures";

export type ReferenceSnapshot = readonly FixtureEvent[];

/** Every event that overlaps the query, found by scanning them all. */
function queryReference(snapshot: ReferenceSnapshot, query: BenchmarkQuery): readonly string[] {
  const ids: string[] = [];

  for (const event of snapshot) {
    if (event.data.startUnit < query.endUnit && event.data.endUnit > query.startUnit) {
      ids.push(event.id);
    }
  }

  return ids;
}

/** The scan the indexed snapshot's queries must agree with, and beat. */
export const referenceEngine: BenchmarkEngine<ReferenceSnapshot> = Object.freeze({
  name: "simple-reference",
  build: ({ events }: BenchmarkFixtureSet) => events,
  query: queryReference,
});
