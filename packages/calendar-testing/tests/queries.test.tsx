// @vitest-environment jsdom

import { afterEach, expect, test } from "vite-plus/test";

import {
  CalendarQueryError,
  PointerLayoutError,
  buildAllDayEvent,
  buildEvent,
  cleanup,
  createTestEnvironment,
  normalizeText,
  renderCalendar,
} from "../src/index";
import { Calendar } from "./list-view";

afterEach(cleanup);

const environment = createTestEnvironment({ timeZone: "America/New_York" });
const standup = buildEvent({ id: "s-1", start: environment.at("09:00"), title: "Standup" });
const review = buildEvent({
  id: "r-1",
  start: environment.at("2026-10-09T14:00"),
  title: "Review",
});
const again = buildEvent({
  id: "s-2",
  start: environment.at("2026-10-10T09:00"),
  title: "Standup",
});
const trip = buildAllDayEvent({ days: 2, start: "2026-10-09", title: "Trip" });

const moveReview = {
  cause: "move",
  eventId: "r-1",
  proposed: {
    end: environment.at("2026-10-09T16:00"),
    kind: "timed",
    start: environment.at("2026-10-09T15:00"),
  },
} as const;

test("events are found by ID, title or start, through the calendar's own events", async () => {
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [standup, review, again, trip],
  });

  expect(calendar.getEvent("r-1").textContent).toBe("Review 2026-10-09T18:00:00Z");
  expect(calendar.getEvent("Review")).toBe(calendar.getEvent("r-1"));
  expect(calendar.getEvent({ id: "s-2" }).textContent).toContain("2026-10-10T13:00:00Z");
  // A start is a wall time on the calendar's zone, or exact.
  expect(calendar.getEvent({ start: "2026-10-10T09:00" })).toBe(calendar.getEvent("s-2"));
  expect(calendar.getEvent({ start: "2026-10-08T13:00:00Z" })).toBe(calendar.getEvent("s-1"));
  expect(calendar.getAllEvents({ title: "Review" })).toHaveLength(1);
});

test("a query that names several events, or none, says which events there are", async () => {
  const calendar = await renderCalendar(Calendar, { environment, events: [standup, again] });

  expect(() => calendar.getEvent("Standup")).toThrow(CalendarQueryError);
  expect(() => calendar.getEvent("Standup")).toThrow(/2 events match "Standup": s-1, s-2/);
  expect(() => calendar.getEvent("Lunch")).toThrow(
    /No event matches "Lunch". The calendar has "Standup" \(s-1\), "Standup" \(s-2\)/,
  );
  expect(calendar.queryEvent("Lunch")).toBeNull();
});

test("an event the view doesn't show is found but has no element", async () => {
  const later = buildEvent({ id: "later", start: "2026-11-20T09:00Z" });
  const calendar = await renderCalendar(Calendar, { environment, events: [later] });

  expect(calendar.placementOf("later").range).toBe("2026-11-20T09:00:00Z/2026-11-20T10:00:00Z");
  expect(calendar.queryEvent("later")).toBeNull();
  expect(() => calendar.getEvent("later")).toThrow(/doesn't show event later/);
});

test("placementOf gives comparable text, on the wall clock too, and says when it's pending", async () => {
  let finish = () => {};
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [review, trip],
    onEventChange: () => new Promise<void>((resolve) => (finish = resolve)),
  });

  expect(calendar.placementOf("Trip")).toMatchObject({
    isPending: false,
    kind: "all-day",
    range: "2026-10-09/2026-10-11",
    wallRange: "2026-10-09/2026-10-11",
  });
  await calendar.act((actions) => {
    void actions.proposeEventChange(moveReview);
  });

  expect(calendar.placementOf("Review")).toEqual({
    end: "2026-10-09T20:00:00Z",
    id: "r-1",
    isPending: true,
    kind: "timed",
    range: "2026-10-09T19:00:00Z/2026-10-09T20:00:00Z",
    resourceIds: [],
    start: "2026-10-09T19:00:00Z",
    title: "Review",
    wallRange: "2026-10-09T15:00/2026-10-09T16:00",
  });

  await calendar.act(() => finish());
  await calendar.settled();
  expect(calendar.placementOf("Review").isPending).toBe(false);
});

test("settled waits for a save, and says what's still pending when it runs out of time", async () => {
  let finish = () => {};
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [review],
    onEventChange: () => new Promise<void>((resolve) => (finish = resolve)),
  });
  await calendar.act((actions) => {
    void actions.proposeEventChange(moveReview);
  });

  await expect(calendar.settled({ timeout: 50 })).rejects.toThrow(
    /still pending after 50 ms: move r-1 \(saving\)/,
  );
  setTimeout(finish, 20);
  await calendar.settled();

  expect(calendar.pendingChanges().size).toBe(0);
  expect(calendar.results.map(({ result }) => result.status)).toEqual(["committed"]);
});

test("cells and resources the view doesn't render throw a query error", async () => {
  const calendar = await renderCalendar(Calendar, { environment, events: [standup] });

  expect(() => calendar.getDayCell("2026-10-08")).toThrow(/no day cell for 2026-10-08/);
  expect(() => calendar.getTimeColumn("2026-10-08")).toThrow(/no time column/);
  expect(() => calendar.getResource({ title: "Ana" })).toThrow(/No resources are titled "Ana"/);
});

test("the pointer driver needs layout, which jsdom doesn't have", async () => {
  const calendar = await renderCalendar(Calendar, { environment, events: [standup] });

  await expect(
    calendar.pointer.moveEvent("Standup", { date: "2026-10-09", time: "10:00" }),
  ).rejects.toThrow(PointerLayoutError);
  await expect(calendar.pointer.drag({ x: 1, y: 1 }, calendar.getEvent("Standup"))).rejects.toThrow(
    /run pointer tests in a browser/,
  );
});

test("keys go to the focused element in the calendar, and nowhere else", async () => {
  const calendar = await renderCalendar(Calendar, { environment, events: [standup] });

  await expect(calendar.keyboard.press("ArrowDown")).rejects.toThrow(
    /Nothing in the calendar has focus/,
  );
  expect(calendar.announcements()).toEqual([]);
  expect(calendar.lastAnnouncement()).toBeUndefined();
});

test("normalizeText makes Intl's thin and no-break spaces plain", () => {
  expect(normalizeText(" 9:15 – 9:45 AM ")).toBe("9:15 – 9:45 AM");
});
