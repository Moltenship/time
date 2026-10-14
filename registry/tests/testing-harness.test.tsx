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

test("queries find an event's parts and the cells under them", async () => {
  const calendar = await renderView("week");

  // The all-day row draws the three-day trip as one bar.
  expect(calendar.getAllEvents("Trip")).toHaveLength(1);
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

test("focusEvent focuses a multi-day event's part on a date, in a month and a week's all-day row", async () => {
  for (const view of ["month", "week"] as const) {
    const calendar = await renderView(view);

    const element = await calendar.keyboard.focusEvent("Trip", { date: "2026-10-07" });

    expect(document.activeElement).toBe(element);
    expect(element.getAttribute("data-event-id")).toBe("Trip");
    expect(calendar.state().focus).toMatchObject({ eventId: "Trip", kind: "event" });
    expect(String((calendar.state().focus as { date: unknown }).date)).toBe("2026-10-07");
    await calendar.unmount();
  }
});

test("a cell or event part the view doesn't show can't take focus, and focus stays put", async () => {
  const calendar = await renderView("week");
  await calendar.keyboard.focusCell({ date: "2026-10-08", time: "09:00" });
  const before = calendar.state().focus;

  await expect(calendar.keyboard.focusCell({ date: "2026-12-01", time: "09:00" })).rejects.toThrow(
    /no cell for 2026-12-01 at 09:00/,
  );
  await expect(calendar.keyboard.focusEvent("Standup", { date: "2026-10-09" })).rejects.toThrow(
    /no focusable part of event "Standup" on 2026-10-09/,
  );
  expect(calendar.state().focus).toEqual(before);
  // DOM focus is back on the 9:00 slot too, so keys go on from there.
  await calendar.keyboard.arrows({ down: 1 });
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Thursday, October 8 at 9:15 AM");
});

test("an event that began before the week takes focus on the week's first day", async () => {
  const long = buildAllDayEvent({ end: "2026-10-07", start: "2026-09-28", title: "Long" });
  const calendar = await renderCalendar(Calendar, { environment, events: [long], view: "week" });

  await calendar.keyboard.focusEvent("Long");

  expect(String((calendar.state().focus as { date: unknown }).date)).toBe("2026-10-05");
});

test("a message said twice is recorded twice, from whichever announcer speaks", async () => {
  // The app's own Announcer comes first in the page; the harness's, mounted last, speaks.
  const calendar = await renderCalendar(Calendar, {
    children: (
      <>
        <Calendar.Announcer messages={calendarAnnouncements} />
        <Calendar.ActiveView />
      </>
    ),
    environment,
    events: [standup],
    messages: calendarAnnouncements,
    view: "week",
  });
  await calendar.keyboard.focusEvent("Standup");
  await calendar.keyboard.grab();

  await calendar.keyboard.step({ down: 1 });
  await calendar.keyboard.step({ down: -1 });
  await calendar.keyboard.step({ down: 1 });
  await calendar.keyboard.cancel();

  const steps = calendar.announcements().slice(1, 4);
  expect(steps).toHaveLength(3);
  expect(steps[0]).toBe(steps[2]);
  expect(calendar.lastAnnouncement()).toMatch(/^Cancelled/);
});

test("Shift+Space twice resizes the start", async () => {
  const calendar = await renderView("week");

  await calendar.keyboard.resizeEvent("Standup", { down: -2, edge: "start" });
  await calendar.settled();

  expect(calendar.changes[0]?.cause).toBe("resize-start");
  expect(calendar.placementOf("Standup").range).toBe("2026-10-08T08:30:00Z/2026-10-08T10:00:00Z");
});
