// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarEvent,
} from "@moltenship/calendar";
import type { ReactElement } from "react";
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

const adapter = createCanonicalEventAdapter<{ readonly calendar?: string }, string>();

/** Names each event in New York, the `pending` one with a change still saving. */
function Labels({
  describe,
  events,
  pending,
}: {
  readonly describe?: EventDescriber<Meeting>;
  readonly events: readonly Meeting[];
  readonly pending?: string;
}) {
  const label = useEventLabel<Meeting>({ locale: "en-US", timeZone: "America/New_York" }, describe);
  return (
    <ul>
      {createEventSnapshot(events, adapter).events.map((event) => (
        <li key={event.id}>{label({ ...event, isPending: event.id === pending })}</li>
      ))}
    </ul>
  );
}

function timed(title: string, start: string, end: string): Meeting {
  return {
    data: {},
    end: Temporal.Instant.from(end),
    id: title,
    kind: "timed",
    start: Temporal.Instant.from(start),
    title,
  };
}

async function labels(element: ReactElement) {
  const view = await render(element);
  cleanup = view.unmount;
  return [...view.container.querySelectorAll("li")].map(text);
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

test("names events by title, when, detail, and pending state", async () => {
  expect(
    await labels(
      <Labels describe={(meeting) => meeting.data.calendar} events={events} pending="standup" />,
    ),
  ).toEqual([
    "Standup, Thursday, October 8, 9:00 – 9:30 AM, Work, saving",
    "Red-eye, Friday, October 9 at 10:00 PM – Saturday, October 10 at 2:00 AM",
    "Holiday, all day, Thursday, October 8",
    "Trip, all day, Tuesday, October 6 – Friday, October 9, Family",
    "Untitled event, Thursday, October 8, 7:00 – 7:30 AM",
  ]);
});

test("names both ends with their zone when the clocks change during an event", async () => {
  const clockChanges = [
    // 1:30 EDT to 1:30 EST, and 1:45 EDT to 1:15 EST: the wall times repeat or run backwards.
    timed("Repeated", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"),
    timed("Backwards", "2026-11-01T05:45:00Z", "2026-11-01T06:15:00Z"),
    // 1:00 EST to 4:00 EDT is two hours.
    timed("Skipped", "2026-03-08T06:00:00Z", "2026-03-08T08:00:00Z"),
  ];

  expect(await labels(<Labels events={clockChanges} />)).toEqual([
    "Repeated, Sunday, November 1 at 1:30 AM EDT – Sunday, November 1 at 1:30 AM EST",
    "Backwards, Sunday, November 1 at 1:45 AM EDT – Sunday, November 1 at 1:15 AM EST",
    "Skipped, Sunday, March 8 at 1:00 AM EST – Sunday, March 8 at 4:00 AM EDT",
  ]);
});
