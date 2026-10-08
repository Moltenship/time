import { describe, expect, test } from "vite-plus/test";

import type { DemoEvent } from "../src/calendar";
import {
  draftForNewEvent,
  draftFromEvent,
  draftFromPlacement,
  eventFromDraft,
  moveDraftStart,
} from "../src/event-draft";

const timeZone = "America/New_York";
const date = (value: string) => Temporal.PlainDate.from(value);
const time = (value: string) => Temporal.PlainTime.from(value);

const timed: DemoEvent = {
  calendarId: "work",
  end: Temporal.Instant.from("2026-10-08T04:30:00Z"),
  id: "deploy",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T03:00:00Z"),
  title: "Deploy window",
};

describe("event drafts", () => {
  test("round-trip a timed event through wall-clock fields", () => {
    const draft = draftFromEvent(timed, timeZone);

    expect(draft.startDate.toString()).toBe("2026-10-07");
    expect(draft.startTime.toString()).toBe("23:00:00");
    expect(draft.endDate.toString()).toBe("2026-10-08");
    const result = eventFromDraft(draft, timeZone, "deploy");
    if (!("event" in result) || result.event.kind !== "timed") throw new Error("expected an event");
    expect(result.event.start.equals(timed.start)).toBe(true);
    expect(result.event.end.equals(timed.end)).toBe(true);
    expect(result.event).toMatchObject({
      calendarId: "work",
      id: "deploy",
      title: "Deploy window",
    });
  });

  test("show all-day end dates inclusively and store them exclusively", () => {
    const allDay: DemoEvent = {
      calendarId: "travel",
      end: date("2026-10-17"),
      id: "trip",
      kind: "all-day",
      start: date("2026-10-14"),
      title: "Berlin trip",
    };
    const draft = draftFromEvent(allDay, timeZone);

    expect(draft.endDate.toString()).toBe("2026-10-16");
    const result = eventFromDraft(draft, timeZone, "trip");
    expect("event" in result && result.event.end.toString()).toBe("2026-10-17");
  });

  test("resolve wall times on a DST day in the display time zone", () => {
    const draft = {
      ...draftForNewEvent(
        date("2026-11-01"),
        Temporal.ZonedDateTime.from("2026-10-08T12:00[UTC]"),
        "work",
      ),
      endTime: time("03:00"),
      startTime: time("00:30"),
      title: "Across the fold",
    };
    const result = eventFromDraft(draft, timeZone, "fold");

    // 00:30 EDT to 03:00 EST spans 3.5 hours because 01:00–02:00 repeats.
    expect(
      "event" in result &&
        result.event.kind === "timed" &&
        result.event.start.until(result.event.end).total("minutes"),
    ).toBe(210);
  });

  test.each([
    ["earlier", "2026-11-01T05:30:00Z", "2026-11-01T05:45:00Z"],
    ["later", "2026-11-01T06:30:00Z", "2026-11-01T06:45:00Z"],
  ])(
    "keep the %s occurrence of a repeated wall time through an unchanged save",
    (_, start, end) => {
      // 01:30–01:45 happens twice in New York on 2026-11-01: first in EDT, then in EST.
      const event: DemoEvent = {
        ...timed,
        end: Temporal.Instant.from(end),
        start: Temporal.Instant.from(start),
      };
      const result = eventFromDraft(draftFromEvent(event, timeZone), timeZone, event.id);
      if (!("event" in result) || result.event.kind !== "timed")
        throw new Error("expected an event");

      expect([result.event.start.toString(), result.event.end.toString()]).toEqual([start, end]);
    },
  );

  test("turn a dragged-out range into a new event's draft", () => {
    const timedDraft = draftFromPlacement(
      {
        end: Temporal.Instant.from("2026-10-08T15:30:00Z"),
        kind: "timed",
        start: Temporal.Instant.from("2026-10-08T14:00:00Z"),
      },
      timeZone,
      "personal",
    );
    expect([timedDraft.startTime.toString(), timedDraft.endTime.toString()]).toEqual([
      "10:00:00",
      "11:30:00",
    ]);
    expect(timedDraft).toMatchObject({ allDay: false, calendarId: "personal", title: "" });

    const allDayDraft = draftFromPlacement(
      { end: date("2026-10-15"), kind: "all-day", start: date("2026-10-13") },
      timeZone,
      "work",
    );
    expect([allDayDraft.allDay, allDayDraft.endDate.toString()]).toEqual([true, "2026-10-14"]);
  });

  test("start new events at the next half hour today and at 09:00 on other days", () => {
    const now = Temporal.ZonedDateTime.from(`2026-10-08T10:05[${timeZone}]`);

    const today = draftForNewEvent(date("2026-10-08"), now, "work");
    expect([today.startTime.toString(), today.endTime.toString()]).toEqual([
      "10:30:00",
      "11:30:00",
    ]);

    const later = draftForNewEvent(date("2026-10-12"), now, "work");
    expect([later.startDate.toString(), later.startTime.toString()]).toEqual([
      "2026-10-12",
      "09:00:00",
    ]);
  });

  test("keep the event's length when its start moves, across midnight", () => {
    const draft = draftFromEvent(timed, timeZone);
    const moved = moveDraftStart(draft, date("2026-10-09"), time("23:30"));

    expect([moved.endDate.toString(), moved.endTime.toString()]).toEqual([
      "2026-10-10",
      "01:00:00",
    ]);
  });

  test.each([
    ["an empty title", { title: "  " }, "Add a title."],
    [
      "an end before the start",
      { endTime: time("22:00"), endDate: date("2026-10-07") },
      "The event must end after it starts.",
    ],
    [
      "an all-day end before the start",
      { allDay: true, endDate: date("2026-10-06") },
      "The event ends before it starts.",
    ],
  ])("reject %s", (_, change, error) => {
    expect(
      eventFromDraft({ ...draftFromEvent(timed, timeZone), ...change }, timeZone, "x"),
    ).toEqual({ error });
  });
});
