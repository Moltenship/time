import {
  resourceTimelineTitle,
  type CalendarCellFocus,
  type PlainDateInterval,
} from "@moltenship/calendar";

import type { TimelineSlot, TimelineSlotGroup, TimelineSlotUnit } from "./timeline-scale";

/**
 * The timeline's words: its date and time formats, and the English copy of its header, rows and
 * cells. Every framework's timeline reads them from here; edit or translate them in place.
 */
export interface TimelineLabels {
  /** The keyboard's cell in full: a day, "Monday, October 5, 2026", or a slot, with its time. */
  readonly cellName: (cell: CalendarCellFocus) => string;
  /** The header's upper row: "Thursday, October 8, 2026" over hours, "October 2026" over days. */
  readonly group: (group: TimelineSlotGroup) => string;
  /** A slot's header: "9 AM" (or "09:00"), or "Mon" over the day number. */
  readonly slot: (slot: TimelineSlot) => string;
  /** A slot in full, for accessible names: "Thursday, October 8, 9:00 AM" or "Monday, October 5, 2026". */
  readonly slotName: (slot: TimelineSlot) => string;
}

/** "1 PM" where the locale uses a 12-hour clock, "13:00" where it uses 24 hours. */
function hourFormat(locale: Intl.LocalesArgument): Intl.DateTimeFormat {
  const hours = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const { hourCycle } = hours.resolvedOptions();
  return hourCycle === "h11" || hourCycle === "h12"
    ? hours
    : new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
}

/** The header's and cells' words for a timeline's slots, in the calendar's locale. */
export function timelineLabels(
  locale: Intl.LocalesArgument,
  unit: TimelineSlotUnit,
): TimelineLabels {
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  if (unit === "day") {
    const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return {
      cellName: ({ date }) => fullDate.format(date),
      group: ({ date }) => month.format(date),
      slot: ({ date }) => weekday.format(date),
      slotName: ({ date }) => fullDate.format(date),
    };
  }
  const hour = hourFormat(locale);
  const dateTime = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    weekday: "long",
  });
  return {
    cellName: (cell) =>
      cell.kind === "slot"
        ? dateTime.format(cell.date.toPlainDateTime(cell.time))
        : fullDate.format(cell.date),
    group: ({ date }) => fullDate.format(date),
    slot: ({ start }) => hour.format(start.toPlainTime()),
    slotName: ({ start }) => dateTime.format(start),
  };
}

/** A timed event's start time on its bar, in the display time zone. */
export function timelineTimeFormat(
  locale: Intl.LocalesArgument,
  timeZone: string,
): (instant: Temporal.Instant) => string {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone });
  return (instant) => format.format(instant);
}

/** The grid's name: the title the toolbar shows for the range, "October 2026" for a month. */
export function timelineGridLabel(range: PlainDateInterval, locale: Intl.Locale | string): string {
  const days = range.start.until(range.end).days;
  const month = range.start.day === 1 && range.end.equals(range.start.add({ months: 1 }));
  return resourceTimelineTitle(
    range,
    month ? { kind: "month" } : { count: days, kind: "days" },
    locale,
  );
}

/** The corner over the resource column. */
export const resourcesHeading = "Resources";

/** A row's title: its resource's, or the row of events with none. */
export function resourceRowTitle(resource: { readonly title: string } | null | undefined): string {
  return resource?.title ?? "Unassigned";
}

/** A group's chevron. */
export function resourceToggleLabel(expanded: boolean, title: string): string {
  return `${expanded ? "Collapse" : "Expand"} ${title}`;
}

/** The row header's name: the resource, its local time on another clock, and its status. */
export function rowHeaderLabel(
  title: string,
  localTime: string | null,
  status: string | undefined,
): string {
  return [title, localTime === null ? undefined : `local time ${localTime}`, status]
    .filter((part) => part !== undefined)
    .join(", ");
}

/** The hatching over hours a clock change skips, and the tint over the hours it repeats. */
export const skippedHoursTitle = "Skipped: clocks moved forward";
export const repeatedHoursTitle = "Repeated: clocks moved back";

/** What a name says about working hours: a closed day of a day row, or closed time of an hour row. */
export type TimelineAvailabilityNote = "closed" | "outside working hours";

function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** A cell's name: its row, its slot in full, what working hours say about it, and its events. */
export function timelineCellLabel(
  title: string,
  slotName: string,
  note: TimelineAvailabilityNote | undefined,
  events: number,
): string {
  return [title, slotName, note, eventCount(events)]
    .filter((part) => part !== undefined)
    .join(", ");
}

/** A keyboard target's cell: its name, then what working hours say about it. */
export function timelineTargetLabel(
  cellName: string,
  note: TimelineAvailabilityNote | undefined,
): string {
  return note === undefined ? cellName : `${cellName}, ${note}`;
}

/** The keyboard's cursor on a cell of a resource's row, named after the row. */
export function cellTargetLabel(title: string, label: string): string {
  return `${title}, ${label}`;
}

/** The keyboard's cursor on a cell of a group's row, which says whether the group is open. */
export function groupCellTargetLabel(title: string, expanded: boolean, label: string): string {
  return `${title}, ${expanded ? "expanded" : "collapsed"}, ${label}`;
}
