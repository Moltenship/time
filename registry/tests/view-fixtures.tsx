import {
  createCalendar,
  createCanonicalEventAdapter,
  createFixedClock,
  defineCalendarView,
  plainDateInterval,
  type AnyCalendarView,
  type CalendarEvent,
} from "@moltenship/calendar";

import type { CalendarEventColor } from "../calendar-theme/event-colors";

export type ColoredEvent = CalendarEvent<{ readonly color: CalendarEventColor }, string | number>;

export function timed(
  id: string | number,
  start: string,
  end: string,
  color: CalendarEventColor = "blue",
) {
  return {
    data: { color },
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    start: Temporal.Instant.from(start),
    title: String(id),
  } as const satisfies ColoredEvent;
}

export function allDay(id: string, start: string, end: string, color: CalendarEventColor = "teal") {
  return {
    data: { color },
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title: id,
  } as const satisfies ColoredEvent;
}

/** The view the month and agenda date buttons switch to. */
const dayView = defineCalendarView({
  name: "day",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => `Day ${range.start.toString()}`,
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: () => null,
  },
  Renderer: () => <p data-testid="day-view" />,
});

export function createTestCalendar<TView extends AnyCalendarView<ColoredEvent>>(view: TView) {
  return createCalendar<ColoredEvent, never>()({
    eventAdapter: createCanonicalEventAdapter<
      { readonly color: CalendarEventColor },
      string | number
    >(),
    views: [view, dayView],
  });
}

export const clock = createFixedClock(Temporal.Instant.from("2026-10-08T12:00:00Z"));
export const anchorDate = Temporal.PlainDate.from("2026-10-08");

/** Intl range and time output uses thin and narrow no-break spaces. */
export function text(element: Element | null | undefined): string | undefined {
  return element?.textContent?.replace(/\s/g, " ");
}
