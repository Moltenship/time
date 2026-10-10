import type {
  EventId,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceTimelineDayRow,
  ResourceTimelineHourRow,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";

import type { TimelineSlot } from "./timeline-scale";

/** An event's bar in a row, measured in slots from the start of the range. */
export interface TimelineBar<TEvent> {
  readonly end: number;
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
  readonly lane: number;
  readonly start: number;
  readonly startsBefore: boolean;
  /** A timed event's start, shown when its bar fits in one day slot. */
  readonly time?: string;
}

/** A bar placed in the first visible cell it covers. */
export interface PlacedBar<TEvent> extends TimelineBar<TEvent> {
  /** The first date the bar shows, and how many dates it covers. */
  readonly date: Temporal.PlainDate;
  readonly days: number;
  /** Where the bar starts relative to its cell, and its width, in pixels. */
  readonly offset: number;
  readonly width: number;
}

/** Space between a bar and the grid lines at the ends it doesn't continue past, in pixels. */
const INSET = 2;

/**
 * A row's bars in slots. Day rows come laid out like a month row, a slot per day; hour rows come
 * as fractions of the range, scaled here to its hour slots.
 */
export function rowBars<TEvent>(
  row: ResourceTimelineDayRow<TEvent> | ResourceTimelineHourRow<TEvent>,
  slotCount: number,
  formatTime: (instant: Temporal.Instant) => string,
): readonly TimelineBar<TEvent>[] {
  if ("segments" in row) {
    return row.segments.map(({ column, endsAfter, event, lane, span, startsBefore }) => ({
      end: column + span,
      endsAfter,
      event,
      lane,
      start: column,
      startsBefore,
      time:
        event.kind === "timed" && span === 1 && !startsBefore ? formatTime(event.start) : undefined,
    }));
  }
  return row.bars.map(({ end, endsAfter, event, lane, start, startsBefore }) => ({
    end: end * slotCount,
    endsAfter,
    event,
    lane,
    start: start * slotCount,
    startsBefore,
  }));
}

/** The slots a stretch covers: the first, and the last it reaches into. */
export function slotsCovered(start: number, end: number): readonly [number, number] {
  const first = Math.floor(start);
  return [first, Math.max(first, Math.ceil(end) - 1)];
}

/** The first rendered slot in `from` to `to`, where an element covering them is placed. */
export function anchorSlot(
  visibleSlots: readonly VirtualItem[],
  from: number,
  to: number,
): number | undefined {
  return visibleSlots.find(({ index }) => from <= index && index <= to)?.index;
}

/**
 * The bars in view, each under the first rendered slot it covers: a bar that starts off-screen
 * still renders inside a cell of the grid, and reaches across the cells after it.
 */
export function placeBars<TEvent>(
  bars: readonly TimelineBar<TEvent>[],
  slots: readonly TimelineSlot[],
  visibleSlots: readonly VirtualItem[],
  slotWidth: number,
): ReadonlyMap<number, readonly PlacedBar<TEvent>[]> {
  const placed = new Map<number, PlacedBar<TEvent>[]>();
  for (const bar of bars) {
    const [from, to] = slotsCovered(bar.start, Math.min(bar.end, slots.length));
    const anchor = anchorSlot(visibleSlots, from, to);
    if (anchor === undefined) continue;
    const before = bar.startsBefore ? 0 : INSET;
    const after = bar.endsAfter ? 0 : INSET;
    const cell = placed.get(anchor) ?? [];
    cell.push({
      ...bar,
      date: slots[from]!.date,
      days: slots[from]!.date.until(slots[to]!.date).days + 1,
      offset: (bar.start - anchor) * slotWidth + before,
      width: Math.max(INSET, (bar.end - bar.start) * slotWidth - before - after),
    });
    placed.set(anchor, cell);
  }
  return placed;
}
