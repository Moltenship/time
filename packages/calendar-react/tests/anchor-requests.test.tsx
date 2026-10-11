// @vitest-environment jsdom

import { defineEventAdapter } from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { act } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useAnchorDateRequests,
  type CalendarSemanticActions,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

interface Shift {
  readonly id: string;
}

const dayView = defineCalendarView({
  name: "day",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: () => null,
  },
  Renderer: () => null,
});

const pairView = defineCalendarView({
  name: "pair",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 2 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: 2 * delta }),
    project: () => null,
  },
  Renderer: () => null,
});

const Calendar = createCalendar<Shift>()({
  eventAdapter: defineEventAdapter<Shift>()({
    getId: (shift) => shift.id,
    getInterval: () => ({
      end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    }),
    getResourceIds: () => [],
    getTitle: (shift) => shift.id,
  }),
  views: [dayView, pairView],
});

const harnesses: ReactRootHarness[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
});

const date = (value: string) => Temporal.PlainDate.from(value);

/** A controlled anchor whose owner never takes a change: it defers or declines them all. */
async function holdAnchor() {
  const changes = vi.fn<(next: Temporal.PlainDate) => void>();
  const requests: string[] = [];
  let actions: CalendarSemanticActions | undefined;
  function Probe() {
    actions = Calendar.useCalendarActions() as unknown as CalendarSemanticActions;
    useAnchorDateRequests((requested, range) =>
      requests.push(`${requested.toString()} ${range?.start.toString()}–${range?.end.toString()}`),
    );
    return null;
  }
  harnesses.push(
    await renderWithHarness(
      <Calendar.Root
        anchorDate={date("2026-08-15")}
        defaultTimeZone="UTC"
        events={[]}
        locale="en-GB"
        onAnchorDateChange={changes}
        weekRules={gateWeekRules}
      >
        <Probe />
      </Calendar.Root>,
    ),
  );
  // Each command in its own task, as separate clicks are.
  const run = async (command: () => void) => {
    await act(async () => command());
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { actions: () => actions!, changes, requests, run };
}

test("an owner holding a change it was told about hears when its own value is asked for again", async () => {
  const { actions, changes, run } = await holdAnchor();

  await run(() => actions().setAnchorDate(date("2026-08-16")));
  expect(changes.mock.calls.map(([next]) => next.toString())).toEqual(["2026-08-16"]);

  // Today, say: the anchor it asks for is the one the owner still has.
  await run(() => actions().setAnchorDate(date("2026-08-15")));
  expect(changes.mock.calls.map(([next]) => next.toString())).toEqual(["2026-08-16", "2026-08-15"]);

  // Once the owner has heard it, asking again changes nothing.
  await run(() => actions().setAnchorDate(date("2026-08-15")));
  expect(changes).toHaveBeenCalledTimes(2);
});

test("anchor date requests reach views, even for the date the calendar already has", async () => {
  const { actions, requests, run } = await holdAnchor();

  await run(() => actions().setAnchorDate(date("2026-08-15")));
  await run(() => actions().navigateNext());

  // Each with the dates the active view shows for it.
  expect(requests).toEqual([
    "2026-08-15 2026-08-15–2026-08-16",
    "2026-08-16 2026-08-16–2026-08-17",
  ]);
});

test("a request's range is the view on screen's, even beside a change of view its owner hasn't taken", async () => {
  const requests: string[] = [];
  let actions: CalendarSemanticActions | undefined;
  function Probe() {
    actions = Calendar.useCalendarActions() as unknown as CalendarSemanticActions;
    useAnchorDateRequests((requested, range) =>
      requests.push(`${requested.toString()} ${range?.start.toString()}–${range?.end.toString()}`),
    );
    return null;
  }
  harnesses.push(
    await renderWithHarness(
      <Calendar.Root
        defaultAnchorDate={date("2026-08-15")}
        defaultTimeZone="UTC"
        events={[]}
        locale="en-GB"
        onViewChange={() => {}}
        view="day"
        weekRules={gateWeekRules}
      >
        <Probe />
      </Calendar.Root>,
    ),
  );

  // Opening a date in another view, in one handler, as a view's day header does.
  await act(async () => {
    actions!.setView("pair");
    actions!.setAnchorDate(date("2026-08-20"));
  });

  expect(requests).toEqual(["2026-08-20 2026-08-20–2026-08-21"]);
});
