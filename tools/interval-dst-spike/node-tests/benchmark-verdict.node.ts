import assert from "node:assert/strict";
import test from "node:test";

import { candidateSurvivesBenchmark, TREE_BUILD_P95_LIMIT_MS } from "../src/benchmark-verdict";

const passingQueries = {
  "1d": { scanP95: 0.2, treeP95: 0.05 },
  "7d": { scanP95: 0.3, treeP95: 0.08 },
} as const;

void test("retains a correct candidate that satisfies build and query gates", () => {
  assert.equal(
    candidateSurvivesBenchmark({
      referenceAgreement: true,
      treeBuildP95: TREE_BUILD_P95_LIMIT_MS - 0.001,
      queries: passingQueries,
    }),
    true,
  );
});

void test("rejects a candidate when tree build p95 reaches the 25 ms gate", () => {
  assert.equal(
    candidateSurvivesBenchmark({
      referenceAgreement: true,
      treeBuildP95: TREE_BUILD_P95_LIMIT_MS,
      queries: passingQueries,
    }),
    false,
  );
});

void test("rejects a candidate when tree build p95 exceeds the 25 ms gate", () => {
  assert.equal(
    candidateSurvivesBenchmark({
      referenceAgreement: true,
      treeBuildP95: TREE_BUILD_P95_LIMIT_MS + 2.6995,
      queries: passingQueries,
    }),
    false,
  );
});
