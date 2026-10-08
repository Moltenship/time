// @vitest-environment jsdom

import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import { useNow } from "@moltenship/calendar-react";

import {
  createTestCalendarClock,
  gateAnchorDate,
  gateEvents,
  gateTimeZone,
  gateWeekRules,
} from "./harness/builders";
import { GateCalendar } from "./harness/custom-view-fixture";
import { hydrateWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
});

function NowProbe({ intervalMs }: { readonly intervalMs?: number }) {
  return <time data-now>{useNow({ intervalMs })?.toString() ?? "pending"}</time>;
}

test("useNow is null on the server, then ticks from the calendar clock after hydration", async () => {
  const clock = createTestCalendarClock(Temporal.Instant.from("2026-08-15T08:30:00Z"));
  const harness = await hydrateWithHarness(
    <GateCalendar.Root
      clock={clock}
      defaultAnchorDate={gateAnchorDate}
      defaultTimeZone={gateTimeZone}
      events={gateEvents}
      locale="en-GB"
      weekRules={gateWeekRules}
    >
      <NowProbe intervalMs={10} />
    </GateCalendar.Root>,
  );
  harnesses.push(harness);

  expect(harness.serverMarkup).toContain("pending");
  expect(harness.recoverableErrors).toEqual([]);
  expect(harness.container.querySelector("[data-now]")?.textContent).toBe("2026-08-15T08:30:00Z");

  clock.set(Temporal.Instant.from("2026-08-15T08:30:01Z"));
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(harness.container.querySelector("[data-now]")?.textContent).toBe("2026-08-15T08:30:01Z");
});

test("a fixed now is rendered on the server and outside a root falls back to the system clock", async () => {
  const fixed = await hydrateWithHarness(
    <GateCalendar.Root
      defaultAnchorDate={gateAnchorDate}
      defaultTimeZone={gateTimeZone}
      events={gateEvents}
      locale="en-GB"
      now={Temporal.Instant.from("2026-08-15T08:30:00Z")}
      weekRules={gateWeekRules}
    >
      <NowProbe />
    </GateCalendar.Root>,
  );
  const standalone = await hydrateWithHarness(<NowProbe />);
  harnesses.push(fixed, standalone);

  expect(fixed.serverMarkup).toContain("2026-08-15T08:30:00Z");
  expect(fixed.hydratedWithoutMutation).toBe(true);
  expect(standalone.serverMarkup).toContain("pending");
  expect(standalone.container.querySelector("[data-now]")?.textContent).not.toBe("pending");
});
