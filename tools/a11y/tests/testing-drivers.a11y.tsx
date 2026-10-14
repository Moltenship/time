import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import {
  buildAllDayEvent,
  buildEvent,
  buildResource,
  cleanup,
  createTestEnvironment,
  renderCalendar,
} from "@moltenship/calendar-testing";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { page, server } from "vite-plus/test/browser";

import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

// @moltenship/calendar-testing's drivers on the registry's views in a real browser, as an app's
// browser-mode tests would use them: pointer and touch, which need layout, and the keyboard.

type Meeting = CalendarEvent<null>;

const Calendar = createCalendar<Meeting, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null>(),
  views: [
    createWeekView<Meeting>(),
    createMonthView<Meeting>(),
    createResourceColumnsView<Meeting>(),
  ],
});

const environment = createTestEnvironment({ now: "2026-10-08T08:30:00Z" });
const review = buildEvent({
  resourceIds: ["Ada"],
  start: "2026-10-08T10:00:00Z",
  title: "Review",
});
const team = [buildResource({ title: "Ada" }), buildResource({ title: "Ben" })];

function Providers({ children }: { readonly children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

afterEach(cleanup);

function renderView(
  view: "week" | "month" | "resources",
  {
    events = [review],
    readOnly = false,
  }: { readonly events?: readonly Meeting[]; readonly readOnly?: boolean } = {},
) {
  return renderCalendar(Calendar, {
    children: (
      <Calendar.Frame className="flex h-dvh flex-col">
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    ),
    environment,
    events,
    readOnly,
    resources: team,
    view,
    wrapper: Providers,
  });
}

describe(`calendar-testing's drivers in ${server.browser}`, () => {
  test("a mouse moves an event to another day and time", async () => {
    const calendar = await renderView("week");

    await calendar.pointer.moveEvent("Review", { date: "2026-10-09", time: "11:00" });
    await calendar.settled();

    expect(calendar.changes.map(({ cause }) => cause)).toEqual(["move"]);
    expect(calendar.placementOf("Review").range).toBe("2026-10-09T11:00:00Z/2026-10-09T12:00:00Z");
    expect(calendar.results[0]?.detail.input).toBe("pointer");
  });

  test("a mouse drags an event's end handle to a later time", async () => {
    const calendar = await renderView("week");

    await calendar.pointer.resizeEvent("Review", { date: "2026-10-08", time: "11:30" });
    await calendar.settled();

    expect(calendar.changes[0]?.cause).toBe("resize-end");
    expect(calendar.placementOf("Review").range).toBe("2026-10-08T10:00:00Z/2026-10-08T11:30:00Z");
  });

  test("a mouse drags across empty slots to create an event", async () => {
    const calendar = await renderView("week");

    await calendar.pointer.createEvent(
      { date: "2026-10-08", time: "14:00" },
      { date: "2026-10-08", time: "14:45" },
    );
    await calendar.settled();

    expect(calendar.changes[0]?.cause).toBe("create");
    expect(calendar.placementOf("new-1").range).toBe("2026-10-08T14:00:00Z/2026-10-08T15:00:00Z");
  });

  test("a finger long-presses an event and moves it", async () => {
    const calendar = await renderView("week");

    await calendar.pointer.moveEvent(
      "Review",
      { date: "2026-10-08", time: "12:00" },
      { pointerType: "touch" },
    );
    await calendar.settled();

    expect(calendar.placementOf("Review").range).toBe("2026-10-08T12:00:00Z/2026-10-08T13:00:00Z");
  });

  test("in a month, an event moves by whole days and keeps its time", async () => {
    const calendar = await renderView("month");

    await calendar.pointer.moveEvent("Review", { date: "2026-10-13" });
    await calendar.settled();

    expect(calendar.placementOf("Review").range).toBe("2026-10-13T10:00:00Z/2026-10-13T11:00:00Z");
  });

  test("in resource columns, an event moves to another resource", async () => {
    const calendar = await renderView("resources");

    expect(calendar.getResource({ title: "Ben" }).getAttribute("data-resource-id")).toBe("Ben");
    await calendar.pointer.moveEvent("Review", {
      date: "2026-10-08",
      resourceId: "Ben",
      time: "10:00",
    });
    await calendar.settled();

    expect(calendar.placementOf("Review")).toMatchObject({
      range: "2026-10-08T10:00:00Z/2026-10-08T11:00:00Z",
      resourceIds: ["Ben"],
    });
  });

  test("the keyboard driver grabs, steps and drops in a browser too", async () => {
    const calendar = await renderView("week");

    await calendar.keyboard.moveEvent("Review", { across: 1, down: 4 });
    await calendar.settled();

    expect(calendar.placementOf("Review").range).toBe("2026-10-09T11:00:00Z/2026-10-09T12:00:00Z");
    expect(calendar.results[0]?.detail.input).toBe("keyboard");
  });

  test("without a time, a mouse moves an event by whole days and keeps its time", async () => {
    const calendar = await renderView("week");

    await calendar.pointer.moveEvent("Review", { date: "2026-10-10" });
    await calendar.settled();

    expect(calendar.placementOf("Review").range).toBe("2026-10-10T10:00:00Z/2026-10-10T11:00:00Z");
  });

  test("a mouse drags an event's start handle to an earlier time", async () => {
    const calendar = await renderView("week");

    await calendar.pointer.resizeEvent("Review", {
      date: "2026-10-08",
      edge: "start",
      time: "09:15",
    });
    await calendar.settled();

    expect(calendar.changes[0]?.cause).toBe("resize-start");
    expect(calendar.placementOf("Review").range).toBe("2026-10-08T09:15:00Z/2026-10-08T11:00:00Z");
  });

  test("an overnight event's end handle is on its last day, and the end moves there", async () => {
    const late = buildEvent({
      end: "2026-10-09T02:00:00Z",
      start: "2026-10-08T22:00:00Z",
      title: "Late",
    });
    const calendar = await renderView("week", { events: [late] });

    await calendar.pointer.resizeEvent("Late", { date: "2026-10-09", time: "03:00" });
    await calendar.settled();

    expect(calendar.placementOf("Late").range).toBe("2026-10-08T22:00:00Z/2026-10-09T03:00:00Z");
  });

  test("an all-day event dropped on a slot starts there", async () => {
    const trip = buildAllDayEvent({ start: "2026-10-08", title: "Trip" });
    const calendar = await renderView("week", { events: [trip] });

    await calendar.pointer.moveEvent("Trip", { date: "2026-10-09", time: "14:00" });
    await calendar.settled();

    expect(calendar.placementOf("Trip")).toMatchObject({
      kind: "timed",
      start: "2026-10-09T14:00:00Z",
    });
  });

  test("in resource columns, a move without a resource stays in the event's", async () => {
    const calendar = await renderView("resources", {
      events: [buildEvent({ resourceIds: ["Ben"], start: "2026-10-08T10:00:00Z", title: "Sync" })],
    });

    await calendar.pointer.moveEvent("Sync", { date: "2026-10-08", time: "12:00" });
    await calendar.settled();

    expect(calendar.placementOf("Sync")).toMatchObject({
      range: "2026-10-08T12:00:00Z/2026-10-08T13:00:00Z",
      resourceIds: ["Ben"],
    });
  });

  test("a move that would take the press past midnight presses near the start instead", async () => {
    const long = buildEvent({
      duration: { hours: 2 },
      start: "2026-10-08T09:00:00Z",
      title: "Long",
    });
    // Tall enough for the whole day, so 09:00 and 23:00 are both on screen.
    await page.viewport(1280, 2400);
    try {
      const calendar = await renderView("week", { events: [long] });

      await calendar.pointer.moveEvent("Long", { date: "2026-10-08", time: "23:00" });
      await calendar.settled();

      expect(calendar.placementOf("Long").range).toBe("2026-10-08T23:00:00Z/2026-10-09T01:00:00Z");
    } finally {
      await page.viewport(1280, 800);
    }
  });

  test("a time in a month, or a resize without one in a week, says what's wrong", async () => {
    const month = await renderView("month");
    await expect(
      month.pointer.moveEvent("Review", { date: "2026-10-14", time: "15:00" }),
    ).rejects.toThrow(/no times to drop on/);
    await month.unmount();

    const week = await renderView("week");
    await expect(week.pointer.resizeEvent("Review", { date: "2026-10-09" })).rejects.toThrow(
      /resizes by time/,
    );
  });

  test("a drag moves an event in an editable calendar and nothing in a read-only one", async () => {
    for (const readOnly of [false, true]) {
      const calendar = await renderView("week", { readOnly });

      await calendar.pointer.drag(
        calendar.getEvent("Review"),
        calendar.getTimeColumn("2026-10-09"),
      );
      await calendar.settled();

      expect(calendar.changes.length).toBe(readOnly ? 0 : 1);
      await calendar.unmount();
    }
  });
});
