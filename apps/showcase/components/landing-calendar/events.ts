import type { CalendarEventChange } from "@moltenship/calendar";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

export type LandingEvent = {
  readonly color: CalendarEventColor;
  readonly id: string;
  readonly title: string;
} & (
  | {
      readonly end: Temporal.Instant;
      readonly kind: "timed";
      readonly sourceTimeZone?: string;
      readonly start: Temporal.Instant;
    }
  | {
      readonly end: Temporal.PlainDate;
      readonly kind: "all-day";
      readonly start: Temporal.PlainDate;
    }
);

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A believable week around `today`, at wall-clock times in the visitor's `timeZone`, with a few
 * events in the weeks either side so navigation is never empty.
 */
export function createLandingEvents(
  today: Temporal.PlainDate,
  timeZone: string,
): readonly LandingEvent[] {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const events: LandingEvent[] = [];
  const dateOf = (week: number, weekday: Weekday) => monday.add({ days: week * 7 + weekday - 1 });

  function timed(
    color: CalendarEventColor,
    title: string,
    [week, weekday]: readonly [number, Weekday],
    time: string,
    duration: Temporal.DurationLike,
    zone = timeZone,
  ) {
    const start = dateOf(week, weekday).toZonedDateTime({
      plainTime: Temporal.PlainTime.from(time),
      timeZone: zone,
    });
    events.push({
      color,
      end: start.add(duration).toInstant(),
      id: `event-${events.length + 1}`,
      kind: "timed",
      start: start.toInstant(),
      title,
      ...(zone === timeZone ? {} : { sourceTimeZone: zone }),
    });
  }

  function allDay(
    color: CalendarEventColor,
    title: string,
    [week, weekday]: readonly [number, Weekday],
    days = 1,
  ) {
    const start = dateOf(week, weekday);
    events.push({
      color,
      end: start.add({ days }),
      id: `event-${events.length + 1}`,
      kind: "all-day",
      start,
      title,
    });
  }

  for (const week of [-1, 0, 1]) {
    for (const weekday of [1, 2, 3, 4, 5] as const) {
      timed("gray", "Standup", [week, weekday], "09:30", { minutes: 15 });
    }
  }

  timed("orange", "Roadmap review", [-1, 2], "11:00", { hours: 1 });

  timed("orange", "Weekly planning", [0, 1], "10:00", { hours: 1 });
  timed("gray", "Lunch with Sam", [0, 1], "12:30", { hours: 1 });
  timed("orange", "Design review", [0, 2], "10:00", { hours: 1, minutes: 30 });
  timed("gray", "1:1 with Maya", [0, 2], "11:00", { minutes: 30 });
  timed("gray", "Dentist", [0, 2], "16:00", { minutes: 45 });
  // Booked in New York time, so it lands wherever 10:00 New York falls for the visitor.
  timed("orange", "Acme kickoff (New York)", [0, 3], "10:00", { hours: 1 }, "America/New_York");
  timed("orange", "Sprint planning", [0, 3], "13:00", { hours: 1, minutes: 30 });
  timed("gray", "Focus time", [0, 4], "10:00", { hours: 2 });
  timed("gray", "Book club", [0, 4], "19:00", { hours: 2 });
  timed("orange", "Team lunch", [0, 5], "12:00", { hours: 1, minutes: 30 });
  timed("orange", "Release retro", [0, 5], "15:00", { hours: 1 });
  timed("gray", "Climbing", [0, 6], "10:30", { hours: 2 });
  timed("gray", "Brunch with parents", [0, 7], "11:00", { hours: 2 });
  allDay("orange", "Release freeze", [0, 3], 3);
  allDay("gray", "Mom's birthday", [0, 6]);

  timed("orange", "Quarterly planning", [1, 1], "10:00", { hours: 2 });
  timed("gray", "Flight to Berlin", [1, 2], "21:40", { hours: 8, minutes: 30 });

  return events;
}

export type LandingEventChange = CalendarEventChange<LandingEvent, string, never>;

/** The events after a drag: moves and resizes take the new placement, and empty time adds one. */
export function applyLandingChange(
  events: readonly LandingEvent[],
  change: LandingEventChange,
): readonly LandingEvent[] {
  if (change.cause === "delete") return events.filter(({ id }) => id !== change.eventId);
  // Landing events have no resources, so only the interval carries over.
  const { resourceIds: _resourceIds, ...placement } = change.proposed;
  if (placement.kind === "floating") return events;
  if (change.cause === "create") {
    return [...events, { color: "orange", id: change.id, title: "New event", ...placement }];
  }
  return events.map((event) =>
    event.id === change.eventId
      ? { color: event.color, id: event.id, title: event.title, ...placement }
      : event,
  );
}
