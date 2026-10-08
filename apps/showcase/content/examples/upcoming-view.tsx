"use client";

// #region view
import {
  defineCalendarView,
  plainDateInterval,
  type CalendarViewProjectionInput,
} from "@moltenship/calendar";

import { EventChip } from "@/components/calendar/event-chip";
import type { CalendarEventColor } from "@/components/calendar/event-colors";

import type { Meeting } from "./quick-start";

interface UpcomingOptions {
  readonly getEventColor?: (meeting: Meeting) => CalendarEventColor;
}

export const upcomingView = defineCalendarView({
  name: "upcoming",
  defaultOptions: {},
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    navigate: (anchor, delta) => anchor.add({ weeks: delta }),
    getTitle: (range, { locale }) => range.start.toLocaleString(locale, { dateStyle: "medium" }),
    project: ({ snapshot, instantRange }: CalendarViewProjectionInput<UpcomingOptions, Meeting>) =>
      snapshot.queryTimed(instantRange),
  },
  Renderer: ({ projection, options }) => (
    <ul>
      {projection.map(({ event }) => (
        <li key={event.id}>
          <EventChip color={options.getEventColor?.(event)}>{event.title}</EventChip>
        </li>
      ))}
    </ul>
  ),
});
// #endregion view
