// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarEvent,
} from "@moltenship/calendar";
import { afterEach, expect, test } from "vite-plus/test";

import { useEventLabel, type EventDescriber } from "../calendar/event-label";
import { render } from "./render";
import { text } from "./view-fixtures";

type Meeting = CalendarEvent<{ readonly calendar?: string }, string>;

const events: readonly Meeting[] = [
  {
    data: { calendar: "Work" },
    end: Temporal.Instant.from("2026-10-08T13:30:00Z"),
    id: "standup",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T13:00:00Z"),
    title: "Standup",
  },
  {
    data: {},
    end: Temporal.Instant.from("2026-10-10T06:00:00Z"),
    id: "redeye",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-10T02:00:00Z"),
    title: "Red-eye",
  },
  {
    data: {},
    end: Temporal.PlainDate.from("2026-10-09"),
    id: "holiday",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-08"),
    title: "Holiday",
  },
  {
    data: { calendar: "Family" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "trip",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-06"),
    title: "Trip",
  },
  {
    data: {},
    end: Temporal.PlainDateTime.from("2026-10-08T07:30"),
    id: "run",
    kind: "floating",
    start: Temporal.PlainDateTime.from("2026-10-08T07:00"),
    title: "  ",
  },
];

const snapshot = createEventSnapshot(events, createCanonicalEventAdapter());

function Labels({ describe }: { readonly describe?: EventDescriber<Meeting> }) {
  const label = useEventLabel<Meeting>({ locale: "en-US", timeZone: "America/New_York" }, describe);
  return (
    <ul>
      {snapshot.events.map((event, index) => (
        <li key={event.id}>{label(index === 0 ? { ...event, isPending: true } : event)}</li>
      ))}
    </ul>
  );
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

test("names events by title, when, detail, and pending state", async () => {
  const view = await render(<Labels describe={(meeting) => meeting.data.calendar} />);
  cleanup = view.unmount;

  expect([...view.container.querySelectorAll("li")].map(text)).toEqual([
    "Standup, Thursday, October 8, 9:00 – 9:30 AM, Work, saving",
    "Red-eye, Friday, October 9 at 10:00 PM – Saturday, October 10 at 2:00 AM",
    "Holiday, all day, Thursday, October 8",
    "Trip, all day, Tuesday, October 6 – Friday, October 9, Family",
    "Untitled event, Thursday, October 8, 7:00 – 7:30 AM",
  ]);
});
