// @vitest-environment jsdom

import { createCalendar, createCanonicalEventAdapter } from "@moltenship/calendar";
import {
  cleanup,
  denseDayFixture,
  dstWeekFixture,
  renderCalendar,
  resourceDayFixture,
  type FixtureEvent,
  type FixtureResource,
} from "@moltenship/calendar-testing";
import { afterEach, expect, test } from "vite-plus/test";

import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";
import { createWeekView } from "../time-grid-view/time-grid-view";

// The harness's fixtures as contract tests of the registry's views: each dataset renders in the
// view it's for, and the calendar shows every event it should.

const Calendar = createCalendar<FixtureEvent, FixtureResource>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly group: string }>(),
  views: [createWeekView<FixtureEvent>(), createResourceColumnsView<FixtureEvent>()],
});

afterEach(cleanup);

test("the week view shows every timed event of the dense day, and no diagnostics", async () => {
  const fixture = denseDayFixture();
  const calendar = await renderCalendar(Calendar, { ...fixture, view: "week" });

  for (const event of fixture.events.filter(({ kind }) => kind === "timed")) {
    expect(calendar.queryEvent(event.id), event.id).not.toBeNull();
  }
  expect(calendar.diagnostics).toEqual([]);
  // The overnight event shows on both days it covers; one that ends at midnight, on one.
  expect(calendar.getAllEvents("n1")).toHaveLength(2);
  expect(calendar.getAllEvents("e1")).toHaveLength(1);
});

test("in the fall DST week, the 09:00 standups stay at 09:00 and the changing hour shows", async () => {
  const fixture = dstWeekFixture();
  const calendar = await renderCalendar(Calendar, { ...fixture, view: "week" });

  expect(calendar.placementOf("d7").wallRange).toBe("2026-11-01T09:00/2026-11-01T09:30");
  expect(calendar.placementOf("d1").wallRange).toBe("2026-10-26T09:00/2026-10-26T09:30");
  expect(calendar.getTimeColumn("2026-11-01").contains(calendar.getEvent("t1"))).toBe(true);
  // The first 01:30, to 01:00 when the clocks go back.
  expect(calendar.placementOf("t1").wallRange).toBe("2026-11-01T01:30/2026-11-01T01:00");
  expect(calendar.diagnostics).toEqual([]);
});

test("the spring DST week's moves keep the wall clock across the change", async () => {
  const fixture = dstWeekFixture({ change: "spring" });
  const calendar = await renderCalendar(Calendar, { ...fixture, view: "week" });

  // Saturday's 09:00 standup a day on is Sunday's 09:00, an hour less in UTC.
  await calendar.keyboard.moveEvent("d6", { across: 1 });
  await calendar.settled();

  expect(calendar.placementOf("d6").wallRange).toBe("2026-03-08T09:00/2026-03-08T09:30");
  expect(calendar.placementOf("d6").start).toBe("2026-03-08T13:00:00Z");
});

test("resource columns show a meeting in each of its resources, rooms under their parent too", async () => {
  // The fixture opens the rooms' parent, so the rooms show.
  const calendar = await renderCalendar(Calendar, { ...resourceDayFixture(), view: "resources" });
  const resourcesOf = (id: string) =>
    calendar
      .getAllEvents(id)
      .map((element) => element.closest("[data-resource-id]")?.getAttribute("data-resource-id"));

  for (const title of ["Ana", "Ben", "Chen"]) {
    expect(calendar.getResource({ title }).getAttribute("data-resource-id")).toBe(
      title.toLowerCase(),
    );
  }
  expect(resourcesOf("meet-1")).toEqual(["ana", "orchid"]);
  expect(resourcesOf("meet-2")).toEqual(["ben", "chen", "lotus"]);
  // The view leaves out the unassigned column unless it's asked for.
  expect(calendar.queryEvent("open-1")).toBeNull();
  expect(calendar.diagnostics).toEqual([]);
});
