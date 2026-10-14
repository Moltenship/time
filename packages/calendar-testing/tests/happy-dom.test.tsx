// @vitest-environment happy-dom

import { afterEach, expect, test } from "vite-plus/test";

import { buildEvent, cleanup, renderCalendar } from "../src/index";
import { Calendar } from "./list-view";

afterEach(cleanup);

test("the harness renders and saves changes in happy-dom too", async () => {
  const calendar = await renderCalendar(Calendar, {
    events: [buildEvent({ start: "2026-10-08T09:00:00Z", title: "Standup" })],
  });

  await calendar.propose({
    cause: "move",
    eventId: "Standup",
    proposed: {
      end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
    },
  });

  expect(calendar.container.querySelector("[data-event-id]")?.textContent).toBe(
    "Standup 2026-10-08T10:00:00Z",
  );
  expect(calendar.results.map(({ result }) => result.status)).toEqual(["committed"]);
});
