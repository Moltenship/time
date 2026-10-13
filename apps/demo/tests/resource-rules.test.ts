import { expect, test } from "vite-plus/test";

import { demoResourceConflictMode, demoResourceOverlapLayout } from "../src/resource-rules";
import { demoResources } from "../src/resources";

test("rooms stack and block double booking, people sit side by side and warn, teams keep the view's", () => {
  const rules = Object.groupBy(demoResources, ({ data }) => data.kind);

  for (const room of rules.room ?? []) {
    expect([demoResourceOverlapLayout(room), demoResourceConflictMode(room.id)]).toEqual([
      "stack",
      "block",
    ]);
  }
  for (const person of rules.person ?? []) {
    expect([demoResourceOverlapLayout(person), demoResourceConflictMode(person.id)]).toEqual([
      "columns",
      "warn",
    ]);
  }
  for (const team of rules.team ?? []) {
    expect([demoResourceOverlapLayout(team), demoResourceConflictMode(team.id)]).toEqual([
      undefined,
      undefined,
    ]);
  }
  expect([rules.room?.length, rules.person?.length, rules.team?.length]).toEqual([8, 20, 3]);
});
