import {
  withAsciiSpaces,
  type CalendarEnvironmentBase,
  type CalendarEventInterval,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo } from "react";

type LabelledEvent<TEvent> = NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
type Where = Pick<CalendarEnvironmentBase, "locale" | "timeZone">;

/** Extra words for an event's accessible name, such as the name of its calendar. */
export type EventDescriber<TEvent> = (event: TEvent) => string | undefined;

/** An event's accessible name; `place` names where this copy shows, such as its resource. */
export type EventLabeler<TEvent> = (event: LabelledEvent<TEvent>, place?: string) => string;

interface WhenFormats {
  readonly date: Intl.DateTimeFormat;
  readonly dateTime: Intl.DateTimeFormat;
  readonly zonedDateTime: Intl.DateTimeFormat;
}

const whenFormats = new Map<string, WhenFormats>();

function formatsFor({ locale, timeZone }: Where): WhenFormats {
  const key = `${String(locale)}|${timeZone}`;
  let formats = whenFormats.get(key);
  if (formats === undefined) {
    const date = { day: "numeric", month: "long", weekday: "long" } as const;
    const dateTime = { ...date, hour: "numeric", minute: "2-digit" } as const;
    formats = {
      date: new Intl.DateTimeFormat(locale, date),
      dateTime: new Intl.DateTimeFormat(locale, dateTime),
      zonedDateTime: new Intl.DateTimeFormat(locale, {
        ...dateTime,
        timeZone,
        timeZoneName: "short",
      }),
    };
    whenFormats.set(key, formats);
  }
  return formats;
}

/**
 * When an event happens, in full: "Thursday, October 8, 9:00 – 9:30 AM", or "all day, Tuesday,
 * October 6 – Friday, October 9". Event names and announcements both read it.
 */
export function describeWhen(interval: CalendarEventInterval, where: Where): string {
  const { date, dateTime, zonedDateTime } = formatsFor(where);
  switch (interval.kind) {
    case "all-day": {
      const last = interval.end.subtract({ days: 1 });
      const dates = last.equals(interval.start)
        ? date.format(interval.start)
        : withAsciiSpaces(date.formatRange(interval.start, last));
      return `all day, ${dates}`;
    }
    case "timed": {
      const start = interval.start.toZonedDateTimeISO(where.timeZone);
      const end = interval.end.toZonedDateTimeISO(where.timeZone);
      // Across a clock change the wall times alone can repeat or run backwards, and a range
      // format collapses them, so name each end with its zone: "1:30 AM EDT – 1:30 AM EST".
      return start.offsetNanoseconds === end.offsetNanoseconds
        ? withAsciiSpaces(dateTime.formatRange(start.toPlainDateTime(), end.toPlainDateTime()))
        : `${zonedDateTime.format(interval.start)} – ${zonedDateTime.format(interval.end)}`;
    }
    case "floating":
      return withAsciiSpaces(dateTime.formatRange(interval.start, interval.end));
  }
}

/** An event's title, or what to call it when it has none. */
export function eventTitle({ title }: { readonly title: string }): string {
  return title.trim() || "Untitled event";
}

/**
 * Accessible names for events: title, when, where, the view's `describeEvent` detail, and whether
 * a change is still saving, as in "Standup, Thursday, October 8, 9:00 – 9:30 AM, Work, saving".
 * The English words live here; edit or translate them in place.
 */
export function useEventLabel<TEvent>(
  { locale, timeZone }: Where,
  describe: EventDescriber<TEvent> | undefined,
): EventLabeler<TEvent> {
  return useMemo(
    () => (event, place) =>
      [
        eventTitle(event),
        describeWhen(event, { locale, timeZone }),
        place,
        describe?.(event.event),
        event.isPending === true ? "saving" : undefined,
      ]
        .filter((part) => part !== undefined && part !== "")
        .join(", "),
    [describe, locale, timeZone],
  );
}
