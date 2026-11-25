import { expect, test } from "vite-plus/test";

import { mondays, startsOf } from "../content/examples/recurrence-first";

test("the overview's example lists three Mondays at 09:00 in Berlin", () => {
  // Berlin goes back to winter time on October 25, so the instant moves and the wall time stays.
  expect(mondays).toEqual(["2026-10-19T07:00:00Z", "2026-10-26T08:00:00Z", "2026-11-02T08:00:00Z"]);
});

test("text that is no rule gives no starts", () => {
  expect(
    startsOf(Temporal.ZonedDateTime.from("2026-10-19T09:00[Europe/Berlin]"), "INTERVAL=2"),
  ).toEqual([]);
});
