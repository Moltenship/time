import {
  withAsciiSpaces,
  type EventId,
  type ListItem,
  type PlainDateInterval,
  type ResourceId,
} from "@moltenship/calendar";

/**
 * The agenda's words: its date and time formats, and the English copy of its rows and states.
 * Every framework's agenda reads them from here; edit or translate them in place.
 */
export interface AgendaFormats {
  readonly date: Intl.DateTimeFormat;
  readonly range: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
  readonly weekday: Intl.DateTimeFormat;
}

export function agendaFormats(locale: Intl.LocalesArgument): AgendaFormats {
  return {
    date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    range: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
  };
}

/**
 * An item's time on its day: its range, "Until" or "From" for an event that starts or ends on
 * another day, or nothing for an all-day event or a day it fills, which shows `allDayLabel`.
 */
export function agendaTimeLabel(
  { end, event, start, endsAfterDay, startsBeforeDay }: ListItem<unknown, EventId, ResourceId>,
  format: Intl.DateTimeFormat,
): string | undefined {
  if (event.kind === "all-day" || (startsBeforeDay && endsAfterDay)) return undefined;
  if (startsBeforeDay) return `Until ${format.format(end.toPlainTime())}`;
  if (endsAfterDay) return `From ${format.format(start.toPlainTime())}`;
  return withAsciiSpaces(format.formatRange(start.toPlainTime(), end.toPlainTime()));
}

export const allDayLabel = "All day";

/** Which day of a multi-day event a row shows: "Day 2 of 3". */
export function dayOfLabel(index: number, count: number): string {
  return `Day ${index} of ${count}`;
}

/** The dates an empty agenda stands in for, as text: "October 5 – 18". */
export function agendaDates(formats: AgendaFormats, range: PlainDateInterval): string {
  return withAsciiSpaces(formats.range.formatRange(range.start, range.end.subtract({ days: 1 })));
}

/** What the empty agenda says for `dates`, while its events load or once nothing is scheduled. */
export function emptyAgendaCopy(
  loading: boolean,
  dates: string,
): { readonly detail: string; readonly title: string } {
  return loading
    ? { detail: `Fetching what's scheduled for ${dates}.`, title: "Loading events" }
    : { detail: `Nothing is scheduled for ${dates}.`, title: "No events" };
}

/** What the end of a scrolling agenda says while events load. */
export const agendaEndLoadingLabel = "Loading events…";

/** What the end of a scrolling agenda says once nothing more is loaded: through which date. */
export function agendaEndLabel(formats: AgendaFormats, empty: PlainDateInterval): string {
  return `Nothing more is scheduled through ${formats.date.format(empty.end.subtract({ days: 1 }))}.`;
}
