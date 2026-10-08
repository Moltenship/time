import { describe, expect, test } from "vite-plus/test";

import {
  applyPreviewChange,
  createPreviewEvents,
  type PreviewEvent,
} from "../components/calendar-preview/events";

function find(events: readonly PreviewEvent[], title: string) {
  const event = events.find((candidate) => candidate.title === title);
  if (event?.kind !== "timed") throw new Error(`${title} is not a timed event`);
  return event;
}

function wallClock(events: readonly PreviewEvent[], title: string, timeZone: string) {
  return find(events, title).start.toZonedDateTimeISO(timeZone).toPlainDateTime().toString();
}

describe("calendar preview events", () => {
  test("places this week's events in the visitor's week and time zone", () => {
    const events = createPreviewEvents(Temporal.ZonedDateTime.from("2026-10-08T12:00[Asia/Tokyo]"));

    expect(wallClock(events, "Weekly planning", "Asia/Tokyo")).toBe("2026-10-05T10:00:00");
    expect(wallClock(events, "Brunch with parents", "Asia/Tokyo")).toBe("2026-10-11T11:00:00");
  });

  test("books the New York call in New York time, across mismatched DST changes", () => {
    // Europe leaves summer time on October 25, New York only on November 1.
    const events = createPreviewEvents(
      Temporal.ZonedDateTime.from("2026-10-28T12:00[Europe/Lisbon]"),
    );
    const title = "Acme kickoff (New York)";

    expect(find(events, title).sourceTimeZone).toBe("America/New_York");
    expect(wallClock(events, title, "America/New_York")).toBe("2026-10-28T10:00:00");
    expect(wallClock(events, title, "Europe/Lisbon")).toBe("2026-10-28T14:00:00");
  });

  test("puts events either side of the current hour, so the opening time grid is never empty", () => {
    const events = createPreviewEvents(Temporal.ZonedDateTime.from("2026-10-08T03:20[Asia/Tokyo]"));

    expect(wallClock(events, "On-call handover", "Asia/Tokyo")).toBe("2026-10-08T02:00:00");
    expect(wallClock(events, "Deploy window", "Asia/Tokyo")).toBe("2026-10-08T04:00:00");
  });

  test("moves an event and keeps its title and colour", () => {
    const events = createPreviewEvents(Temporal.ZonedDateTime.from("2026-10-08T12:00[UTC]"));
    const event = find(events, "Focus time");
    const start = Temporal.Instant.from("2026-10-08T14:00:00Z");
    const end = Temporal.Instant.from("2026-10-08T16:00:00Z");
    const placement = { end, kind: "timed", resourceIds: [], start } as const;

    const moved = applyPreviewChange(events, {
      cause: "move",
      event,
      eventId: event.id,
      id: "change-1",
      original: { ...event, resourceIds: [] },
      proposed: placement,
    });

    expect(find(moved, "Focus time")).toEqual({ ...event, end, start });
    expect(moved).toHaveLength(events.length);
  });

  test("adds a new event for a drag on empty time", () => {
    const start = Temporal.Instant.from("2026-10-08T17:00:00Z");
    const end = Temporal.Instant.from("2026-10-08T18:00:00Z");

    const created = applyPreviewChange([], {
      cause: "create",
      event: null,
      eventId: null,
      id: "change-2",
      original: null,
      proposed: { end, kind: "timed", resourceIds: [], start },
    });

    expect(created).toEqual([
      { color: "orange", end, id: "change-2", kind: "timed", start, title: "New event" },
    ]);
  });
});
