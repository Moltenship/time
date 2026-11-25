import {
  instantInterval,
  timedFragmentBox,
  withAsciiSpaces,
  type CalendarEventPlacement,
  type CalendarFocus,
  type CalendarSlotFocus,
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type TimeGridBand,
  type TimeGridColumn,
} from "@moltenship/calendar";

/*
 * The time grid's arithmetic, one place for every framework's markup: where events, drafts, slots
 * and the now-line sit on a column's 24-hour axis, and the time ranges events show.
 */

type DayFragment = EventDayFragment<unknown, EventId, ResourceId>;

export const DAY_MINUTES = 24 * 60;

/** Blocks shorter than this show title and start time on one line. */
export const COMPACT_MINUTES = 45;

/** Hour labels from 1:00 to 23:00; midnight sits under the header. */
export const labelledHours: readonly number[] = Array.from({ length: 23 }, (_, index) => index + 1);

/** Without a current time in view, open the day at 08:00. */
export const DEFAULT_SCROLL_FRACTION = 8 / 24;

export function percent(fraction: number): string {
  return `${fraction * 100}%`;
}

/** The columns of a row of `count` days, each as wide as the others. */
export function dayColumns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

/** An hour label's place on the gutter, from the top of the day. */
export function hourTop(hour: number): string {
  return percent(hour / 24);
}

/** Whether an event of `height`, a fraction of the day, shows on one compact line. */
export function isCompact(height: number): boolean {
  return height * DAY_MINUTES < COMPACT_MINUTES;
}

/** Px an event keeps free at each side of the column's event area, for the annotation rail. */
export interface EventInset {
  readonly end: number;
  readonly start: number;
}

/** Where a lane sits across the event area, less what `inset` keeps free at its sides. */
export function laneBox(
  left: number,
  width: number,
  inset: EventInset | undefined,
): { readonly insetInlineStart: string; readonly width: string } {
  if (inset === undefined) return { insetInlineStart: percent(left), width: percent(width) };
  const area = `(100% - ${inset.start + inset.end}px)`;
  return {
    insetInlineStart: `calc(${inset.start}px + ${left} * ${area})`,
    width: `calc(${width} * ${area})`,
  };
}

/** A band's place on the column, as CSS lengths. */
export function bandBox({ height, top }: TimeGridBand): {
  readonly height: string;
  readonly top: string;
} {
  return { height: percent(height), top: percent(top) };
}

/** The event's own start and end on the wall clock, even on the second day of an overnight event. */
export function wallTimes(
  { event, end, start }: DayFragment,
  timeZone: string,
): readonly [Temporal.PlainDateTime, Temporal.PlainDateTime] {
  switch (event.kind) {
    case "timed":
      return [
        event.start.toZonedDateTimeISO(timeZone).toPlainDateTime(),
        event.end.toZonedDateTimeISO(timeZone).toPlainDateTime(),
      ];
    case "floating":
      return [event.start, event.end];
    case "all-day":
      return [start, end];
  }
}

/** Which resize handles an event's block gets: none on read-only events or roots. */
export function resizeHandles(
  fragment: Pick<DayFragment, "endsAfterDay" | "startsBeforeDay">,
  compact: boolean,
  resizable: boolean,
): { readonly end: boolean; readonly start: boolean } {
  const { endsAfterDay, startsBeforeDay } = fragment;
  return {
    // A short block keeps one handle, so the rest still grabs to move.
    end: resizable && !endsAfterDay,
    start: resizable && !startsBeforeDay && (!compact || endsAfterDay),
  };
}

/** A key for an event's element that keeps numeric and string IDs apart. */
export function eventKey(id: EventId): string {
  return `${typeof id}:${id}`;
}

export interface TimeGridEventFormats {
  /** A wall time on another day, with its weekday. */
  readonly dayTime: Intl.DateTimeFormat;
  /** A wall time. */
  readonly time: Intl.DateTimeFormat;
}

/** The dash between the ends of a same-day range in this locale, when it is a plain dash. */
function rangeDash(
  format: Intl.DateTimeFormat,
  start: Temporal.PlainTime,
  end: Temporal.PlainTime,
): string {
  const parts = format.formatRangeToParts(start, end);
  const dash = parts.find(
    (part, index) => part.source === "shared" && parts[index - 1]?.source === "startRange",
  )?.value;
  return dash !== undefined && /^\s*[–—-]\s*$/u.test(dash) ? withAsciiSpaces(dash) : " – ";
}

/**
 * "18:15 – 19:00", or with the end's weekday when it falls on a later date ("18:15 – ter., 18:00"),
 * so an overnight event never reads as ending before it starts. Ending at the next midnight still
 * reads as a time.
 */
export function eventTimeRange(
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime,
  formats: TimeGridEventFormats,
): string {
  const nextMidnight = start.toPlainDate().add({ days: 1 }).toPlainDateTime();
  if (Temporal.PlainDateTime.compare(end, nextMidnight) <= 0) {
    return withAsciiSpaces(formats.time.formatRange(start.toPlainTime(), end.toPlainTime()));
  }
  const dash = rangeDash(formats.time, start.toPlainTime(), end.toPlainTime());
  return `${formats.time.format(start.toPlainTime())}${dash}${formats.dayTime.format(end)}`;
}

/**
 * Whether a title shows less than all of itself: cut short by its clamp or by its event's box.
 * Rounding can leave a pixel of overflow on a title that fits, so a pixel doesn't count.
 */
export function isClipped(title: HTMLElement | null | undefined): boolean {
  const box = title?.closest("[data-event-id]")?.getBoundingClientRect();
  return (
    title != null &&
    box !== undefined &&
    (title.scrollWidth > title.clientWidth + 1 ||
      title.scrollHeight > title.clientHeight + 1 ||
      title.getBoundingClientRect().bottom > box.bottom + 1)
  );
}

/** Whether focus is in a column's or row's resource; a side without one matches any resource. */
export function inResource(
  focus: CalendarFocus,
  resourceId: ResourceId | null | undefined,
): boolean {
  return (
    resourceId === undefined || focus.resourceId === undefined || focus.resourceId === resourceId
  );
}

/** Where a keyboard create's timed draft falls in a column, or `null` when it misses it. */
export function draftBox(
  column: TimeGridColumn,
  placement: CalendarEventPlacement,
): TimeGridBand | null {
  const day = column.day.interval;
  if (day === null || placement.kind === "all-day") return null;
  const instant = (point: Temporal.Instant | Temporal.PlainDateTime) =>
    point instanceof Temporal.Instant
      ? point
      : point.toZonedDateTime(column.day.timeZone).toInstant();
  const start = instant(placement.start);
  const end = instant(placement.end);
  const from = Temporal.Instant.compare(start, day.start) > 0 ? start : day.start;
  const to = Temporal.Instant.compare(end, day.end) < 0 ? end : day.end;
  return Temporal.Instant.compare(from, to) < 0
    ? timedFragmentBox(column, instantInterval(from, to))
    : null;
}

/** Where a slot sits on its column's 24-hour axis. */
export function slotBand(slot: CalendarSlotFocus, slotMinutes: number): TimeGridBand {
  const minutes = slot.time.hour * 60 + slot.time.minute;
  return { height: slotMinutes / DAY_MINUTES, top: minutes / DAY_MINUTES };
}

export function sameBand(left: TimeGridBand | null, right: TimeGridBand | null): boolean {
  return left === right || (left?.top === right?.top && left?.height === right?.height);
}

/**
 * Where the body opens: on the current time at `nowTop`, a third of the way down, or on 08:00
 * when the current time is not visible.
 */
export function openingScrollTop(
  nowTop: number | null,
  scrollHeight: number,
  clientHeight: number,
): number {
  return nowTop === null
    ? DEFAULT_SCROLL_FRACTION * scrollHeight
    : Math.max(0, nowTop * scrollHeight - clientHeight / 3);
}
