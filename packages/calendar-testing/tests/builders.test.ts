import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarEventChange,
} from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
} from "@moltenship/calendar-recurrence";
import { expect, test } from "vite-plus/test";

import {
  applyCanonicalChange,
  buildAllDayEvent,
  buildAvailability,
  buildEvent,
  buildRecurringEvent,
  buildResource,
  withRecurrence,
} from "../src/index";

const range = (event: { readonly start: unknown; readonly end: unknown }) =>
  `${String(event.start)}/${String(event.end)}`;

test("an event without input is an hour at 09:00 UTC on the default date, titled and keyed Event", () => {
  const event = buildEvent();

  expect(event).toMatchObject({ data: null, id: "Event", kind: "timed", title: "Event" });
  expect(range(event)).toBe("2026-10-08T09:00:00Z/2026-10-08T10:00:00Z");
  expect("sourceTimeZone" in event).toBe(false);
  expect("resourceIds" in event).toBe(false);
});

test("the ID defaults to the title and the title to the ID", () => {
  expect(buildEvent({ title: "Standup" })).toMatchObject({ id: "Standup", title: "Standup" });
  expect(buildEvent({ id: 7 })).toMatchObject({ id: 7, title: "7" });
});

test("wall times are read on the event's zone, which becomes its source zone", () => {
  const event = buildEvent({
    duration: { days: 1 },
    start: "2026-10-24T09:00",
    timeZone: "Europe/Berlin",
  });

  // Berlin leaves summer time on 25 October: a day later is still 09:00 there, 25 hours on.
  expect(range(event)).toBe("2026-10-24T07:00:00Z/2026-10-25T08:00:00Z");
  expect(event.sourceTimeZone).toBe("Europe/Berlin");
});

test("an exact end wins over a duration, and builders keep data and resources", () => {
  const event = buildEvent({
    data: { color: "teal" },
    end: "2026-10-08T09:45:00Z",
    resourceIds: ["ada"],
    start: "2026-10-08T09:00:00Z",
    title: "Review",
  });

  expect(range(event)).toBe("2026-10-08T09:00:00Z/2026-10-08T09:45:00Z");
  expect(event.data.color).toBe("teal");
  expect(event.resourceIds).toEqual(["ada"]);
  expect(Object.isFrozen(event)).toBe(true);
});

test("all-day events cover whole dates, end exclusive", () => {
  expect(range(buildAllDayEvent())).toBe("2026-10-08/2026-10-09");
  expect(range(buildAllDayEvent({ days: 3, start: "2026-10-06", title: "Trip" }))).toBe(
    "2026-10-06/2026-10-09",
  );
  expect(range(buildAllDayEvent({ end: "2026-10-10", start: "2026-10-08" }))).toBe(
    "2026-10-08/2026-10-10",
  );
});

test("resources default their ID and title from each other", () => {
  expect(buildResource({ title: "Ada" })).toEqual({ data: null, id: "Ada", title: "Ada" });
  expect(buildResource({ id: "room-1", timeZone: "Asia/Tokyo" })).toEqual({
    data: null,
    id: "room-1",
    timeZone: "Asia/Tokyo",
    title: "room-1",
  });
});

test("availability defaults to 9 to 5 on weekdays and takes exceptions", () => {
  const availability = buildAvailability({
    exceptions: [
      { date: "2026-12-25", label: "Holiday" },
      { date: "2026-12-24", hours: "09:00-12:00" },
    ],
  });

  expect(availability.weekly).toHaveLength(1);
  expect(availability.weekly?.[0]?.days).toEqual([1, 2, 3, 4, 5]);
  expect(String(availability.weekly?.[0]?.start)).toBe("09:00:00");
  expect(String(availability.weekly?.[0]?.end)).toBe("17:00:00");
  expect(
    availability.exceptions?.map(({ date, hours, label }) => [String(date), hours?.length, label]),
  ).toEqual([
    ["2026-12-25", undefined, "Holiday"],
    ["2026-12-24", 1, undefined],
  ]);
  expect(() => buildAvailability({ hours: "9 to 5" })).toThrow(/09:00-17:00/);
});

test("a recurring series repeats on its zone's wall clock across DST", () => {
  const series = buildRecurringEvent({
    exceptionDates: ["2026-10-28T09:00"],
    rule: "FREQ=WEEKLY;COUNT=4",
    start: "2026-10-21T09:00",
    timeZone: "Europe/Berlin",
    title: "Planning",
  });
  const expander = createOccurrenceExpander(createCanonicalRecurrenceAdapter<null>());
  const { occurrences } = expander.expand([series], {
    range: {
      end: Temporal.PlainDate.from("2026-12-01"),
      start: Temporal.PlainDate.from("2026-10-01"),
    },
    timeZone: "UTC",
  });

  expect(series.recurrence?.rule?.frequency).toBe("WEEKLY");
  // 09:00 in Berlin: summer time, then winter time; the 28th is excluded.
  expect(occurrences.map(({ interval }) => String(interval.start))).toEqual([
    "2026-10-21T07:00:00Z",
    "2026-11-04T08:00:00Z",
    "2026-11-11T08:00:00Z",
  ]);
});

test("withRecurrence makes an all-day event a series, and bad rules throw", () => {
  const series = withRecurrence(buildAllDayEvent({ start: "2026-10-05" }), {
    exceptionDates: ["2026-10-12"],
    rule: "FREQ=WEEKLY",
  });

  expect(String(series.recurrence?.exceptionDates?.[0])).toBe("2026-10-12");
  expect(() => buildRecurringEvent({ rule: "FREQ=SOMETIMES" })).toThrow(/Invalid RRULE/);
});

test("applyCanonicalChange applies moves, creates and deletes like an app that saves at once", () => {
  const standup = buildEvent({ start: "2026-10-08T09:00:00Z", timeZone: "UTC", title: "Standup" });
  const snapshot = createEventSnapshot([standup], createCanonicalEventAdapter<null>());
  const moved = applyCanonicalChange([standup], {
    cause: "move",
    event: standup,
    eventId: "Standup",
    id: "change-1",
    original: { ...standup, resourceIds: [] },
    proposed: {
      kind: "all-day",
      end: Temporal.PlainDate.from("2026-10-10"),
      resourceIds: [],
      start: Temporal.PlainDate.from("2026-10-09"),
    },
  } satisfies CalendarEventChange<typeof standup, string, string>);
  const created = applyCanonicalChange(moved, {
    cause: "create",
    event: null,
    eventId: null,
    id: "change-2",
    original: null,
    proposed: { ...buildEvent({ start: "2026-10-09T14:00:00Z" }), resourceIds: ["ada"] },
  });

  expect(snapshot.size).toBe(1);
  expect(moved[0]).toMatchObject({ id: "Standup", kind: "all-day" });
  expect("sourceTimeZone" in moved[0]!).toBe(false);
  expect(range(moved[0]!)).toBe("2026-10-09/2026-10-10");
  expect(created[1]).toMatchObject({
    data: null,
    id: "new-2",
    resourceIds: ["ada"],
    title: "New event",
  });
  expect(
    applyCanonicalChange(created, {
      cause: "delete",
      event: standup,
      eventId: "Standup",
      id: "change-3",
      original: { ...standup, resourceIds: [] },
      proposed: null,
    }),
  ).toHaveLength(1);
  expect(() =>
    applyCanonicalChange([{ id: "x", when: "today" }], {
      cause: "delete",
      event: { id: "x", when: "today" },
      eventId: "x",
      id: "change-4",
      original: { ...standup, resourceIds: [] },
      proposed: null,
    }),
  ).toThrow(/applyChange/);
});
