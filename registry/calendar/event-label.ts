import type {
  CalendarEnvironmentBase,
  EventId,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar";
import { useMemo } from "react";

type LabelledEvent<TEvent> = NormalizedCalendarEvent<TEvent, EventId, ResourceId>;

/** Extra words for an event's accessible name, such as the name of its calendar. */
export type EventDescriber<TEvent> = (event: TEvent) => string | undefined;

export type EventLabeler<TEvent> = (event: LabelledEvent<TEvent>) => string;

/**
 * Accessible names for events: title, when, the view's `describeEvent` detail, and whether a
 * change is still saving, as in "Standup, Thursday, October 8, 9:00 – 9:30 AM, Work, saving".
 * The English words live here; edit or translate them in place.
 */
export function useEventLabel<TEvent>(
  { locale, timeZone }: Pick<CalendarEnvironmentBase, "locale" | "timeZone">,
  describe: EventDescriber<TEvent> | undefined,
): EventLabeler<TEvent> {
  return useMemo(() => {
    const date = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      weekday: "long",
    });
    const dateTimeOptions = {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "long",
      weekday: "long",
    } as const;
    const dateTime = new Intl.DateTimeFormat(locale, dateTimeOptions);
    const zonedDateTime = new Intl.DateTimeFormat(locale, {
      ...dateTimeOptions,
      timeZone,
      timeZoneName: "short",
    });
    const when = (event: LabelledEvent<TEvent>) => {
      switch (event.kind) {
        case "all-day": {
          const last = event.end.subtract({ days: 1 });
          const dates = last.equals(event.start)
            ? date.format(event.start)
            : date.formatRange(event.start, last);
          return `all day, ${dates}`;
        }
        case "timed": {
          const start = event.start.toZonedDateTimeISO(timeZone);
          const end = event.end.toZonedDateTimeISO(timeZone);
          // Across a clock change the wall times alone can repeat or run backwards, and a range
          // format collapses them, so name each end with its zone: "1:30 AM EDT – 1:30 AM EST".
          return start.offsetNanoseconds === end.offsetNanoseconds
            ? dateTime.formatRange(start.toPlainDateTime(), end.toPlainDateTime())
            : `${zonedDateTime.format(event.start)} – ${zonedDateTime.format(event.end)}`;
        }
        case "floating":
          return dateTime.formatRange(event.start, event.end);
      }
    };

    return (event) =>
      [
        event.title.trim() || "Untitled event",
        when(event),
        describe?.(event.event),
        event.isPending === true ? "saving" : undefined,
      ]
        .filter((part) => part !== undefined && part !== "")
        .join(", ");
  }, [describe, locale, timeZone]);
}
