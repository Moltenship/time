import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import {
  buildEvent,
  buildResource,
  cleanup,
  createTestEnvironment,
  renderCalendar,
} from "@moltenship/calendar-testing";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { server } from "vite-plus/test/browser";

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
  { readOnly = false }: { readonly readOnly?: boolean } = {},
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
    events: [review],
    resources: team,
    view,
    readOnly,
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

  test("a read-only calendar takes no drag", async () => {
    const calendar = await renderView("week", { readOnly: true });

    await calendar.pointer.drag(calendar.getEvent("Review"), calendar.getTimeColumn("2026-10-09"));
    await calendar.settled();

    expect(calendar.changes).toEqual([]);
    expect(calendar.placementOf("Review").range).toBe("2026-10-08T10:00:00Z/2026-10-08T11:00:00Z");
  });
});
