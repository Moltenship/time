// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar";
import {
  buildAllDayEvent,
  buildEvent,
  buildResource,
  cleanup,
  createTestEnvironment,
  renderCalendar,
} from "@moltenship/calendar-testing";
import { afterEach, expect, test } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createMonthView } from "../month-view/month-view";
import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";
import { createWeekView } from "../time-grid-view/time-grid-view";

// @moltenship/calendar-testing on the registry's month, week and resource columns views in jsdom:
// its queries and keyboard driver, as an app's tests would use them on its copies of the views.

type Meeting = CalendarEvent<null>;

const Calendar = createCalendar<Meeting, ReturnType<typeof buildResource>>()({
  eventAdapter: createCanonicalEventAdapter<null>(),
  views: [
    createMonthView<Meeting>(),
    createWeekView<Meeting>(),
    createResourceColumnsView<Meeting>(),
  ],
});

const environment = createTestEnvironment();
const standup = buildEvent({ resourceIds: ["Ana"], start: "2026-10-08T09:00Z", title: "Standup" });
const trip = buildAllDayEvent({ days: 3, start: "2026-10-06", title: "Trip" });
const team = [buildResource({ title: "Ana" }), buildResource({ title: "Ben" })];

afterEach(cleanup);

function renderView(view: "month" | "week" | "resources", direction: "ltr" | "rtl" = "ltr") {
  return renderCalendar(Calendar, {
    environment: createTestEnvironment({ direction }),
    events: [standup, trip],
    messages: calendarAnnouncements,
    resources: team,
    view,
  });
}

test("queries find a multi-day event's part on each day, and the cells under them", async () => {
  const calendar = await renderView("week");

  expect(calendar.getAllEvents("Trip").length).toBeGreaterThan(0);
  expect(calendar.getDayCell("2026-10-07").hasAttribute("data-all-day")).toBe(true);
  expect(calendar.getTimeColumn("2026-10-08").hasAttribute("data-all-day")).toBe(false);
  expect(calendar.getTimeColumn("2026-10-08").contains(calendar.getEvent("Standup"))).toBe(true);
  expect(calendar.placementOf("Trip").range).toBe("2026-10-06/2026-10-09");
});

test("in a month, Space, arrows and Enter move an event by days and weeks", async () => {
  const calendar = await renderView("month");

  // A week down, then a day across: from Thursday the 8th to Friday the 16th.
  await calendar.keyboard.moveEvent("Standup", { across: 1, down: 1 });
  await calendar.settled();

  expect(calendar.placementOf("Standup").range).toBe("2026-10-16T09:00:00Z/2026-10-16T10:00:00Z");
  expect(calendar.announcements()[0]).toMatch(/^Picked up Standup/);
  expect(calendar.lastAnnouncement()).toMatch(/^Moved Standup to Friday, October 16/);
});

test("in a month, Space on a day creates an all-day event that arrows extend", async () => {
  const calendar = await renderView("month");

  await calendar.keyboard.createEvent({ date: "2026-10-20" }, { across: 2 });
  await calendar.settled();

  expect(calendar.changes[0]?.cause).toBe("create");
  expect(calendar.placementOf("new-1").range).toBe("2026-10-20/2026-10-23");
});

test("in a month, Shift+Space resizes the end by days, and Escape cancels a grab", async () => {
  const calendar = await renderView("month");

  await calendar.keyboard.resizeEvent("Trip", { across: 1 });
  await calendar.keyboard.focusEvent("Standup");
  await calendar.keyboard.grab();
  await calendar.keyboard.step({ across: 2 });
  await calendar.keyboard.cancel();
  await calendar.settled();

  expect(calendar.changes.map(({ cause }) => cause)).toEqual(["resize-end"]);
  expect(calendar.placementOf("Trip").range).toBe("2026-10-06/2026-10-10");
  expect(calendar.placementOf("Standup").range).toBe("2026-10-08T09:00:00Z/2026-10-08T10:00:00Z");
});

test("in resource columns, a step across moves an event to the next resource", async () => {
  const calendar = await renderView("resources");

  expect(calendar.getResource({ title: "Ben" }).getAttribute("data-resource-id")).toBe("Ben");
  await calendar.keyboard.focusCell({ date: "2026-10-08", resourceId: "Ben", time: "10:00" });
  expect(calendar.state().focus).toMatchObject({ kind: "slot", resourceId: "Ben" });
  await calendar.keyboard.moveEvent("Standup", { across: 1, down: 2 });
  await calendar.settled();

  expect(calendar.placementOf("Standup")).toMatchObject({
    range: "2026-10-08T09:30:00Z/2026-10-08T10:30:00Z",
    resourceIds: ["Ben"],
  });
});

test("in a right-to-left calendar, a step across still moves forward", async () => {
  const calendar = await renderView("week", "rtl");

  await calendar.keyboard.moveEvent("Standup", { across: 1 });
  await calendar.settled();

  expect(calendar.placementOf("Standup").range).toBe("2026-10-09T09:00:00Z/2026-10-09T10:00:00Z");
});

test("a cell the view doesn't show can't take focus", async () => {
  const calendar = await renderView("week");

  await expect(calendar.keyboard.focusCell({ date: "2026-12-01", time: "09:00" })).rejects.toThrow(
    /no cell for 2026-12-01 at 09:00/,
  );
  await expect(calendar.keyboard.focusEvent("Standup", { date: "2026-10-09" })).rejects.toThrow(
    /no focusable element for event Standup on 2026-10-09/,
  );
  expect(environment.today.toString()).toBe("2026-10-08");
});
